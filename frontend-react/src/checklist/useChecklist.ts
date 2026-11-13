/**
 * The checklist's behaviour: load, pack, assign, add, remove, undo.
 *
 * The split with checklistReducer.ts is the point. The reducer decides what the
 * screen shows given what has happened; this hook decides what happens — it
 * makes the requests, numbers them, and reports each outcome back. That keeps
 * every rule about rollback in one pure, testable function, and every side
 * effect here.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { ApiError } from '../api/client';
import { itemsApi } from '../api/items';
import { tripsApi } from '../api/trips';
import { useAuth } from '../auth/useAuth';
import type { Collaborator, Trip } from '../types/api';
import {
  checklistReducer,
  initialChecklistState,
  selectItems,
  selectProgress,
  type ChecklistItem,
  type MutableField,
} from './checklistReducer';
import { useSaveIndicator } from './useSaveIndicator';

export interface Member {
  userId: string;
  /** Null when the API does not tell us — see the owner case in useChecklist. */
  name: string | null;
  email: string | null;
  isOwner: boolean;
}

export interface RemovedItem {
  item: ChecklistItem;
  atIndex: number;
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

let tempCounter = 0;
const tempId = () => `temp-${Date.now()}-${++tempCounter}`;

export function useChecklist(tripId: string) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(checklistReducer, initialChecklistState);
  const { state: saveState, track } = useSaveIndicator();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [participants, setParticipants] = useState<Collaborator[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastRemoved, setLastRemoved] = useState<RemovedItem | null>(null);

  // One counter for every optimistic change in this checklist. Each change
  // takes the next number; the reducer uses it to tell a current request from
  // one the user has since overtaken.
  const seq = useRef(0);

  // Read the latest state inside callbacks without re-creating them on every
  // render — the callbacks are passed to every row.
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * Writes for one item go out one at a time, in the order the user made them.
   *
   * Without this, two quick taps on the same row send two PATCHes at once, and
   * nothing guarantees the server receives them in click order. Measured: with
   * "pack" then "unpack" delivered in reverse, the server applied unpack, then
   * pack, and kept the item PACKED — while the screen showed it unpacked, as
   * the user intended. A reload would then silently undo what they did.
   *
   * Chaining each item's requests closes that: the second write is not sent
   * until the first has settled, so the server sees them in the order they
   * were made. The screen is unaffected — the optimistic update is dispatched
   * before the request is queued — so only the network is serialised, and only
   * per item: packing ten different rows still sends ten requests at once.
   *
   * Removal goes through the same chain, so a delete waits for any change to
   * that row still in flight instead of racing it into a 404.
   */
  const chains = useRef(new Map<string, Promise<unknown>>());
  const enqueue = useCallback(<T,>(itemId: string, work: () => Promise<T>): Promise<T> => {
    const previous = chains.current.get(itemId) ?? Promise.resolve();
    // Whether the previous write succeeded or failed, this one still goes —
    // a failure is reported by its own caller, not by blocking the queue.
    const next = previous.catch(() => undefined).then(work);
    chains.current.set(itemId, next);
    // Drop the entry once the tail settles, so the map does not grow with
    // every item ever touched. Only if nothing newer has queued behind it.
    next
      .finally(() => {
        if (chains.current.get(itemId) === next) chains.current.delete(itemId);
      })
      .catch(() => undefined);
    return next;
  }, []);

  /* -------------------------------------------------------------- load */

