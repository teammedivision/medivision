# MediVision GUI &mdash; Standalone Package

Full-stack web app pairing a Flask REST API (TensorFlow + Keras 3 ResNet50)
with a pure HTML/CSS/JS frontend. The model auto-detects whether an image
is **skin**, **eye**, or **dental**, runs the matching disease classifier,
and returns ranked predictions plus a Grad-CAM heatmap.

> Educational use only &mdash; not a diagnostic tool.

---

## Package Contents

```
MediVision_GUI/
+-- api/                                 Flask backend
|   +-- app.py                            REST API endpoints
|   +-- requirements.txt                  Python dependencies
|   +-- models/
|   |   +-- loader.py                     Loads all 4 .keras models at startup
|   |   +-- gradcam.py                    Grad-CAM (handles nested ResNet50)
|   +-- utils/
|       +-- symptoms.py                   Symptom refinement
+-- frontend/                            Static SPA - no build step
|   +-- index.html
|   +-- css/styles.css
|   +-- js/app.js
+-- domain_resnet50.keras                 Domain router model
+-- skin_disease_resnet50.keras           Skin disease classifier
+-- eye_disease_resnet50.keras            Eye disease classifier (384x384 input)
+-- teeth_disease_resnet50.keras          Dental disease classifier
+-- README.md                             This file
```

The four `.keras` files at the package root are loaded automatically by
`api/models/loader.py` at startup &mdash; never per request.

---

## Prerequisites

* **Python 3.10 or 3.11** (TensorFlow 2.x supports these best on Windows)
* About **2 GB free RAM** when all four models are loaded
* About **1.1 GB free disk space** for the model files

---

## 1. Install Dependencies

Open a terminal in this folder (`MediVision_GUI/`) and run:

```bash
cd api
pip install -r requirements.txt
```

This installs Flask, flask-cors, TensorFlow, NumPy, Pillow, and OpenCV.

> **Tip:** A virtual environment is recommended. On Windows:
> ```bash
> python -m venv venv
> venv\Scripts\activate
> pip install -r api/requirements.txt
> ```

---

## 2. Start the Flask API

From the `api/` folder:

```bash
python app.py
```

The first run will load all four `.keras` models into memory (slow &mdash;
about 30-60 seconds depending on disk speed). When ready you'll see:

```
[loader] All 4 models loaded.
 * Running on http://0.0.0.0:5000
```

Health check (in another terminal):

```
curl http://localhost:5000/api/health
# {"status":"ok","models_loaded":true}
```

Keep this terminal open &mdash; the API needs to stay running.

---

## 3. Open the Frontend

`app.py` now serves the static frontend directly, so there's nothing extra
to run. Just open:

```
http://localhost:5000
```

`frontend/js/app.js` uses a same-origin `API_BASE` by default, so this works
out of the box &mdash; including once the app is tunneled or deployed behind a
single public URL (see below). It falls back to `http://localhost:5000` only
if the page is served the old way, from a separate static server on port
8080 (`python -m http.server 8080` inside `frontend/`).

---

## 4. Share It Publicly &mdash; Free (ngrok tunnel)

