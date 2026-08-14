# Running the models in the browser — GitHub-only (proof of concept)

Goal: make **analysis actually work** with nothing but GitHub — no Python server,
no other service. The models run in the visitor's browser with TensorFlow.js.

This document covers the **proof of concept**: the *domain* model (skin / eye /
teeth router). If it works and stays accurate, the same steps extend to the
three disease models plus the Grad-CAM heatmap.

---

## How it works

```
your trained .keras models
        │  (uploaded once to a GitHub Release)
        ▼
GitHub Action  ──►  TensorFlow.js model files  ──►  committed to frontend/models/
 (convert-models.yml)                                        │
                                                             ▼
                                              GitHub Pages serves them
                                                             │
                                                             ▼
                                    browser downloads once, runs the model locally
```

Everything after the first step happens **on GitHub automatically**.

---

## What's already verified

- **Preprocessing is exact.** The browser reproduces the backend's ResNet50
  caffe preprocessing (RGB→BGR, subtract `[103.939, 116.779, 123.68]`) to within
  7e-6 — confirmed by the self-test on `tfjs-test.html`. This is the step that
  silently ruins predictions if it is even slightly off, so it mattered most.
- **The plumbing runs:** `js/inference.js` loads a model, preprocesses, predicts;
  the test page loads, and fails gracefully with a clear message when no model
  is present yet.

---

## The one step only you can do

The trained `.keras` files (~200–300 MB each) live on your machine. They are not
in the repo and not on GitHub yet — so they must be uploaded once.

1. Go to **https://github.com/teammedivision/medivision/releases/new**
2. **Tag:** type `models-v1`
3. **Title:** `Model files`
4. Drag the four files into the attach box (for the proof of concept you only
   strictly need `domain_resnet50.keras`, but upload all four while you're here):
   - `domain_resnet50.keras`
   - `skin_disease_resnet50.keras`
   - `eye_disease_resnet50.keras`
   - `teeth_disease_resnet50.keras`
5. Click **Publish release**.

That's the only manual step, and only you can do it — the files exist only where
you trained them.

---

## Then let GitHub do the rest

1. **Actions** tab → **Convert models to TensorFlow.js** → **Run workflow**
   - Model: `domain`  ·  Quantization: `float16`
2. It downloads the model from the Release, converts it, and commits
   `frontend/models/domain/` (~50 MB). The Pages deploy then publishes it.
3. Open **`https://teammedivision.github.io/medivision/tfjs-test.html`**
   - Click **Run self-test** → should say *preprocessing exact ✓*
   - Click **Load model** → should say *loaded ✓*
   - Pick a photo → you'll get a **skin / eye / teeth** prediction, computed
     entirely in your browser.

---

## If the proof works

We extend it to the full app:

1. Convert the other three models (same workflow, `model: all`).
2. Port the disease classification + **Grad-CAM heatmap** into `inference.js`
   (the heatmap is the one genuinely fiddly piece).
3. Replace the "Screening unavailable" path in `app.js` with local inference.
4. Save results to on-device history (browser storage) instead of a server.
5. **Validate accuracy** against the held-out test set — especially melanoma
   sensitivity — before trusting it. `float16` should be near-identical; if we
   ever switch to `uint8` for size, this check is mandatory.

---

## Local testing (optional)

You don't need this — the Action does it on GitHub — but to convert on your own
machine:

```bash
pip install tensorflow tensorflowjs
python tools/convert_to_tfjs.py --model domain      # writes frontend/models/domain/
npx serve frontend -l 8080                          # open http://localhost:8080/tfjs-test.html
```
