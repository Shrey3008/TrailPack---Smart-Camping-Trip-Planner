/**
 * The session state machine.
 *
 * Kept in its own file, as a pure function, for two reasons: it is the part
 * worth unit-testing (Phase 7 does), and separating it from the provider makes
 * the set of legal transitions readable in one screen.
 *
 * `status` is a single field rather than separate `isLoading` / `isLoggedIn`
 * booleans because those permit states that cannot exist — loading and
 * authenticated at once, or authenticated with no user. One field with four
 * values makes those unrepresentable.
 *
 * The `checking` state matters more than it looks. On a hard refresh there is
 * a token in sessionStorage but no user object yet, and the app cannot know
 * whether that token is still valid until /auth/me answers. Without a distinct
 * state for "we have a token but have not verified it", a protected route
 * would either flash the login page before the check finishes, or render with
 * a user that turns out to be stale.
 */

import type { CurrentUser } from '../types/api';

export type AuthStatus =
  /** Nothing has happened yet; the provider has not run its first effect. */
  | 'idle'
  /** A token exists and /auth/me is in flight. Protected routes must wait. */
  | 'checking'
  /** Verified: `user` is present. */
  | 'authenticated'
  /** No valid session. `error` may explain why, if the user was kicked out. */
  | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  user: CurrentUser | null;
  /** Set when a sign-in attempt failed, cleared on the next attempt. */
  error: string | null;
  /** True while a login/register request is in flight, for button states. */
  isSubmitting: boolean;
}

export type AuthAction =
  | { type: 'RESTORE_START' }
  | { type: 'RESTORE_SUCCESS'; user: CurrentUser }
  | { type: 'RESTORE_FAILURE' }
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; user: CurrentUser }
  | { type: 'LOGIN_FAILURE'; error: string }
  | { type: 'LOGOUT'; reason?: string }
  | { type: 'USER_UPDATED'; user: CurrentUser }
  | { type: 'CLEAR_ERROR' };

export const initialAuthState: AuthState = {
  status: 'idle',
  user: null,
  error: null,
  isSubmitting: false,
};

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'RESTORE_START':
      return { ...state, status: 'checking', error: null };

    case 'RESTORE_SUCCESS':
      return { status: 'authenticated', user: action.user, error: null, isSubmitting: false };

    case 'RESTORE_FAILURE':
      // Not an error the user should see. They did not try to do anything —
      // a stored token simply turned out to be expired.
      return { status: 'unauthenticated', user: null, error: null, isSubmitting: false };

    case 'LOGIN_START':
      return { ...state, isSubmitting: true, error: null };

    case 'LOGIN_SUCCESS':
      return { status: 'authenticated', user: action.user, error: null, isSubmitting: false };

    case 'LOGIN_FAILURE':
      // Stays 'unauthenticated' rather than an 'error' status: a failed
      // attempt is the same session state as before it, plus a message.
      return { status: 'unauthenticated', user: null, error: action.error, isSubmitting: false };

    case 'LOGOUT':
      return {
        status: 'unauthenticated',
        user: null,
        error: action.reason ?? null,
        isSubmitting: false,
      };

    case 'USER_UPDATED':
      // Only meaningful while authenticated. Applying it otherwise would
      // resurrect a session that was just ended — possible if a profile
      // request resolves after a logout.
      if (state.status !== 'authenticated') return state;
      return { ...state, user: action.user };

    case 'CLEAR_ERROR':
      return state.error === null ? state : { ...state, error: null };

    default: {
      // Exhaustiveness: adding an action without a case here fails the build
      // rather than silently falling through to the current state.
      const unhandled: never = action;
      return unhandled;
    }
  }
}
