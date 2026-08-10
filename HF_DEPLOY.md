# Deploying MediVision to Hugging Face Spaces (free)

This gets MediVision running on a public `https://...hf.space` URL on Hugging
Face's free CPU tier (16 GB RAM — enough for all four models), at no cost.

**How it works:** the Space contains just two small files (`Dockerfile` +
`README.md`). At build time the Dockerfile pulls the code from GitHub and the
four model files from a GitHub Release. So there's no large upload to Hugging
Face and no Git LFS.

---

## Step 1 — Put the model files on a GitHub Release (one time, ~10 min)

The four `.keras` files are too big for the git repo, so they live on a Release.

1. Go to **https://github.com/teammedivision/medivision/releases/new**
2. **Choose a tag** → type `models-v1` → "Create new tag on publish".
3. Title: `Model weights`.
4. Drag these four files from `E:\New folder\MediVision_GUI\MediVision_GUI\`
   into the "Attach binaries" box and wait for each to reach 100 %:
   - `domain_resnet50.keras`
   - `skin_disease_resnet50.keras`
   - `eye_disease_resnet50.keras`
   - `teeth_disease_resnet50.keras`
5. Click **Publish release**.

> The tag **must** be exactly `models-v1` — the Dockerfile downloads from
> `.../releases/download/models-v1/<file>`. (This Release also makes GitHub
> Codespaces work, since `.devcontainer` already points at `models-v1`.)

Verify: open
`https://github.com/teammedivision/medivision/releases/download/models-v1/domain_resnet50.keras`
— it should start downloading. If it 404s, the tag name is wrong.

---

## Step 2 — Create the Space (~2 min)

1. Sign in at **https://huggingface.co** (free account).
2. Go to **https://huggingface.co/new-space**.
3. Owner: your account (or a `teammedivision` org). Space name: `medivision`.
4. License: **Other**. SDK: **Docker** → **Blank**.
5. Hardware: **CPU basic — free**. Visibility: **Public**.
6. Click **Create Space**.

---

## Step 3 — Add the two files (~3 min, all in the browser)

In the new Space, open the **Files** tab. You'll replace the starter README and
add a Dockerfile — copy the contents from `deploy/hf-space/` in this repo.

**README.md** (edit the existing one):
1. Click `README.md` → the pencil (**Edit**).
2. Delete everything and paste the contents of `deploy/hf-space/README.md`.
3. **Commit changes to main**.

**Dockerfile** (new file):
1. **Add file → Create a new file**. Name it exactly `Dockerfile`.
2. Paste the contents of `deploy/hf-space/Dockerfile`.
3. **Commit new file to main**.

The Space starts building immediately (watch the **Logs** tab). First build
takes ~10–20 min: it installs TensorFlow and downloads ~1.1 GB of models. When
it prints `All 4 models loaded`, the app is live at the top of the page.

---

## Step 4 — Set your secret key (~1 min)

So login tokens survive restarts:

1. Space **Settings → Variables and secrets → New secret**.
2. Name `SECRET_KEY`, value = a long random string (e.g. run
   `python -c "import secrets;print(secrets.token_hex(32))"`).
3. Save, then **Settings → Factory rebuild** to pick it up.

---

## Updating the deployment later

- **Changed the code?** Push to GitHub `main`, then in the Space:
  **Settings → Factory rebuild** (re-clones the latest code).
- **Retrained a model?** Upload the new `.keras` to the `models-v1` Release
  (delete the old asset first, keep the same name), then Factory rebuild.

## Notes & limits (free tier)

- The Space **sleeps after ~48 h idle**; the next visit wakes it (first request
  reloads models — slow, then fast).
- Storage is **ephemeral** — the SQLite database (accounts/history) resets on
  rebuild. Fine for a demo; add Hugging Face **persistent storage** (paid) or an
  external Postgres (`DATABASE_URL`) when you need it to stick.
- The frontend is served same-origin, so no CORS setup is needed. To allow
  other sites to call the API, add the Space URL to `ALLOWED_ORIGINS` as a
  Space variable.
