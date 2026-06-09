import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'

export async function registerPushToken(userId: string, groupId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (Capacitor.getPlatform() !== 'ios') return

  const permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') return

  await PushNotifications.register()

  PushNotifications.addListener('registration', async ({ value: token }) => {
    const supabase = createClient()
    await supabase.from('PushTokens').upsert(
      { user_id: userId, group_id: groupId, platform: 'apns', token },
      { onConflict: 'user_id,platform,token' }
    )
  })

  PushNotifications.addListener('registrationError', (error) => {
    console.error('[push] registration error', error)
  })
}
