'use client'

import { BottomNav } from './BottomNav'

export function BottomNavSkeleton() {
  // Settings has no Add sheet — clicking + jumps to dashboard where the sheet lives.
  return <BottomNav onAddClick={() => { window.location.href = '/dashboard' }} />
}
