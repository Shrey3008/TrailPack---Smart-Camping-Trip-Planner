/**
 * The app's data-fetching hook.
 *
 * Written rather than imported, deliberately. TanStack Query is the standard
 * answer and would do more than this — request deduplication, a shared cache,
 * background refetching, invalidation. This app does not need those yet: each
 * screen loads its own data once, and there is no second component racing for
 * the same resource. Adopting a cache before there is anything to cache means
 * carrying concepts that cannot be explained by what the code does.
 *
 * It is worth understanding what this does NOT do, because that is the honest
 * boundary: no caching between mounts (every visit refetches), no dedup of
 * concurrent identical requests, no retries, no revalidation on window focus.
 * When those start mattering — most likely on the checklist, where several
 * panels read the same trip — that is the moment to reach for a library, and
 * the reason will be a real one.
 *
 * What it does handle is the part that is easy to get wrong by hand: not
 * calling setState after unmount, and not letting a slow earlier request
 * overwrite a fast later one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  /** True during the first load, when there is nothing to show yet. */
  isLoading: boolean;
  /** True during a refetch that still has previous data on screen. */
  isRefreshing: boolean;
  error: Error | null;
}

export interface UseAsyncResult<T> extends AsyncState<T> {
  /** Re-run the request, keeping current data visible while it is in flight. */
  refresh: () => void;
  /** Replace the data locally, e.g. after a mutation returns the new value. */
  setData: (updater: T | ((current: T | null) => T)) => void;
}

/**
 * @param run  the request. It receives an AbortSignal and must pass it on, so
 *             a superseded or unmounted request is actually cancelled rather
 *             than merely ignored.
 * @param deps when these change the request re-runs, like useEffect.
 */
export function useAsync<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): UseAsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: true,
    isRefreshing: false,
    error: null,
  });

  // Identifies the most recent request. A response from an older one is
  // dropped: without this, a slow first request resolving after a fast second
  // would overwrite newer data with staler data — the classic race that makes
  // a list briefly show the previous filter's results.
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // `run` is typically an inline arrow, so it is a new function every render.
  // Depending on it directly would re-fetch forever; the caller's `deps` are
  // the real dependency, exactly as with useEffect.
  const runRef = useRef(run);
  runRef.current = run;

  const execute = useCallback((isRefresh: boolean) => {
    const id = ++requestId.current;
    const controller = new AbortController();

    setState((prev) => ({
      ...prev,
      isLoading: !isRefresh,
      isRefreshing: isRefresh,
      error: null,
    }));

    runRef
      .current(controller.signal)
      .then((data) => {
        if (!mounted.current || id !== requestId.current) return;
        setState({ data, isLoading: false, isRefreshing: false, error: null });
      })
      .catch((cause: unknown) => {
        if (!mounted.current || id !== requestId.current) return;
        // An abort is this hook's own doing — a superseded request or an
        // unmount — and is not a failure the user should be told about.
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setState((prev) => ({
          data: prev.data,
          isLoading: false,
          isRefreshing: false,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        }));
      });

    return controller;
  }, []);

  useEffect(() => {
    const controller = execute(false);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(() => {
    execute(true);
  }, [execute]);

  const setData = useCallback((updater: T | ((current: T | null) => T)) => {
    setState((prev) => ({
      ...prev,
      data:
        typeof updater === 'function'
          ? (updater as (current: T | null) => T)(prev.data)
          : updater,
    }));
  }, []);

  return { ...state, refresh, setData };
}