To let anyone, anywhere reach your locally-running instance over a real
`https://` URL, tunnel it with [ngrok](https://ngrok.com) (free plan):

**One-time setup**

1. Sign up free at ngrok.com and copy your authtoken.
2. Download ngrok for Windows/macOS/Linux and unzip it (add to PATH, or
   drop the binary into this folder on Windows).
3. Run once: `ngrok config add-authtoken YOUR_TOKEN`

**Every time you want to go live**

```bash
# terminal 1 - production server (waitress), from api/
python serve.py

# terminal 2 - public tunnel
ngrok http 5000
```

ngrok prints a forwarding URL like `https://xxxx-xx-xx-xxx-xx.ngrok-free.app`
&mdash; share that. It proxies straight to your machine, so keep both
terminals running (and the computer awake) for as long as people need
access. On Windows, double-clicking `run_public.bat` does both steps for
you automatically (see `START_HERE.txt`).

**Free-plan caveats**

* The URL changes every time you restart the tunnel (a paid plan lets you
  reserve one).
* First-time visitors may see a one-click ngrok interstitial page before
  reaching the app; the frontend's fetch calls already send
  `ngrok-skip-browser-warning` so the AI-analysis request itself isn't
  affected.
* Your PC has to stay on and connected the whole time &mdash; this is a
  tunnel to your machine, not a hosted deployment. For something that
  stays up when your PC is off, deploy the backend to a free host built
  for this workload (e.g. Hugging Face Spaces, which offers 16 GB RAM on
  its free CPU tier) and the frontend to a static host like Netlify or
  GitHub Pages.

---

## 5. Run in GitHub Codespaces (free, no local install at all)

Runs the whole app &mdash; API, frontend, and models &mdash; in the cloud on
GitHub's own free compute, with nothing to install on your machine. Good for
demos; GitHub's free tier gives ~60 hours/month on a 2-core box (120 core
hours), so it's not meant to stay on 24/7.

The 4 `.keras` files (200-300MB each) are over GitHub's 100MB per-file limit,
so they're excluded from the repo via `.gitignore` and fetched at container
startup from a **GitHub Release** instead (Release assets allow up to 2GB
per file, free, no Git LFS quota to worry about).

**One-time setup**

1. Create a new GitHub repo and push this folder to it:
   ```bash
   cd "MediVision_GUI"
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Create a Release to hold the model files (either on github.com under
   **Releases > Draft a new release**, or with the `gh` CLI):
   ```bash
   gh release create models-v1 \
     domain_resnet50.keras eye_disease_resnet50.keras \
     skin_disease_resnet50.keras teeth_disease_resnet50.keras \
     --title "Model weights" --notes "4 .keras models, fetched by Codespaces"
   ```
   If you use a different tag than `models-v1`, update `MODEL_RELEASE_TAG`
   in `.devcontainer/devcontainer.json` to match.

**Every time you want to go live**

1. On the repo's GitHub page: **Code > Codespaces > Create codespace on
   main**. Wait for it to build &mdash; `postCreateCommand` installs
   dependencies and downloads the 4 models automatically.
2. In the Codespace terminal: `cd api && python serve.py`. Wait for
   `models loaded` (30-60s).
3. Open the **Ports** tab, confirm port 5000 is set to **Public**
   visibility (the devcontainer tries to set this automatically; if it
   didn't, right-click the port row and set it yourself), then click the
   forwarded address &mdash; that `https://...app.github.dev` URL is what
   you share.
4. Keep the Codespace open while people are using it; it auto-suspends
   after a period of inactivity in the browser tab.

---

## API Reference

### `POST /api/analyze`

`multipart/form-data` with:

| Field      | Type             | Required | Notes                                  |
|------------|------------------|----------|----------------------------------------|
| `image`    | file (JPG/PNG/WEBP) | yes   | <= 10 MB, processed in-memory only |
| `symptoms` | string           | no       | Free-text; commas/newlines split phrases |

Response JSON:

```json
{
  "domain": "skin",
  "domain_confidence": 0.94,
  "top_disease": "Melanoma",
  "top_confidence": 0.87,
  "all_predictions": [
    {"label": "Melanoma", "probability": 0.87}
  ],
  "symptoms_used": true,
  "symptom_matches": {"Melanoma": ["dark spot", "irregular border"]},
  "gradcam_image": "<base64 PNG string>",
  "low_confidence": false,
  "severity": "URGENT",
  "recommendation": "Consult a dermatologist immediately."
}
```

### `GET /api/health`

Returns `{ "status": "ok", "models_loaded": true }` once all four models
are loaded.

---

## Troubleshooting

**"ModuleNotFoundError: No module named 'tensorflow'"**
You forgot to install dependencies. Run `pip install -r api/requirements.txt`.

**"Could not find 'domain_resnet50.keras'"**
The four `.keras` files must sit at the root of `MediVision_GUI/`, next to
the `api/` and `frontend/` folders. They should already be in the right
place after unzipping.

