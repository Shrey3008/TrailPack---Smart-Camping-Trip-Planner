/**
 * Checklist item endpoints.
 *
 * Every route here checks trip ACCESS, not ownership — a collaborator can read,
 * pack, add to and remove from a shared checklist. That is deliberate on the
 * server (routes/items.js), and it is why none of these functions need to know
 * whether the caller owns the trip.
 */

import { api } from './client';
import type { Collaborator, CreateItemInput, Item, ParticipantsResponse, PatchItemInput } from '../types/api';

export const itemsApi = {
  /** Bare Item[] — unlike GET /trips, there is no envelope here. */
  async list(tripId: string, signal?: AbortSignal): Promise<Item[]> {
    const res = await api.get<Item[]>(`/trips/${encodeURIComponent(tripId)}/items`, signal ? { signal } : {});
    return Array.isArray(res) ? res : [];
  },

  /**
   * Only the keys present in `patch` are written, so toggling `packed` never
   * disturbs `assignedTo` and vice versa. An empty patch is a 400.
   */
  patch(tripId: string, itemId: string, patch: PatchItemInput): Promise<Item> {
    return api.patch<Item>(
      `/trips/${encodeURIComponent(tripId)}/items/${encodeURIComponent(itemId)}`,
      patch,
    );
  },

  /**
   * Answers 201 with the created item, including its server-issued itemId.
   *
   * `weight` has three meanings on this route: omitted means "estimate it from
   * the name", null means "unweighed", a number means grams. Undo relies on
   * the difference — see useChecklist's restore.
   */
  create(input: CreateItemInput & { assignedTo?: string | null }): Promise<Item> {
    return api.post<Item>('/items', input);
  },

  /**
   * DELETE is final server-side. tripId is sent as a query parameter because
   * some clients and proxies drop DELETE bodies; the route accepts either.
   * Answers 404 if nothing matched, rather than a false success.
   */
  remove(tripId: string, itemId: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(
      `/items/${encodeURIComponent(itemId)}?tripId=${encodeURIComponent(tripId)}`,
    );
  },

  /** Collaborators only — the owner is not in this list. */
  async participants(tripId: string, signal?: AbortSignal): Promise<Collaborator[]> {
    const res = await api.get<ParticipantsResponse>(
      `/trips/${encodeURIComponent(tripId)}/participants`,
      signal ? { signal } : {},
    );
    return Array.isArray(res?.participants) ? res.participants : [];
  },
};
