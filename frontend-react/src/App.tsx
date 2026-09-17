/**
 * Routes.
 *
 * Flat and explicit while it is small. The two guard components wrap groups
 * via <Outlet/> rather than being repeated per route, so adding a protected
 * screen means adding one line inside the right group and cannot accidentally
 * ship unguarded.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute, RequireRole } from './auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { DashboardPlaceholder } from './pages/DashboardPlaceholder';

/** Phase 6 fills this in; here now so the guard itself is exercised. */
function AdminPlaceholder() {
  return (
    <main className="placeholder-page">
      <h1>Admin</h1>
      <p>
        This route is gated by <code>&lt;RequireRole roles={['admin']}/&gt;</code> in the UI and by{' '}
        <code>authorize('admin')</code> on the server. The admin views arrive in Phase 6.
      </p>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Requires a verified session */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPlaceholder />} />
          </Route>

          {/* Requires a session AND a role */}
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/admin" element={<AdminPlaceholder />} />
          </Route>

          {/* Unknown paths go home; the guard then decides where that is. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
