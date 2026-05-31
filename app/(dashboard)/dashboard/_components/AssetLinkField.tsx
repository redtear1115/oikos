'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { loadAsset } from '@/actions/asset'
import { Chevron } from '@/app/(dashboard)/_components/sheet-icons'

// AssetPickerSheet is a nested sheet that only opens on user tap — lazy-load
// to keep AddSheet's initial bundle lean (#670 audit 6.1).
const AssetPickerSheet = dynamic(
  () => import('./AssetPickerSheet').then(m => m.AssetPickerSheet),
  { ssr: false },
)

interface AssetLinkFieldProps {
  value: string | null   // assetId
  onChange: (id: string | null) => void
  open: boolean          // parent sheet open state (used to gate effect)
}

export function AssetLinkField({ value: assetId, onChange, open }: AssetLinkFieldProps) {
  const [assetInfo, setAssetInfo] = useState<{ name: string; deletedAt: string | null } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const loadedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (!assetId) {
      setAssetInfo(null)
      loadedIdRef.current = null
      return
    }
    if (loadedIdRef.current === assetId) return
    setAssetInfo(null)
    let cancelled = false
    loadAsset(assetId).then((info) => {
      if (cancelled) return
      if (info) {
        setAssetInfo({ name: info.name, deletedAt: info.deletedAt })
        loadedIdRef.current = assetId
      } else {
        setAssetInfo(null)
        loadedIdRef.current = null
      }
    }).catch(() => {
      if (!cancelled) {
        setAssetInfo(null)
        loadedIdRef.current = null
      }
    })
    return () => { cancelled = true }
  }, [assetId, open])

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="w-full flex items-center gap-3 px-3.5 py-3 rounded-bubble cursor-pointer text-left"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex-1">
          {assetId && assetInfo ? (
            <>
              <div className="text-base font-medium" style={{ color: 'var(--ink)' }}>
                {assetInfo.name}
                {assetInfo.deletedAt && <span className="ml-2 text-xs" style={{ color: 'var(--ink-3)' }}>（已刪除）</span>}
              </div>
            </>
          ) : assetId && !assetInfo ? (
            <div className="text-base" style={{ color: 'var(--ink-3)' }}>載入中…</div>
          ) : (
            <div className="text-base" style={{ color: 'var(--ink-3)' }}>不關聯</div>
          )}
        </div>
        <Chevron />
      </button>

      <AssetPickerSheet
        open={pickerOpen && open}
        selectedAssetId={assetId}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => onChange(id)}
      />
    </>
  )
}
