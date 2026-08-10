<div align="center">

# 🩺 MediVision

### AI-powered visual screening for skin, eye, and dental conditions

One photo in — a ranked prediction, a Grad-CAM heatmap showing *why*, and a severity-based recommendation out.

[![CI](https://github.com/teammedivision/medivision/actions/workflows/ci.yml/badge.svg)](https://github.com/teammedivision/medivision/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-API-000000?logo=flask&logoColor=white)
![TensorFlow](https://img.shields.io/badge/TensorFlow-ResNet50-FF6F00?logo=tensorflow&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![Status](https://img.shields.io/badge/status-research%20preview-orange)

</div>

---

> [!WARNING]
> **MediVision is not a medical device.** It is an educational and research screening tool. Its output is **not a diagnosis**, **not medical advice**, and must **not** be used to make treatment decisions. It has not been cleared by any medical regulator (FDA, EU MDR/CE, TGA). Always consult a qualified healthcare professional.

---

## What it does

Upload a close-up photo of skin, an eye, or teeth. MediVision automatically detects which of the three domains the image belongs to, runs the matching disease classifier, and returns:

- **Ranked predictions** with confidence scores
- **A Grad-CAM heatmap** highlighting the regions that drove the prediction
- **A severity triage** (routine → urgent) with a plain-language recommendation
- **Optional symptom refinement** — free-text symptoms nudge the ranking
- **An out-of-distribution gate** that rejects non-medical images instead of guessing

No image ever touches disk — uploads live in memory from request to inference and are discarded.

## Key features

| | |
|---|---|
| 🧭 **Auto domain routing** | A router model decides skin vs. eye vs. teeth — users don't pick |
| 🔬 **24 conditions across 3 domains** | See the [full list](#supported-conditions) below |
| 🔥 **Explainable by default** | Grad-CAM overlay ships with every result |
| 🚦 **Severity triage** | Melanoma and other high-risk findings flag as urgent |
| 🛡️ **OOD rejection** | Softmax-confidence + entropy gate blocks off-topic photos |
| 👤 **Accounts & history** | JWT auth, per-user screening history (metadata only — no images) |
| 🔒 **Production-hardened** | CORS allow-list, rate limiting, consent enforcement, audit logging |
| 📄 **PDF reports** | One-click downloadable report of any result |

## How it works

```
        upload (in-memory)
              │
              ▼
      ┌───────────────┐   fails gate → 422 "not a supported medical image"
      │ Domain router │──────────────────────────────────────────────┐
      │  (ResNet50)   │                                               │
      └───────┬───────┘                                               │
              │ skin / eye / teeth                                    │
              ▼                                                       │
      ┌───────────────┐     ┌──────────────────┐     ┌─────────────┐  │
      │   Disease     │────▶│ Symptom refine   │────▶│  Grad-CAM   │  │
      │  classifier   │     │   (optional)     │     │  heatmap    │  │
      └───────┬───────┘     └──────────────────┘     └──────┬──────┘  │
              │                                             │         │
              ▼                                             ▼         ▼
        severity triage  ──────────────▶  JSON result → frontend renders
```

Each stage lives in `api/` — the router and classifiers in `api/models/`, the OOD gate in `api/utils/ood.py`, severity mapping in `api/utils/severity.py`, and symptom refinement in `api/utils/symptoms.py`.

## Supported conditions

| Domain | Input | Conditions |
|--------|-------|-----------|
| **Skin** (11) | 224×224 | Atopic Dermatitis, Basal Cell Carcinoma, Benign Keratosis, Eczema, Melanocytic Nevus, Melanoma, Normal, Psoriasis, Seborrheic Keratosis, Tinea, Warts |
| **Eye** (6) | 384×384 | Cataract, Conjunctivitis, Dry Eye, Eyelid Drooping, Normal, Uveitis |
| **Dental** (7) | 224×224 | Calculus, Caries, Discoloration, Gingivitis, Hypodontia, Mouth Ulcer, Normal |

## Model performance

Metrics are being finalized on held-out test sets and will be published here and in [`MODEL_CARD.md`](MODEL_CARD.md). Live numbers are served from `GET /api/model-info` and rendered on the app's "How It Works" page. Melanoma sensitivity is reported separately because it matters most clinically.

> Honest, reproducible metrics are a credibility requirement — we don't publish a number until it comes from a documented validation run.

## Tech stack

**Backend** — Python · Flask · TensorFlow 2 / Keras 3 · ResNet50 · SQLAlchemy · flask-jwt-extended · flask-limiter · waitress
**Frontend** — Vanilla HTML / CSS / JS (no build step) · Grad-CAM rendering · jsPDF report export
**Infra** — Docker + docker-compose · GitHub Actions CI · SQLite (dev) / PostgreSQL (prod) · optional Sentry

## Quick start

**Prerequisites:** Python 3.10 or 3.11, ~2 GB free RAM, ~1.1 GB disk for the four model files.

```bash
# 1. install dependencies
cd api
pip install -r requirements.txt

# 2. configure (copy the template and set a SECRET_KEY)
cp ../.env.example ../.env

# 3. run
python app.py
```

Then open **http://localhost:5000**. The first launch loads all four models into memory (~30–60 s); watch for `All 4 models loaded`. Health check:

```bash
curl http://localhost:5000/api/health   # {"status":"ok","models_loaded":true}
```

> The four `.keras` model files (200–300 MB each) live at the project root and are loaded once at startup. They exceed GitHub's 100 MB limit, so they're distributed via GitHub Releases rather than committed — see [`DEPLOYMENT.md`](DEPLOYMENT.md).

### With Docker

```bash
docker compose up --build          # add --profile postgres for a database
```

For production hosting (Hugging Face Spaces, Render, a VPS), HTTPS, monitoring, and the go-live checklist, see **[`DEPLOYMENT.md`](DEPLOYMENT.md)**.

## API reference

### `POST /api/analyze`
`multipart/form-data`:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `image` | file (JPG/PNG/WEBP) | yes | ≤ 10 MB, processed in memory only |
| `symptoms` | string | no | Free text; commas/newlines split phrases |
| `consent` | string | yes | `true` — server enforces disclaimer acknowledgement |

```json
{
  "domain": "skin",
  "domain_confidence": 0.94,
  "top_disease": "Melanoma",
  "top_confidence": 0.87,
  "all_predictions": [{ "label": "Melanoma", "probability": 0.87 }],
  "gradcam_image": "<base64 PNG>",
  "severity": "URGENT",
  "recommendation": "Consult a dermatologist immediately.",
  "low_confidence": false
}
```

### Other endpoints

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `GET` | `/api/health` | — | Liveness + `models_loaded` flag |
| `GET` | `/api/model-info` | — | Published model metrics |
| `POST` | `/api/auth/register` | — | Create an account |
| `POST` | `/api/auth/login` | — | Get a JWT |
| `GET` | `/api/auth/me` | JWT | Current user |
| `GET` | `/api/history` | JWT | Last 50 screenings (metadata only) |

## Project structure

```
MediVision_GUI/
├── api/
│   ├── app.py              # Flask app factory + /api/analyze pipeline
│   ├── auth.py             # register / login / me
│   ├── config.py           # env-driven configuration
│   ├── db.py               # SQLAlchemy models (User, Analysis, AuditLog)
│   ├── serve.py            # waitress production entrypoint
│   ├── models/             # loader.py + gradcam.py (nested ResNet50 aware)
│   ├── utils/              # ood.py · severity.py · symptoms.py
│   └── tests/              # pytest suite (runs without TF via skip flag)
├── frontend/               # index.html · css/ · js/ · terms.html
├── *.keras                 # 4 model files (via GitHub Releases)
├── Dockerfile · docker-compose.yml
├── DEPLOYMENT.md · MODEL_CARD.md
└── .github/workflows/ci.yml
```

## Testing

```bash
pip install pytest
cd api
MEDIVISION_SKIP_MODELS=1 python -m pytest tests
```

The skip flag lets the full API contract (auth, validation, OOD gate, consent) be tested without loading TensorFlow — which is exactly how CI runs on every push.

## Security & privacy

- **Images are never stored** — in-memory only, from upload to inference.
- **History stores metadata only** — predicted condition, confidence, severity, timestamp. No images are attached.
- **Consent is enforced server-side** — the API rejects analysis without disclaimer acknowledgement.
- **Hardened surface** — CORS allow-list, per-route rate limiting (stricter on analyze/login/register), audit logging, rotating file logs, optional Sentry.

See [`frontend/terms.html`](frontend/terms.html) for the full terms and privacy summary.

## Roadmap

- [ ] Publish validated metrics for all four models
- [ ] Trained out-of-distribution detector (replacing the entropy heuristic)
- [ ] Larger, more demographically diverse training data
- [ ] Clinical validation with licensed specialists
- [ ] Hosted public deployment + custom domain
- [ ] Regulatory pathway assessment (TGA / FDA / CE)

## Team

Built by **Arnav Mehta** and **Yash Hingu** — originally as a UTS 42028 Deep Learning project, now in development as a real-world product.

📧 **team.medivision@gmail.com**

## License

© 2026 MediVision. All rights reserved. Not licensed for clinical or commercial use.

---

<div align="center">
<sub>MediVision is a research preview. It does not diagnose. Always consult a healthcare professional.</sub>
</div>
