import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { storePushToken } from '@/lib/pushTokenStorage'

export async function registerPushToken(userId: string, groupId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (Capacitor.getPlatform() !== 'ios') return

  const permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') return

  await PushNotifications.register()

  PushNotifications.addListener('registration', async ({ value: token }) => {
    // #1605 — remembered so sign-out can remove this device's row
    // (lib/signOutThisDevice.ts). Never throws.
    storePushToken(token)
    const supabase = createClient()
    // Since 0087 the database refuses a group_id the user is not a member of;
    // supabase-js returns that as `{ error }`, which is ignored here on purpose
    // (the registrar passes the active ledger, so it only happens on a race).
    await supabase.from('PushTokens').upsert(
      { user_id: userId, group_id: groupId, platform: 'apns', token },
      { onConflict: 'user_id,platform,token' }
    )
  })

  PushNotifications.addListener('registrationError', (error) => {
    console.error('[push] registration error', error)
  })
}
