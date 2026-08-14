/* =========================================================
 * MediVision frontend configuration.
 *
 * THIS IS THE ONLY FILE YOU EDIT TO POINT THE APP AT A BACKEND.
 *
 * GitHub Pages serves static files only — it cannot run Flask or
 * TensorFlow. With `apiBase` empty, the deployed site calls itself,
 * every request 404s, and the UI looks working right up until someone
 * uploads an image. Set this once the API is hosted.
 *
 *   apiBase: 'https://medivision-api-xxxxx.run.app'      (Cloud Run)
 *   apiBase: 'https://teammedivision-medivision.hf.space' (HF Spaces)
 *
 * See CLOUDRUN_DEPLOY.md / HF_DEPLOY.md.
 *
 * Also add the site origin to ALLOWED_ORIGINS on the backend, or the
 * browser blocks the calls:
 *   ALLOWED_ORIGINS=https://teammedivision.github.io
 * ========================================================= */
window.MV_CONFIG = {
  // Leave '' to call the same origin — correct when Flask serves this
  // frontend itself (python api/serve.py), and for local development.
  apiBase: '',
};

/* Resolve the base URL once, so app.js and auth.js cannot disagree. */
window.MV_API_BASE = (function () {
  var cfg = (window.MV_CONFIG && window.MV_CONFIG.apiBase) || '';
  if (cfg) return String(cfg).replace(/\/+$/, '');
  // Legacy local-dev fallback: `python -m http.server 8080` in ./frontend
  // while Flask runs separately on :5000.
  if (location.port === '8080') return 'http://localhost:5000';
  return '';
})();
