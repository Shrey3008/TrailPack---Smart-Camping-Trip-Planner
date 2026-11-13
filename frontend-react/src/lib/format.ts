/**
 * Display formatting.
 *
 * The date handling here is more careful than it looks, for a specific reason:
 * Trip.startDate and Trip.endDate are stored as date-only STRINGS
 * ('2026-10-10'), not Date values. Passing one to `new Date()` parses it as
 * UTC midnight, and rendering that in a timezone behind UTC shows the previous
 * day. A trip starting on the 10th displays as the 9th for every user west of
 * Greenwich — which is most of this app's users.
 *
 * So the parts are split and handed to the Date constructor as local values.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Parse 'YYYY-MM-DD' as a LOCAL date. Returns null for anything else. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Month is zero-based here; this constructor builds a local date.
  const date = new Date(year, month - 1, day);
  // Rejects impossible dates that would otherwise roll over silently —
  // '2026-02-30' would become March 2nd.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function formatDate(value: string | null | undefined): string | null {
  const date = parseDateOnly(value);
  if (!date) return null;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * 'Oct 10–13, 2026' when the range sits in one month, widening only as far as
 * it needs to. Returns null when there is no usable start date, so callers can
 * fall back rather than printing 'Invalid Date'.
 */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const from = parseDateOnly(start);
  const to = parseDateOnly(end);

  if (!from && !to) return null;
  if (from && !to) return formatDate(start);
  if (!from && to) return formatDate(end);
  if (!from || !to) return null;

  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();

  if (sameMonth) {
    return `${MONTHS[from.getMonth()]} ${from.getDate()}–${to.getDate()}, ${from.getFullYear()}`;
  }
  if (sameYear) {
    return `${MONTHS[from.getMonth()]} ${from.getDate()} – ${MONTHS[to.getMonth()]} ${to.getDate()}, ${from.getFullYear()}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function formatDuration(nights: number): string {
  if (!Number.isFinite(nights) || nights <= 0) return '—';
  return `${nights} ${nights === 1 ? 'night' : 'nights'}`;
}

/**
 * Nights between two date-only strings — the count the API's `duration` field
 * means. Null only when a date cannot be parsed.
 *
 * A reversed range returns a NEGATIVE number rather than null, so callers can
 * tell "these dates are backwards" from "these dates are unreadable" and say
 * so. Collapsing both to null looks tidier and costs the user the one message
 * that would tell them what to fix.
 */
export function nightsBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  const from = parseDateOnly(start);
  const to = parseDateOnly(end);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Today as 'YYYY-MM-DD' in the viewer's own timezone, for date input mins. */
export function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