  const load = useCallback(
    (signal?: AbortSignal) => {
      dispatch({ type: 'LOAD_START' });
      setActionError(null);

      // The trip and its items are what the page cannot render without. The
      // participant list only fills the assignment picker, so its failure is
      // absorbed rather than failing the page — exactly the Promise.all trap
      // the vanilla checklist fell into when the trip 404'd for collaborators.
      Promise.all([tripsApi.get(tripId, signal), itemsApi.list(tripId, signal)])
        .then(([loadedTrip, items]) => {
          setTrip(loadedTrip);
          dispatch({ type: 'LOAD_SUCCESS', items });
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          dispatch({
            type: 'LOAD_FAILURE',
            error: cause instanceof Error ? cause : new Error(String(cause)),
          });
        });

      itemsApi
        .participants(tripId, signal)
        .then(setParticipants)
        .catch(() => setParticipants([]));
    },
    [tripId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /* --------------------------------------------------- field changes */

  const changeField = useCallback(
    async (itemId: string, field: MutableField, value: unknown) => {
      // A row created locally has only a temporary id until the API answers;
      // sending that id would 404. The UI disables these controls, and this is
      // the guarantee behind it.
      if (stateRef.current.unsaved[itemId]) return;

      const mySeq = ++seq.current;
      setActionError(null);
      dispatch({ type: 'FIELD_OPTIMISTIC', itemId, field, value, seq: mySeq });

      try {
        // track() wraps the queued request, so the indicator reads "Saving…"
        // for the whole time this change is unsaved — including any time spent
        // waiting behind an earlier write to the same row.
        const saved = await track(() =>
          enqueue(itemId, () => itemsApi.patch(tripId, itemId, { [field]: value })),
        );
        dispatch({ type: 'FIELD_CONFIRMED', itemId, field, item: saved, seq: mySeq });
      } catch (cause) {
        dispatch({ type: 'FIELD_FAILED', itemId, field, seq: mySeq });
        setActionError(messageFrom(cause, 'That change could not be saved and has been undone.'));
      }
    },
    [tripId, track, enqueue],
  );

  const togglePacked = useCallback(
    (itemId: string) => {
      const current = selectItems(stateRef.current).find((i) => i.itemId === itemId);
      if (!current) return;
      void changeField(itemId, 'packed', !current.packed);
    },
    [changeField],
  );

  const assign = useCallback(
    (itemId: string, userId: string | null) => {
      void changeField(itemId, 'assignedTo', userId);
    },
    [changeField],
  );

  /** Pack or unpack every row in a category at once, as the vanilla header box does. */
  const setCategoryPacked = useCallback(
    (itemIds: string[], packed: boolean) => {
      const byId = new Map(selectItems(stateRef.current).map((i) => [i.itemId, i]));
      for (const id of itemIds) {
        const item = byId.get(id);
        if (item && item.packed !== packed && !item.isUnsaved) {
          void changeField(id, 'packed', packed);
        }
      }
    },
    [changeField],
  );

  /* ------------------------------------------------------------- add */

  const add = useCallback(
    async (name: string, category: string): Promise<boolean> => {
      const trimmed = name.trim();
      if (!trimmed || !category) return false;

      const id = tempId();
      setActionError(null);
      dispatch({
        type: 'ADD_OPTIMISTIC',
        item: {
          itemId: id,
          tripId,
          name: trimmed,
          category,
          priority: 'medium',
          source: 'manual',
          packed: false,
          assignedTo: null,
          weight: null,
        },
      });

      try {
        // `weight` is deliberately omitted so the server estimates it from the
        // name — what a freshly typed item wants.
        const saved = await track(() => itemsApi.create({ tripId, name: trimmed, category }));
        dispatch({ type: 'ADD_CONFIRMED', tempId: id, item: saved });
        return true;
      } catch (cause) {
        dispatch({ type: 'ADD_FAILED', tempId: id });
        setActionError(messageFrom(cause, `“${trimmed}” could not be added.`));
        return false;
      }
    },
    [tripId, track],
  );

  /* ---------------------------------------------------------- remove */

  const remove = useCallback(
    async (itemId: string) => {
      const items = selectItems(stateRef.current);
      const atIndex = items.findIndex((i) => i.itemId === itemId);
      const item = items[atIndex];
      if (!item || item.isUnsaved) return;

      setActionError(null);
      dispatch({ type: 'REMOVE_OPTIMISTIC', itemId });

      try {
        await track(() => enqueue(itemId, () => itemsApi.remove(tripId, itemId)));
        // Offer undo only once the delete has actually happened — offering it
        // earlier would let "undo" race a delete still in flight.
        setLastRemoved({ item, atIndex });
      } catch (cause) {
        dispatch({ type: 'REMOVE_FAILED', item, atIndex });
        setActionError(messageFrom(cause, `“${item.name}” could not be removed.`));
      }
    },
    [tripId, track, enqueue],
  );

  /**
   * Undo a removal.
   *
   * DELETE is final on the server, so undo re-creates the row rather than
   * resurrecting it — which means a new itemId, and it means everything POST
   * /items would otherwise default has to be sent explicitly:
   *
   *   - assignedTo, or the carrier silently disappears
   *   - weight, including an explicit null, or an unweighed item comes back
   *     with an estimate it never had
   *   - packed, which POST always sets to false — so a packed item needs a
   *     follow-up PATCH to come back packed
   */
  const undoRemove = useCallback(async () => {
    const removed = lastRemoved;
    if (!removed) return;
    setLastRemoved(null);

    const { item, atIndex } = removed;
    const id = tempId();
    dispatch({
      type: 'ADD_OPTIMISTIC',
      item: { ...item, itemId: id, packed: item.packed },
      atIndex,
    });

    try {
      let restored = await track(() =>
        itemsApi.create({
          tripId,
          name: item.name,
          category: item.category,
          assignedTo: item.assignedTo,
          weight: item.weight,
        }),
      );
      if (item.packed && !restored.packed) {
        restored = await track(() => itemsApi.patch(tripId, restored.itemId, { packed: true }));
      }
      dispatch({ type: 'ADD_CONFIRMED', tempId: id, item: restored });
    } catch (cause) {
      dispatch({ type: 'ADD_FAILED', tempId: id });
      setActionError(messageFrom(cause, `“${item.name}” could not be restored.`));
    }
  }, [lastRemoved, tripId, track]);

  const dismissUndo = useCallback(() => setLastRemoved(null), []);
  const dismissError = useCallback(() => setActionError(null), []);

  /* --------------------------------------------------------- derived */

  const items = useMemo(() => selectItems(state), [state]);
  const progress = useMemo(() => selectProgress(items), [items]);

  /**
   * Who can be assigned an item: the owner plus current collaborators.
   *
   * The participants route returns collaborators only. The owner is added from
   * the trip. When the viewer IS the owner, their own name is known from the
   * session. When the viewer is a collaborator, nothing in the API returns the
   * owner's name — the vanilla page reads trip.ownerName, which the Trip model
   * does not have, so it is always empty there — and the picker labels them
   * "Trip owner" rather than showing a blank.
   */
  const members = useMemo<Member[]>(() => {
    if (!trip) return [];
    const ownerId = trip.userId;
    const viewerIsOwner = user?.userId === ownerId;
    const list: Member[] = [
      {
        userId: ownerId,
        name: viewerIsOwner ? (user?.name ?? null) : null,
        email: viewerIsOwner ? (user?.email ?? null) : null,
        isOwner: true,
      },
    ];
    const seen = new Set([ownerId]);
    for (const p of participants) {
      if (!p.userId || seen.has(p.userId)) continue;
      seen.add(p.userId);
      list.push({ userId: p.userId, name: p.name, email: p.email, isOwner: false });
    }
    return list;
  }, [trip, participants, user]);

  const isOwner = Boolean(trip && user && trip.userId === user.userId);

  return {
    status: state.status,
    loadError: state.error,
    reload: () => load(),
    trip,
    isOwner,
    items,
    progress,
    members,
    saveState,
    actionError,
    dismissError,
    lastRemoved,
    undoRemove,
    dismissUndo,
    togglePacked,
    setCategoryPacked,
    assign,
    add,
    remove,
  };
}

export type UseChecklistResult = ReturnType<typeof useChecklist>;
