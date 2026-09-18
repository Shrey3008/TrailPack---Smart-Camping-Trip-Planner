/**
 * Types for the TrailPack REST API.
 *
 * Hand-written from the Mongoose schemas in backend/models/, not generated and
 * not guessed. Each type notes where it came from so the two can be compared
 * when the backend changes — there is no build step tying them together, so
 * this file is a claim about the API that has to be maintained deliberately.
 *
 * Two things about this API that the types have to respect:
 *
 * 1. Documents are keyed by their own string UUID field — `tripId`, `itemId`,
 *    `userId`, `inviteId`, `notifId` — not by Mongo's `_id`. Responses strip
 *    `_id` and `__v` (`.select('-_id -__v')`), so `_id` is deliberately absent
 *    here: reaching for it is a bug, and the compiler should say so.
 *
 * 2. Response envelopes are inconsistent. `GET /trips` answers `{ trips: [...] }`
 *    while `GET /trips/:id` answers a bare object and `GET /trips/:id/items` a
 *    bare array. That is absorbed in src/api/client.ts rather than changed on
 *    the backend, which would break the vanilla frontend still in production
 *    and the 679 tests pinning it. The envelope types below record the shapes
 *    as they actually are.
 */

/* ------------------------------------------------------------------ users */

/** backend/models/User.js — `role` is an enum on the schema. */
export type UserRole = 'user' | 'organizer' | 'admin';

/**
 * A user as the API returns it.
 *
 * `POST /auth/login` returns only the first four fields. `GET /auth/me` returns
 * the full record minus password/securityAnswer/_id/__v (routes/auth.js's
 * publicUser), plus a `stats` object it computes per request. Everything
 * publicUser does not guarantee is optional here.
 */
export interface User {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive?: boolean;
  securityQuestion?: string | null;
  /** ISO strings, kept as strings for parity with pre-migration rows. */
  passwordUpdatedAt?: string | null;
  lastLogin?: string | null;
  profile?: UserProfile;
  createdAt?: string;
  updatedAt?: string;
}

/** Sub-document on User. `notificationSettings` is Schema.Types.Mixed. */
export interface UserProfile {
  phone?: string;
  notificationSettings?: Record<string, unknown>;
}

/** Computed per request by GET /auth/me; not stored on the user row. */
export interface UserStats {
  totalTrips: number;
  completedTrips: number;
  totalItemsPacked: number;
  joinedAt: string | null;
}

export type CurrentUser = User & { stats?: UserStats };

/* ------------------------------------------------------------------ trips */

/**
 * backend/models/Trip.js stores `status` as a free string with no enum, to
 * avoid invalidating existing rows. The six values below are the ones the
 * schema documents and the ones PUT /trips/:id/status validates against.
 * Typing it as a union here is safe for values we send; values we *read* come
 * from the database and could in principle be anything, so parsing code must
 * not assume exhaustiveness.
 */
export type TripStatus =
  | 'planned'
  | 'planning'
  | 'active'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

