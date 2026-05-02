'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { EditTextSheet } from '@/app/(dashboard)/_components/EditTextSheet'
import { LogoutButton } from './LogoutButton'
import { updateGroupName } from '@/actions/group'
import { updateDisplayName } from '@/actions/profile'

export interface ViewerInfo { id: string; displayName: string; email: string }
export interface PartnerInfo { id: string; displayName: string; email: string | null }

interface Props {
  viewer: ViewerInfo
  partner: PartnerInfo | null
  groupName: string
}

export function SettingsContent({ viewer, partner, groupName }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<null | 'group' | 'name'>(null)

  const handleClose = () => setEditing(null)
  const refresh = () => router.refresh()

  return (
    <>
      <div className="px-5 pt-[60px] pb-4">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          設定
        </div>
      </div>

      {/* 帳本 */}
      <Section title="帳本">
        <Row
          label="帳本名稱"
          value={groupName}
          onClick={() => setEditing('group')}
        />
      </Section>

      {/* 成員 */}
      <Section title="成員">
        <div
          className="rounded-[20px] overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <MemberRow
            who="M"
            initial={viewer.displayName[0]?.toUpperCase() ?? '?'}
            displayName={viewer.displayName}
            email={viewer.email}
            youSuffix
          />
          {partner && (
            <>
              <div style={{ borderTop: '1px solid var(--hairline)' }} />
              <MemberRow
                who="T"
                initial={partner.displayName[0]?.toUpperCase() ?? '?'}
                displayName={partner.displayName}
                email={partner.email ?? ''}
              />
            </>
          )}
        </div>
      </Section>

      {/* 個人 */}
      <Section title="個人">
        <Row
          label="顯示名稱"
          value={viewer.displayName}
          onClick={() => setEditing('name')}
        />
      </Section>

      <div className="px-4 pb-2 mt-4">
        <LogoutButton />
      </div>
      <div
        className="text-[11px] text-center mt-2 leading-relaxed tracking-[0.3px] pb-8"
        style={{ color: 'var(--ink-3)' }}
      >
        Futari · v0.1.0 · <a href="#" className="underline" style={{ color: 'var(--ink-3)' }}>法律聲明</a>
      </div>

      <EditTextSheet
        open={editing === 'group'}
        title="帳本名稱"
        initialValue={groupName}
        onClose={handleClose}
        onSubmit={async (v) => {
          await updateGroupName(v)
          refresh()
        }}
      />
      <EditTextSheet
        open={editing === 'name'}
        title="顯示名稱"
        initialValue={viewer.displayName}
        onClose={handleClose}
        onSubmit={async (v) => {
          await updateDisplayName(v)
          refresh()
        }}
      />
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 mt-2 mb-5">
      <div className="text-xs font-medium px-1 mb-2" style={{ color: 'var(--ink-3)' }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-5 py-4 rounded-[20px] text-left bg-transparent cursor-pointer"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{label}</div>
      <div className="text-sm flex items-center gap-2" style={{ color: 'var(--ink-3)' }}>
        <span style={{ color: 'var(--ink-2)' }}>「{value}」</span>
        <span>›</span>
      </div>
    </button>
  )
}

function MemberRow({
  who, initial, displayName, email, youSuffix,
}: { who: 'M' | 'T'; initial: string; displayName: string; email: string; youSuffix?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-4">
      <Avatar who={who} initial={initial} size={40} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {displayName}{youSuffix && <span className="ml-1" style={{ color: 'var(--ink-3)' }}>（你）</span>}
        </div>
        {email && (
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>{email}</div>
        )}
      </div>
    </div>
  )
}
