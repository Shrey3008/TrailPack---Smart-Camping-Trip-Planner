import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { FormError, SubmitButton, TextField } from '../components/Field';

interface LocationState {
  from?: { pathname: string };
  /**
   * Set by the pages that hand off to sign-in — registration and the end of
   * the password reset. Without rendering it, someone who has just created an
   * account arrives at a blank form with no sign anything worked, and the
   * natural reading is that the submission failed.
   */
  notice?: string;
}

export function LoginPage() {
  const { login, status, error, clearError, isSubmitting } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  // Clear a stale message when the page is left, so returning here does not
  // show the previous attempt's failure against an empty form.
  useEffect(() => () => clearError(), [clearError]);

  const state = location.state as LocationState | null;
  // Where ProtectedRoute wanted to send them before the redirect.
  const from = state?.from?.pathname ?? '/';
  const notice = state?.notice;

  if (status === 'authenticated') return <Navigate to={from} replace />;

  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    if (!password) next.password = 'Enter your password.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    try {
      await login({ email: email.trim(), password });
      navigate(from, { replace: true });
    } catch {
      // The message is already in auth state; FormError renders it. Swallowed
      // here so an expected 401 does not surface as an unhandled rejection.
    }
  }

  return (
    <main className="auth-layout">
      <div className="auth-card">
        <p className="auth-card__brand">TrailPack</p>
        <h1 className="auth-card__title">Sign in</h1>
        <p className="auth-card__subtitle">Pick up where you left off.</p>

        {/* A success handoff from registration or password reset. `role="status"`
            rather than "alert": it is good news and should not interrupt what a
            screen reader is already saying. Hidden once a sign-in attempt
            fails, so the two messages never contradict each other on screen. */}
        {notice && !error ? (
          <p className="form-success" role="status">
            {notice}
          </p>
        ) : null}

        <FormError message={error} />

        {/* noValidate: the browser's own bubbles are unstyled, inconsistent
            across browsers, and not announced the way our messages are. */}
        <form onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email"
            type="email"
            name="email"
            value={email}
            autoComplete="email"
            autoFocus
            disabled={isSubmitting}
            error={fieldErrors.email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <TextField
            label="Password"
            type="password"
            name="password"
            value={password}
            autoComplete="current-password"
            disabled={isSubmitting}
            error={fieldErrors.password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <SubmitButton pending={isSubmitting} pendingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </form>

        <p className="auth-card__footer">
          <Link to="/forgot-password">Forgot your password?</Link>
          <br />
          New here? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
