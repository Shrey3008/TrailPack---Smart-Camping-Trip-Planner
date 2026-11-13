/**
 * Checklist state, with optimistic updates that roll back correctly.
 *
 * ---------------------------------------------------------------- the model
 *
 * Two layers, kept apart:
 *
 *   server   — the last value the API CONFIRMED for each item.
 *   pending  — optimistic overrides the user has made that the API has not
 *              answered yet, one per (item, field), each tagged with a
 *              sequence number.
 *
 * What the screen shows is `pending` layered over `server` (see selectItems).
 * Nothing is ever written into `server` on the user's say-so — only on the
 * API's.
 *
 * ------------------------------------------------ why not the obvious way
 *
 * The obvious optimistic update is: remember the old value, write the new one,
 * and on failure write the old one back. It is what frontend/checklist.html
 * does, and it is wrong as soon as two changes to the same item overlap:
 *
 *   tap "pack"   → shows packed,   PATCH #1 in flight, old value = unpacked
 *   tap "unpack" → shows unpacked, PATCH #2 in flight, old value = PACKED
 *   #1 fails     → "roll back" to unpacked        (fine, by luck)
 *   #2 fails     → "roll back" to PACKED          ← the server never had this
 *
 * The rollback target in #2 was the optimistic value from #1, which the server
 * never accepted. The screen now claims an item is packed that isn't.
 *
 * Rolling back to the last CONFIRMED value instead of the last DISPLAYED one
 * fixes that, and the sequence number decides who is allowed to roll back:
 * only the newest change to a field may clear its override. A failure that has
 * already been superseded by a later tap is simply dropped — the later change
 * owns the field now.
 *
 * ------------------------------------------ what the reducer cannot know
 *
 * Stale confirmations are guarded too (a confirmation older than one already
 * applied is ignored), so responses arriving out of order cannot move the
 * screen backwards.
 *
 * What no reducer can know is the order the SERVER applied two overlapping
 * requests in. If the network delivers "pack" then "unpack" in reverse, the
 * server ends on "pack" while the screen shows "unpack". That was measured, not
 * theorised, and a reload would have silently undone the user's last choice.
 * It is closed in useChecklist.ts, which sends each item's writes one at a time
 * in the order they were made — so the order the server applies is the order
 * the user chose. The stale-confirmation guard here stays as a second line.
 *
 * The reducer is pure: no fetch, no timers. useChecklist.ts makes the requests
 * and dispatches the outcomes, which is what lets this be tested directly.
 */

import type { Item } from '../types/api';

/** The fields that can be changed optimistically on an existing row. */
export type MutableField = 'packed' | 'assignedTo';

type FieldValue<F extends MutableField> = Item[F];

interface Pending {
  value: unknown;
  seq: number;
}

export interface ChecklistState {
  status: 'loading' | 'ready' | 'error';
  error: Error | null;
  /** Display order. Holds real itemIds and temporary ids for unsaved adds. */
  order: string[];
  /** Last confirmed value per item. Unsaved adds live here too, marked below. */
  server: Record<string, Item>;
  /** Optimistic overrides, keyed `${itemId}:${field}`. */
  pending: Record<string, Pending>;
  /** Highest sequence already applied to `server`, per `${itemId}:${field}`. */
  confirmedSeq: Record<string, number>;
  /** Temporary ids of rows created locally that the API has not confirmed. */
  unsaved: Record<string, true>;
}

export type ChecklistAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; items: Item[] }
  | { type: 'LOAD_FAILURE'; error: Error }
  | { type: 'FIELD_OPTIMISTIC'; itemId: string; field: MutableField; value: unknown; seq: number }
  | { type: 'FIELD_CONFIRMED'; itemId: string; field: MutableField; item: Item; seq: number }
  | { type: 'FIELD_FAILED'; itemId: string; field: MutableField; seq: number }
  | { type: 'ADD_OPTIMISTIC'; item: Item; atIndex?: number }
  | { type: 'ADD_CONFIRMED'; tempId: string; item: Item }
  | { type: 'ADD_FAILED'; tempId: string }
  | { type: 'REMOVE_OPTIMISTIC'; itemId: string }
  | { type: 'REMOVE_FAILED'; item: Item; atIndex: number };

export const initialChecklistState: ChecklistState = {
  status: 'loading',
  error: null,
  order: [],
  server: {},
  pending: {},
  confirmedSeq: {},
  unsaved: {},
};

const key = (itemId: string, field: MutableField) => `${itemId}:${field}`;

/** Drop every entry in `record` whose key belongs to `itemId`. */
function withoutItem<T>(record: Record<string, T>, itemId: string): Record<string, T> {
  const prefix = `${itemId}:`;
  const next: Record<string, T> = {};
  for (const [k, v] of Object.entries(record)) {
    if (!k.startsWith(prefix)) next[k] = v;
  }
  return next;
}

function insertAt(order: string[], id: string, index: number | undefined): string[] {
  const without = order.filter((x) => x !== id);
  if (index === undefined || index < 0 || index > without.length) return [...without, id];
  return [...without.slice(0, index), id, ...without.slice(index)];
}

