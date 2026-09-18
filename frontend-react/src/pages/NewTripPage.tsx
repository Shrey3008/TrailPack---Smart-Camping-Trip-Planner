import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { tripsApi } from '../api/trips';
import { TripForm, emptyTripValues, type TripFormValues } from '../components/TripForm';

export function NewTripPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(values: TripFormValues) {
    setSubmitError(null);
    try {
      const trip = await tripsApi.create({
        name: values.name.trim(),
        terrain: values.terrain,
        season: values.season,
        duration: Number(values.duration),
        groupSize: Number(values.groupSize),
        // Empty strings are sent as null rather than '', so the stored value
        // matches the schema's default and the checklist's "no destination"
        // check works the same for a trip that never had one.
        location: values.location.trim() || null,
        startDate: values.startDate || null,
        endDate: values.endDate || null,
      });
      // Straight to the new trip — creating one generates its checklist
      // server-side, so there is something to see.
      navigate(`/trips/${trip.tripId}`, { replace: true });
    } catch (cause) {
      setSubmitError(
        cause instanceof ApiError ? cause.message : 'Could not create the trip. Please try again.',
      );
    }
  }

  return (
    <div className="page page--narrow">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">My trips</Link>
      </nav>

      <h1 className="page__title">Plan a trip</h1>
      <p className="page__lede">
        TrailPack builds a packing checklist from the terrain, season and length.
      </p>

      <TripForm
        initialValues={emptyTripValues}
        submitLabel="Create trip"
        pendingLabel="Creating…"
        submitError={submitError}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/')}
      />
    </div>
  );
}
