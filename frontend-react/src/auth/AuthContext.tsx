/**
 * Session provider.
 *
 * The only global state in this app. Everything else is server data that
 * belongs to the screen showing it — deliberately not lifted here, because a
 * store holding every resource is the thing that makes React apps hard to
 * follow, and this app's deepest tree is three levels.
 */

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import { ApiError, setUnauthorizedHandler, tokenStorage } from '../api/client';
import { authApi, type LoginCredentials, type RegisterInput } from '../api/auth';
import { authReducer, initialAuthState, type AuthState } from './authReducer';
import type { CurrentUser, UserRole } from '../types/api';

export interface AuthContextValue extends AuthState {
  login(credentials: LoginCredentials): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): void;
  /** Replace the cached user after a profile edit, without a refetch. */
  setUser(user: CurrentUser): void;
  clearError(): void;
  /** True when the signed-in user holds any of the given roles. */
  hasRole(...roles: UserRole[]): boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Strip security-sensitive fields before anything is written to sessionStorage.
 *
 * GET /auth/me currently returns `passwordResetTokenHash` and
 * `passwordResetExpiresAt`. routes/auth.js's publicUser() removes fields by
 * blacklist — password, securityAnswer, _id, __v — so every column added to the
 * schema after it was written is returned by default, and these two were.
 *
 * They are the caller's own reset-token hash, so this is not an account
 * takeover on its own. But it is a credential artefact that has no business in
 * a browser, and persisting it would put it somewhere any XSS could read at
 * leisure rather than only in the memory of one response.
 *
 * The real fix is server-side: publicUser() should pick the fields it returns
 * rather than subtract the ones it remembers. Until that lands, this app
 * refuses to store them. It cannot stop them being sent.
 */
function forStorage(user: CurrentUser): CurrentUser {
  const {
    passwordResetTokenHash: _hash,
    passwordResetExpiresAt: _expires,
    ...safe
  } = user as CurrentUser & {
    passwordResetTokenHash?: unknown;
    passwordResetExpiresAt?: unknown;
  };
  return safe as CurrentUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  /**
   * Restore a session from sessionStorage on mount.
   *
   * A token alone is not a session — it may have expired since it was stored,
   * and its role may have changed, which matters because the backend reads the
   * role fresh from the database on every request and deliberately does not
   * put it in the token. So the stored user is never trusted: /auth/me is the
   * only thing that decides.
   */
  useEffect(() => {
    const token = tokenStorage.get();
    if (!token) {
      dispatch({ type: 'RESTORE_FAILURE' });
      return;
    }

    let cancelled = false;
    dispatch({ type: 'RESTORE_START' });

    authApi
      .me()
      .then((user) => {
        if (cancelled) return;
        tokenStorage.setUserJson(JSON.stringify(forStorage(user)));
        dispatch({ type: 'RESTORE_SUCCESS', user });
      })
      .catch(() => {
        if (cancelled) return;
        // Any failure here means no usable session. A 401 has already cleared
        // storage inside the client; clearing again is harmless and covers
        // the network-failure case, where keeping a token we could not verify
        // would leave the app stuck in 'checking' on the next reload.
        tokenStorage.clear();
        dispatch({ type: 'RESTORE_FAILURE' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Bridge the API client's 401 handling to this provider.
   *
   * Held in a ref and read through a stable callback so re-registering does
   * not depend on `state`, which would re-run this effect on every dispatch.
   */
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Only meaningful if we thought we had a session. A 401 while already
      // unauthenticated is just a public endpoint answering.
      if (statusRef.current === 'authenticated' || statusRef.current === 'checking') {
        dispatch({ type: 'LOGOUT', reason: 'Your session expired. Please sign in again.' });
      }
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const { token, user } = await authApi.login(credentials);
      tokenStorage.set(token);

      // The login response carries only four fields. Fetch the full record so
      // the rest of the app sees one consistent shape regardless of whether
      // the session was just created or restored on refresh. If that second
      // call fails the login still stands — the token is valid — so fall back
      // to the partial user rather than throwing away a good session.
      let fullUser: CurrentUser = user;
      try {
        fullUser = await authApi.me();
      } catch {
        /* keep the partial user from the login response */
      }

      tokenStorage.setUserJson(JSON.stringify(forStorage(fullUser)));
      dispatch({ type: 'LOGIN_SUCCESS', user: fullUser });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : 'Something went wrong signing in. Please try again.';
      dispatch({ type: 'LOGIN_FAILURE', error: message });
      // Rethrown so the form can keep focus handling local; the message is
      // already in state for rendering.
      throw cause;
    }
  }, []);

  /** Registration does not sign you in — the API returns 201 with a message. */
  const register = useCallback(async (input: RegisterInput) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      await authApi.register(input);
      dispatch({ type: 'RESTORE_FAILURE' });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : 'Something went wrong creating your account. Please try again.';
      dispatch({ type: 'LOGIN_FAILURE', error: message });
      throw cause;
    }
  }, []);

  const logout = useCallback(() => {
    tokenStorage.clear();
    dispatch({ type: 'LOGOUT' });
  }, []);

  const setUser = useCallback((user: CurrentUser) => {
    tokenStorage.setUserJson(JSON.stringify(forStorage(user)));
    dispatch({ type: 'USER_UPDATED', user });
  }, []);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => (state.user ? roles.includes(state.user.role) : false),
    [state.user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout, setUser, clearError, hasRole }),
    [state, login, register, logout, setUser, clearError, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
