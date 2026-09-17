/**
 * Accessor for the session.
 *
 * In its own file because AuthContext.tsx exports a component: keeping hooks
 * and components in separate modules is what lets Vite's fast refresh replace
 * the provider without remounting the tree.
 *
 * Throws rather than returning null when used outside the provider. A missing
 * provider is a wiring mistake that should fail loudly at the first render,
 * not produce a silently signed-out app that looks like a session bug.
 */

import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './AuthContext';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return context;
}
