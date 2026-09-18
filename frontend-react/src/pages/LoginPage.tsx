import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { BrandPanel, PaneMobileLogo } from '../components/BrandPanel';
import { AuthPasswordField, AuthSubmit, AuthTextField } from '../components/AuthField';

interface LocationState {
  from?: { pathname: string };
  /**
   * Set by the pages that hand off to sign-in — registration and the end of
   * the password reset. Without rendering it, someone who has just created an
   * account arrives at a blank form with no sign anything worked.
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

  useEffect(() => () => clearError(), [clearError]);

  const state = location.state as LocationState | null;
  const from = state?.from?.pathname ?? '/';
  const notice = state?.notice;

  if (status === 'authenticated') return <Navigate to={from} replace />;

  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = 'Please enter a valid email.';
    if (!password) next.password = 'Password is required.';
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
      // Message already in auth state; rendered below. Swallowed so an
      // expected 401 is not an unhandled rejection.
    }
  }

  return (
    <div className="auth-shell">
      <BrandPanel />

      <main className="pane">
        <div className="form-wrap">
          <PaneMobileLogo />

          <header className="pane__intro">
            <p className="pane__greeting">Welcome back 👋</p>
            <h1>Sign in to TrailPack</h1>
          </header>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <AuthTextField
              label="Email"
              type="email"
              name="email"
              value={email}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              disabled={isSubmitting}
              error={fieldErrors.email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((p) => (p.email ? { ...p, email: undefined } : p));
              }}
            />

            <AuthPasswordField
              label="Password"
              name="password"
              value={password}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={isSubmitting}
              error={fieldErrors.password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((p) => (p.password ? { ...p, password: undefined } : p));
              }}
            />

            <div className="form-row">
              {/* "Remember me" is presentational here, as it is on the vanilla
                  page: the session lives in sessionStorage and ends with the
                  tab either way. Kept so the layout matches, and deliberately
                  not wired to anything it does not actually do. */}
              <label className="checkbox">
                <input type="checkbox" name="remember-me" disabled={isSubmitting} />
                Remember me
              </label>
              <Link to="/forgot-password" className="forgot-link">
                Forgot password?
              </Link>
            </div>

            {notice && !error ? (
              <div className="auth-success" role="status">
                {notice}
              </div>
            ) : null}

            {error ? (
              <div className="auth-error" role="alert">
                {error}
              </div>
            ) : null}

            <AuthSubmit pending={isSubmitting} pendingLabel="Signing in…">
              Sign In
            </AuthSubmit>
          </form>

          <div className="divider">
            <span>or</span>
          </div>

          <p className="signup">
            Don&rsquo;t have an account? <Link to="/register">Sign up</Link>
          </p>

          <p className="copyright">© 2026 TrailPack</p>
        </div>
      </main>
    </div>
  );
}
