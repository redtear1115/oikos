'use client'

import { createContext, useContext } from 'react'
import type { SplitType } from '@/lib/balance'

export interface MemberInfo {
  id: string
  initial: string
  displayName: string
  avatarUrl: string | null
  defaultSplitType: SplitType
}

export interface MemberContextValue {
  group: { id: string; name: string }
  viewer: MemberInfo & { who: 'M' }      // the signed-in user
  partner: (MemberInfo & { who: 'T' }) | null  // null until invite accepted
  viewerIsA: boolean  // true if viewer === group.memberA
  isSolo: boolean     // partner === null
  /** True when viewer is currently pinned to a past (closed) epoch. UI in this
   *  mode must hide all transaction-write entry points (FAB, edit/delete/+Add).
   *  Server actions also reject writes — UI hide is the primary defence,
   *  server reject is the safety net. */
  isPast: boolean
}

const MemberContext = createContext<MemberContextValue | null>(null)

export function useMember(): MemberContextValue {
  const ctx = useContext(MemberContext)
  if (!ctx) throw new Error('useMember must be inside <MemberContext.Provider>')
  return ctx
}

export const MemberProvider = MemberContext.Provider
