'use client'

import { useState, useEffect } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { PICKABLE_CATEGORIES, type CategoryId } from '@/lib/categories'
import { defaultFilter, type TxnFilter, type PayerFilter, type SplitFilter } from '@/lib/filter'

interface Props {
  open: boolean
  /** Current applied filter — used to seed the draft when the sheet opens. */
  current: TxnFilter
  onClose: () => void
  /** Called with the new filter when the user taps 套用. The sheet does NOT close itself —
   *  the parent decides (typically: also call onClose). */
  onApply: (next: TxnFilter) => void
}

const PAYER_OPTIONS: { value: PayerFilter; label: string }[] = [
  { value: 'all',    label: '全部' },
  { value: 'mine',   label: '我' },
  { value: 'theirs', label: '對方' },
]

const SPLIT_OPTIONS: { value: SplitFilter; label: string }[] = [
  { value: 'all',         label: '全部' },
  { value: 'half',        label: '平分' },
  { value: 'all_mine',    label: '我的' },
  { value: 'all_theirs',  label: '對方的' },
]

export function FilterSheet({ open, current, onClose, onApply }: Props) {
  const { isSolo } = useMember()
  const [draft, setDraft] = useState<TxnFilter>(current)

  // Re-seed the draft whenever the sheet (re-)opens — without this, dismissing without
  // applying and reopening would show the stale draft instead of the live state.
  useEffect(() => {
    if (open) setDraft({ ...current, categories: new Set(current.categories) })
  }, [open, current])

  if (!open) return null

  const toggleCategory = (id: CategoryId) => {
    const next = new Set(draft.categories)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDraft({ ...draft, categories: next })
  }

  return (
    <>
      <SheetBackdrop open={open} onClick={onClose} />
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[100] rounded-t-[24px] pb-6"
        style={{ background: 'var(--bg)', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}
      >
        {/* Header: 重設 / 篩選 / 套用 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <button
            onClick={() => setDraft(defaultFilter())}
            className="text-sm font-medium bg-transparent border-0 cursor-pointer"
            style={{ color: 'var(--ink-2)' }}
          >
            重設
          </button>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>篩選</div>
          <button
            onClick={() => onApply(draft)}
            className="text-sm font-semibold bg-transparent border-0 cursor-pointer"
            style={{ color: 'var(--accent)' }}
          >
            套用
          </button>
        </div>

        <div className="px-5 pt-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* 誰付的 + 分攤 — pair-mode only. In solo, payer is always self and split is
              always all_mine, so these dimensions are degenerate (every row matches). */}
          {!isSolo && (
            <Section title="誰付的">
              {PAYER_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={draft.payer === o.value}
                  onClick={() => setDraft({ ...draft, payer: o.value })}
                />
              ))}
            </Section>
          )}

          {!isSolo && (
            <Section title="分攤">
              {SPLIT_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={draft.split === o.value}
                  onClick={() => setDraft({ ...draft, split: o.value })}
                />
              ))}
            </Section>
          )}

          {/* 分類 (multi) */}
          <Section title="分類（可多選）">
            {PICKABLE_CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                label={c.label}
                active={draft.categories.has(c.id)}
                onClick={() => toggleCategory(c.id)}
              />
            ))}
          </Section>
        </div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium mb-2" style={{ color: 'var(--ink-3)' }}>{title}</div>
      <div className="flex gap-2 flex-wrap">{children}</div>
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-3 rounded-full text-xs font-medium cursor-pointer transition-colors"
      style={{
        background: active ? 'var(--ink)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--ink-2)',
        border: '1px solid var(--hairline)',
      }}
    >
      {label}
    </button>
  )
}
