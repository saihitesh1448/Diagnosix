import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  isAuthConfigured,
  refreshSession,
  resendSignupOtp as resendOtp,
  signInWithPassword,
  signOutSession,
  signUpWithPassword,
  verifySignupOtp as verifyOtp,
  type SupabaseSession,
} from '../lib/supabase';

/**
 * Where the *session* lives between page loads.
 *
 * Only the short-lived access token and the opaque refresh token are kept —
 * never a password, and never any health data. It is removed on sign-out.
 */
const STORAGE_KEY = 'diagnosix.auth.session.v1';

/** Refresh slightly early so a request never races an expiry. */
const REFRESH_MARGIN_SECONDS = 120;
const REFRESH_POLL_MS = 60_000;

export interface AuthContextValue {
  /** False until both VITE_SUPABASE_* vars exist; the app stays open meanwhile. */
  configured: boolean;
  /** False while a stored session is still being restored. */
  ready: boolean;
  session: SupabaseSession | null;
  email: string | null;
  signUp: (email: string, password: string) => Promise<{ needsVerification: boolean }>;
  verifySignupOtp: (email: string, token: string) => Promise<void>;
  resendSignupOtp: (email: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): SupabaseSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SupabaseSession>;
    if (
      !parsed ||
      typeof parsed.access_token !== 'string' ||
      typeof parsed.refresh_token !== 'string' ||
      !parsed.user ||
      typeof parsed.user.id !== 'string'
    ) {
      return null;
    }
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_at: typeof parsed.expires_at === 'number' ? parsed.expires_at : 0,
      user: { id: parsed.user.id, email: parsed.user.email },
    };
  } catch {
    return null;
  }
}

function writeStoredSession(session: SupabaseSession | null): void {
  try {
    if (!session) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private mode or storage disabled: the session simply stays in memory.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [ready, setReady] = useState(!isAuthConfigured);
  const sessionRef = useRef<SupabaseSession | null>(null);

  const apply = useCallback((next: SupabaseSession | null) => {
    sessionRef.current = next;
    writeStoredSession(next);
    setSession(next);
  }, []);

  // Restore a previous session on load, refreshing it first if it is dying.
  useEffect(() => {
    if (!isAuthConfigured) return;
    let cancelled = false;
    const stored = readStoredSession();

    if (!stored) {
      setReady(true);
      return;
    }

    const secondsLeft = stored.expires_at - Math.floor(Date.now() / 1000);
    if (secondsLeft >= REFRESH_MARGIN_SECONDS) {
      sessionRef.current = stored;
      setSession(stored);
      setReady(true);
      return;
    }

    void (async () => {
      try {
        const refreshed = await refreshSession(stored.refresh_token);
        if (!cancelled) apply(refreshed);
      } catch {
        if (!cancelled) writeStoredSession(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apply]);

  // Keep a long-lived session alive while the tab is open.
  useEffect(() => {
    if (!isAuthConfigured) return;
    const timer = window.setInterval(() => {
      const current = sessionRef.current;
      if (!current) return;
      if (current.expires_at - Math.floor(Date.now() / 1000) > REFRESH_MARGIN_SECONDS) return;
      void refreshSession(current.refresh_token)
        .then((next) => {
          // Ignore a response that raced a newer sign-in/sign-out.
          if (sessionRef.current?.refresh_token === current.refresh_token) apply(next);
        })
        .catch(() => {
          // Leave the session in place; the next real request reports the failure.
        });
    }, REFRESH_POLL_MS);
    return () => window.clearInterval(timer);
  }, [apply]);

  const signUp = useCallback(async (email: string, password: string) => signUpWithPassword(email, password), []);

  const verifySignupOtp = useCallback(
    async (email: string, token: string) => {
      apply(await verifyOtp(email, token));
    },
    [apply],
  );

  const resendSignupOtp = useCallback(async (email: string) => {
    await resendOtp(email);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      apply(await signInWithPassword(email, password));
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    const current = sessionRef.current;
    // Clear locally first so signing out always succeeds, even offline.
    apply(null);
    if (current) {
      try {
        await signOutSession(current.access_token);
      } catch {
        // Already revoked or unreachable — the local session is gone either way.
      }
    }
  }, [apply]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isAuthConfigured,
      ready,
      session,
      email: session?.user.email ?? null,
      signUp,
      verifySignupOtp,
      resendSignupOtp,
      signIn,
      signOut,
    }),
    [ready, session, signUp, verifySignupOtp, resendSignupOtp, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
