'use client'

import { createBrowserClient } from '@supabase/ssr'

let cached: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (cached) return cached
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return cached
}

/** @deprecated Use createClient() instead */
export const getSupabaseClient = createClient
