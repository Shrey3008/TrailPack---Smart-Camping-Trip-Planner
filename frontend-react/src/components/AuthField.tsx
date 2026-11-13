/**
 * Form controls for the auth pages.
 *
 * Separate from components/Field.tsx because the two design systems really are
 * different: the app pages use the token-driven `.field` styles, the auth pages
 * use the self-contained styles copied from the vanilla login. Sharing one
 * component and branching on a prop would tie them together for no gain — they
 * change for different reasons.
 *
 * The accessibility wiring matches Field.tsx: label bound to control,
 * aria-describedby pointing at hint and error, aria-invalid on failure.
 */

import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

function useFieldIds(error?: string, hint?: ReactNode) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return { id, errorId, hintId, describedBy };
}

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
};

export function AuthTextField({ label, error, hint, ...inputProps }: TextProps) {
  const { id, errorId, hintId, describedBy } = useFieldIds(error, hint);

  return (
    <div className={`auth-field${error ? ' auth-field--error' : ''}`}>
      <label className="auth-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="auth-field__control">
        <input
          {...inputProps}
          id={id}
          className="auth-field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      </div>
      {hint ? (
        <p className="auth-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <span className="auth-field__error" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Password input with the show/hide eye, matching the vanilla control.
 *
 * The toggle is a real button with `aria-pressed` and a label that changes with
 * state, so it is reachable and its effect is announced. Reveal state is local:
 * showing one password field must not reveal the others on the register form.
 */
export function AuthPasswordField({ label, error, hint, ...inputProps }: TextProps) {
  const { id, errorId, hintId, describedBy } = useFieldIds(error, hint);
  const [revealed, setRevealed] = useState(false);

  return (
    <div className={`auth-field auth-field--password${error ? ' auth-field--error' : ''}`}>
      <label className="auth-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="auth-field__control">
        <input
          {...inputProps}
          type={revealed ? 'text' : 'password'}
          id={id}
          className="auth-field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="auth-field__toggle"
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          onClick={() => setRevealed((v) => !v)}
        >
          {revealed ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {hint ? (
        <p className="auth-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <span className="auth-field__error" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> & {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: ReactNode;
};

export function AuthSelectField({ label, error, hint, children, ...selectProps }: SelectProps) {
  const { id, errorId, hintId, describedBy } = useFieldIds(error, hint);

  return (
    <div className={`auth-field${error ? ' auth-field--error' : ''}`}>
      <label className="auth-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="auth-field__control">
        <select
          {...selectProps}
          id={id}
          className="auth-field__select"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          {children}
        </select>
      </div>
      {hint ? (
        <p className="auth-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <span className="auth-field__error" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function AuthSubmit({
  children,
  pending,
  pendingLabel,
}: {
  children: ReactNode;
  pending: boolean;
  pendingLabel: string;
}) {
  return (
    <button type="submit" className="btn-submit" disabled={pending}>
      {pending ? <span className="btn-submit__spinner" aria-hidden="true" /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}

/* --------------------------------------------------------------- icons --- */

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.6 19.6 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.5 19.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