/** backend/models/Trip.js */
export interface Trip {
  tripId: string;
  /** The owner's userId. Collaborators are a separate collection. */
  userId: string;
  name: string;
  terrain: string;
  season: string;
  /** Nights. Stored as a Number. */
  duration: number;
  /** Clamped server-side to [1, 50]. */
  groupSize: number;
  location: string | null;
  lat: number | null;
  lon: number | null;
  /** Date-only ISO strings ('2026-10-10'), stored as String not Date. */
  startDate: string | null;
  endDate: string | null;
  status: TripStatus | string;
  photoIndex: number;
  /** GRAMS, matching Item.weight. Null means no target set. */
  weightTarget: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * The terrain and season values the vanilla create-trip form offers. The API
 * does NOT validate either — POST /trips accepts any non-empty string — so
 * these are the app's vocabulary, not the server's.
 *
 * Worth knowing: the rule-based checklist generator in routes/trips.js only
 * branches on Mountain, Forest and Desert. A Beach or Lake trip gets the base
 * items and the season rules, but no terrain-specific gear.
 */
export const TERRAINS = ['Mountain', 'Forest', 'Desert', 'Beach', 'Lake'] as const;
export const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'] as const;

export type Terrain = (typeof TERRAINS)[number];
export type Season = (typeof SEASONS)[number];

/** Fields POST /trips accepts. name/terrain/season/duration are required. */
export interface CreateTripInput {
  name: string;
  terrain: string;
  season: string;
  duration: number;
  groupSize?: number;
  location?: string | null;
  lat?: number | null;
  lon?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  /** Server copies the checklist from this trip when present. */
  cloneFromTripId?: string | null;
}

/** PUT /trips/:id — every field optional; sending none is a 400. */
export type UpdateTripInput = Partial<
  Omit<CreateTripInput, 'cloneFromTripId'> & {
    status: TripStatus;
    /** Grams. Explicit null clears the budget; omitting leaves it alone. */
    weightTarget: number | null;
  }
>;

/* ------------------------------------------------------- checklist items */

/**
 * The six-category vocabulary, from aiService.CHECKLIST_CATEGORIES.
 * backend/__tests__/checklistCategories.test.js enforces it and scrapes
 * routes/trips.js, so a seventh category there fails the build. Do not
 * collapse these.
 */
export const CHECKLIST_CATEGORIES = [
  'Essentials',
  'Clothing',
  'Shelter',
  'Food & Water',
  'Safety',
  'Tools',
] as const;

export type ChecklistCategory = (typeof CHECKLIST_CATEGORIES)[number];

/** Item.priority — a free string on the schema, defaulting to 'medium'. */
export type ItemPriority = 'low' | 'medium' | 'high';

/** Where an item came from. 'manual' | 'ai' | a rule-generator source. */
export type ItemSource = 'manual' | 'ai' | string;

/** backend/models/Item.js */
export interface Item {
  itemId: string;
  tripId: string;
  name: string;
  /** Defaults to '' on the schema, so an empty string is possible. */
  category: ChecklistCategory | string;
  priority: ItemPriority | string;
  source: ItemSource;
  packed: boolean;
  /** userId of the collaborator carrying it, or null if unassigned. */
  assignedTo: string | null;
  /** GRAMS. Null means unweighed, which is different from 0. */
  weight: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/** POST /items — tripId, name and category are required. */
export interface CreateItemInput {
  tripId: string;
  name: string;
  category: ChecklistCategory | string;
  priority?: ItemPriority;
  weight?: number | null;
}

/**
 * PATCH /trips/:tripId/items/:itemId.
 * The route rejects a body carrying none of these three with a 400.
 */
export interface PatchItemInput {
  packed?: boolean;
  assignedTo?: string | null;
  /** Non-negative grams, or null to clear. */
  weight?: number | null;
}

/* ----------------------------------------------- sharing & collaborators */

/** backend/models/Collaborator.js — no id field of its own; keyed by pair. */
export interface Collaborator {
  tripId: string;
  userId: string;
  email: string | null;
  name: string | null;
  invitedBy: string | null;
  joinedAt: string;
}

/** backend/models/Invite.js */
export interface Invite {
  inviteId: string;
  tripId: string;
  email: string;
  /** Present when listing your own trip's invites; never for a preview. */
  token?: string;
  invitedBy: string | null;
  invitedByName: string | null;
  status: 'pending' | 'accepted' | string;
  /** ISO string, compared in code rather than by Mongo. */
  expiresAt: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  createdAt?: string;
}

/**
 * GET /invites/:token — the unauthenticated preview shown before accepting.
 * Deliberately narrower than Invite: it must not leak the whole row to someone
 * holding only a link.
 */
export interface InvitePreview {
  tripName?: string;
  invitedByName?: string | null;
  email?: string;
  expiresAt?: string;
}

/* ------------------------------------------------------- notifications */

/** backend/models/Notification.js — note the field is `notifId`, not `id`. */
export interface Notification {
  notifId: string;
  userId: string;
  message: string;
  type: string;
  read: boolean;
  /** Stored RELATIVE, so it outlives a change of host. */
  link: string | null;
  createdAt?: string;
}

/* ------------------------------------------------------------ envelopes */

/** POST /auth/login */
export interface LoginResponse {
  token: string;
  user: Pick<User, 'userId' | 'name' | 'email' | 'role'>;
}

/** GET /auth/me */
export interface MeResponse {
  user: CurrentUser;
}

/**
 * GET /trips — wrapped, and only trips the caller OWNS, newest first.
 * Trips shared with them come from GET /shared-trips/mine instead.
 * Contrast GET /trips/:id and PUT /trips/:id, which both answer a bare Trip.
 */
export interface TripsResponse {
  trips: Trip[];
}

/**
 * POST /trips — 201. The trip is nested under `trip`, unlike the bare object
 * that GET and PUT return for the same resource.
 *
 * The clone fields appear only when `cloneFromTripId` was sent and the source
 * trip existed, which is why they are optional rather than a separate type:
 * the caller cannot tell from the request alone which shape comes back.
 */
export interface CreateTripResponse {
  message: string;
  trip: Trip;
  checklistSource?: 'cloned';
  clonedFrom?: string;
  counts?: {
    copied: number;
    assignmentsKept: number;
    assignmentsCleared: number;
  };
}

/** GET /shared-trips/mine */
export interface SharedTripsResponse {
  trips: Trip[];
}

/** GET /trips/:id/participants */
export interface ParticipantsResponse {
  participants: Collaborator[];
}

/** GET /trips/:tripId/invites */
export interface InvitesResponse {
  invites: Invite[];
}

/** GET /trips/organizer/dashboard — requires the organizer or admin role. */
export interface OrganizerDashboardResponse {
  stats: OrganizerStats;
  trips: Array<Trip & { participants: Collaborator[]; participantCount: number }>;
}

export interface OrganizerStats {
  totalOrganized: number;
  activeTrips: number;
  completedTrips: number;
  totalParticipants: number;
}

/** GET /notifications/unread-count */
export interface UnreadCountResponse {
  count: number;
}

/**
 * Error bodies. Checked against every 4xx/5xx response in backend/routes/:
 * all of them carry `message`, and exactly one carries anything more —
 * `POST /trips/:id/ai-items` adds `code` when the AI provider is unavailable
 * (routes/items.js, 503; the value is the provider's error code or the literal
 * 'AI_UNAVAILABLE'). There is no `error` or `errors` field anywhere.
 *
 * `code` is therefore optional rather than absent: it exists, but only one
 * route sets it, so nothing may depend on it being present.
 */
export interface ApiErrorBody {
  message: string;
  code?: string;
}
