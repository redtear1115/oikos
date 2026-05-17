'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { localizedSignInPath } from '@/lib/i18n/server-redirect'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // Preserve user's locale on the sign-in destination — without an explicit
  // prefix, proxy sees an unprefixed public path and downgrades the
  // `lang` cookie to DEFAULT_LOCALE.
  redirect(await localizedSignInPath())
}
