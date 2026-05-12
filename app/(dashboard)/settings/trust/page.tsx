import { requireViewerOrRedirect } from '@/lib/auth/viewer'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { TrustContent } from './_components/TrustContent'

export default async function TrustPage() {
  await requireViewerOrRedirect()

  return (
    <div className="relative min-h-dvh pb-[92px]">
      <TrustContent />
      <BottomNavSkeleton />
    </div>
  )
}
