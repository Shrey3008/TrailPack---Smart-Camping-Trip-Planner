import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { CategoryCard } from '../checklist/CategoryCard';
import { useChecklist } from '../checklist/useChecklist';
import type { ChecklistItem } from '../checklist/checklistReducer';
import type { SaveState } from '../checklist/useSaveIndicator';
import { ErrorState, Skeleton } from '../components/States';
import { formatDateRange, formatDuration } from '../lib/format';
import { CHECKLIST_CATEGORIES } from '../types/api';

const UNDO_WINDOW_MS = 6000;

/**
 * Group rows into categories.
 *
 * The six canonical categories always appear, in their canonical order, so any
 * of them can be added to even while empty. Rows whose category is outside the
 * six — possible, since the schema does not enforce it and older rows predate
 * the vocabulary — are grouped after them rather than dropped; a blank category
 * is shown as "Other". Nothing on the trip is ever hidden by the grouping.
 */
function groupByCategory(items: ChecklistItem[]): Array<[string, ChecklistItem[]]> {
  const groups = new Map<string, ChecklistItem[]>();
  for (const category of CHECKLIST_CATEGORIES) groups.set(category, []);
  for (const item of items) {
    const category = item.category?.trim() || 'Other';
    const bucket = groups.get(category);
    if (bucket) bucket.push(item);
    else groups.set(category, [item]);
  }
  return [...groups.entries()];
}

function SaveIndicator({ state }: { state: SaveState }) {
  const label =
    state === 'saving'
      ? 'Saving…'
      : state === 'error'
        ? 'Some changes weren’t saved'
        : 'All changes saved';
  return (
    // role="status" + aria-live: announced politely, without stealing focus.
    <span className="save-pill" data-state={state} role="status" aria-live="polite">
      <span className="save-pill__icon" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function ChecklistPage() {
  const { tripId = '' } = useParams();
  const { user } = useAuth();
  const checklist = useChecklist(tripId);
  const {
    status,
    loadError,
    reload,
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
  } = checklist;

  const groups = useMemo(() => groupByCategory(items), [items]);

  // The undo offer expires. Leaving it up indefinitely would mean an "Undo"
  // that restores something removed long ago, after other edits.
  useEffect(() => {
    if (!lastRemoved) return;
    const timer = setTimeout(dismissUndo, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [lastRemoved, dismissUndo]);

  if (status === 'loading' && !trip) {
    return (
      <div className="page page--narrow checklist">
        <p className="sr-only" role="status">
          Loading checklist…
        </p>
        <Skeleton style={{ height: '1rem', width: '30%' }} />
        <Skeleton style={{ height: '2rem', width: '60%', marginTop: '0.6rem' }} />
        <Skeleton style={{ height: '4.5rem', marginTop: '1.5rem' }} />
        <Skeleton style={{ height: '14rem', marginTop: '1rem' }} />
        <Skeleton style={{ height: '10rem', marginTop: '1rem' }} />
      </div>
    );
  }

  if (status === 'error' && loadError) {
    const notFound = loadError instanceof ApiError && loadError.status === 404;
    return (
      <div className="page page--narrow">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">My trips</Link>
        </nav>
        <ErrorState
          error={loadError}
          onRetry={reload}
          title={notFound ? 'Checklist not found' : 'Could not load this checklist'}
          {...(notFound
            ? {
                description:
                  'This trip may have been deleted, or you may no longer have access to it.',
              }
            : {})}
        />
      </div>
    );
  }

  if (!trip) return null;

  const dates = formatDateRange(trip.startDate, trip.endDate);
  const complete = progress.total > 0 && progress.packed === progress.total;

  return (
    <div className="page page--narrow checklist">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">My trips</Link>
      </nav>

      <header className="checklist__head">
        <div>
          <p className="checklist__eyebrow">{isOwner ? 'Packing checklist' : 'Shared checklist'}</p>
          <h1 className="page__title">{trip.name}</h1>
          <p className="checklist__meta">
            {[trip.location, dates ?? formatDuration(trip.duration), `${trip.terrain} · ${trip.season}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {/* Trip settings are owner-only on the server (PUT and DELETE scope on
            the owner), so a collaborator is not offered a page of controls
            that would all refuse them. */}
        {isOwner ? (
          <Link to={`/trips/${trip.tripId}`} className="btn btn--secondary btn--auto">
            Trip details
          </Link>
        ) : null}
      </header>

      <section
        className={`progress${complete ? ' progress--complete' : ''}`}
        aria-label="Packing progress"
      >
        <div className="progress__row">
          <span className="progress__label">
            <span>
              <span className="progress__pct">{progress.percent}%</span>{' '}
              · {progress.packed} of {progress.total} packed
            </span>
          </span>
          <SaveIndicator state={saveState} />
        </div>
        <div
          className="progress__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.packed}
          aria-valuetext={`${progress.packed} of ${progress.total} items packed`}
        >
          <div className="progress__fill" style={{ width: `${progress.percent}%` }} />
        </div>
      </section>

      {actionError ? (
        <div className="form-error" role="alert">
          {actionError}{' '}
          <button type="button" className="link-button" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="categories">
        {groups.map(([category, categoryItems]) => (
          <CategoryCard
            key={category}
            category={category}
            items={categoryItems}
            members={members}
            viewerId={user?.userId}
            onToggle={togglePacked}
            onAssign={assign}
            onRemove={remove}
            onSetAllPacked={setCategoryPacked}
            onAdd={add}
          />
        ))}
      </div>

      {lastRemoved ? (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast__text">Removed “{lastRemoved.item.name}”</span>
          <button type="button" className="toast__action" onClick={() => void undoRemove()}>
            Undo
          </button>
          <button type="button" className="toast__close" onClick={dismissUndo} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
