'use server'

import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function updateDisplayName(name: string): Promise<{ ok: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const trimmed = name.trim()
  if (!trimmed) throw new Error('顯示名稱不能為空')
  if (trimmed.length > 32) throw new Error('顯示名稱最長 32 字')

  const result = await db
    .update(profiles)
    .set({ displayName: trimmed })
    .where(eq(profiles.id, user.id))
    .returning({ id: profiles.id })

  if (result.length === 0) throw new Error('找不到個人資料')

  // Display name shows in headers / rows across the app.
  revalidatePath('/dashboard')
  revalidatePath('/records')
  revalidatePath('/settings')
  return { ok: true }
}
