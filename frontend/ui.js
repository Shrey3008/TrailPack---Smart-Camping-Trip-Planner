// TrailPack shared UI helpers: toast notifications + confirmation modal.
// Keep this file framework-free so every page can load it without dependencies.

(function () {
  if (window.__trailpackUiLoaded) return;
  window.__trailpackUiLoaded = true;

  function ensureToastContainer() {
    let c = document.getElementById('tp-toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'tp-toast-container';
      c.className = 'tp-toast-container';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      document.body.appendChild(c);
    }
    return c;
  }

  // Show a transient toast. type: 'success' | 'error' | 'info' | 'warning'
  function showToast(message, type = 'info', duration = 3200) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `tp-toast tp-toast-${type}`;
    const icon = { success: '✅', error: '⚠️', info: 'ℹ️', warning: '⚠️' }[type] || 'ℹ️';
    toast.innerHTML = `
      <span class="tp-toast-icon" aria-hidden="true">${icon}</span>
      <span class="tp-toast-msg"></span>
      <button class="tp-toast-close" aria-label="Dismiss">×</button>
    `;
    toast.querySelector('.tp-toast-msg').textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('tp-toast-in'));

    const remove = () => {
      toast.classList.remove('tp-toast-in');
      toast.classList.add('tp-toast-out');
      setTimeout(() => toast.remove(), 220);
    };
    toast.querySelector('.tp-toast-close').addEventListener('click', remove);
    if (duration > 0) setTimeout(remove, duration);
    return remove;
  }

  // Promise-based confirmation modal. Returns Promise<boolean>.
  function showConfirm(message, options = {}) {
    const {
      title = 'Are you sure?',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      danger = false,
    } = options;

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'tp-modal-overlay';
      overlay.innerHTML = `
        <div class="tp-modal" role="dialog" aria-modal="true" aria-labelledby="tp-modal-title">
          <h3 id="tp-modal-title" class="tp-modal-title"></h3>
          <p class="tp-modal-body"></p>
          <div class="tp-modal-actions">
            <button type="button" class="btn btn-secondary tp-modal-cancel"></button>
            <button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'} tp-modal-confirm"></button>
          </div>
        </div>
      `;
      overlay.querySelector('.tp-modal-title').textContent = title;
      overlay.querySelector('.tp-modal-body').textContent = message;
      overlay.querySelector('.tp-modal-cancel').textContent = cancelText;
      overlay.querySelector('.tp-modal-confirm').textContent = confirmText;

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('tp-modal-in'));

      const cleanup = (result) => {
        overlay.classList.remove('tp-modal-in');
        overlay.classList.add('tp-modal-out');
        setTimeout(() => overlay.remove(), 180);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') cleanup(false);
        if (e.key === 'Enter') cleanup(true);
      };
      overlay.querySelector('.tp-modal-cancel').addEventListener('click', () => cleanup(false));
      overlay.querySelector('.tp-modal-confirm').addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
      document.addEventListener('keydown', onKey);

      // focus the safe/primary action
      setTimeout(() => overlay.querySelector(danger ? '.tp-modal-cancel' : '.tp-modal-confirm')?.focus(), 60);
    });
  }

  // Inline error banner helper for forms. Pass a container element or id, set text to null to hide.
  function showFormError(target, text) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.textContent = text;
    el.style.display = 'block';
    el.classList.add('tp-shake');
    setTimeout(() => el.classList.remove('tp-shake'), 500);
  }

  window.showToast = showToast;
  window.showConfirm = showConfirm;
  window.showFormError = showFormError;
})();
