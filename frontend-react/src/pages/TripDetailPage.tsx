import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { tripsApi } from '../api/trips';
import { useAsync } from '../hooks/useAsync';
import { ErrorState, Skeleton } from '../components/States';
import { TripForm, initialValuesFrom, type TripFormValues } from '../components/TripForm';
import { formatDateRange, formatDuration } from '../lib/format';
import type { Trip, TripStatus } from '../types/api';

/** The statuses offered as actions, and what to call each transition. */
const STATUS_ACTIONS: Array<{ status: TripStatus; label: string }> = [
  { status: 'active', label: 'Mark active' },
  { status: 'completed', label: 'Mark completed' },
  { status: 'cancelled', label: 'Cancel trip' },
];

export function TripDetailPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();

  const trip = useAsync<Trip>((signal) => tripsApi.get(tripId, signal), [tripId]);

  const [isEditing, setIsEditing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyStatus, setBusyStatus] = useState<TripStatus | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSave(values: TripFormValues) {
    setSubmitError(null);
    try {
      const updated = await tripsApi.update(tripId, {
        name: values.name.trim(),
        terrain: values.terrain,
        season: values.season,
        duration: Number(values.duration),
        groupSize: Number(values.groupSize),
        location: values.location.trim() || null,
        startDate: values.startDate || null,
        endDate: values.endDate || null,
      });
      // PUT returns the updated trip, so the screen can be corrected from the
      // response rather than refetching — one request instead of two, and no
      // window where the form has closed but the page still shows old values.
      trip.setData(updated);
      setIsEditing(false);
    } catch (cause) {
      setSubmitError(
        cause instanceof ApiError ? cause.message : 'Could not save your changes. Please try again.',
      );
    }
  }

  async function handleStatus(status: TripStatus) {
    setActionError(null);
    setBusyStatus(status);
    try {
      const updated = await tripsApi.setStatus(tripId, status);
      trip.setData(updated);
    } catch (cause) {
      setActionError(
        cause instanceof ApiError ? cause.message : 'Could not update the status.',
      );
    } finally {
      setBusyStatus(null);
    }
  }

  async function handleDelete() {
    setActionError(null);
    try {
      await tripsApi.remove(tripId);
      navigate('/', { replace: true });
    } catch (cause) {
      setActionError(
        cause instanceof ApiError ? cause.message : 'Could not delete the trip.',
      );
      setConfirmingDelete(false);
    }
  }

  if (trip.isLoading) {
    return (
      <div className="page page--narrow">
        <p className="sr-only" role="status">
          Loading trip…
        </p>
        <Skeleton style={{ height: '2rem', width: '55%' }} />
        <Skeleton style={{ height: '1rem', width: '35%', marginTop: '1rem' }} />
        <Skeleton style={{ height: '8rem', marginTop: '1.75rem' }} />
      </div>
    );
  }

  if (trip.error) {
    const notFound = trip.error instanceof ApiError && trip.error.status === 404;
    return (
      <div className="page page--narrow">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">My trips</Link>
        </nav>
        <ErrorState
          error={trip.error}
          onRetry={trip.refresh}
          title={notFound ? 'Trip not found' : 'Could not load this trip'}
          // The server's message for a 404 is literally "Trip not found",
          // which is already the title. Say something the reader does not
          // have in front of them instead.
          {...(notFound
            ? {
                description:
                  'This trip may have been deleted, or it belongs to someone else. Trips shared with you appear under “Shared with you” on your trips page.',
              }
            : {})}
        />
      </div>
    );
  }

  if (!trip.data) return null;

  const current = trip.data;
  const dates = formatDateRange(current.startDate, current.endDate);

  return (
    <div className="page page--narrow">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">My trips</Link>
      </nav>

      {isEditing ? (
        <>
          <h1 className="page__title">Edit trip</h1>
          <TripForm
            initialValues={initialValuesFrom(current)}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            submitError={submitError}
            onSubmit={handleSave}
            onCancel={() => {
              setSubmitError(null);
              setIsEditing(false);
            }}
          />
        </>
      ) : (
        <>
          <div className="page__head">
            <h1 className="page__title">{current.name}</h1>
            <button
              type="button"
              className="btn btn--secondary btn--auto"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
          </div>

          <dl className="detail-grid">
            <div>
              <dt>Destination</dt>
              <dd>{current.location || 'Not set'}</dd>
            </div>
            <div>
              <dt>Terrain</dt>
              <dd>{current.terrain}</dd>
            </div>
            <div>
              <dt>Season</dt>
              <dd>{current.season}</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>{formatDuration(current.duration)}</dd>
            </div>
            <div>
              <dt>Dates</dt>
              <dd>{dates ?? 'Not set'}</dd>
            </div>
            <div>
              <dt>Party</dt>
              <dd>
                {current.groupSize} {current.groupSize === 1 ? 'person' : 'people'}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              {/* The one value that wants presentation casing — it is a
                  lowercase enum from the database. See .detail-grid__status. */}
              <dd className="detail-grid__status">{current.status}</dd>
            </div>
          </dl>

          {actionError ? (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          ) : null}

          <section className="page__section">
            <h2 className="page__subtitle">Status</h2>
            <div className="button-row">
              {STATUS_ACTIONS.filter((action) => action.status !== current.status).map((action) => (
                <button
                  key={action.status}
                  type="button"
                  className="btn btn--secondary btn--auto"
                  disabled={busyStatus !== null}
                  onClick={() => handleStatus(action.status)}
                >
                  {busyStatus === action.status ? 'Saving…' : action.label}
                </button>
              ))}
            </div>
          </section>

          <section className="page__section">
            <h2 className="page__subtitle">Checklist</h2>
            <p className="page__lede">
              The packing checklist for this trip arrives in Phase 4 of the migration. For now it
              lives on the existing site.
            </p>
          </section>

          <section className="page__section page__section--danger">
            <h2 className="page__subtitle">Delete this trip</h2>
            <p className="page__lede">
              Deleting a trip also deletes its checklist items. This cannot be undone.
            </p>
            {confirmingDelete ? (
              <div className="button-row">
                <button type="button" className="btn btn--danger btn--auto" onClick={handleDelete}>
                  Yes, delete “{current.name}”
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--auto"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--danger btn--auto"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete trip
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
