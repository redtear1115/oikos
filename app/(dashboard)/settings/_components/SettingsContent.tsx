'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { EditTextSheet } from '@/app/(dashboard)/_components/EditTextSheet'
import { InstallGuide } from '@/app/(dashboard)/_components/InstallGuide'
import { LogoutButton } from './LogoutButton'
import { updateGroupName } from '@/actions/group'
import { createInvite } from '@/actions/invite'
import { updateDisplayName, updateDefaultSplitType } from '@/actions/profile'
import { shareInviteLink } from '@/lib/share'
import type { SplitType } from '@/lib/balance'

export interface ViewerInfo {
  id: string
  displayName: string
  email: string
  avatarUrl: string | null
  defaultSplitType: SplitType
}
export interface PartnerInfo { id: string; displayName: string; email: string | null; avatarUrl: string | null }

interface Props {
  viewer: ViewerInfo
  partner: PartnerInfo | null
  groupId: string
  groupName: string
  appVersion: string
}

export function SettingsContent({
  viewer, partner, groupId, groupName, appVersion,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<null | 'group' | 'name'>(null)
  const isSolo = partner === null

  const handleClose = () => setEditing(null)
  const refresh = () => router.refresh()

  const [savingSplit, startSplitTransition] = useTransition()
  const [splitError, setSplitError] = useState<string | null>(null)

  // Solo-mode invite flow (only relevant when partner === null).
  const [invitePending, startInviteTransition] = useTransition()
  const [inviteToast, setInviteToast] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const inviteToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (inviteToastTimerRef.current) clearTimeout(inviteToastTimerRef.current)
    }
  }, [])

  const [installGuideOpen, setInstallGuideOpen] = useState(false)

  const handleInvite = () => {
    setInviteError(null)
    startInviteTransition(async () => {
      try {
        const url = await createInvite(groupId)
        const result = await shareInviteLink(url)
        // Always confirm — see SoloBanner for the same rationale.
        setInviteToast(result === 'shared' ? '已分享,連結也已複製' : '已複製連結')
        if (inviteToastTimerRef.current) clearTimeout(inviteToastTimerRef.current)
        inviteToastTimerRef.current = setTimeout(() => setInviteToast(null), 2000)
      } catch (e) {
        setInviteError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  // In solo mode the only valid configuration is all_mine, so we lock the radio
  // to that value visually and disable interaction. The user's stored preference
  // (in DB) is preserved untouched and re-takes effect when partner joins.
  const displayedSplit: SplitType = isSolo ? 'all_mine' : viewer.defaultSplitType

  const handleSplitChange = (next: SplitType) => {
    if (next === viewer.defaultSplitType) return  // no-op if same
    setSplitError(null)
    startSplitTransition(async () => {
      try {
        await updateDefaultSplitType(next)
        router.refresh()
      } catch (e) {
        setSplitError(e instanceof Error ? e.message : '儲存失敗')
      }
    })
  }

  return (
    <>
      <div className="px-5 pt-[max(env(safe-area-inset-top),24px)] pb-4">
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
            avatarUrl={viewer.avatarUrl}
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
                avatarUrl={partner.avatarUrl}
                displayName={partner.displayName}
                email={partner.email ?? ''}
              />
            </>
          )}
        </div>
        {isSolo && (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleInvite}
              disabled={invitePending}
              className="w-full h-12 rounded-[14px] border-0 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {invitePending ? '產生中…' : '邀請對方加入'}
            </button>
            {inviteToast && (
              <div className="text-xs mt-2 px-1 text-center" style={{ color: 'var(--ink-2)' }}>
                {inviteToast}
              </div>
            )}
            {inviteError && (
              <div className="text-xs mt-2 px-1 text-center" style={{ color: 'var(--debit)' }}>
                {inviteError}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* 個人 */}
      <Section title="個人">
        <Row
          label="加到主畫面"
          onClick={() => setInstallGuideOpen(true)}
        />
        <div className="mt-3" />
        <Row
          label="顯示名稱"
          value={viewer.displayName}
          onClick={() => setEditing('name')}
        />
        <div className="mt-3">
          <div className="text-xs px-1 pb-2" style={{ color: 'var(--ink-3)' }}>
            建立紀錄時的預設分攤
          </div>
          <div
            className="rounded-[20px] overflow-hidden flex flex-col"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            {([
              { id: 'half',       label: '平分' },
              { id: 'all_mine',   label: '全部我的' },
              { id: 'all_theirs', label: '全部對方的' },
            ] as const).map((opt, i) => {
              const sel = displayedSplit === opt.id
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => handleSplitChange(opt.id)}
                  disabled={savingSplit || isSolo}
                  className="flex items-center justify-between px-4 py-3 text-left cursor-pointer disabled:cursor-default disabled:opacity-60"
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                    background: 'transparent',
                  }}
                >
                  <span className="text-body" style={{ color: 'var(--ink)' }}>
                    {opt.label}
                  </span>
                  <div
                    className="w-5 h-5 rounded-full transition-all duration-150"
                    style={{
                      border: sel ? '6px solid var(--ink)' : '1.5px solid var(--hairline)',
                      background: sel ? 'var(--ink)' : 'transparent',
                      boxShadow: sel ? 'inset 0 0 0 3px var(--surface)' : 'none',
                    }}
                  />
                </button>
              )
            })}
          </div>
          {isSolo && (
            <div className="text-xs mt-2 px-1" style={{ color: 'var(--ink-3)' }}>
              單人狀態下固定為「全部我的」，邀請對方加入後可調整。
            </div>
          )}
          {splitError && (
            <div className="text-xs mt-2 px-1" style={{ color: 'var(--debit)' }}>
              {splitError}
            </div>
          )}
        </div>
      </Section>

      <div className="px-4 pb-2 mt-4">
        <LogoutButton />
      </div>
      <div
        className="text-micro text-center mt-2 leading-relaxed tracking-[0.3px] pb-8"
        style={{ color: 'var(--ink-3)' }}
      >
        Futari · v{appVersion} · <a href="#" className="underline" style={{ color: 'var(--ink-3)' }}>法律聲明</a>
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
      <InstallGuide
        open={installGuideOpen}
        onClose={() => setInstallGuideOpen(false)}
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

function Row({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-5 py-4 rounded-[20px] text-left bg-transparent cursor-pointer"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{label}</div>
      <div className="text-sm flex items-center gap-2" style={{ color: 'var(--ink-3)' }}>
        {value && <span style={{ color: 'var(--ink-2)' }}>「{value}」</span>}
        <span>›</span>
      </div>
    </button>
  )
}

function MemberRow({
  who, initial, avatarUrl, displayName, email, youSuffix,
}: { who: 'M' | 'T'; initial: string; avatarUrl: string | null; displayName: string; email: string; youSuffix?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-4">
      <Avatar who={who} initial={initial} src={avatarUrl} size={40} />
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
