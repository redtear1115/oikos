'use client'

import { useEffect, useMemo, useState } from 'react'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { useEscapeToClose } from '@/app/(dashboard)/_components/useEscapeToClose'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { loadAssetsForPicker, type PickerAsset } from '@/actions/asset'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'

type PickerTab = 'aibutsu' | 'guardian'

interface Props {
  open: boolean
  selectedAssetId: string | null
  onClose: () => void
  onSelect: (assetId: string | null) => void
}

export function AssetPickerSheet({ open, selectedAssetId, onClose, onSelect }: Props) {
  const t = useTranslations()
  const { canAccessGuardian } = useMember()
  const [assets, setAssets] = useState<PickerAsset[] | null>(null)
  const [loadError, setLoadError] = useState('')
  // #368 — when Guardian beta is enabled, split the picker into 愛物 / 守護
  // tabs. Insurance assets live in 守護; everything else in 愛物. Always
  // default-open on 愛物.
  const [tab, setTab] = useState<PickerTab>('aibutsu')

  useEffect(() => {
    if (!open) return
    setLoadError('')
    setTab('aibutsu')
    loadAssetsForPicker()
      .then(setAssets)
      .catch((e) => setLoadError(describeError(e, t.assetPickerSheet.loadFailed, t.common.offlineError)))
  }, [open, t])

  // Escape closes — picker uses its own inline backdrop (z-112) instead of
  // SheetBackdrop, so the hook is wired here explicitly.
  useEscapeToClose(open, onClose)

  const filteredAssets = useMemo(() => {
    if (!assets) return null
    if (!canAccessGuardian) return assets
    return tab === 'guardian'
      ? assets.filter((a) => a.type === 'insurance')
      : assets.filter((a) => a.type !== 'insurance')
  }, [assets, canAccessGuardian, tab])

  const emptyMessage =
    canAccessGuardian && tab === 'guardian'
      ? t.assetPickerSheet.emptyGuardian
      : t.assetPickerSheet.emptyAibutsu

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[112] transition-opacity duration-[250ms]"
        style={{
          background: 'rgba(31,27,22,0.45)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />
      {/* Sheet sits at z-115 — must be ABOVE AddSheet's error toast (z-110) so a
          mid-picker error doesn't render in front of the asset list. */}
      <div
        className="fixed left-1/2 bottom-0 z-[115] w-full max-w-md -translate-x-1/2 flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          maxHeight: '70dvh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <div className="pt-2 flex justify-center">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'rgba(31,27,22,0.18)' }} />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <button onClick={onClose} className="bg-transparent border-0 text-body cursor-pointer p-1" style={{ color: 'var(--ink-2)' }}>
            {t.common.cancel}
          </button>
          <div className="text-base font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
            {t.assetPickerSheet.title}
          </div>
          <div className="w-10" />  {/* spacer for symmetry */}
        </div>

        {canAccessGuardian && (
          <div className="px-4 pb-2" role="tablist" aria-label={t.assetPickerSheet.tablistAriaLabel}>
            <div
              className="flex rounded-full p-1"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
              }}
            >
              {(['aibutsu', 'guardian'] as const).map((id) => {
                const active = tab === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(id)}
                    className="flex-1 rounded-full transition-colors"
                    style={{
                      padding: '8px 12px',
                      background: active ? 'var(--ink)' : 'transparent',
                      color: active ? '#fff' : 'var(--ink-2)',
                      fontFamily: 'inherit',
                      fontSize: 'var(--fs-button)',
                      fontWeight: active ? 600 : 500,
                      border: 'none',
                      cursor: 'pointer',
                      letterSpacing: '0.2px',
                    }}
                  >
                    {id === 'aibutsu' ? t.assets.tabs.aibutsu : t.assets.tabs.guardian}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="overflow-auto flex-1 px-3 pb-6">
          {/* "不關聯" option always present in both tabs — selecting it clears
              the link regardless of which tab the user is browsing. */}
          <PickerRow
            iconNode={<NoneIcon />}
            title={t.assetPickerSheet.noneTitle}
            subtitle={t.assetPickerSheet.noneSubtitle}
            selected={selectedAssetId === null}
            onClick={() => { onSelect(null); onClose() }}
          />

          {loadError && (
            <div className="text-sm py-3 px-3" style={{ color: 'var(--debit)' }}>
              {loadError}
            </div>
          )}

          {assets === null && !loadError && (
            <div className="text-sm py-3 px-3" style={{ color: 'var(--ink-3)' }}>
              {t.assetPickerSheet.loading}
            </div>
          )}

          {filteredAssets && filteredAssets.length === 0 && (
            <div className="text-sm py-6 px-3 text-center leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              {emptyMessage}
            </div>
          )}

          {filteredAssets?.map((a) => (
            <PickerRow
              key={a.id}
              iconNode={<AssetIcon type={a.type} size={22} />}
              title={a.name}
              subtitle={a.plate ?? ''}
              selected={selectedAssetId === a.id}
              onClick={() => { onSelect(a.id); onClose() }}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function PickerRow({
  iconNode, title, subtitle, selected, onClick,
}: { iconNode: React.ReactNode; title: string; subtitle: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-bubble cursor-pointer text-left bg-transparent border-0"
      style={{
        background: selected ? 'var(--surface)' : 'transparent',
        border: selected ? '1.5px solid var(--ink)' : '1px solid transparent',
      }}
    >
      <div
        className="w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0"
        style={{ background: 'var(--surface-alt)', color: 'var(--ink-2)' }}
      >
        {iconNode}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-body font-medium truncate" style={{ color: 'var(--ink)' }}>{title}</div>
        {subtitle && (
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>{subtitle}</div>
        )}
      </div>
      {selected && <span className="text-body" style={{ color: 'var(--ink)' }}>✓</span>}
    </button>
  )
}

function NoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
