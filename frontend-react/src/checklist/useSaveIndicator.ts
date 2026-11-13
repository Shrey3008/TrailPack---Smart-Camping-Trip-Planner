/**
 * The auto-save indicator, ported from frontend/checklist.html.
 *
 * Kept from the original: it counts saves in flight and only reports "saved"
 * once every concurrent request has settled, then fades back to idle after
 * 2.2 seconds. Ticking five boxes quickly shows one "Saving…" and one "All
 * changes saved", not five flickers.
 *
 * Changed from the original, because it could hide a failure:
 *
 *   PATCH A and PATCH B go out together (in flight: 2)
 *   A fails   → shows "Couldn't save"           (in flight: 1)
 *   B succeeds → in flight reaches 0 → shows "All changes saved"
 *
 * The later, unrelated success overwrote the failure, and the user was told
 * everything saved when it had not. Here a failure is sticky for the rest of
 * the batch it happened in: once every in-flight request settles, the result
 * is "error" if ANY of them failed. The next save that starts from a clean
 * slate clears it.
 *
 * The failed change itself has already been rolled back on screen by the
 * reducer, so what is displayed is consistent with the server either way.
 * What the sticky error preserves is the user's knowledge that something they
 * did did not stick.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SAVED_VISIBLE_MS = 2200;

export function useSaveIndicator() {
  const [state, setState] = useState<SaveState>('idle');
  const inFlight = useRef(0);
  const batchFailed = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  useEffect(() => clearHide, []);

  const settle = useCallback(() => {
    inFlight.current = Math.max(0, inFlight.current - 1);
    if (inFlight.current > 0) return;

    if (batchFailed.current) {
      setState('error');
      return;
    }
    setState('saved');
    clearHide();
    hideTimer.current = setTimeout(() => setState('idle'), SAVED_VISIBLE_MS);
  }, []);

  /** Wrap a mutation so it drives the indicator. Rethrows the original error. */
  const track = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T> => {
      // A new batch begins when nothing is in flight. Only then is it safe to
      // forget an earlier failure — mid-batch, forgetting it is the bug above.
      if (inFlight.current === 0) batchFailed.current = false;
      inFlight.current += 1;
      clearHide();
      setState('saving');
      try {
        const result = await work();
        settle();
        return result;
      } catch (error) {
        batchFailed.current = true;
        settle();
        throw error;
      }
    },
    [settle],
  );

  return { state, track };
}
