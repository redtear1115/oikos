import type { createClient } from './client'

/**
 * Browser Supabase client for the public brand pages (#1520). `./client` pulls
 * in `@supabase/ssr` + `@supabase/supabase-js` (~0.5 s of simulated LCP when
 * they sat in the initial bundle), so brand-page code must reach it only through
 * this dynamic import — a static `import ... from '@/lib/supabase/client'` in
 * any module those pages load silently puts the SDK back in the first paint.
 * Dashboard code keeps importing `./client` directly.
 */
export function loadSupabaseClient(): Promise<ReturnType<typeof createClient>> {
  return import('./client').then((m) => m.createClient())
}
