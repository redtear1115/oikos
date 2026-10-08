'use client'

import { createContext, useContext } from 'react'
import type { SplitType } from '@/lib/balance'
import type { CurrencyCode } from '@/lib/currency'

export interface MemberInfo {
  id: string
  initial: string
  displayName: string
  avatarUrl: string | null
  defaultSplitType: SplitType
}

/**
 * #1604 — the other person of a closed chapter, as that chapter recorded them.
 * Name and initial only: `avatarUrl` is always null because a past chapter
 * shows no avatar (after-leaving spec,「人：停在當時」). The name comes from
 * `getEpochMembers` and nowhere else (see its docstring).
 */
export interface ChapterPartner {
  id: string
  displayName: string
  initial: string
  avatarUrl: null
}

/** #1604 — who the pinned past chapter was between. Built by the layout from
 *  the chapter's GroupEpochs row, never from today's group row. */
export interface ChapterIdentity {
  /** null when the chapter was solo (or its row could not be read). */
  partner: ChapterPartner | null
  /** The chapter was solo — from the chapter, not from today's `isSolo`. */
  isSolo: boolean
}

/** The partner as a surface that labels rows should show them: a live
 *  partner (with avatar) or a past chapter's partner (no avatar). */
export type ViewedPartner = Pick<MemberInfo, 'id' | 'displayName' | 'initial' | 'avatarUrl'>

export interface MemberContextValue {
  /** `baseCurrency` = OikosGroups.base_currency — the symbol / format for every
   *  main-ledger amount (see `formatLedgerAmount`, #1482). */
  group: { id: string; name: string; baseCurrency: CurrencyCode }
  viewer: MemberInfo & { who: 'M' }      // the signed-in user
  /** The group's CURRENT other member — live meaning, even when pinned to a
   *  past chapter (live surfaces such as PendingExpenseCard need it). Anything
   *  labelling a chapter's rows reads `useViewedPartner()` instead (#1604). */
  partner: (MemberInfo & { who: 'T' }) | null  // null until invite accepted
  /** From the CURRENT group row, also when pinned (#1604): confirmSwap and
   *  account deletion flip `split_ratio_a` on every row, closed chapters
   *  included, without rewriting GroupEpochs — so stored ratios always follow
   *  today's A/B, and only today's row reads them correctly. */
  viewerIsA: boolean  // true if viewer === group.memberA
  isSolo: boolean     // partner === null (live meaning, see `partner`)
  /** #1604 — set by the layout when `isPast`; null / absent otherwise. Read it
   *  through `useViewedPartner()`. */
  chapter?: ChapterIdentity | null
  /** True when viewer is currently pinned to a past (closed) epoch. UI in this
   *  mode must hide all transaction-write entry points (FAB, edit/delete/+Add).
   *  Server actions also reject writes — UI hide is the primary defence,
   *  server reject is the safety net. */
  isPast: boolean
  /** #220 — Guardian module visibility. True when the viewer's group has
   *  opted into the Guardian (守護) beta (or — eventually — has a paid
   *  subscription). Drives nav-tab rendering on /assets and similar gates;
   *  server-side routes also recheck via `canAccessGuardian()`. */
  canAccessGuardian: boolean
  /** ISO date string of when the current (or pinned past) epoch started.
   *  Used by ContextStrip to display the date range in past-epoch banners. */
  epochStartedAt: string
  /** ISO date string of when the epoch ended; null if this is the current epoch. */
  epochEndedAt: string | null
}

const MemberContext = createContext<MemberContextValue | null>(null)

export function useMember(): MemberContextValue {
  const ctx = useContext(MemberContext)
  if (!ctx) throw new Error('useMember must be inside <MemberContext.Provider>')
  return ctx
}

/**
 * #1604 — the other person of the chapter being viewed. Live chapter: today's
 * partner and `isSolo`, unchanged. Pinned past chapter: that chapter's partner
 * (name + initial, no avatar) and whether THAT chapter was solo — so a stayer
 * who is solo today still sees the ex on the old chapter's rows, and a stayer
 * now paired with someone new never sees the new partner there.
 *
 * Fails closed: pinned with no chapter identity → no partner, never the live
 * one. Symptom if a surface reads `useMember().partner` instead: nothing
 * errors; an old chapter's rows are labelled with today's partner (or 「對方」
 * when solo today).
 */
export function useViewedPartner(): { partner: ViewedPartner | null; isSolo: boolean } {
  const { isPast, chapter, partner, isSolo } = useMember()
  if (!isPast) return { partner, isSolo }
  return chapter ? { partner: chapter.partner, isSolo: chapter.isSolo } : { partner: null, isSolo: true }
}

/** The ledger's base currency, for `formatLedgerAmount*`. */
export function useBaseCurrency(): CurrencyCode {
  return useMember().group.baseCurrency
}

export const MemberProvider = MemberContext.Provider

/** Convert viewer-relative `who` ('M' = me, 'T' = them) to absolute group role
 *  ('a' / 'b'). Used by Avatar to pick brand color (#238 — heart-icon parity). */
export function whoToMemberRole(who: 'M' | 'T', viewerIsA: boolean): 'a' | 'b' {
  const isA = who === 'M' ? viewerIsA : !viewerIsA
  return isA ? 'a' : 'b'
}
