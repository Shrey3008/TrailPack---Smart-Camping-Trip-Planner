import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { authApi } from '../api/auth';
import { BrandPanel, PaneMobileLogo } from '../components/BrandPanel';
import { AuthPasswordField, AuthSubmit, AuthTextField } from '../components/AuthField';

/**
 * Password recovery, which the API models as three ordered steps:
 *
 *   1. POST /auth/forgot/get-question   → the question for that email
 *   2. POST /auth/forgot/verify-answer  → a short-lived resetToken
 *   3. POST /auth/forgot/reset-password → done
 *
 * Modelled as a discriminated union rather than a pile of booleans, so the
 * resetToken is only reachable in the step that has one: step 3 cannot compile
 * without having passed through step 2.
 *
 * Step 2's trap, from routes/auth.js: a WRONG ANSWER IS HTTP 200 with
 * `{ success: false }`, deliberately, so the client does not branch on status.
 * Treating a resolved promise as success would let anyone through.
 *
 * Uses the same two-panel shell as sign-in and registration. The vanilla site's
 * forgot-password page is a plainer layout, but matching it would put a third
 * different auth design in front of the user mid-flow.
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
    if (!email.trim()) return setError('Please enter a valid email.');
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
    if (!answer.trim()) return setError('Please enter your answer.');
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

  const greeting =
    stage.step === 'email'
      ? 'Forgot your password?'
      : stage.step === 'answer'
        ? 'Verify it’s you'
        : 'Almost there';

  return (
    <div className="auth-shell">
      <BrandPanel />

      <main className="pane">
        <div className="form-wrap">
          <PaneMobileLogo />

          <header className="pane__intro">
            <p className="pane__greeting">{greeting}</p>
            <h1>Reset your password</h1>
          </header>

          {stage.step === 'email' ? (
            <form className="auth-form" onSubmit={submitEmail} noValidate>
              <AuthTextField
                label="Email"
                type="email"
                name="email"
                value={email}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                disabled={pending}
                hint="We’ll ask the security question you chose when you signed up."
                onChange={(e) => setEmail(e.target.value)}
              />
              {error ? (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              ) : null}
              <AuthSubmit pending={pending} pendingLabel="Looking up…">
                Continue
              </AuthSubmit>
            </form>
          ) : null}

          {stage.step === 'answer' ? (
            <form className="auth-form" onSubmit={submitAnswer} noValidate>
              <AuthTextField
                label={stage.question}
                name="answer"
                value={answer}
                placeholder="Your answer"
                autoComplete="off"
                autoFocus
                disabled={pending}
                hint="Case-insensitive — extra spaces are ignored."
                onChange={(e) => setAnswer(e.target.value)}
              />
              {error ? (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              ) : null}
              <AuthSubmit pending={pending} pendingLabel="Checking…">
                Verify answer
              </AuthSubmit>
            </form>
          ) : null}

          {stage.step === 'reset' ? (
            <form className="auth-form" onSubmit={submitNewPassword} noValidate>
              <AuthPasswordField
                label="New Password"
                name="newPassword"
                value={newPassword}
                placeholder="Create a password"
                autoComplete="new-password"
                autoFocus
                disabled={pending}
                hint="Must be at least 8 characters"
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <AuthPasswordField
                label="Confirm New Password"
                name="confirmPassword"
                value={confirmPassword}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                disabled={pending}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {error ? (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              ) : null}
              <AuthSubmit pending={pending} pendingLabel="Saving…">
                Reset password
              </AuthSubmit>
            </form>
          ) : null}

          <div className="divider">
            <span>or</span>
          </div>

          <p className="signup">
            Remembered it? <Link to="/login">Back to sign in</Link>
          </p>

          <p className="copyright">© 2026 TrailPack</p>
        </div>
      </main>
    </div>
  );
}
