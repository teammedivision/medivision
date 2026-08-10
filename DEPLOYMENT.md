# MediVision — Deployment & Operations Guide

This guide takes you from "runs on my laptop" to "deployed with HTTPS,
auth, a database, monitoring, and CI". Written for the hardened v2 backend.

---

## 1. Local development (unchanged workflow)

```bash
# Windows: just double-click run_backend.bat (it re-installs new deps), or:
cd api
pip install -r requirements.txt
python app.py            # dev server
# or
python serve.py          # production server (waitress)
```

Open http://localhost:5000. First run creates `api/data/medivision.db`
(SQLite) automatically — no database setup needed.

**New since v2:** copy `.env.example` to `.env` at the project root and set
`SECRET_KEY` (otherwise login tokens reset every restart).

## 2. Configuration

All settings live in `.env` (see `.env.example` for the full list):

| Variable | Purpose |
|---|---|
| `SECRET_KEY` / `JWT_SECRET_KEY` | Token signing — REQUIRED in production |
| `DATABASE_URL` | Empty = SQLite; set `postgresql://...` in production |
| `ALLOWED_ORIGINS` | CORS allow-list — add your real domain |
| `RATE_LIMIT_*` | Abuse protection budgets |
| `OOD_*` | Out-of-distribution rejection thresholds |
| `REQUIRE_CONSENT` | Server-side disclaimer enforcement (keep `true`) |
| `SENTRY_DSN` | Error alerting (free at sentry.io) |

## 3. Docker (recommended)

```bash
cp .env.example .env       # then edit SECRET_KEY at minimum
docker compose up --build
```

That builds the image (models are *mounted*, not baked in), persists the
SQLite DB + logs in named volumes, and serves on port 5000.

PostgreSQL instead of SQLite:

```bash
# in .env:
DATABASE_URL=postgresql://medivision:medivision@db:5432/medivision
docker compose --profile postgres up --build
```

## 4. Cloud deployment options

### Option A — Hugging Face Spaces (free, good for demos)
1. Create a Space → type **Docker**.
2. Push this repo to the Space (models via `git lfs` or download at startup
   from your GitHub Release, as `.devcontainer/fetch_models.sh` already does).
3. In Space settings → Variables, add `SECRET_KEY`, `ALLOWED_ORIGINS`
   (your `*.hf.space` URL), etc. Spaces provides HTTPS automatically.
4. Note: free CPU tier sleeps when idle; first request re-loads models.

### Option B — Render / Railway (simple paid hosting)
1. Connect the GitHub repo, select "Docker" as the environment.
2. Add the env vars from `.env.example` in the dashboard.
3. Attach their managed PostgreSQL and set `DATABASE_URL` (Render's
   `postgres://` URL scheme is handled automatically by `config.py`).
4. Models: store in an S3/R2 bucket or GitHub Release and download on boot
   (extend the Dockerfile CMD), or use a persistent disk.
5. RAM: pick a plan with **≥ 4 GB** (TF + 4 models ≈ 2–3 GB).

### Option C — a VPS (Hetzner/DigitalOcean, most control)
```bash
git clone <repo> && cd MediVision_GUI
# copy the 4 .keras files onto the server (scp/rclone)
cp .env.example .env && nano .env
docker compose up -d --build
# HTTPS: put Caddy or nginx+certbot in front of port 5000
```
Caddyfile example (automatic HTTPS):
```
medivision.yourdomain.com {
    reverse_proxy localhost:5000
}
```
Then set `ALLOWED_ORIGINS=https://medivision.yourdomain.com` in `.env`.

## 5. CI/CD

`.github/workflows/ci.yml` runs the unit-test suite on every push/PR
(models are skipped via `MEDIVISION_SKIP_MODELS=1`, so CI is fast and
free). Extend it with a deploy job (e.g. Render deploy hook or
`docker build`+push) once you pick a host.

## 6. Monitoring & operations

- **Errors:** set `SENTRY_DSN` — unhandled exceptions email/Slack you.
- **Logs:** rotating file logs in `logs/medivision.log` (5×1 MB).
- **Audit trail:** `audit_log` DB table records registrations, logins,
  failed logins, analyses, and OOD rejections with IP + timestamp.
- **Health:** `GET /api/health` returns `{status, version, models_loaded}` —
  point uptime monitoring (UptimeRobot is free) at it.
- **Rate limiting:** in-memory by default; if you run more than one
  container, set `RATE_LIMIT_STORAGE=redis://...`.

## 7. Scaling notes (current bottleneck)

`serve.py` runs **one worker thread** to keep TF graph state predictable —
that's ~1 concurrent inference. When you outgrow it:
1. Run 2–4 containers behind a load balancer (each loads its own models).
2. Or move inference to a queue (Celery/RQ) with worker processes.
3. Or serve models via TensorFlow Serving / ONNX Runtime and keep Flask thin.
4. GPU only matters at real volume; CPU inference is fine to start.

## 8. Go-live checklist

- [ ] `SECRET_KEY` set, `.env` not committed
- [ ] `ALLOWED_ORIGINS` = your real domain(s) only
- [ ] HTTPS in front (Caddy/nginx/platform TLS)
- [ ] PostgreSQL + automated backups (managed DB or `pg_dump` cron)
- [ ] Sentry DSN set and receiving a test error
- [ ] Uptime monitor on `/api/health`
- [ ] Real metrics in `MODEL_CARD.md`, `api/model_metrics.json`, and the
      four `data-metric` values in `frontend/index.html`
- [ ] `[PLACEHOLDER]`s in `frontend/terms.html` filled in; lawyer review
- [ ] Load test `/api/analyze` (e.g. `locust`) so you know your capacity

## 9. Regulatory reality check (before charging money)

Screening/diagnostic AI is a regulated medical device in most markets (FDA
in the US, EU MDR, TGA in Australia, CDSCO in India). Operating as an
"educational tool" with clear disclaimers is a common early stage, but the
moment you market diagnostic value, you need a regulatory strategy:
quality-management system (ISO 13485), clinical evaluation, and a
submission. Budget for regulatory consulting early — it shapes what you can
legally claim on your landing page.
