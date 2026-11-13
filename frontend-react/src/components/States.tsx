/**
 * Loading, error and empty states.
 *
 * One place, because these are the three screens a user sees most often when
 * something is wrong and the three most likely to be written carelessly. The
 * vanilla app learned this the hard way: it shipped a dashboard that showed
 * four zeros while still loading, which is indistinguishable from a real
 * answer of zero.
 */

import type { ReactNode } from 'react';
import { ApiError } from '../api/client';

/**
 * A skeleton shaped like the content it replaces.
 *
 * Shaped, not a spinner: a block the size of the incoming card keeps the
 * layout from jumping when data lands. The baseline measured the vanilla
 * dashboard at a cumulative layout shift of 0.610, well past the 0.25 "poor"
 * threshold, and content appearing into unreserved space is how that happens.
 *
 * aria-hidden with a single live-region label on the container: announcing
 * every skeleton block separately would read as noise.
 */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}

export function TripCardSkeleton() {
  return (
    <li className="trip-card trip-card--skeleton">
      <Skeleton style={{ height: '1.15rem', width: '62%' }} />
      <Skeleton style={{ height: '0.85rem', width: '40%', marginTop: '0.75rem' }} />
      <Skeleton style={{ height: '0.85rem', width: '52%', marginTop: '0.5rem' }} />
      <Skeleton style={{ height: '1.6rem', width: '5.5rem', marginTop: '1.1rem' }} />
    </li>
  );
}

/** A grid of skeleton cards, announced once as a whole. */
export function TripListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      <p className="sr-only" role="status">
        Loading your trips…
      </p>
      <ul className="trip-grid">
        {Array.from({ length: count }, (_, i) => (
          <TripCardSkeleton key={i} />
        ))}
      </ul>
    </>
  );
}

/**
 * A failure, with a way out.
 *
 * Distinguishes a network failure from a server refusal, because the two want
 * different words: "check your connection" is useless advice when the server
 * answered 403. `ApiError` carries that distinction rather than the caller
 * guessing from a message string.
 */
export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
  description,
}: {
  error: Error;
  onRetry?: () => void;
  title?: string;
  /** Replaces the server's message when the caller knows something better to
   *  say. Useful where the title already carries the server's wording and
   *  repeating it underneath tells the reader nothing twice. */
  description?: string;
}) {
  const apiError = error instanceof ApiError ? error : null;

  let detail = description ?? error.message;
  if (!description) {
    if (apiError?.isNetworkError) {
      detail = 'Could not reach the server. Check your connection and try again.';
    } else if (apiError?.isForbidden) {
      detail = 'You do not have access to this.';
    }
  }

  // A network failure is worth retrying; a 403 or a 404 is not, so offering a
  // button there just invites the same answer again.
  const retryWorthwhile = !apiError || apiError.isNetworkError || apiError.status >= 500;

  return (
    <div className="state-panel state-panel--error" role="alert">
      <h2 className="state-panel__title">{title}</h2>
      <p className="state-panel__body">{detail}</p>
      {onRetry && retryWorthwhile ? (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Nothing here yet — with the action that would change that. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-panel">
      <h2 className="state-panel__title">{title}</h2>
      <p className="state-panel__body">{body}</p>
      {action}
    </div>
  );
}
