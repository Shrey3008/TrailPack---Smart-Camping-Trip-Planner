/* =============================================================
 * TrailPack — Shared hamburger navigation menu
 * -------------------------------------------------------------
 * Replaces the existing pill-button row in `.nav-user` /
 * `.nav-links` with a single ☰ button that opens a clean
 * white-pill dropdown matching the navbar aesthetic.
 *
 * The menu automatically excludes the link for the page the
 * user is currently on (e.g. on my-trips.html, the "My Trips"
 * row is hidden) so the dropdown only offers navigation to
 * other places.
 *
 * The script auto-detects what's already in the navbar so each
 * page can keep its own per-route handlers (logout,
 * role-based links). Original elements are moved into a hidden
 * host so existing scripts that toggle their visibility (e.g.
 * `#admin-link.style.display = 'block'`) keep working — the
 * dropdown re-reads visibility every time it opens.
 *
 * Click handlers are preserved by proxying dropdown clicks to
 * the original elements (`originalEl.click()`).
 * ============================================================= */
(function () {
  'use strict';

  /* ---------- Canonical navbar styles (shared across all pages) ----------
     Mirrors the dashboard (index.html via dashboard-light.css) reference
     exactly so every page that loads nav-menu.js renders the same white
     surface, 64px height, 1.45rem Playfair brand, and 38px logo. The
     dashboard itself wins via the higher-specificity selector
     `body.dash-light .navbar`, so these rules don't change the reference. */
  const NAVBAR_CSS = `
    .navbar {
      background: #ffffff !important;
      color: #1a1a1a !important;
      padding: 0 32px !important;
      min-height: 64px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px;
      flex-wrap: wrap;
      border-bottom: 1px solid #e8e8e4 !important;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      position: sticky !important;
      top: 0 !important;
      z-index: 100;
    }
    .navbar .nav-brand { display: flex !important; align-items: center !important; gap: 12px !important; }
    .navbar .nav-brand h1,
    .navbar .nav-brand .brand-text {
      font-family: 'Playfair Display', Georgia, serif !important;
      font-weight: 700 !important;
      font-size: 1.45rem !important;
      color: #1a1a1a !important;
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
      background: #e6f2eb !important;
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
    .navbar .nav-brand.tp-brand-link:hover { background: rgba(45, 106, 79, 0.06); }
    .navbar .nav-brand.tp-brand-link:focus-visible {
      outline: 2px solid rgba(45, 106, 79, 0.6);
      outline-offset: 2px;
    }

    .navbar .nav-user,
    .navbar .nav-links {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      flex-wrap: wrap;
    }
    .navbar .nav-user .user-name,
    .navbar .nav-user #user-info,
    .navbar .nav-links .user-greeting,
    .navbar .nav-links #user-name {
      color: #1a1a1a !important;
      font-weight: 600 !important;
      font-size: 0.9rem !important;
      margin: 0 !important;
    }

    @media (max-width: 900px) {
      .navbar { padding: 0 20px !important; }
      .navbar .nav-user .user-name,
      .navbar .nav-user #user-info,
      .navbar .nav-links .user-greeting,
      .navbar .nav-links #user-name { display: none !important; }
    }
  `;

  const CSS = `
    /* Hamburger button — pill that matches the white navbar. */
    .tp-hamburger {
      background: transparent;
      border: 1px solid #e8e8e4;
      border-radius: 999px;
      padding: 8px 14px;
      color: #374151;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 48px;
      height: 40px;
    }
    .tp-hamburger:hover {
      background: #f3f4f6;
      border-color: #d8d8d2;
      color: #1a1a1a;
    }
    .tp-hamburger:focus-visible {
      outline: 2px solid rgba(45, 106, 79, 0.6);
      outline-offset: 2px;
    }

    /* Hidden host that keeps the original nav children alive so
       per-page scripts that read/toggle them keep working. */
    #tp-nav-hidden-host { display: none !important; }

    /* Dropdown — clean white pill overlay matching the navbar. */
    .tp-menu {
      position: fixed;
      top: 60px;
      right: 16px;
      width: 240px;
      background: #ffffff;
      color: #1a1a1a;
      border: 1px solid #e8e8e4;
      border-radius: 14px;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.10), 0 2px 6px rgba(15, 23, 42, 0.06);
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
      border-bottom: 1px solid #f0f0ec;
      color: #1a1a1a;
      font-size: 15px;
      font-weight: 500;
      font-family: inherit;
      letter-spacing: 0.005em;
      cursor: pointer;
      text-align: left;
      text-decoration: none;
      transition: background 0.12s ease, color 0.12s ease;
    }
    .tp-menu-item:last-child { border-bottom: 0; }
    .tp-menu-item:hover { background: #f3f4f6; color: #111; }
    .tp-menu-item:focus-visible {
      outline: 2px solid rgba(45, 106, 79, 0.55);
      outline-offset: -2px;
    }
    .tp-menu-item.danger { color: #c0392b; }
    .tp-menu-item.danger:hover { background: rgba(192, 57, 43, 0.08); color: #a32b20; }
    .tp-menu-emoji {
      width: 22px;
      flex-shrink: 0;
      text-align: center;
      font-size: 16px;
      line-height: 1;
    }
    .tp-menu-emoji.gold { color: #c29a1a; }
    .tp-menu-label { flex: 1; }

    @media (max-width: 540px) {
      .tp-menu { right: 10px; width: 220px; }
    }
  `;

  /* ---------- Helpers ---------- */
  const EMOJI_BY_KEYWORD = [
    [/admin/i,                    '🛡️'],
    [/organizer/i,                '🧭'],
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
  // Some pages (e.g. organizer.html) ship a hardcoded "Admin" anchor
  // that's hidden until per-page JS detects an admin user. Since
  // getRoleItems() is the canonical source for role-gated rows, we
  // strip those hardcoded anchors out of the per-page ingestion to
  // avoid double entries in the dropdown.
  function isRoleGatedLink(el) {
    if (!el) return false;
    if (el.id === 'admin-link' || el.id === 'organizer-link') return true;
    const href = (el.getAttribute && el.getAttribute('href')) || '';
    if (/(?:^|\/)admin\.html(?:[?#]|$)/i.test(href)) return true;
    if (/(?:^|\/)organizer\.html(?:[?#]|$)/i.test(href)) return true;
    return false;
  }
  function isOriginallyVisible(el) {
    // Read inline style.display so per-page scripts that set
    // `el.style.display = 'none'` for role gating are respected.
    return (el.style && el.style.display) !== 'none';
  }

  /* ---------- Current-page detection ----------
     Used to suppress the dropdown row pointing at the page the
     user is already on. Normalises both sides to a lowercased
     filename (e.g. "my-trips.html") and treats an empty path as
     the root dashboard ("index.html"). */
  function currentPageBasename() {
    try {
      const path = (window.location.pathname || '').split(/[?#]/)[0];
      const last = path.split('/').filter(Boolean).pop() || '';
      if (!last || !/\.html?$/i.test(last)) return 'index.html';
      return last.toLowerCase();
    } catch (_) { return ''; }
  }
  function hrefBasename(href) {
    if (!href) return '';
    const url = String(href).split(/[?#]/)[0];
    const last = url.split('/').filter(Boolean).pop() || '';
    if (!last) return 'index.html';
    return last.toLowerCase();
  }
  function isCurrentPageHref(href) {
    const cur = currentPageBasename();
    const target = hrefBasename(href);
    return !!cur && !!target && cur === target;
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

      // Page-level opt-out: elements marked with data-keep-in-nav="true"
      // stay visible in the navbar (e.g. checklist page's Print + Export
      // CSV buttons that should sit right next to the hamburger).
      if (el.getAttribute && el.getAttribute('data-keep-in-nav') === 'true') return;

      // Logout is rendered as a fixed danger row at the bottom of the menu.
      if (isLogoutEl(el)) {
        logoutEl = el;
        hiddenHost.appendChild(el);
        return;
      }

      // Role-gated hardcoded links (e.g. organizer.html's
      // <a id="admin-link" href="admin.html">Admin</a>) are owned
      // exclusively by getRoleItems() to avoid duplicate rows in the
      // dropdown. Move them to the hidden host so per-page JS that
      // still toggles their visibility doesn't crash.
      if (isRoleGatedLink(el)) {
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
        // Captured now because the element lives in the hidden host
        // from this point on — used to filter out the current page.
        href: (el.getAttribute && el.getAttribute('href')) || '',
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

      // Core "My Trips" entry — every page can jump back to the
      // trips view, except the page that IS the trips view.
      if (!isCurrentPageHref('my-trips.html')) {
        const tripsRow = document.createElement('a');
        tripsRow.href = 'my-trips.html';
        tripsRow.className = 'tp-menu-item';
        tripsRow.setAttribute('role', 'menuitem');
        tripsRow.innerHTML =
          '<span class="tp-menu-emoji">🏠</span>' +
          '<span class="tp-menu-label">My Trips</span>';
        tripsRow.addEventListener('click', () => closeMenu());
        menu.appendChild(tripsRow);
      }

      // Custom links (skip role-gated items hidden by per-page JS
      // and anything that points at the current page).
      items.forEach((item) => {
        if (!isOriginallyVisible(item.originalEl)) return;
        if (item.href && isCurrentPageHref(item.href)) return;
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
      // Current-page entries are filtered so e.g. admin.html's menu
      // doesn't offer a link to itself.
      getRoleItems().forEach((roleItem) => {
        if (isCurrentPageHref(roleItem.href)) return;
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

    // Expose a small API so pages can drive the menu programmatically.
    window.tpNavMenu = Object.assign(window.tpNavMenu || {}, {
      open: openMenu,
      close: closeMenu,
      rebuild: buildMenu,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
