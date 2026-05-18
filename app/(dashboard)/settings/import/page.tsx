import { requireViewerOrRedirect } from '@/lib/auth/viewer'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { redirect } from 'next/navigation'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { SubpageHeader } from '@/app/(dashboard)/_components/SubpageHeader'
import { getTranslations } from '@/lib/i18n/t'
import { ImportClient } from './_components/ImportClient'

export default async function ImportPage() {
  const { user } = await requireViewerOrRedirect()
  const group = await getActiveGroupForUser(user.id)
  if (!group) redirect('/setup')

  const t = await getTranslations()
  const isSolo = group.memberB === null

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      <SubpageHeader title={t.importPage.title} backLabel={t.importPage.back} />

      <div className="px-5 pt-6 pb-4">
        <h1
          className="text-page leading-tight"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {t.importPage.pageHeading}
        </h1>
        <p className="text-sm mt-3" style={{ color: 'var(--ink-2)' }}>
          {t.importPage.pageSubtitle}
        </p>
      </div>

      <div className="px-4 pb-12">
        <ImportClient isSolo={isSolo} />
      </div>

      <BottomNavSkeleton hideFab />
    </div>
  )
}
