/**
 * The shell around every signed-in screen: nav, and the skip link.
 *
 * Rendered as a layout route so the nav is not remounted on navigation — a
 * remount would drop focus to the top of the document on every click, which is
 * the single most common keyboard regression in an SPA.
 */

import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export function AppLayout() {
  const { user, logout, hasRole } = useAuth();

  return (
    <>
      {/* First focusable thing on the page, visible only when focused. Without
          it a keyboard user tabs through the whole nav on every screen. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="appbar">
        <div className="appbar__inner">
          <NavLink to="/" className="appbar__brand">
            TrailPack
          </NavLink>

          <nav className="appbar__nav" aria-label="Main">
            <NavLink to="/" end className="appbar__link">
              My trips
            </NavLink>
            <NavLink to="/trips/new" className="appbar__link">
              New trip
            </NavLink>
            {hasRole('admin') ? (
              <NavLink to="/admin" className="appbar__link">
                Admin
              </NavLink>
            ) : null}
          </nav>

          <div className="appbar__user">
            {user ? <span className="appbar__name">{user.name}</span> : null}
            <button type="button" className="btn btn--ghost btn--auto" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="app-main">
        <Outlet />
      </main>
    </>
  );
}
