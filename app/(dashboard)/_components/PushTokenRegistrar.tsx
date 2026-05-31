'use client'

import { useEffect } from 'react'
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { registerPushToken } from '@/lib/pushNotifications'

interface Props {
  userId: string
  groupId: string
}

export function PushTokenRegistrar({ userId, groupId }: Props) {
  useEffect(() => {
    registerPushToken(userId, groupId).catch(console.error)

    return () => {
      if (Capacitor.isNativePlatform()) {
        PushNotifications.removeAllListeners()
      }
    }
  }, [userId, groupId])

  return null
}
