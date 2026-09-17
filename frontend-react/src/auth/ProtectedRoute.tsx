/**
 * Route guards.
 *
 * Two separate components because they answer different questions — "are you
 * signed in" and "are you allowed here" — and conflating them produces the
 * wrong redirect. A signed-out user should land on the login page and come
 * back after; a signed-in user without the role should not, because signing in
 * again will not help them.
 *
 * Neither of these is a security boundary. The server decides: every protected
 * route runs `authenticate`, and the organizer and admin routes run
 * `authorize(...)`. These components only keep the UI from showing a screen
 * whose data the API is going to refuse. The vanilla frontend's organizer page
 * gated on the client alone, and the route behind it accepted anyone — that
 * gap was closed server-side before this app was written.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from './useAuth';
import type { UserRole } from '../types/api';

/** Shown while a stored token is being verified against /auth/me. */
function SessionCheck() {
  return (
    <div className="route-pending" role="status" aria-live="polite">
      <span className="route-pending__spinner" aria-hidden="true" />
      <span className="sr-only">Checking your session…</span>
    </div>
  );
}

/**
 * Requires a verified session.
 *
 * Rendering nothing during 'idle'/'checking' is the point: redirecting while
 * the token is still being verified would bounce a signed-in user to the login
 * page on every hard refresh, then bounce them back — a visible flash, and a
 * lost destination.
 */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'idle' || status === 'checking') return <SessionCheck />;

  if (status === 'unauthenticated') {
    // `state.from` lets the login page return the user where they were going.
    // `replace` keeps the protected URL out of history, so Back after signing
    // out does not land on a page that immediately redirects again.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

/**
 * Requires one of `roles`, on top of a session.
 *
 * Renders a plain refusal rather than redirecting. Sending someone to the
 * dashboard hides what happened and makes a bookmarked admin URL look broken;
 * saying "you do not have access" is both truthful and easier to support.
 */
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'idle' || status === 'checking') return <SessionCheck />;

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!roles.includes(user.role)) {
    return (
      <div className="access-denied" role="alert">
        <h1>You don’t have access to this page</h1>
        <p>
          This area needs {formatRoles(roles)} access. You’re signed in as{' '}
          <strong>{user.name}</strong> ({user.role}).
        </p>
        <a href="/">Back to your trips</a>
      </div>
    );
  }

  return <Outlet />;
}

function formatRoles(roles: UserRole[]): string {
  if (roles.length === 0) return 'elevated';
  if (roles.length === 1) return roles[0] as string;
  return `${roles.slice(0, -1).join(', ')} or ${roles[roles.length - 1]}`;
}
