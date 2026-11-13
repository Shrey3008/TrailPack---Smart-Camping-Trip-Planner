import { Link } from 'react-router-dom';
import type { Trip } from '../types/api';
import { formatDateRange, formatDuration } from '../lib/format';

/** Status pill colouring. Unknown values fall back to neutral rather than
 *  throwing — `status` is a free string on the schema, so a row written by an
 *  older version of the app can legitimately carry something not in the list. */
function statusClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'pill pill--done';
    case 'cancelled':
      return 'pill pill--muted';
    case 'active':
    case 'in_progress':
      return 'pill pill--active';
    default:
      return 'pill';
  }
}

function statusLabel(status: string): string {
  if (status === 'in_progress') return 'In progress';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function TripCard({ trip }: { trip: Trip }) {
  const dates = formatDateRange(trip.startDate, trip.endDate);

  return (
    <li className="trip-card">
      <div className="trip-card__head">
        <h3 className="trip-card__title">
          {/* The title is the link, not the whole card: a card-sized <a> would
              swallow any control added inside it later. It opens the checklist
              because packing is what a trip is opened for, as on the vanilla
              dashboard; trip settings are one link away, and owner-only. */}
          <Link to={`/trips/${trip.tripId}/checklist`}>{trip.name}</Link>
        </h3>
        <span className={statusClass(trip.status)}>{statusLabel(trip.status)}</span>
      </div>

      <dl className="trip-card__meta">
        <div>
          <dt>Where</dt>
          <dd>{trip.location || `${trip.terrain}`}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{dates ?? `${trip.season} · ${formatDuration(trip.duration)}`}</dd>
        </div>
        <div>
          <dt>Party</dt>
          <dd>
            {trip.groupSize} {trip.groupSize === 1 ? 'person' : 'people'}
          </dd>
        </div>
      </dl>
    </li>
  );
}
