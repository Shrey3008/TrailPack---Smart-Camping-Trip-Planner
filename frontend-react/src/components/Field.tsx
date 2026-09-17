/**
 * A labelled input with its error and hint wired up.
 *
 * Exists so the accessibility plumbing is written once instead of per form:
 * the label points at the control, `aria-describedby` points at whichever of
 * hint/error is present, and `aria-invalid` flips when there is an error.
 * Those three get forgotten individually; bundling them means a new form
 * cannot ship without them.
 */

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

interface FieldShellProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

function FieldShell({ label, error, hint, children }: FieldShellProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
};

export function TextField({ label, error, hint, ...inputProps }: InputProps) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <input
          {...inputProps}
          id={id}
          className="field__input"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      )}
    </FieldShell>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: ReactNode;
};

export function SelectField({ label, error, hint, children, ...selectProps }: SelectProps) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <select
          {...selectProps}
          id={id}
          className="field__select"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}

export function SubmitButton({
  children,
  pending,
  pendingLabel,
}: {
  children: ReactNode;
  pending: boolean;
  pendingLabel: string;
}) {
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? <span className="btn__spinner" aria-hidden="true" /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * Form-level error. `role="alert"` so a submission failure is announced —
 * this is the one message per form that should interrupt, which is why the
 * per-field errors deliberately do not.
 */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}
