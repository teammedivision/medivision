/* =========================================================
 * MediVision auth + history UI.
 * Self-contained: builds its own modal/nav elements at runtime
 * so index.html stays untouched apart from the script include.
 * Exposes window.MVAuth for app.js (getToken / isLoggedIn).
 * ========================================================= */
(function () {
  'use strict';

  var API_BASE = (location.port === '8080') ? 'http://localhost:5000' : '';
  var TOKEN_KEY = 'mv_token';
  var EMAIL_KEY = 'mv_email';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }
  function setSession(token, email) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(EMAIL_KEY, email);
    } catch (_) {}
  }
  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
    } catch (_) {}
  }
  function getEmail() {
    try { return localStorage.getItem(EMAIL_KEY) || ''; } catch (_) { return ''; }
  }
  function isLoggedIn() { return !!getToken(); }

  /* ---------- API ---------- */
  function api(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers['ngrok-skip-browser-warning'] = 'true';
    var t = getToken();
    if (t) opts.headers['Authorization'] = 'Bearer ' + t;
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(API_BASE + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  /* ---------- DOM helpers ---------- */
  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  /* ---------- Auth modal ---------- */
  var modal, emailInput, passInput, errBox, modeLogin = true, titleEl, submitBtn, switchBtn;

  function buildModal() {
    errBox = h('div', { class: 'mv-auth-err', role: 'alert' });
    emailInput = h('input', { class: 'mv-auth-input', type: 'email', placeholder: 'Email', autocomplete: 'email' });
    passInput = h('input', { class: 'mv-auth-input', type: 'password', placeholder: 'Password (min 8 characters)', autocomplete: 'current-password' });
    titleEl = h('h2', { class: 'mv-auth-title', text: 'Sign in' });
    submitBtn = h('button', { class: 'btn btn-primary btn-block', text: 'Sign in', onclick: submit });
    switchBtn = h('button', {
      class: 'mv-auth-switch', type: 'button',
      text: "No account? Create one",
      onclick: function () { setMode(!modeLogin); },
    });
    var closeBtn = h('button', { class: 'mv-auth-close', 'aria-label': 'Close', text: '×', onclick: closeModal });

    var card = h('div', { class: 'modal-card mv-auth-card' }, [
      closeBtn, titleEl,
      h('p', { class: 'mv-auth-sub', text: 'Save your screening history and access it from any device.' }),
      errBox, emailInput, passInput, submitBtn, switchBtn,
      h('p', { class: 'mv-auth-terms' }, [
        document.createTextNode('By continuing you agree to the '),
        h('a', { href: 'terms.html', target: '_blank', text: 'Terms of Service' }),
        document.createTextNode('.'),
      ]),
    ]);
    modal = h('div', { class: 'modal-overlay hidden mv-auth-overlay', role: 'dialog', 'aria-modal': 'true' }, [card]);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    passInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    document.body.appendChild(modal);
  }

  function setMode(login) {
    modeLogin = login;
    titleEl.textContent = login ? 'Sign in' : 'Create account';
    submitBtn.textContent = login ? 'Sign in' : 'Create account';
    switchBtn.textContent = login ? 'No account? Create one' : 'Already registered? Sign in';
    errBox.textContent = '';
  }

  function openModal() {
    if (!modal) buildModal();
    setMode(true);
    modal.classList.remove('hidden');
    setTimeout(function () { emailInput.focus(); }, 40);
  }
  function closeModal() { if (modal) modal.classList.add('hidden'); }

  function submit() {
    errBox.textContent = '';
    submitBtn.disabled = true;
    var path = modeLogin ? '/api/auth/login' : '/api/auth/register';
    api(path, { method: 'POST', body: { email: emailInput.value.trim(), password: passInput.value } })
      .then(function (res) {
        if (res.ok && res.body.token) {
          setSession(res.body.token, res.body.user.email);
          closeModal();
          renderNav();
        } else {
          errBox.textContent = res.body.error || ('Request failed (' + res.status + ')');
        }
      })
      .catch(function () { errBox.textContent = 'Network error - is the API running?'; })
      .finally(function () { submitBtn.disabled = false; });
  }

  function logout() {
    clearSession();
    renderNav();
    closeHistory();
  }

  /* ---------- History panel ---------- */
  var histOverlay;

  function severityClass(sev) {
    return 'mv-sev-' + String(sev || 'mild').toLowerCase();
  }

  function openHistory() {
    if (!isLoggedIn()) { openModal(); return; }
    if (histOverlay) histOverlay.remove();
    var listWrap = h('div', { class: 'mv-hist-list', text: 'Loading…' });
    var card = h('div', { class: 'modal-card mv-hist-card' }, [
      h('button', { class: 'mv-auth-close', 'aria-label': 'Close', text: '×', onclick: closeHistory }),
      h('h2', { class: 'mv-auth-title', text: 'My Screening History' }),
      h('p', { class: 'mv-auth-sub', text: 'Metadata only — images are never stored.' }),
      listWrap,
    ]);
    histOverlay = h('div', { class: 'modal-overlay mv-auth-overlay', role: 'dialog' }, [card]);
    histOverlay.addEventListener('click', function (e) { if (e.target === histOverlay) closeHistory(); });
    document.body.appendChild(histOverlay);

    api('/api/history').then(function (res) {
      if (res.status === 401) { closeHistory(); logout(); openModal(); return; }
      var items = (res.body && res.body.items) || [];
      listWrap.textContent = '';
      if (!items.length) {
        listWrap.appendChild(h('div', { class: 'mv-hist-empty', text: 'No screenings yet. Run an analysis and it will appear here.' }));
        return;
      }
      items.forEach(function (it) {
        var when = it.created_at ? new Date(it.created_at).toLocaleString() : '';
        listWrap.appendChild(h('div', { class: 'mv-hist-row' }, [
          h('div', { class: 'mv-hist-main' }, [
            h('strong', { text: it.top_disease }),
            h('span', { class: 'mv-hist-domain', text: ' · ' + it.domain }),
          ]),
          h('div', { class: 'mv-hist-meta' }, [
            h('span', { class: 'mv-hist-sev ' + severityClass(it.severity), text: it.severity }),
            h('span', { text: (it.top_confidence * 100).toFixed(0) + '%' }),
            h('span', { class: 'mv-hist-when', text: when }),
          ]),
        ]));
      });
    }).catch(function () { listWrap.textContent = 'Could not load history.'; });
  }
  function closeHistory() { if (histOverlay) { histOverlay.remove(); histOverlay = null; } }

  /* ---------- Nav ---------- */
  var navBox;

  function renderNav() {
    if (!navBox) return;
    navBox.innerHTML = '';
    if (isLoggedIn()) {
      var email = getEmail();
      navBox.appendChild(h('button', {
        class: 'mv-nav-btn mv-nav-user', title: email,
        text: email.split('@')[0], onclick: openHistory,
      }));
      navBox.appendChild(h('button', { class: 'mv-nav-btn mv-nav-out', text: 'Sign out', onclick: logout }));
    } else {
      navBox.appendChild(h('button', { class: 'mv-nav-btn mv-nav-in', text: 'Sign in', onclick: openModal }));
    }
  }

  function init() {
    var navRight = document.querySelector('.nav-right');
    if (navRight) {
      navBox = h('span', { class: 'mv-nav-box' });
      navRight.insertBefore(navBox, navRight.firstChild);
      renderNav();
    }
    // Validate stale tokens in the background.
    if (isLoggedIn()) {
      api('/api/auth/me').then(function (res) {
        if (res.status === 401) { clearSession(); renderNav(); }
      }).catch(function () {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  window.MVAuth = {
    getToken: getToken,
    isLoggedIn: isLoggedIn,
    openModal: openModal,
    openHistory: openHistory,
    logout: logout,
  };
})();
