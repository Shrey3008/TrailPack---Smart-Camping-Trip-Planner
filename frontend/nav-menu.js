/* =============================================================
 * TrailPack — Shared hamburger navigation menu
 * -------------------------------------------------------------
 * Replaces the existing pill-button row in `.nav-user` /
 * `.nav-links` with a single ☰ button that opens a themed
 * dropdown matching the dark-green navbar.
 *
 * The script auto-detects what's already in the navbar so each
 * page can keep its own per-route handlers (logout, theme,
 * role-based links). Original elements are moved into a hidden
 * host so existing scripts that toggle their visibility (e.g.
 * `#admin-link.style.display = 'block'`) keep working — the
 * dropdown re-reads visibility every time it opens.
 *
 * Click handlers are preserved by proxying dropdown clicks to
 * the original elements (`originalEl.click()`).
 *
 * The Dark Mode toggle inside the menu is managed directly: it
 * writes `tp-theme` to localStorage, applies `data-theme` on
 * `<html>`, and toggles a `dark-mode` class on `<body>`.
 * ============================================================= */
(function () {
  'use strict';

  /* ---------- Canonical navbar styles (shared across all pages) ----------
     These mirror index.html's navbar CSS so every page that loads
     nav-menu.js renders the same dark-green bar, Playfair brand,
     pill buttons, and red-outlined Logout — without each page
     having to maintain its own copy. The !important flags ensure
     this wins over any leftover per-page navbar rules. */
  const NAVBAR_CSS = `
    .navbar {
      background: #1B4332 !important;
      color: #fff !important;
      padding: 18px 32px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 16px;
      flex-wrap: wrap;
      box-shadow: 0 1px 0 rgba(0,0,0,0.04);
    }
    .navbar .nav-brand { display: flex !important; align-items: center !important; gap: 12px !important; }
    .navbar .nav-brand h1,
    .navbar .nav-brand .brand-text {
      font-family: 'Playfair Display', Georgia, serif !important;
      font-weight: 700 !important;
      font-size: 1.55rem !important;
      color: #fff !important;
      letter-spacing: 0.005em;
      margin: 0 !important;
    }
    .navbar .nav-brand .logo-mark {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 38px !important;
      height: 38px !important;
      border-radius: 10px !important;
      background: rgba(82, 183, 136, 0.15) !important;
    }
    .navbar .nav-brand .logo-mark svg { display: block; }

    /* Brand becomes a click-target back to the dashboard on every page.
       Applied as a class to the existing .nav-brand container so we
       don't restructure any per-page markup. */
    .navbar .nav-brand.tp-brand-link {
      cursor: pointer;
      border-radius: 12px;
      transition: background 0.15s ease;
    }
    .navbar .nav-brand.tp-brand-link:hover { background: rgba(255,255,255,0.06); }
    .navbar .nav-brand.tp-brand-link:focus-visible {
      outline: 2px solid rgba(255,255,255,0.7);
      outline-offset: 2px;
    }

    .navbar .nav-user,
    .navbar .nav-links {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      flex-wrap: wrap;
    }
    .navbar .nav-user .user-name,
    .navbar .nav-user #user-info,
    .navbar .nav-links .user-greeting,
    .navbar .nav-links #user-name {
      color: rgba(255,255,255,0.88) !important;
      font-weight: 500 !important;
      font-size: 0.92rem !important;
      margin-right: 4px;
    }

    @media (max-width: 900px) {
      .navbar { padding: 16px 20px !important; }
      .navbar .nav-user .user-name,
      .navbar .nav-user #user-info,
      .navbar .nav-links .user-greeting,
      .navbar .nav-links #user-name { display: none !important; }
    }
  `;

  const CSS = `
    /* Hamburger button — pill that matches the existing nav buttons. */
    .tp-hamburger {
      background: transparent;
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 999px;
      padding: 8px 14px;
      color: #fff;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s ease, border-color 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 48px;
      height: 40px;
    }
    .tp-hamburger:hover {
      background: rgba(255,255,255,0.10);
      border-color: rgba(255,255,255,0.65);
    }
    .tp-hamburger:focus-visible {
      outline: 2px solid rgba(255,255,255,0.7);
      outline-offset: 2px;
    }

    /* Hidden host that keeps the original nav children alive so
       per-page scripts that read/toggle them keep working. */
    #tp-nav-hidden-host { display: none !important; }

    /* Dropdown */
    .tp-menu {
      position: fixed;
      top: 60px;
      right: 16px;
      width: 240px;
      background: #1e3d2f;
      border: 1px solid rgba(255,255,255,0.20);
      border-radius: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.30);
      padding: 6px 0;
      z-index: 10000;
      opacity: 0;
      transform: translateY(-8px);
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
      font-family: 'Inter', system-ui, sans-serif;
      overflow: hidden;
    }
    .tp-menu.show {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    /* Menu rows */
    .tp-menu-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 12px 18px;
      background: transparent;
      border: 0;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      color: #fff;
      font-size: 15px;
      font-weight: 500;
      font-family: inherit;
      letter-spacing: 0.005em;
      cursor: pointer;
      text-align: left;
      transition: background 0.12s ease, color 0.12s ease;
    }
    .tp-menu-item:last-child { border-bottom: 0; }
    .tp-menu-item:hover { background: rgba(255,255,255,0.06); }
    .tp-menu-item:focus-visible {
      outline: 2px solid rgba(255,255,255,0.7);
      outline-offset: -2px;
    }
    .tp-menu-item.danger { color: #e87070; }
    .tp-menu-item.danger:hover { background: rgba(232,112,112,0.10); }
    .tp-menu-emoji {
      width: 22px;
      flex-shrink: 0;
      text-align: center;
      font-size: 16px;
      line-height: 1;
    }
    .tp-menu-emoji.gold { color: #f5c842; }
    .tp-menu-label { flex: 1; }

    /* iOS-style toggle for the dark-mode row */
    .tp-toggle-switch {
      position: relative;
      width: 38px;
      height: 22px;
      background: #5a6470;
      border-radius: 999px;
      transition: background 0.2s ease;
      flex-shrink: 0;
    }
    .tp-toggle-switch.is-on { background: #2ecc71; }
    .tp-toggle-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      background: #fff;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.20);
      transition: transform 0.2s ease;
    }
    .tp-toggle-switch.is-on .tp-toggle-knob { transform: translateX(16px); }

    @media (max-width: 540px) {
      .tp-menu { right: 10px; width: 220px; }
    }
  `;

  /* ---------- Helpers ---------- */
  const EMOJI_BY_KEYWORD = [
    [/admin/i,                    '🛡️'],
    [/organizer/i,                '🧭'],
    [/history/i,                  '🕒'],
    [/profile/i,                  '👤'],
    [/dashboard|home|my trips/i,  '🏠'],
    [/back/i,                     '⬅️'],
    [/log\s*out|sign\s*out/i,     '🚪'],
  ];
  function inferEmoji(text) {
    const t = String(text || '').trim();
    if (!t) return '•';
    for (const [re, emoji] of EMOJI_BY_KEYWORD) {
      if (re.test(t)) return emoji;
    }
    return '•';
  }
  function cleanLabel(text) {
    // Strip leading arrows + spaces ("← Back to Dashboard" → "Back to Dashboard").
    return String(text || '').trim().replace(/^[←→\s]+/, '').trim();
  }
  function isLogoutEl(el) {
    if (!el) return false;
    if (el.id === 'logout-btn') return true;
    if (el.classList && el.classList.contains('btn-logout')) return true;
    const onclick = el.getAttribute && el.getAttribute('onclick');
    if (onclick && /logout/i.test(onclick)) return true;
    if (/log\s*out|sign\s*out/i.test((el.textContent || ''))) return true;
    return false;
  }
  function isUserDisplayEl(el) {
    if (!el) return false;
    const ids = ['user-info', 'user-name'];
    if (ids.includes(el.id)) return true;
    if (el.classList && (el.classList.contains('user-name') || el.classList.contains('user-greeting'))) return true;
    return false;
  }
  function isOriginallyVisible(el) {
    // Read inline style.display so per-page scripts that set
    // `el.style.display = 'none'` for role gating are respected.
    return (el.style && el.style.display) !== 'none';
  }

  /* ---------- Theme management ---------- */
  function applyTheme(t) {
    try { localStorage.setItem('tp-theme', t); } catch (_) {}
    document.documentElement.setAttribute('data-theme', t);
    document.body.classList.toggle('dark-mode', t === 'dark');
  }
  function currentTheme() {
    try {
      return localStorage.getItem('tp-theme') || document.documentElement.getAttribute('data-theme') || 'light';
    } catch (_) {
      return document.documentElement.getAttribute('data-theme') || 'light';
    }
  }

  /* ---------- Role-based items (single source of truth) ----------
     Reads sessionStorage.currentUser.role and emits the dropdown
     entries that should be visible for that role. Re-evaluated on
     every menu open so role changes (impersonation, demotion) are
     reflected without a page reload. */
  function getCurrentRole() {
    try {
      const u = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
      return (u && u.role) ? String(u.role).toLowerCase() : 'user';
    } catch (_) { return 'user'; }
  }
  function getRoleItems() {
    const role = getCurrentRole();
    const out = [];
    if (role === 'organizer' || role === 'admin') {
      out.push({ label: 'Organizer', href: 'organizer.html', emoji: '🧭' });
    }
    if (role === 'admin') {
      out.push({ label: 'Admin', href: 'admin.html', emoji: '🛡️' });
    }
    return out;
  }

  /* ---------- Default logout ---------- */
  function defaultLogout() {
    try {
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('currentUser');
    } catch (_) {}
    window.location.href = 'login.html';
  }

  /* ---------- Init ---------- */
  function injectStyles() {
    if (document.getElementById('tp-nav-menu-styles')) return;
    const style = document.createElement('style');
    style.id = 'tp-nav-menu-styles';
    // Canonical navbar styles first, then dropdown styles. Both are
    // injected from a single shared source so future tweaks live in
    // one place (this file) instead of being duplicated on every page.
    style.textContent = NAVBAR_CSS + '\n' + CSS;
    document.head.appendChild(style);
  }

  /* Make the brand block a click-target back to the dashboard on
     every page. Implemented as a non-destructive click handler
     (no DOM restructuring) so we never disturb existing markup or
     event listeners other pages may have wired up. */
  function wireBrandLink() {
    try {
      const brand = document.querySelector('.navbar .nav-brand');
      if (!brand || brand.dataset.tpBrandWired === '1') return;
      brand.dataset.tpBrandWired = '1';
      brand.classList.add('tp-brand-link');
      brand.setAttribute('role', 'link');
      brand.setAttribute('tabindex', '0');
      brand.setAttribute('aria-label', 'TrailPack — go to dashboard');
      const goHome = () => { window.location.href = 'index.html'; };
      brand.addEventListener('click', (e) => {
        // Don't hijack clicks on existing inner anchors/buttons.
        if (e.target.closest('a, button')) return;
        goHome();
      });
      brand.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goHome();
        }
      });
    } catch (_) {
      // Brand wiring is non-essential — never let it break the page.
    }
  }

  /* Populate the username slot from sessionStorage if a page leaves
     it blank. Mirrors the existing app.js behaviour ("Hi, <name>")
     so the dashboard and any page that loads nav-menu.js show the
     same greeting without needing per-page glue code. */
  function populateUserName() {
    const el = document.getElementById('user-info') || document.getElementById('user-name');
    if (!el) return;
    if ((el.textContent || '').trim()) return;
    try {
      const u = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
      if (u && u.name) el.textContent = 'Hi, ' + u.name;
    } catch (_) {}
  }

  function getHiddenHost() {
    let host = document.getElementById('tp-nav-hidden-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'tp-nav-hidden-host';
      document.body.appendChild(host);
    }
    return host;
  }

  function init() {
    // Already initialised on this page — no-op.
    if (document.querySelector('.tp-hamburger')) return;
    try { injectStyles(); } catch (_) {}
    try { wireBrandLink(); } catch (_) {}
    try { populateUserName(); } catch (_) {}

    const container = document.querySelector('.nav-user, .nav-links');
    if (!container) return;

    const hiddenHost = getHiddenHost();
    const items = []; // { label, originalEl, emoji, danger }
    let logoutEl = null;

    // Snapshot current children before mutation.
    const children = Array.from(container.children);
    children.forEach((el) => {
      // Keep username display in place — it stays on the left of the hamburger.
      if (isUserDisplayEl(el)) return;

      // Theme toggle is replaced by the dark-mode switch inside the menu.
      // We move the original button into the hidden host so any existing
      // scripts that grab it via getElementById still work; we manage the
      // theme directly so we don't double-toggle.
      if (el.id === 'theme-toggle') {
        hiddenHost.appendChild(el);
        return;
      }

      // Logout is rendered as a fixed danger row at the bottom of the menu.
      if (isLogoutEl(el)) {
        logoutEl = el;
        hiddenHost.appendChild(el);
        return;
      }

      // Everything else (links + role-gated buttons) becomes a menu item.
      const rawText = el.textContent || '';
      const label = cleanLabel(rawText);
      if (!label) {
        // Unlabeled element — skip but still hide.
        hiddenHost.appendChild(el);
        return;
      }
      items.push({
        label,
        originalEl: el,
        emoji: inferEmoji(rawText),
      });
      hiddenHost.appendChild(el);
    });

    // Build hamburger
    const hamburger = document.createElement('button');
    hamburger.type = 'button';
    hamburger.className = 'tp-hamburger';
    hamburger.setAttribute('aria-label', 'Open menu');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-haspopup', 'menu');
    hamburger.textContent = '☰';
    container.appendChild(hamburger);

    // Build dropdown (attached to body to avoid clipping by transformed
    // ancestors and to ensure consistent fixed positioning).
    const menu = document.createElement('div');
    menu.className = 'tp-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-hidden', 'true');
    document.body.appendChild(menu);

    function buildMenu() {
      menu.innerHTML = '';

      // Custom links (filter out role-gated items hidden by per-page JS).
      items.forEach((item) => {
        if (!isOriginallyVisible(item.originalEl)) return;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'tp-menu-item';
        row.setAttribute('role', 'menuitem');
        row.innerHTML =
          '<span class="tp-menu-emoji">' + item.emoji + '</span>' +
          '<span class="tp-menu-label"></span>';
        row.querySelector('.tp-menu-label').textContent = item.label;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          closeMenu();
          // Proxy click to the original element so its existing
          // handlers (navigation, role logic, analytics) fire.
          try { item.originalEl.click(); } catch (_) {}
        });
        menu.appendChild(row);
      });

      // Role-based rows (Organizer / Admin). Driven by
      // sessionStorage.currentUser.role — no per-page markup required.
      getRoleItems().forEach((roleItem) => {
        const row = document.createElement('a');
        row.href = roleItem.href;
        row.className = 'tp-menu-item';
        row.setAttribute('role', 'menuitem');
        row.innerHTML =
          '<span class="tp-menu-emoji">' + roleItem.emoji + '</span>' +
          '<span class="tp-menu-label"></span>';
        row.querySelector('.tp-menu-label').textContent = roleItem.label;
        row.addEventListener('click', () => closeMenu());
        menu.appendChild(row);
      });

      // Dark Mode row
      const darkRow = document.createElement('div');
      darkRow.className = 'tp-menu-item tp-menu-darkrow';
      darkRow.setAttribute('role', 'menuitemcheckbox');
      darkRow.tabIndex = 0;
      darkRow.innerHTML =
        '<span class="tp-menu-emoji gold">🌙</span>' +
        '<span class="tp-menu-label">Dark Mode</span>' +
        '<span class="tp-toggle-switch" aria-hidden="true">' +
          '<span class="tp-toggle-knob"></span>' +
        '</span>';
      const sw = darkRow.querySelector('.tp-toggle-switch');
      const isDark = currentTheme() === 'dark';
      sw.classList.toggle('is-on', isDark);
      darkRow.setAttribute('aria-checked', isDark ? 'true' : 'false');
      darkRow.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = sw.classList.contains('is-on') ? 'light' : 'dark';
        applyTheme(next);
        sw.classList.toggle('is-on', next === 'dark');
        darkRow.setAttribute('aria-checked', next === 'dark' ? 'true' : 'false');
      });
      darkRow.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          darkRow.click();
        }
      });
      menu.appendChild(darkRow);

      // Logout row (always present)
      const logoutRow = document.createElement('button');
      logoutRow.type = 'button';
      logoutRow.className = 'tp-menu-item danger';
      logoutRow.setAttribute('role', 'menuitem');
      logoutRow.innerHTML =
        '<span class="tp-menu-emoji">🚪</span>' +
        '<span class="tp-menu-label">Logout</span>';
      logoutRow.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        if (logoutEl) {
          try { logoutEl.click(); return; } catch (_) {}
        }
        defaultLogout();
      });
      menu.appendChild(logoutRow);
    }

    function positionMenu() {
      const rect = hamburger.getBoundingClientRect();
      const right = Math.max(8, window.innerWidth - rect.right);
      menu.style.right = right + 'px';
      menu.style.top = (rect.bottom + 8) + 'px';
    }

    let outsideClickAttached = false;
    function onDocClick(e) {
      if (!menu.contains(e.target) && !hamburger.contains(e.target)) {
        closeMenu();
      }
    }
    function onKeydown(e) {
      if (e.key === 'Escape') closeMenu();
    }
    function onScroll() { if (menu.classList.contains('show')) positionMenu(); }

    function openMenu() {
      buildMenu();
      positionMenu();
      menu.classList.add('show');
      menu.setAttribute('aria-hidden', 'false');
      hamburger.setAttribute('aria-expanded', 'true');
      if (!outsideClickAttached) {
        // Defer to the next tick so the click that opened the menu
        // doesn't immediately close it.
        setTimeout(() => {
          document.addEventListener('click', onDocClick);
          document.addEventListener('keydown', onKeydown);
          window.addEventListener('scroll', onScroll, true);
          outsideClickAttached = true;
        }, 0);
      }
    }
    function closeMenu() {
      menu.classList.remove('show');
      menu.setAttribute('aria-hidden', 'true');
      hamburger.setAttribute('aria-expanded', 'false');
      if (outsideClickAttached) {
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKeydown);
        window.removeEventListener('scroll', onScroll, true);
        outsideClickAttached = false;
      }
    }

    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu.classList.contains('show')) closeMenu();
      else openMenu();
    });
    window.addEventListener('resize', positionMenu);

    // Apply current theme on load so freshly opened pages reflect
    // the persisted dark-mode state (mirrors per-page pre-paint).
    applyTheme(currentTheme());

    // Expose a small API so pages can drive the menu programmatically.
    window.tpNavMenu = Object.assign(window.tpNavMenu || {}, {
      open: openMenu,
      close: closeMenu,
      rebuild: buildMenu,
      applyTheme,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