export function checklistReducer(state: ChecklistState, action: ChecklistAction): ChecklistState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, status: 'loading', error: null };

    case 'LOAD_SUCCESS': {
      const server: Record<string, Item> = {};
      for (const item of action.items) server[item.itemId] = item;
      return {
        status: 'ready',
        error: null,
        order: action.items.map((i) => i.itemId),
        server,
        // A fresh load is the new truth: nothing is pending against it.
        pending: {},
        confirmedSeq: {},
        unsaved: {},
      };
    }

    case 'LOAD_FAILURE':
      return { ...state, status: 'error', error: action.error };

    /* ----------------------------------------------------- field changes */

    case 'FIELD_OPTIMISTIC': {
      if (!state.server[action.itemId]) return state;
      return {
        ...state,
        pending: {
          ...state.pending,
          [key(action.itemId, action.field)]: { value: action.value, seq: action.seq },
        },
      };
    }

    case 'FIELD_CONFIRMED': {
      const k = key(action.itemId, action.field);
      const current = state.server[action.itemId];
      // The row may have been removed while this request was in flight.
      if (!current) return state;

      // A confirmation older than one already applied is stale — responses can
      // arrive out of order, and an old one must not move the screen backwards.
      const applied = state.confirmedSeq[k] ?? -1;
      const isNewer = action.seq > applied;

      const server = isNewer
        ? { ...state.server, [action.itemId]: { ...current, [action.field]: action.item[action.field] } }
        : state.server;
      const confirmedSeq = isNewer ? { ...state.confirmedSeq, [k]: action.seq } : state.confirmedSeq;

      // Only clear the override if it is THIS request's. If the user has changed
      // the field again since, their newer choice is still in flight and must
      // stay on screen.
      const pending = { ...state.pending };
      if (pending[k]?.seq === action.seq) delete pending[k];

      return { ...state, server, confirmedSeq, pending };
    }

    case 'FIELD_FAILED': {
      const k = key(action.itemId, action.field);
      // Superseded: a later change to this field owns it now. Rolling back here
      // would undo a choice the user made after this one.
      if (state.pending[k]?.seq !== action.seq) return state;
      // Otherwise drop the override. The screen falls back to `server`, which is
      // the last value the API actually confirmed — never an unconfirmed guess.
      const pending = { ...state.pending };
      delete pending[k];
      return { ...state, pending };
    }

    /* ----------------------------------------------------------- adding */

    case 'ADD_OPTIMISTIC':
      return {
        ...state,
        order: insertAt(state.order, action.item.itemId, action.atIndex),
        server: { ...state.server, [action.item.itemId]: action.item },
        unsaved: { ...state.unsaved, [action.item.itemId]: true },
      };

    case 'ADD_CONFIRMED': {
      // Swap the temporary row for the server's, in the same position, so the
      // list does not jump when the real id arrives.
      if (!state.unsaved[action.tempId]) return state;
      const server = { ...state.server };
      delete server[action.tempId];
      server[action.item.itemId] = action.item;
      const unsaved = { ...state.unsaved };
      delete unsaved[action.tempId];
      return {
        ...state,
        order: state.order.map((id) => (id === action.tempId ? action.item.itemId : id)),
        server,
        unsaved,
      };
    }

    case 'ADD_FAILED': {
      const server = { ...state.server };
      delete server[action.tempId];
      const unsaved = { ...state.unsaved };
      delete unsaved[action.tempId];
      return {
        ...state,
        order: state.order.filter((id) => id !== action.tempId),
        server,
        unsaved,
      };
    }

    /* --------------------------------------------------------- removing */

    case 'REMOVE_OPTIMISTIC': {
      if (!state.server[action.itemId]) return state;
      const server = { ...state.server };
      delete server[action.itemId];
      return {
        ...state,
        order: state.order.filter((id) => id !== action.itemId),
        server,
        // Any in-flight change to a removed row is now meaningless.
        pending: withoutItem(state.pending, action.itemId),
        confirmedSeq: withoutItem(state.confirmedSeq, action.itemId),
      };
    }

    case 'REMOVE_FAILED':
      // Put it back where it was. The caller captured the row and its index
      // before removing it, because by now the reducer no longer has either.
      return {
        ...state,
        order: insertAt(state.order, action.item.itemId, action.atIndex),
        server: { ...state.server, [action.item.itemId]: action.item },
      };

    default: {
      const unhandled: never = action;
      return unhandled;
    }
  }
}

/* ------------------------------------------------------------ selectors */

export interface ChecklistItem extends Item {
  /** True while any field on this row is waiting on the API. */
  isSaving: boolean;
  /** True for a row created locally that the API has not confirmed yet. */
  isUnsaved: boolean;
}

/** What the screen shows: each confirmed row with its pending overrides on top. */
export function selectItems(state: ChecklistState): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  for (const id of state.order) {
    const base = state.server[id];
    if (!base) continue;
    const packed = state.pending[key(id, 'packed')];
    const assignedTo = state.pending[key(id, 'assignedTo')];
    out.push({
      ...base,
      packed: packed ? (packed.value as FieldValue<'packed'>) : base.packed,
      assignedTo: assignedTo ? (assignedTo.value as FieldValue<'assignedTo'>) : base.assignedTo,
      isSaving: Boolean(packed || assignedTo),
      isUnsaved: Boolean(state.unsaved[id]),
    });
  }
  return out;
}

export interface Progress {
  packed: number;
  total: number;
  /** Whole percent, 0 when there is nothing to pack. */
  percent: number;
}

export function selectProgress(items: readonly ChecklistItem[]): Progress {
  const total = items.length;
  const packed = items.filter((i) => i.packed).length;
  return { packed, total, percent: total === 0 ? 0 : Math.round((packed / total) * 100) };
}
