/* =============================================================
 * TrailPack — notification bell
 * -------------------------------------------------------------
 * The /notifications API, its model and its tests have existed for a while
 * with no interface at all: no frontend file called any of the eleven
 * endpoints, so in-app notifications were unreachable however many were
 * recorded. This is that interface.
 *
 * Mounted next to the hamburger in the shared navbar, so it appears on every
 * signed-in page without per-page markup. Loads after nav-menu.js and finds
 * the same container that script uses; if the navbar has not been built (or
 * nobody is signed in) it does nothing at all.
 *
 * Styles are injected here rather than living in theme.css, matching the
 * pattern nav-menu.js already uses for navbar-owned UI — the component stays
 * self-contained and a page that does not load this file gets none of it.
 * ============================================================= */
(function () {
  'use strict';

  if (window.__trailpackBellLoaded) return;
  window.__trailpackBellLoaded = true;

  const POLL_MS = 60000;

  function token() {
    return sessionStorage.getItem('authToken');
  }

  function api(path, options = {}) {
    return fetch(`${window.API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token()}`,
        ...(options.headers || {}),
      },
    });
  }

  // "3m", "2h", "5d" — compact enough for a dropdown row.
  function relativeTime(iso) {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }

  // The message is server-authored, but it interpolates user-supplied names and
  // trip titles, so it is rendered as text and never as markup.
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const ICONS = {
    'pre-trip': '🏕️',
    'packing-nudge': '⏰',
    'trip-invitation': '👥',
    'weather-alert': '🌧️',
    'checklist-progress': '🎒',
    welcome: '👋',
  };

  function injectStyles() {
    if (document.getElementById('tp-bell-styles')) return;
    const style = document.createElement('style');
    style.id = 'tp-bell-styles';
    style.textContent = `
      .tp-bell {
        position: relative;
        display: inline-flex; align-items: center; justify-content: center;
        width: 40px; height: 40px; min-width: 44px; min-height: 44px;
        border-radius: 9999px;
        border: 1px solid #e8e8e4;
        background: #fff;
        font-size: 17px; line-height: 1;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .tp-bell:hover { background: rgba(45, 106, 79, 0.06); border-color: #d8d8d2; }
      .tp-bell:focus-visible { outline: 2px solid #40916c; outline-offset: 2px; }
      .tp-bell__badge {
        position: absolute; top: 2px; right: 2px;
        min-width: 17px; height: 17px; padding: 0 4px;
        border-radius: 9999px;
        background: #b91c1c; color: #fff;
        font-size: 10.5px; font-weight: 700; line-height: 17px;
        text-align: center;
        box-shadow: 0 0 0 2px #fff;
      }
      .tp-bell__badge[hidden] { display: none; }

      .tp-bell-panel {
        position: fixed; top: 64px; right: 16px;
        width: min(360px, calc(100vw - 32px));
        max-height: min(70vh, 520px);
        display: none; flex-direction: column;
        background: #fff;
        border: 1px solid #e8e8e4;
        border-radius: 14px;
        box-shadow: 0 16px 44px rgba(15, 23, 42, 0.16);
        z-index: 1300;
        overflow: hidden;
      }
      .tp-bell-panel.open { display: flex; }
      .tp-bell-panel__head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding: 13px 16px;
        border-bottom: 1px solid #efeee9;
      }
      .tp-bell-panel__title {
        font-weight: 700; font-size: 0.95rem; color: #1a1a1a;
        font-family: 'Playfair Display', Georgia, serif;
      }
      .tp-bell-panel__markall {
        border: none; background: none; padding: 6px 8px;
        font: inherit; font-size: 0.78rem; font-weight: 600;
        color: #2d6a4f; cursor: pointer; border-radius: 8px;
        transition: background 0.15s ease;
      }
      .tp-bell-panel__markall:hover { background: rgba(45, 106, 79, 0.08); }
      .tp-bell-panel__markall[disabled] { color: #9aa3af; cursor: default; background: none; }
      .tp-bell-panel__list { overflow-y: auto; }

      .tp-note {
        display: flex; gap: 11px; width: 100%;
        padding: 12px 16px; text-align: left;
        border: none; border-bottom: 1px solid #f3f2ee;
        background: #fff; font: inherit; cursor: pointer;
        transition: background 0.15s ease;
      }
      .tp-note:last-child { border-bottom: none; }
      .tp-note:hover { background: #faf9f6; }
      .tp-note.is-unread { background: #f2f9f5; }
      .tp-note.is-unread:hover { background: #e9f4ee; }
      .tp-note__icon { font-size: 15px; line-height: 1.4; flex-shrink: 0; }
      .tp-note__body { min-width: 0; }
      /* Both of these are spans, so they need to be told to stack — left
         inline, a long message runs straight into its timestamp and wraps
         mid-way through it ("...in 3 days 41m / ago"). */
      .tp-note__msg,
      .tp-note__time { display: block; }
      .tp-note__msg {
        font-size: 0.845rem; color: #1a1a1a; line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .tp-note__time { font-size: 0.72rem; color: #9aa3af; margin-top: 3px; }
      .tp-note__dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #2d6a4f; flex-shrink: 0; margin-top: 6px; margin-left: auto;
      }
      /* Chevron on rows that go somewhere. Without it a tappable row and an
         inert one look identical, and the only way to find out is to tap. */
      .tp-note__go {
        margin-left: auto; align-self: center;
        color: #6b7280; font-size: 18px; line-height: 1; flex-shrink: 0;
      }
      .tp-note.has-link { cursor: pointer; }
      .tp-note.has-link:hover .tp-note__go { color: #2d6a4f; }
      /* The unread dot also claims margin-left:auto; when both are present the
         chevron takes the gap and the dot sits next to it. */
      .tp-note__go + .tp-note__dot { margin-left: 8px; }

      .tp-bell-empty { padding: 30px 20px; text-align: center; color: #6b7280; }
      .tp-bell-empty__icon { font-size: 22px; display: block; margin-bottom: 8px; }
      .tp-bell-empty__text { font-size: 0.85rem; }

      @media (prefers-reduced-motion: reduce) {
        .tp-bell, .tp-note, .tp-bell-panel__markall { transition: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    if (!token()) return;                       // signed out: no bell at all
    if (document.querySelector('.tp-bell')) return;

    const container = document.querySelector('.nav-user, .nav-links');
    if (!container) return;                     // page has no navbar

    injectStyles();

    const bell = document.createElement('button');
    bell.type = 'button';
    bell.className = 'tp-bell';
    bell.setAttribute('aria-label', 'Notifications');
    bell.setAttribute('aria-expanded', 'false');
    bell.setAttribute('aria-haspopup', 'true');
    bell.innerHTML = '🔔<span class="tp-bell__badge" hidden></span>';

    // Sit to the left of the hamburger when nav-menu.js has already run.
    const hamburger = container.querySelector('.tp-hamburger');
    if (hamburger) container.insertBefore(bell, hamburger);
    else container.appendChild(bell);

    const panel = document.createElement('div');
    panel.className = 'tp-bell-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Notifications');
    panel.innerHTML = `
      <div class="tp-bell-panel__head">
        <span class="tp-bell-panel__title">Notifications</span>
        <button type="button" class="tp-bell-panel__markall">Mark all read</button>
      </div>
      <div class="tp-bell-panel__list"></div>`;
    document.body.appendChild(panel);

    const badge = bell.querySelector('.tp-bell__badge');
    const list = panel.querySelector('.tp-bell-panel__list');
    const markAll = panel.querySelector('.tp-bell-panel__markall');

    let notes = [];

    function paintBadge() {
      const unread = notes.filter(n => !n.read).length;
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.hidden = unread === 0;
      markAll.disabled = unread === 0;
      bell.setAttribute('aria-label',
        unread ? `Notifications (${unread} unread)` : 'Notifications');
    }

    function paintList() {
      if (!notes.length) {
        list.innerHTML = `
          <div class="tp-bell-empty">
            <span class="tp-bell-empty__icon">🔔</span>
            <span class="tp-bell-empty__text">No notifications yet.<br>Trip reminders will show up here.</span>
          </div>`;
        return;
      }
      list.innerHTML = notes.map(n => {
        const link = safeLink(n.link);
        return `
        <button type="button" class="tp-note${n.read ? '' : ' is-unread'}${link ? ' has-link' : ''}"
                data-id="${escapeHtml(n.notifId)}"${link ? ` data-link="${escapeHtml(link)}"` : ''}>
          <span class="tp-note__icon" aria-hidden="true">${ICONS[n.type] || '🔔'}</span>
          <span class="tp-note__body">
            <span class="tp-note__msg">${escapeHtml(n.message)}</span>
            <span class="tp-note__time">${escapeHtml(relativeTime(n.createdAt))}</span>
          </span>
          ${link ? '<span class="tp-note__go" aria-hidden="true">›</span>' : ''}
          ${n.read ? '' : '<span class="tp-note__dot" aria-label="unread"></span>'}
        </button>`;
      }).join('');
    }

    async function load() {
      try {
        const res = await api('/notifications');
        if (!res.ok) return;
        const data = await res.json();
        notes = Array.isArray(data) ? data : [];
        paintBadge();
        paintList();
      } catch (_) {
        // Offline or backend asleep — leave whatever is on screen alone rather
        // than replacing it with an error the user cannot act on.
      }
    }

    async function markRead(id) {
      const note = notes.find(n => n.notifId === id);
      if (!note || note.read) return;
      note.read = true;                          // optimistic
      paintBadge();
      paintList();
      try { await api(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' }); }
      catch (_) { /* next load reconciles */ }
    }

    function setOpen(open) {
      panel.classList.toggle('open', open);
      bell.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) load();
    }

    bell.addEventListener('click', e => {
      e.stopPropagation();
      setOpen(!panel.classList.contains('open'));
    });

    // Only ever navigate to a path on this origin. The backend already refuses
    // to store anything else, but the value arrives over the network and ends up
    // in window.location, so it is checked again here rather than trusted twice
    // over — an absolute or protocol-relative value would be an open redirect.
    function safeLink(link) {
      if (!link || typeof link !== 'string') return '';
      const trimmed = link.trim();
      if (!trimmed) return '';
      if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return '';
      return trimmed.replace(/^\/+/, '');
    }

    list.addEventListener('click', e => {
      const row = e.target.closest('.tp-note');
      if (!row) return;
      markRead(row.dataset.id);
      // Marking read is optimistic and its request is fire-and-forget, so
      // navigating straight away does not lose it — the row is already painted
      // read, and the next load reconciles if the PUT failed.
      const target = safeLink(row.dataset.link);
      if (target) window.location.href = target;
    });

    markAll.addEventListener('click', async () => {
      notes.forEach(n => { n.read = true; });
      paintBadge();
      paintList();
      try { await api('/notifications/read-all', { method: 'PUT' }); }
      catch (_) { /* next load reconciles */ }
    });

    // Close on outside click and on Escape, matching the hamburger menu.
    document.addEventListener('click', e => {
      if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== bell) {
        setOpen(false);
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && panel.classList.contains('open')) {
        setOpen(false);
        bell.focus();
      }
    });

    load();
    setInterval(load, POLL_MS);
  }

  // nav-menu.js builds the navbar this attaches to, so run after it. Both use
  // DOMContentLoaded; the later listener wins the ordering, and init() falls
  // back to appending if the hamburger is not there yet.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
