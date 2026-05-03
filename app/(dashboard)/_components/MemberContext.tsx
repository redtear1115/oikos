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
}

const MemberContext = createContext<MemberContextValue | null>(null)

export function useMember(): MemberContextValue {
  const ctx = useContext(MemberContext)
  if (!ctx) throw new Error('useMember must be inside <MemberContext.Provider>')
  return ctx
}

export const MemberProvider = MemberContext.Provider
