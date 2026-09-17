/**
 * Phase 2's landing page.
 *
 * A placeholder on purpose: Phase 2 ships auth, and Phase 3 replaces this with
 * the real trip list. It shows the verified session so signing in demonstrably
 * worked — the values below come from /auth/me, not from the login response,
 * so seeing them means the token round-tripped.
 */

import { useAuth } from '../auth/useAuth';

export function DashboardPlaceholder() {
  const { user, logout } = useAuth();

  return (
    <main className="placeholder-page">
      <h1>Signed in{user ? `, ${user.name}` : ''}</h1>
      <p>
        Phase 2 of the React migration ships authentication only. Trips, the
        checklist and the admin views arrive in later phases.
      </p>

      {user ? (
        <dl className="placeholder-page__meta">
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Role</dt>
          <dd>{user.role}</dd>
          {user.stats ? (
            <>
              <dt>Trips</dt>
              <dd>{user.stats.totalTrips}</dd>
              <dt>Items packed</dt>
              <dd>{user.stats.totalItemsPacked}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      <p style={{ marginTop: '1.5rem' }}>
        <button type="button" className="btn btn--primary" style={{ width: 'auto' }} onClick={logout}>
          Sign out
        </button>
      </p>
    </main>
  );
}