**Models load very slowly**
Normal on first run &mdash; loading takes 30-60 seconds. Once loaded they
stay in memory until you stop `app.py`.

**Frontend shows "Failed to fetch"**
The API isn't running. Check terminal 1 is still showing
`Running on http://0.0.0.0:5000`. If it crashed, scroll up for the error.

**Port 5000 already in use**
Edit the last line of `api/app.py` and change `port=5000` to something
free (e.g. 5001), then update `API_BASE` in `frontend/js/app.js` to match.

---

## What's New (showcase pass)

* **Quick-try samples** — "Try a sample" buttons on the upload screen load
  `frontend/samples/skin.jpg|eye.jpg|teeth.jpg`. The bundled files are
  placeholders; replace them with real test images before the showcase
  (see `frontend/samples/README.txt`).
* **Live pipeline animation** — the loading overlay now shows the four
  inference stages instead of a plain spinner.
* **Original vs Grad-CAM** — the results screen shows the uploaded image
  beside the heatmap.
* **PDF report** — "Download Report" now generates a real PDF (via jsPDF)
  and falls back to the print dialog if the library can't load.
* **Mobile navigation** — a hamburger menu keeps How It Works / About
  reachable on phones.
* **Model warmup** — all models run one dummy inference at startup so the
  first real prediction is fast.

### Run with a production server (optional)

From the `api/` folder, instead of `python app.py`:

```bash
python serve.py        # serves via waitress on http://0.0.0.0:5000
```

### Run the tests

```bash
pip install pytest
cd api
python -m pytest tests
```

---

## Implementation Notes

* **Images are never written to disk** &mdash; uploads stay in `io.BytesIO`
  from request through to inference.
* **Models load once at startup** in `api/models/loader.py` and are cached
  in `MODELS = {}` at module level.
* **CORS is enabled on all routes** via `flask_cors.CORS(app, ...)`.
* **Grad-CAM** correctly handles the nested ResNet50 submodel by locating
  the last `Conv2D` *inside* the nested layer and re-threading the head
  layers (see `api/models/gradcam.py`).
* **Eye model** uses 384x384 input; the other three use 224x224 &mdash;
  resolved automatically per domain.
* **First-visit disclaimer** is a modal stored in `sessionStorage` so it
  only blocks the first interaction per browser session.
* **Low-confidence threshold** is 0.50. Anything below shows a red badge
  and a warning alert above the metric cards.

---

## What's New (production hardening pass — v2)

The backend and frontend were hardened toward startup readiness:

* **Accounts & history** — JWT auth (`/api/auth/register|login|me`), per-user
  screening history (`/api/history`), rendered by `frontend/js/auth.js`.
* **Database** — SQLite by default (zero setup, `api/data/medivision.db`),
  PostgreSQL via `DATABASE_URL`. Images are still never stored.
* **Security** — CORS allow-list, rate limiting (stricter on analyze/login),
  server-side consent enforcement, audit log table, rotating file logs,
  optional Sentry error tracking.
* **Out-of-distribution gate** — non-medical images are rejected (HTTP 422)
  instead of being force-classified.
* **Docker** — `docker compose up --build` runs everything; `--profile
  postgres` adds a database. See `Dockerfile`, `docker-compose.yml`.
* **CI** — GitHub Actions runs the test suite on every push
  (`.github/workflows/ci.yml`); tests run without TensorFlow via
  `MEDIVISION_SKIP_MODELS=1`.
* **Docs** — `DEPLOYMENT.md` (hosting, HTTPS, monitoring, go-live checklist),
  `MODEL_CARD.md` (fill in real metrics!), `frontend/terms.html` (ToS
  template), `.env.example` (all settings).

**Upgrading an existing local setup:** re-run `run_backend.bat` (it installs
the new dependencies), or `pip install -r api/requirements.txt` manually.
Then copy `.env.example` to `.env` and set `SECRET_KEY`.
