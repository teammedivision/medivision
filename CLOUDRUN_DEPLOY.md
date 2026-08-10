# Deploying MediVision to Google Cloud Run (free tier)

Cloud Run runs your Docker container and **scales to zero** — you're billed only
while it's actively handling requests, so at demo traffic it stays within the
free tier ($0). You deploy entirely from the browser using **Cloud Shell**, so
there's nothing to install locally.

**Two things to know first:**
- A Google Cloud account with **billing enabled** is required (a card is needed,
  but the free tier won't charge at low use; we cap instances to limit cost).
- The public link has a **slow first load (~1–2 min)** after it's been idle,
  while it reloads the models. Warm requests are fast.

---

## Step 1 — Put the model files on a GitHub Release (one time)

Same as for any host — the build downloads the models from here.

1. Go to **https://github.com/teammedivision/medivision/releases/new**
2. Tag: `models-v1` → "Create new tag on publish". Title: `Model weights`.
3. Drag in the four `.keras` files from
   `E:\New folder\MediVision_GUI\MediVision_GUI\`:
   `domain_resnet50.keras`, `skin_disease_resnet50.keras`,
   `eye_disease_resnet50.keras`, `teeth_disease_resnet50.keras`
4. **Publish release.** (Skip this if you already created it.)

The tag must be exactly `models-v1`.

---

## Step 2 — Create a Google Cloud project with billing

1. Sign in at **https://console.cloud.google.com**.
2. Top bar → project dropdown → **New Project** → name it `medivision` → Create.
3. Enable billing: **Billing** in the left menu → link a billing account
   (add a card if you don't have one). New accounts include a large free trial
   credit on top of the always-free tier.

---

## Step 3 — Deploy from Cloud Shell (~15 min, all in the browser)

1. Click the **Cloud Shell** icon (`>_`) in the top-right of the console. A
   terminal opens at the bottom with `gcloud` already installed.
2. Point it at your project (replace with your actual project ID, shown in the
   project dropdown):
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```
3. Turn on the two services this uses:
   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com
   ```
4. Get the repo (for the deploy folder) and deploy. Pick a `SECRET_KEY` — any
   long random string:
   ```bash
   git clone https://github.com/teammedivision/medivision.git
   cd medivision

   gcloud run deploy medivision \
     --source deploy/cloudrun \
     --region us-central1 \
     --memory 4Gi --cpu 2 --cpu-boost \
     --timeout 900 --max-instances 2 \
     --allow-unauthenticated \
     --set-env-vars SECRET_KEY=PASTE_A_LONG_RANDOM_STRING
   ```
   - If asked "Allow unauthenticated invocations?" → **y**.
   - The build takes ~10–15 min (installs TensorFlow, downloads ~1.1 GB of
     models). When it finishes, gcloud prints a **Service URL** like
     `https://medivision-xxxxx-uc.a.run.app` — that's your public link.

Open the URL. The very first hit loads the models (~1–2 min), then it's fast.

---

## Updating it later

After pushing new code to GitHub `main`, redeploy with the same command (from a
fresh `git clone` in Cloud Shell, or `git pull` in the existing one):

```bash
gcloud run deploy medivision --source deploy/cloudrun --region us-central1 \
  --memory 4Gi --cpu 2 --cpu-boost --timeout 900 --max-instances 2 \
  --allow-unauthenticated
```

Retrained a model? Replace the asset on the `models-v1` Release (same filename),
then redeploy.

---

## Keeping it free / avoiding surprises

- `--max-instances 2` caps how much can run at once. `--min-instances` is 0 by
  default, so it scales to zero when idle (no charge while idle).
- Free tier covers 180,000 vCPU-seconds and 360,000 GiB-seconds per month in
  `us-central1` — comfortably enough for a demo.
- Want no cold starts? `--min-instances 1` keeps one warm, but that runs 24/7
  and will exceed the free tier (roughly a few dollars/month). Leave it at 0 to
  stay free.
- The SQLite database (accounts/history) is **ephemeral** on Cloud Run — it
  resets when a new instance starts. Fine for a demo; use Cloud SQL Postgres
  (`DATABASE_URL`) when you need it to persist.

---

## Alternative: always-on and free forever

If the cold-start delay bothers you, an **Oracle Cloud Always Free** ARM VM
(24 GB RAM) runs your existing `docker compose` setup 24/7 at no cost — but it's
a full Linux server (SSH, install Docker, copy the models up, add HTTPS). More
setup, better result. Ask me and I'll write that guide instead.
