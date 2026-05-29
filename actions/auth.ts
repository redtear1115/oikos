'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { localizedHomePath } from '@/lib/i18n/server-redirect'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // Land on the warm landing surface, not /sign-in. Preserve the user's
  // locale on the path so the redirected page keeps speaking their language.
  // Client (LogoutButton) also has a window.location.replace('/') safety net
  // because useTransition + server-action redirect previously swallowed the
  // navigation, leaving users visually stuck on /settings.
  redirect(await localizedHomePath())
}
