/**
 * Dependency-free Supabase access.
 *
 * Diagnosix is a static bundle, so instead of pulling in an SDK these helpers
 * call Supabase's HTTPS APIs directly with `fetch`.
 *
 * Security contract:
 *  - Only the *public* anon key is read here. It is safe to ship to a browser
 *    because every row is gated by the row-level security policies in
 *    `supabase/schema.sql`.
 *  - Passwords are posted to Supabase over TLS and are never stored, logged or
 *    persisted anywhere in this app. Supabase hashes them server-side.
 */

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/** True once both public env vars are set; the UI stays open until then. */
export const isAuthConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

export interface SupabaseUser {
  id: string;
  email?: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  /** Unix seconds at which the access token stops being accepted. */
  expires_at: number;
  user: SupabaseUser;
}

/** An auth failure whose message is safe to show to a person. */
export class SupabaseAuthError extends Error {
  readonly code: string;

  constructor(message: string, code = 'auth_error') {
    super(message);
    this.name = 'SupabaseAuthError';
    this.code = code;
  }
}

interface RawSession {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: SupabaseUser;
}

interface RequestOptions {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string;
  /** Already-encoded query string, including the leading `?`. */
  query?: string;
}

function readField(payload: unknown, keys: string[]): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Supabase returns machine-oriented text ("Invalid login credentials"). People
 * get something they can act on instead; anything unrecognised is passed
 * through unchanged so real information is never hidden.
 */
function friendlyMessage(raw: string | null, status: number): string {
  if (!raw) {
    if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
    if (status >= 500) return 'The sign-in service is having trouble. Please try again shortly.';
    return 'Sign-in failed. Please try again.';
  }

  const normalised = raw.toLowerCase();
  if (normalised.includes('invalid login credentials')) {
    return 'That email and password do not match. Please try again.';
  }
  if (normalised.includes('email not confirmed')) {
    return 'Please confirm your email with the 6-digit code we sent before signing in.';
  }
  if (normalised.includes('already registered') || normalised.includes('already exists')) {
    return 'That email is already registered. Try signing in instead.';
  }
  if (normalised.includes('token has expired') || normalised.includes('invalid token') || normalised.includes('expired')) {
    return 'That code is wrong or has expired. Request a new one and try again.';
  }
  if (normalised.includes('at least 6 characters') || normalised.includes('password should be')) {
    return 'Please choose a longer password (at least 8 characters).';
  }
  if (normalised.includes('rate limit') || (normalised.includes('after') && normalised.includes('seconds'))) {
    return 'Please wait a moment before requesting another code.';
  }
  if (normalised.includes('unable to validate email') || normalised.includes('invalid format')) {
    return 'That does not look like a valid email address.';
  }
  return raw;
}

async function request<T>({ path, method = 'POST', body, accessToken, query }: RequestOptions): Promise<T> {
  if (!isAuthConfigured) {
    throw new SupabaseAuthError('Sign-in is not configured on this build.', 'not_configured');
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}${path}${query ?? ''}`, {
      method,
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new SupabaseAuthError('Could not reach the sign-in server. Check your connection and try again.', 'network');
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const raw = readField(payload, ['error_description', 'msg', 'message', 'error']);
    throw new SupabaseAuthError(friendlyMessage(raw, response.status), readField(payload, ['error_code', 'code']) ?? 'auth_error');
  }

  return payload as T;
}

function normaliseSession(raw: RawSession | null): SupabaseSession {
  if (!raw || !raw.access_token || !raw.refresh_token || !raw.user?.id) {
    throw new SupabaseAuthError('The sign-in server sent an unexpected response. Please try again.', 'bad_response');
  }
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at:
      typeof raw.expires_at === 'number' ? raw.expires_at : Math.floor(Date.now() / 1000) + (raw.expires_in ?? 3600),
    user: { id: raw.user.id, email: raw.user.email },
  };
}

/**
 * Creates the account and asks Supabase to email a 6-digit confirmation code.
 * No session is returned yet — the person must verify the code first.
 */
export async function signUpWithPassword(email: string, password: string): Promise<{ needsVerification: boolean }> {
  const data = await request<{ session?: RawSession | null }>({
    path: '/auth/v1/signup',
    body: { email, password },
  });
  return { needsVerification: !data?.session };
}

/** Confirms "this inbox is really theirs" and signs them in. */
export async function verifySignupOtp(email: string, token: string): Promise<SupabaseSession> {
  const data = await request<RawSession>({
    path: '/auth/v1/verify',
    body: { type: 'signup', email, token },
  });
  return normaliseSession(data);
}

/** The everyday path once the account is confirmed. */
export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
  const data = await request<RawSession>({
    path: '/auth/v1/token',
    query: '?grant_type=password',
    body: { email, password },
  });
  return normaliseSession(data);
}

export async function refreshSession(refreshToken: string): Promise<SupabaseSession> {
  const data = await request<RawSession>({
    path: '/auth/v1/token',
    query: '?grant_type=refresh_token',
    body: { refresh_token: refreshToken },
  });
  return normaliseSession(data);
}

export async function resendSignupOtp(email: string): Promise<void> {
  await request<null>({ path: '/auth/v1/resend', body: { type: 'signup', email } });
}

/**
 * Best-effort server-side revocation. Callers clear local state regardless, so
 * a network failure can never strand someone in a half-signed-in state.
 */
export async function signOutSession(accessToken: string): Promise<void> {
  await request<null>({ path: '/auth/v1/logout', accessToken, body: {} });
}
