/**
 * Trip endpoints.
 *
 * Every function here returns a `Trip` or `Trip[]`, regardless of how the
 * endpoint wraps it. That is the whole point of this layer: the API answers
 * `{ trips }` for the list, a bare object for one trip, and `{ message, trip }`
 * for a creation, and no component should have to know which.
 */

import { api } from './client';
import type {
  CreateTripInput,
  CreateTripResponse,
  Trip,
  TripStatus,
  TripsResponse,
  UpdateTripInput,
} from '../types/api';

export const tripsApi = {
  /** Trips the caller owns, newest first. Shared ones are a different route. */
  async list(signal?: AbortSignal): Promise<Trip[]> {
    const res = await api.get<TripsResponse>('/trips', signal ? { signal } : {});
    // Defensive: an unexpected shape should surface as an empty list rather
    // than a crash inside a .map() three components deep.
    return Array.isArray(res?.trips) ? res.trips : [];
  },

  /** Trips shared with the caller by someone else. */
  async listShared(signal?: AbortSignal): Promise<Trip[]> {
    const res = await api.get<TripsResponse>('/shared-trips/mine', signal ? { signal } : {});
    return Array.isArray(res?.trips) ? res.trips : [];
  },

  /** Bare Trip. 404s for a trip the caller does not own. */
  get(tripId: string, signal?: AbortSignal): Promise<Trip> {
    return api.get<Trip>(`/trips/${encodeURIComponent(tripId)}`, signal ? { signal } : {});
  },

  /** Unwraps `{ message, trip }` to the Trip. */
  async create(input: CreateTripInput): Promise<Trip> {
    const res = await api.post<CreateTripResponse>('/trips', input);
    return res.trip;
  },

  /**
   * Returns the updated Trip. Sending no recognised field is a 400
   * ("No fields to update"), so callers should omit unchanged values rather
   * than sending an empty object.
   */
  update(tripId: string, input: UpdateTripInput): Promise<Trip> {
    return api.put<Trip>(`/trips/${encodeURIComponent(tripId)}`, input);
  },

  /**
   * The dedicated status route added in Phase 1. PUT /trips/:id can also set
   * status among other fields; this one validates the single value and is what
   * a status control should call.
   */
  setStatus(tripId: string, status: TripStatus): Promise<Trip> {
    return api.put<Trip>(`/trips/${encodeURIComponent(tripId)}/status`, { status });
  },

  /** Deletes the trip and its checklist items. */
  remove(tripId: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/trips/${encodeURIComponent(tripId)}`);
  },
};
