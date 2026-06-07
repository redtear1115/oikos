import { requireViewerOrRedirect } from '@/lib/auth/viewer'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { SupportContent } from './_components/SupportContent'

export default async function SupportPage() {
  await requireViewerOrRedirect()

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      <SupportContent />
      <BottomNavSkeleton hideFab />
    </div>
  )
}
