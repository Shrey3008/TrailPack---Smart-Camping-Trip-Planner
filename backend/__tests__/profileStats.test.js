// REGRESSION GUARD: one missing element blanked the whole profile page.
//
// loadProfile() in frontend/profile.js wrote to `stat-completed` and
// `stat-member-since`. Neither exists in frontend/profile.html, so
// getElementById returned null, assigning .textContent on null threw a
// TypeError, and every line after it was skipped. Users saw:
//
//   - "Gear Items 0" on an account with items packed (the packed-count write
//     was the very next line after the throw), and
//   - notification checkboxes that never reflected saved settings.
//
// Confirmed in the browser against the deployed markup before the fix.
//
// This is frontend code and jest runs from backend/, with no jsdom available.
// Rather than add a dependency or reimplement the function (a copy would keep
// passing while the shipped file stayed broken), the real profile.js is
// executed in a vm against a DOM stub whose getElementById returns null for
// unknown ids — the exact browser behaviour that caused the bug.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FRONTEND = path.join(__dirname, '..', '..', 'frontend');
const PROFILE_JS = fs.readFileSync(path.join(FRONTEND, 'profile.js'), 'utf8');
const PROFILE_HTML = fs.readFileSync(path.join(FRONTEND, 'profile.html'), 'utf8');

// Every id the real page actually renders.
function idsInMarkup() {
  return new Set([...PROFILE_HTML.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
}

const USER = {
  user: {
    name: 'Shrey Patel',
    email: 'demo@local.test',
    role: 'admin',
    profile: { phone: '555-0100', notificationSettings: {} },
    stats: { totalTrips: 4, completedTrips: 1, totalItemsPacked: 28, joinedAt: '2026-08-03T00:00:00.000Z' },
  },
};

// Run profile.js with a DOM containing exactly the ids profile.html has.
function runLoadProfile({ ids = idsInMarkup() } = {}) {
  const elements = new Map();
  // Elements carry style/className because profile.js defines its own
  // showMessage() which shadows any stub passed in and writes to both. Without
  // them a failing load throws a second, misleading error inside the error
  // handler rather than surfacing the original one.
  for (const id of ids) {
    elements.set(id, { id, textContent: '', value: '', checked: null, className: '', style: {} });
  }

  const errors = [];
  const messages = [];

  const sandbox = {
    document: {
      // The behaviour at the heart of the bug: unknown id -> null, not a stub.
      getElementById: id => elements.get(id) || null,
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    window: { addEventListener: () => {} },
    console: { error: (...a) => errors.push(a.join(' ')), log: () => {}, warn: () => {} },
    apiCallWithAuth: async () => USER,
    showMessage: (_target, text) => messages.push(text),
    showToast: () => {},
    setTimeout,
    clearTimeout,
    Date,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(PROFILE_JS, sandbox);

  return { elements, errors, messages, loadProfile: sandbox.loadProfile };
}

describe('profile.js survives elements the markup does not have', () => {
  test('THE BUG: the packed-item count is populated', async () => {
    const ctx = runLoadProfile();
    await ctx.loadProfile();

    // Old behaviour: the write to stat-completed threw first, so this element
    // was never touched and the page rendered a stale "0".
    expect(ctx.elements.get('stat-items-packed').textContent).toBe(28);
    expect(ctx.errors).toHaveLength(0);
  });

  test('THE BUG: notification checkboxes reflect saved settings', async () => {
    const ctx = runLoadProfile();
    await ctx.loadProfile();

    // These lines sat after the throw and never ran, so both boxes rendered
    // unchecked no matter what the user had saved.
    expect(ctx.elements.get('email-notifications').checked).toBe(true);
    expect(ctx.elements.get('checklist-reminders').checked).toBe(true);
  });

  test('honours notification settings that are switched off', async () => {
    const ctx = runLoadProfile();
    USER.user.profile.notificationSettings = { email: false, checklistReminders: true };
    await ctx.loadProfile();

    expect(ctx.elements.get('email-notifications').checked).toBe(false);
    expect(ctx.elements.get('checklist-reminders').checked).toBe(true);
    USER.user.profile.notificationSettings = {};
  });

  test('no user-facing failure message is shown on a healthy load', async () => {
    const ctx = runLoadProfile();
    await ctx.loadProfile();

    // The thrown TypeError was caught and surfaced as "Failed to load profile
    // data", which pointed at the network rather than at the real cause.
    //
    // Asserted on the element rather than the injected showMessage stub:
    // profile.js declares its own showMessage, which shadows anything passed
    // into the sandbox, so the stub is never called and an assertion on it
    // would pass no matter what.
    expect(ctx.elements.get('profile-message').textContent).toBe('');
    expect(ctx.errors).toHaveLength(0);
  });

  test('the form fields still populate', async () => {
    const ctx = runLoadProfile();
    await ctx.loadProfile();

    expect(ctx.elements.get('profile-name').value).toBe('Shrey Patel');
    expect(ctx.elements.get('profile-email').value).toBe('demo@local.test');
    expect(ctx.elements.get('profile-role').value).toBe('admin');
    expect(ctx.elements.get('profile-phone').value).toBe('555-0100');
  });

  test('a page missing a stat tile degrades instead of aborting', async () => {
    // The general property, not just the two ids that happened to be wrong:
    // dropping any single display element must not stop the rest loading.
    const ids = idsInMarkup();
    ids.delete('stat-total-trips');
    const ctx = runLoadProfile({ ids });
    await ctx.loadProfile();

    expect(ctx.elements.get('stat-items-packed').textContent).toBe(28);
    expect(ctx.elements.get('email-notifications').checked).toBe(true);
    expect(ctx.errors).toHaveLength(0);
  });
});

describe('profile.js references no element the markup lacks', () => {
  test('every getElementById target exists in profile.html', () => {
    const present = idsInMarkup();
    const referenced = [...PROFILE_JS.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);

    const missing = [...new Set(referenced)].filter(id => !present.has(id));

    // Was ['stat-completed', 'stat-member-since'].
    expect(missing).toEqual([]);
  });
});
