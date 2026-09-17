import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { authApi } from '../api/auth';
import { FormError, SubmitButton, TextField } from '../components/Field';

/**
 * Password recovery, which the API models as three ordered steps:
 *
 *   1. POST /auth/forgot/get-question   → the question for that email
 *   2. POST /auth/forgot/verify-answer  → a short-lived resetToken
 *   3. POST /auth/forgot/reset-password → done
 *
 * Modelled as a discriminated union rather than a pile of booleans, so the
 * resetToken is only reachable in the step that actually has one. That is not
 * decoration: step 3 cannot compile without having passed through step 2.
 *
 * Step 2's trap, from routes/auth.js: a WRONG ANSWER IS HTTP 200 with
 * `{ success: false }`, deliberately, so the client does not branch on status.
 * Treating a resolved promise as success would let anyone through.
 */
type Stage =
  | { step: 'email' }
  | { step: 'answer'; email: string; question: string }
  | { step: 'reset'; email: string; resetToken: string };

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ step: 'email' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function failureMessage(cause: unknown, fallback: string): string {
    return cause instanceof ApiError ? cause.message : fallback;
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return setError('Enter your email address.');
    setPending(true);
    setError(null);
    try {
      const { securityQuestion } = await authApi.getSecurityQuestion(email.trim());
      setStage({ step: 'answer', email: email.trim(), question: securityQuestion });
    } catch (cause) {
      // 404 (no account) and 409 (account predates security questions) both
      // arrive with a message worth showing verbatim.
      setError(failureMessage(cause, 'Could not look up that account.'));
    } finally {
      setPending(false);
    }
  }

  async function submitAnswer(event: FormEvent) {
    event.preventDefault();
    if (stage.step !== 'answer') return;
    if (!answer.trim()) return setError('Enter your answer.');
    setPending(true);
    setError(null);
    try {
      const result = await authApi.verifySecurityAnswer({
        email: stage.email,
        answer: answer.trim(),
      });
      // The check that matters — see the note above.
      if (!result.success) {
        setError('That answer does not match our records.');
        return;
      }
      setStage({ step: 'reset', email: stage.email, resetToken: result.resetToken });
    } catch (cause) {
      setError(failureMessage(cause, 'Could not verify your answer.'));
    } finally {
      setPending(false);
    }
  }

  async function submitNewPassword(event: FormEvent) {
    event.preventDefault();
    if (stage.step !== 'reset') return;
    if (newPassword.length < 8) return setError('Use at least 8 characters.');
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');

    setPending(true);
    setError(null);
    try {
      await authApi.resetPassword({
        email: stage.email,
        resetToken: stage.resetToken,
        newPassword,
      });
      navigate('/login', {
        replace: true,
        state: { notice: 'Your password has been reset. Sign in with your new password.' },
      });
    } catch (cause) {
      setError(failureMessage(cause, 'Could not reset your password.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-layout">
      <div className="auth-card">
        <p className="auth-card__brand">TrailPack</p>
        <h1 className="auth-card__title">Reset your password</h1>

        <FormError message={error} />

        {stage.step === 'email' ? (
          <>
            <p className="auth-card__subtitle">
              Enter your email and we’ll ask your security question.
            </p>
            <form onSubmit={submitEmail} noValidate>
              <TextField
                label="Email"
                type="email"
                name="email"
                value={email}
                autoComplete="email"
                autoFocus
                disabled={pending}
                onChange={(e) => setEmail(e.target.value)}
              />
              <SubmitButton pending={pending} pendingLabel="Looking up…">
                Continue
              </SubmitButton>
            </form>
          </>
        ) : null}

        {stage.step === 'answer' ? (
          <>
            <p className="auth-card__subtitle">{stage.question}</p>
            <form onSubmit={submitAnswer} noValidate>
              <TextField
                label="Your answer"
                name="answer"
                value={answer}
                autoComplete="off"
                autoFocus
                disabled={pending}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <SubmitButton pending={pending} pendingLabel="Checking…">
                Verify answer
              </SubmitButton>
            </form>
          </>
        ) : null}

        {stage.step === 'reset' ? (
          <>
            <p className="auth-card__subtitle">Choose a new password.</p>
            <form onSubmit={submitNewPassword} noValidate>
              <TextField
                label="New password"
                type="password"
                name="newPassword"
                value={newPassword}
                autoComplete="new-password"
                autoFocus
                disabled={pending}
                hint="At least 8 characters."
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <TextField
                label="Confirm new password"
                type="password"
                name="confirmPassword"
                value={confirmPassword}
                autoComplete="new-password"
                disabled={pending}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <SubmitButton pending={pending} pendingLabel="Saving…">
                Reset password
              </SubmitButton>
            </form>
          </>
        ) : null}

        <p className="auth-card__footer">
          Remembered it? <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
