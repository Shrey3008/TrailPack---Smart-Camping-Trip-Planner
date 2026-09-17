import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { SECURITY_QUESTIONS, type SecurityQuestion } from '../api/auth';
import { FormError, SelectField, SubmitButton, TextField } from '../components/Field';

/**
 * Registration.
 *
 * The security question is required by the API — POST /auth/register 400s
 * without both question and answer, and the question must be one of the five
 * the backend allows. That list is imported rather than retyped so a change
 * there is a compile error here, not a runtime 400.
 */
export function RegisterPage() {
  const { register, status, error, clearError, isSubmitting } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    securityQuestion: SECURITY_QUESTIONS[0] as SecurityQuestion,
    securityAnswer: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => () => clearError(), [clearError]);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Enter your name.';
    if (!form.email.trim()) next.email = 'Enter your email address.';

    // 8 is this form's rule, NOT the server's — POST /auth/register enforces no
    // minimum length at all, so the API accepts a one-character password today.
    // The rest of the backend disagrees with itself too: PUT /auth/password
    // requires 6, POST /auth/forgot/reset-password requires 8, and the vanilla
    // register.html asks for 6 client-side only. 8 is chosen here to match the
    // strictest existing rule rather than add a fourth number.
    //
    // This is client-side only and therefore not a control — anyone posting
    // directly to the API bypasses it. Worth fixing server-side in its own
    // change; doing it here would be a silent behaviour change to a running
    // product from inside a frontend migration.
    if (!form.password) next.password = 'Choose a password.';
    else if (form.password.length < 8) next.password = 'Use at least 8 characters.';

    if (form.confirmPassword !== form.password) {
      next.confirmPassword = 'Passwords do not match.';
    }
    if (!form.securityAnswer.trim()) {
      next.securityAnswer = 'Answer the security question so you can recover your account.';
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        securityQuestion: form.securityQuestion,
        securityAnswer: form.securityAnswer,
      });
      // Registration deliberately does not sign you in — the API answers 201
      // with a message and no token. Hand off to the login page and say so,
      // rather than silently landing on a form with no explanation.
      navigate('/login', {
        replace: true,
        state: { notice: 'Your account is ready. Sign in to get started.' },
      });
    } catch {
      /* message rendered from auth state */
    }
  }

  return (
    <main className="auth-layout">
      <div className="auth-card">
        <p className="auth-card__brand">TrailPack</p>
        <h1 className="auth-card__title">Create your account</h1>
        <p className="auth-card__subtitle">Plan a trip and pack for it in one place.</p>

        <FormError message={error} />

        <form onSubmit={handleSubmit} noValidate>
          <TextField
            label="Name"
            name="name"
            value={form.name}
            autoComplete="name"
            autoFocus
            disabled={isSubmitting}
            error={fieldErrors.name}
            onChange={(e) => update('name', e.target.value)}
          />

          <TextField
            label="Email"
            type="email"
            name="email"
            value={form.email}
            autoComplete="email"
            disabled={isSubmitting}
            error={fieldErrors.email}
            onChange={(e) => update('email', e.target.value)}
          />

          <TextField
            label="Password"
            type="password"
            name="password"
            value={form.password}
            autoComplete="new-password"
            disabled={isSubmitting}
            error={fieldErrors.password}
            hint="At least 8 characters."
            onChange={(e) => update('password', e.target.value)}
          />

          <TextField
            label="Confirm password"
            type="password"
            name="confirmPassword"
            value={form.confirmPassword}
            autoComplete="new-password"
            disabled={isSubmitting}
            error={fieldErrors.confirmPassword}
            onChange={(e) => update('confirmPassword', e.target.value)}
          />

          <SelectField
            label="Security question"
            name="securityQuestion"
            value={form.securityQuestion}
            disabled={isSubmitting}
            hint="Used to recover your account if you forget your password."
            onChange={(e) => update('securityQuestion', e.target.value as SecurityQuestion)}
          >
            {SECURITY_QUESTIONS.map((question) => (
              <option key={question} value={question}>
                {question}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Your answer"
            name="securityAnswer"
            value={form.securityAnswer}
            autoComplete="off"
            disabled={isSubmitting}
            error={fieldErrors.securityAnswer}
            onChange={(e) => update('securityAnswer', e.target.value)}
          />

          <SubmitButton pending={isSubmitting} pendingLabel="Creating account…">
            Create account
          </SubmitButton>
        </form>

        <p className="auth-card__footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
