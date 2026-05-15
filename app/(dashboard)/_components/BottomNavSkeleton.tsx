'use client'

import { useRouter } from 'next/navigation'
import { BottomNav } from './BottomNav'

interface Props {
  hideFab?: boolean
}

export function BottomNavSkeleton({ hideFab = false }: Props = {}) {
  // Settings has no Add sheet — tapping + jumps to dashboard where the sheet lives.
  // Using router.push keeps us in SPA mode (no full reload, preserves state).
  // Pages that own a write affordance (currency / recurring) wire BottomNav
  // directly; pages that don't (past-times / trust) opt out via hideFab.
  const router = useRouter()
  return <BottomNav onAddClick={() => router.push('/dashboard')} hideFab={hideFab} />
}
