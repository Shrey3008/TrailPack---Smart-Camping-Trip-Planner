/**
 * Auth endpoints.
 *
 * This is where the API's envelope inconsistencies get absorbed, so no
 * component ever has to know that `/auth/login` returns `{ token, user }`
 * while `/auth/me` returns `{ user }` with a nested `stats`.
 */

import { api } from './client';
import type { CurrentUser, LoginResponse, MeResponse, User } from '../types/api';

/** The five questions backend/routes/auth.js will accept. Anything else 400s. */
export const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What city were you born in?',
  "What is your mother's maiden name?",
  'What was your elementary school name?',
  'What was the make of your first car?',
] as const;

export type SecurityQuestion = (typeof SECURITY_QUESTIONS)[number];

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  securityQuestion: SecurityQuestion;
  securityAnswer: string;
}

export const authApi = {
  /**
   * Public: a 401 here means "wrong password", not "session expired", so it
   * must not trip the global logout handler.
   */
  login(credentials: LoginCredentials): Promise<LoginResponse> {
    return api.post<LoginResponse>('/auth/login', credentials, { public: true });
  },

  /** Answers 201 with only `{ message }` — it does not log you in. */
  register(input: RegisterInput): Promise<{ message: string }> {
    return api.post<{ message: string }>('/auth/register', input, { public: true });
  },

  /** Unwraps `{ user }` so callers get the user directly. */
  async me(): Promise<CurrentUser> {
    const res = await api.get<MeResponse>('/auth/me');
    return res.user;
  },

  updateProfile(input: {
    name?: string;
    phone?: string;
    notificationSettings?: Record<string, unknown>;
  }): Promise<{ user: User }> {
    return api.put<{ user: User }>('/auth/profile', input);
  },

  changePassword(input: { currentPassword: string; newPassword: string }): Promise<{ message: string }> {
    return api.put<{ message: string }>('/auth/password', input);
  },

  /* ---- Forgot-password: three public steps, in this order ---- */

  /**
   * 404 when no account matches, 409 when the account predates the security
   * question feature and has none stored. Both are ApiErrors with a usable
   * `message` — show it rather than inventing copy.
   */
  getSecurityQuestion(email: string): Promise<{ securityQuestion: string }> {
    return api.post<{ securityQuestion: string }>('/auth/forgot/get-question', { email }, { public: true });
  },

  /**
   * Note the two traps here, both verified against routes/auth.js:
   *
   *  - the field is `answer`, not `securityAnswer` (which is what *register*
   *    takes). Sending the wrong key yields a 400.
   *  - a WRONG ANSWER IS NOT AN ERROR. The route always answers HTTP 200 with
   *    `{ success: boolean }`, deliberately, so the UI does not have to branch
   *    on status. Callers must check `success`; a resolved promise here does
   *    not mean the answer was right.
   */
  verifySecurityAnswer(input: { email: string; answer: string }): Promise<VerifyAnswerResponse> {
    return api.post<VerifyAnswerResponse>('/auth/forgot/verify-answer', input, { public: true });
  },

  resetPassword(input: { email: string; resetToken: string; newPassword: string }): Promise<{ message: string }> {
    return api.post<{ message: string }>('/auth/forgot/reset-password', input, { public: true });
  },
};

/**
 * Always HTTP 200. `resetToken` and `expiresInSeconds` are present only when
 * `success` is true, which is why this is a discriminated union rather than an
 * object with optional fields — the compiler then refuses to read the token
 * without checking `success` first.
 */
export type VerifyAnswerResponse =
  | { success: true; resetToken: string; expiresInSeconds: number }
  | { success: false };
