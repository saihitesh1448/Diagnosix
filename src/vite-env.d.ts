/// <reference types="vite/client" />

/**
 * Only *public* configuration belongs here.
 *
 * Both values below are shipped to the browser on purpose: the anon key is
 * designed to be public, and every row it can reach is gated by the row-level
 * security policies in `supabase/schema.sql`. The service-role key must never
 * be referenced by this app.
 */
interface ImportMetaEnv {
  /** Supabase project URL, e.g. `https://abcdefghijkl.supabase.co`. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (public) key, e.g. `eyJhbGciOi...` or `sb_publishable_...`. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
