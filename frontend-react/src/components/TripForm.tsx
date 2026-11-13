import { useState, type FormEvent } from 'react';

import { FormError, SelectField, SubmitButton, TextField } from './Field';
import { nightsBetween, todayISO } from '../lib/format';
import { SEASONS, TERRAINS, type Season, type Terrain, type Trip } from '../types/api';

/**
 * Create and edit share this form.
 *
 * One component rather than two because the fields and the validation rules
 * are identical — the only differences are the initial values and what the
 * submit button says. Two copies would drift, and the validation is the part
 * that must not.
 */

export interface TripFormValues {
  name: string;
  terrain: Terrain;
  season: Season;
  duration: string; // kept as a string so the input can be empty mid-edit
  groupSize: string;
  location: string;
  startDate: string;
  endDate: string;
}

export function initialValuesFrom(trip: Trip): TripFormValues {
  return {
    name: trip.name,
    // Stored verbatim, even when it is not one of TERRAINS/SEASONS. The API
    // does not validate either field, so a trip created by an older version of
    // the app can carry anything. Coercing it to a known value here would
    // rewrite the user's data the next time they saved an unrelated field; the
    // select below keeps an unknown value selectable instead.
    terrain: trip.terrain as Terrain,
    season: trip.season as Season,
    duration: String(trip.duration ?? ''),
    groupSize: String(trip.groupSize ?? 1),
    location: trip.location ?? '',
    startDate: trip.startDate ?? '',
    endDate: trip.endDate ?? '',
  };
}

export const emptyTripValues: TripFormValues = {
  name: '',
  terrain: 'Mountain',
  season: 'Summer',
  duration: '3',
  groupSize: '1',
  location: '',
  startDate: '',
  endDate: '',
};

export type TripFormErrors = Partial<Record<keyof TripFormValues, string>>;

/**
 * Validation.
 *
 * Exported and pure so Phase 7 can test it without rendering anything, and so
 * the rules are readable in one place rather than scattered through JSX.
 *
 * These mirror the server where the server has a rule (name/terrain/season/
 * duration required, groupSize clamped to 1–50) and add only what the server
 * cannot check on its own — that an end date is not before its start.
 */
export function validateTripForm(values: TripFormValues): TripFormErrors {
  const errors: TripFormErrors = {};

  if (!values.name.trim()) errors.name = 'Give the trip a name.';
  if (!values.terrain) errors.terrain = 'Choose a terrain.';
  if (!values.season) errors.season = 'Choose a season.';

  const duration = Number(values.duration);
  if (!values.duration.trim()) {
    errors.duration = 'How many nights?';
  } else if (!Number.isInteger(duration) || duration < 1) {
    errors.duration = 'Enter a whole number of nights, at least 1.';
  } else if (duration > 365) {
    errors.duration = 'That is longer than a year — check the number.';
  }

  const groupSize = Number(values.groupSize);
  if (!values.groupSize.trim()) {
    errors.groupSize = 'How many people?';
  } else if (!Number.isInteger(groupSize) || groupSize < 1) {
    errors.groupSize = 'At least 1 person.';
  } else if (groupSize > 50) {
    // The server clamps silently to 50; saying so is better than accepting
    // 80 and showing 50 afterwards with no explanation.
    errors.groupSize = 'TrailPack supports up to 50 people per trip.';
  }

  if (values.startDate && values.endDate) {
    const nights = nightsBetween(values.startDate, values.endDate);
    if (nights === null) {
      errors.endDate = 'Check these dates.';
    } else if (nights < 0) {
      errors.endDate = 'The end date is before the start date.';
    }
  }

  return errors;
}

interface TripFormProps {
  initialValues: TripFormValues;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (values: TripFormValues) => Promise<void>;
  /** A request failure, as opposed to a validation problem. */
  submitError: string | null;
  onCancel?: () => void;
}

export function TripForm({
  initialValues,
  submitLabel,
  pendingLabel,
  onSubmit,
  submitError,
  onCancel,
}: TripFormProps) {
  const [values, setValues] = useState<TripFormValues>(initialValues);
  const [errors, setErrors] = useState<TripFormErrors>({});
  const [pending, setPending] = useState(false);

  function update<K extends keyof TripFormValues>(key: K, value: TripFormValues[K]) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };

      // Keep duration and the date range consistent, in the direction the user
      // is not currently typing. Editing dates implies a duration; editing
      // duration with a start date set implies an end date. Without this the
      // two disagree silently and whichever the checklist reads wins.
      if (key === 'startDate' || key === 'endDate') {
        const nights = nightsBetween(next.startDate, next.endDate);
        if (nights !== null && nights > 0) next.duration = String(nights);
      }
      return next;
    });

    // Clear a field's error as soon as it is edited — leaving it until the next
    // submit makes the form feel like it is arguing with the user.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateTripForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      await onSubmit(values);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="trip-form" onSubmit={handleSubmit} noValidate>
      <FormError message={submitError} />

      <TextField
        label="Trip name"
        name="name"
        value={values.name}
        autoFocus
        disabled={pending}
        error={errors.name}
        onChange={(e) => update('name', e.target.value)}
      />

      <TextField
        label="Destination"
        name="location"
        value={values.location}
        disabled={pending}
        error={errors.location}
        hint="Optional. Used for the weather forecast on the checklist."
        onChange={(e) => update('location', e.target.value)}
      />

      <div className="field-row">
        <SelectField
          label="Terrain"
          name="terrain"
          value={values.terrain}
          disabled={pending}
          error={errors.terrain}
          onChange={(e) => update('terrain', e.target.value as Terrain)}
        >
          {TERRAINS.map((terrain) => (
            <option key={terrain} value={terrain}>
              {terrain}
            </option>
          ))}
          {/* A stored value outside the list stays selectable, so editing a
              trip does not quietly change its terrain on save. */}
          {(TERRAINS as readonly string[]).includes(values.terrain) ? null : (
            <option value={values.terrain}>{values.terrain}</option>
          )}
        </SelectField>

        <SelectField
          label="Season"
          name="season"
          value={values.season}
          disabled={pending}
          error={errors.season}
          onChange={(e) => update('season', e.target.value as Season)}
        >
          {SEASONS.map((season) => (
            <option key={season} value={season}>
              {season}
            </option>
          ))}
          {(SEASONS as readonly string[]).includes(values.season) ? null : (
            <option value={values.season}>{values.season}</option>
          )}
        </SelectField>
      </div>

      <div className="field-row">
        <TextField
          label="Nights"
          name="duration"
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          value={values.duration}
          disabled={pending}
          error={errors.duration}
          onChange={(e) => update('duration', e.target.value)}
        />

        <TextField
          label="People"
          name="groupSize"
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={values.groupSize}
          disabled={pending}
          error={errors.groupSize}
          onChange={(e) => update('groupSize', e.target.value)}
        />
      </div>

      <div className="field-row">
        <TextField
          label="Start date"
          name="startDate"
          type="date"
          min={todayISO()}
          value={values.startDate}
          disabled={pending}
          error={errors.startDate}
          hint="Optional."
          onChange={(e) => update('startDate', e.target.value)}
        />

        <TextField
          label="End date"
          name="endDate"
          type="date"
          min={values.startDate || todayISO()}
          value={values.endDate}
          disabled={pending}
          error={errors.endDate}
          hint="Optional."
          onChange={(e) => update('endDate', e.target.value)}
        />
      </div>

      <div className="form-actions">
        <SubmitButton pending={pending} pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
        {onCancel ? (
          <button
            type="button"
            className="btn btn--ghost btn--auto"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
