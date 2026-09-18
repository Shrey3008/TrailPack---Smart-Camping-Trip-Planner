import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { SECURITY_QUESTIONS, type SecurityQuestion } from '../api/auth';
import { BrandPanel, PaneMobileLogo } from '../components/BrandPanel';
import {
  AuthPasswordField,
  AuthSelectField,
  AuthSubmit,
  AuthTextField,
} from '../components/AuthField';

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => () => clearError(), [clearError]);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  function validate(): boolean {
    const next: Record<string, string | undefined> = {};
    if (!form.name.trim()) next.name = 'Please enter your name.';
    if (!form.email.trim()) next.email = 'Please enter a valid email.';

    // 8 is this form's rule, NOT the server's — POST /auth/register enforces no
    // minimum length at all, so the API accepts a one-character password today.
    // The rest of the backend disagrees with itself too: PUT /auth/password
    // requires 6, POST /auth/forgot/reset-password requires 8, and the vanilla
    // register.html asks for 6 client-side only. 8 matches the strictest
    // existing rule rather than adding a fourth number.
    //
    // Client-side length is not a control — anyone posting directly to the API
    // bypasses it. Worth fixing server-side in its own change.
    if (!form.password) next.password = 'Please choose a password.';
    else if (form.password.length < 8) next.password = 'Use at least 8 characters.';

    if (form.confirmPassword !== form.password) {
      next.confirmPassword = 'Passwords do not match.';
    }
    if (!form.securityAnswer.trim()) {
      next.securityAnswer = 'Please answer the security question.';
    }

    setFieldErrors(next);
    return Object.values(next).every((v) => v === undefined);
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
      // with a message and no token. Hand off to sign-in and say so.
      navigate('/login', {
        replace: true,
        state: { notice: 'Your account is ready. Sign in to get started.' },
      });
    } catch {
      /* message rendered from auth state */
    }
  }

  return (
    <div className="auth-shell">
      <BrandPanel />

      <main className="pane">
        <div className="form-wrap">
          <PaneMobileLogo />

          <header className="pane__intro">
            <p className="pane__greeting">Welcome to TrailPack 🎒</p>
            <h1>Create your account</h1>
          </header>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <AuthTextField
              label="Full Name"
              name="name"
              value={form.name}
              placeholder="Enter your full name"
              autoComplete="name"
              autoFocus
              disabled={isSubmitting}
              error={fieldErrors.name}
              onChange={(e) => update('name', e.target.value)}
            />

            <AuthTextField
              label="Email"
              type="email"
              name="email"
              value={form.email}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isSubmitting}
              error={fieldErrors.email}
              onChange={(e) => update('email', e.target.value)}
            />

            <AuthPasswordField
              label="Password"
              name="password"
              value={form.password}
              placeholder="Create a password"
              autoComplete="new-password"
              disabled={isSubmitting}
              error={fieldErrors.password}
              hint="Must be at least 8 characters"
              onChange={(e) => update('password', e.target.value)}
            />

            <AuthPasswordField
              label="Confirm Password"
              name="confirmPassword"
              value={form.confirmPassword}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              disabled={isSubmitting}
              error={fieldErrors.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
            />

            <AuthSelectField
              label="Security Question"
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
            </AuthSelectField>

            <AuthTextField
              label="Your Answer"
              name="securityAnswer"
              value={form.securityAnswer}
              placeholder="Your answer"
              autoComplete="off"
              disabled={isSubmitting}
              error={fieldErrors.securityAnswer}
              hint="Case-insensitive — extra spaces are ignored."
              onChange={(e) => update('securityAnswer', e.target.value)}
            />

            {error ? (
              <div className="auth-error" role="alert">
                {error}
              </div>
            ) : null}

            <AuthSubmit pending={isSubmitting} pendingLabel="Creating account…">
              Create Account
            </AuthSubmit>
          </form>

          <div className="divider">
            <span>or</span>
          </div>

          <p className="signup">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>

          <p className="copyright">© 2026 TrailPack</p>
        </div>
      </main>
    </div>
  );
}
