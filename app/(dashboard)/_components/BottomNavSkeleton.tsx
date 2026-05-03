'use client'

import { useRouter } from 'next/navigation'
import { BottomNav } from './BottomNav'

export function BottomNavSkeleton() {
  // Settings has no Add sheet — tapping + jumps to dashboard where the sheet lives.
  // Using router.push keeps us in SPA mode (no full reload, preserves state).
  const router = useRouter()
  return <BottomNav onAddClick={() => router.push('/dashboard')} />
}
