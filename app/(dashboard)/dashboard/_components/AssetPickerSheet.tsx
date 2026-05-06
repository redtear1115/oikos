'use client'

import { useEffect, useState } from 'react'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { loadAssetsForPicker, type PickerAsset } from '@/actions/asset'

interface Props {
  open: boolean
  selectedAssetId: string | null
  onClose: () => void
  onSelect: (assetId: string | null) => void
}

export function AssetPickerSheet({ open, selectedAssetId, onClose, onSelect }: Props) {
  const [assets, setAssets] = useState<PickerAsset[] | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoadError('')
    loadAssetsForPicker()
      .then(setAssets)
      .catch((e) => setLoadError(e instanceof Error ? e.message : '載入失敗'))
  }, [open])

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
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
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
            取消
          </button>
          <div className="text-base font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
            選擇愛物
          </div>
          <div className="w-10" />  {/* spacer for symmetry */}
        </div>

        <div className="overflow-auto flex-1 px-3 pb-6">
          {/* "不關聯" option always present */}
          <PickerRow
            iconNode={<NoneIcon />}
            title="不關聯"
            subtitle="這筆與任何愛物無關"
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
              載入中…
            </div>
          )}

          {assets && assets.length === 0 && (
            <div className="text-sm py-6 px-3 text-center leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              還沒有愛物 — 先到「愛物」分頁新增。
            </div>
          )}

          {assets?.map((a) => (
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
      className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-[14px] cursor-pointer text-left bg-transparent border-0"
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
