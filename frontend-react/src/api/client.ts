/**
 * The single place this app talks to the network.
 *
 * Three jobs, and nothing else:
 *   1. know the base URL,
 *   2. attach the bearer token to every request,
 *   3. turn a failed response into a thrown ApiError, handling 401 once.
 *
 * Why 401 is handled here rather than in each caller: an expired token is not
 * a property of the screen that happened to notice it. Every screen makes
 * requests, so a per-component check is the same logic written N times, and
 * the one place it gets forgotten is the bug. Handling it at the only layer
 * that sees every response means a session can expire during any request and
 * the outcome is identical.
 */

import type { ApiErrorBody } from '../types/api';

/* --------------------------------------------------------------- base URL */

/**
 * Mirrors frontend/config.js so both frontends agree about which backend they
 * are talking to during the migration.
 *
 * Note what is NOT carried over: config.js honours a `?api=` query override on
 * localhost. That override exists there because the vanilla app is served as
 * static files with no build step, so there is no other way to point it at a
 * different backend. Vite has env files, so the same capability arrives as
 * VITE_API_URL without putting an attacker-controllable URL anywhere near the
 * code path that attaches the session token.
 */
const DEFAULT_LOCAL = 'http://localhost:3000';
const DEFAULT_PROD = 'https://trailpack-smart-camping-trip-planner-agq7.onrender.com';

function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '';
  return isLocalhost ? DEFAULT_LOCAL : DEFAULT_PROD;
}

export const API_BASE_URL = resolveBaseUrl();

/* ----------------------------------------------------------- token storage */

/**
 * sessionStorage, with the same keys the vanilla frontend uses.
 *
 * Deliberate: while both frontends are live, a session started in one is
 * usable in the other, so this app can be reached from the existing nav
 * without a second login. It also keeps the security posture unchanged —
 * moving to localStorage would make the token outlive the tab, which is a
 * decision to make on its own merits, not by accident during a migration.
 *
 * Every access is wrapped: sessionStorage throws in some privacy modes rather
 * than returning null, and a storage failure must not take the app down.
 */
const TOKEN_KEY = 'authToken';
const USER_KEY = 'currentUser';

export const tokenStorage = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable — the in-memory session still works for this tab */
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch {
      /* nothing to clear */
    }
  },
  getUserJson(): string | null {
    try {
      return sessionStorage.getItem(USER_KEY);
    } catch {
      return null;
    }
  },
  setUserJson(value: string): void {
    try {
      sessionStorage.setItem(USER_KEY, value);
    } catch {
      /* see set() */
    }
  },
};

/* ---------------------------------------------------------------- errors */

/**
 * One error type for every failure, so callers branch on `status` rather than
 * parsing strings. `isNetworkError` separates "the server said no" from "the
 * request never arrived", which want different messages in the UI — the first
 * is actionable by the user, the second usually is not.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly isNetworkError: boolean;

  constructor(message: string, status: number, opts: { code?: string; isNetworkError?: boolean } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (opts.code !== undefined) this.code = opts.code;
    this.isNetworkError = opts.isNetworkError ?? false;
  }

  /** 401 from an expired or invalid token — the session is over. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** 403 — authenticated, but not allowed. A different message from 401. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

/* ------------------------------------------------------- 401 subscription */

/**
 * The client cannot navigate on its own — it has no router, and importing one
 * here would make this module untestable and tie it to a rendering context.
 * Instead AuthContext subscribes, and decides what "session over" means.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/* --------------------------------------------------------------- request */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /**
   * Skip the bearer token and the 401 handler. For genuinely public endpoints
   * — login, register, the invite preview — where a 401 is a normal answer
   * about the submitted credentials, not an expired session. Without this, a
   * wrong password would log the user out of a session they never had.
   */
  public?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, public: isPublic = false, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!isPublic) {
    const token = tokenStorage.get();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (signal) init.signal = signal;
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (cause) {
    // fetch rejects for network failure, DNS, CORS refusal and abort. An abort
    // is the caller's own doing, so it is rethrown untouched rather than
    // reported to the user as a connection problem.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      0,
      { isNetworkError: true },
    );
  }

  if (response.status === 401 && !isPublic) {
    tokenStorage.clear();
    onUnauthorized?.();
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  // 204 and an empty body are both legitimate: DELETE /items/:id answers
  // `{ message }` but other routes may not, and parsing '' as JSON throws.
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // A non-JSON body from an error is usually an infrastructure page (a
      // proxy 502, Render's cold-start splash) rather than this API.
      if (!response.ok) {
        throw new ApiError(
          `The server returned an unexpected response (HTTP ${response.status}).`,
          response.status,
        );
      }
    }
  }

  if (!response.ok) {
    const errorBody = parsed as ApiErrorBody | null;
    const opts: { code?: string } = {};
    if (errorBody?.code) opts.code = errorBody.code;
    throw new ApiError(
      errorBody?.message || `Request failed (HTTP ${response.status}).`,
      response.status,
      opts,
    );
  }

  return parsed as T;
}

/**
 * The verbs. These are thin on purpose — anything that knows about a specific
 * endpoint's shape belongs in src/api/<resource>.ts, not here.
 */
export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
