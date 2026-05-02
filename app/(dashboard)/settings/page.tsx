import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { LogoutButton } from './_components/LogoutButton'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)
  const displayName = profile?.displayName ?? '?'
  const initial = displayName[0]?.toUpperCase() ?? '?'

  return (
    <div className="relative pb-[92px]">
      <div className="px-5 pt-[60px] pb-4">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          設定
        </div>
      </div>

      {/* User card */}
      <div
        className="mx-4 my-2 mb-6 p-5 rounded-[20px] flex items-center gap-3.5"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <Avatar who="M" initial={initial} size={56} />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
            {displayName}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {user.email}
          </div>
        </div>
      </div>

      <div className="px-4 pb-8">
        <LogoutButton />
        <div
          className="text-[11px] text-center mt-2 leading-relaxed tracking-[0.3px]"
          style={{ color: 'var(--ink-3)' }}
        >
          Futari · v0.1.0
        </div>
      </div>

      <BottomNavSkeleton />
    </div>
  )
}
