import { Link } from 'react-router-dom';

import { tripsApi } from '../api/trips';
import { useAsync } from '../hooks/useAsync';
import { TripCard } from '../components/TripCard';
import { EmptyState, ErrorState, TripListSkeleton } from '../components/States';
import type { Trip } from '../types/api';

/**
 * The trip list.
 *
 * Owned trips and shared trips are two separate endpoints — GET /trips returns
 * only what the caller owns — so both are fetched and shown as distinct
 * sections rather than merged. Merging them would be a lie about who controls
 * a trip: the owner can delete it, a collaborator cannot.
 */
export function TripsPage() {
  const owned = useAsync<Trip[]>((signal) => tripsApi.list(signal), []);
  const shared = useAsync<Trip[]>((signal) => tripsApi.listShared(signal), []);

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">My trips</h1>
        <Link to="/trips/new" className="btn btn--primary btn--auto">
          Plan a trip
        </Link>
      </div>

      {owned.isLoading ? <TripListSkeleton /> : null}

      {owned.error && !owned.isLoading ? (
        <ErrorState
          error={owned.error}
          onRetry={owned.refresh}
          title="Could not load your trips"
        />
      ) : null}

      {!owned.isLoading && !owned.error && owned.data ? (
        owned.data.length === 0 ? (
          <EmptyState
            title="No trips yet"
            body="Plan your first trip and TrailPack will build a packing checklist for it."
            action={
              <Link to="/trips/new" className="btn btn--primary btn--auto">
                Plan a trip
              </Link>
            }
          />
        ) : (
          <ul className="trip-grid">
            {owned.data.map((trip) => (
              <TripCard key={trip.tripId} trip={trip} />
            ))}
          </ul>
        )
      ) : null}

      {/* Shared trips are supplementary: a failure to load them must not
          replace the page, which is why this section renders its own error
          inline instead of bubbling up. */}
      {shared.data && shared.data.length > 0 ? (
        <section className="page__section">
          <h2 className="page__subtitle">Shared with you</h2>
          <ul className="trip-grid">
            {shared.data.map((trip) => (
              <TripCard key={trip.tripId} trip={trip} />
            ))}
          </ul>
        </section>
      ) : null}

      {shared.error && !shared.isLoading ? (
        <section className="page__section">
          <h2 className="page__subtitle">Shared with you</h2>
          <ErrorState
            error={shared.error}
            onRetry={shared.refresh}
            title="Could not load trips shared with you"
          />
        </section>
      ) : null}
    </div>
  );
}
