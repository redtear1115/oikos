'use client'

import { useEffect } from 'react'
import { registerPushToken } from '@/lib/pushNotifications'

interface Props {
  userId: string
  groupId: string
}

export function PushTokenRegistrar({ userId, groupId }: Props) {
  useEffect(() => {
    registerPushToken(userId, groupId).catch(console.error)
  }, [userId, groupId])

  return null
}
