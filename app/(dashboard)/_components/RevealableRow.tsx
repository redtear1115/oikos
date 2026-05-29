'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import { describeError } from '@/lib/errors'
import { useTranslations } from '@/lib/i18n/client'

/** 10 mask characters: enough to read as "filled in" without leaking length. */
const PII_MASK = '●●●●●●●●●●'

interface Props {
  /** Row label (e.g. 「身分證」「車牌」「地址」). */
  label: string
  /** When false renders the empty row (em-dash placeholder); no reveal toggle. */
  hasValue: boolean
  /** Server action bound by the caller. Returns decrypted plaintext.
   *  Example: `() => revealCarPlate(assetId)`. The wrapper handles error
   *  translation and pending state — the action just decrypts and returns. */
  revealAction: () => Promise<string>
  /** Suppress the bottom hairline for the last row in an InfoCard. */
  last?: boolean
  /** Optional value-cell style override. Defaults to mono numeric ink. */
  valueStyle?: CSSProperties
}

/**
 * #826 — shared row pattern for encrypted PII fields. Mask by default,
 * tap 「顯示」 to call the server action and reveal in place; tap again to
 * re-mask. Reveal state is local to the component (no client persistence,
 * no global cache) so navigating away naturally re-obscures.
 *
 * Originally inlined in ChildDetailClient; extracted here so car-plate,
 * house-address, and child-name can all share the same UX without
 * duplicating the masking / pending / error wiring.
 */
export function RevealableRow({ label, hasValue, revealAction, last, valueStyle }: Props) {
  const t = useTranslations()
  const [revealed, setRevealed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // No stored value: empty row, no toggle.
  if (!hasValue) {
    return (
      <div
        className="px-3.5 py-[11px] flex items-center gap-2.5"
        style={{ borderBottom: last ? 'none' : '1px solid var(--hairline)' }}
      >
        <div
          className="text-micro shrink-0 tracking-[0.4px]"
          style={{ color: 'var(--ink-3)', width: 76 }}
        >
          {label}
        </div>
        <div
          className="flex-1 text-label font-medium truncate"
          style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
        >
          —
        </div>
      </div>
    )
  }

  const onToggle = () => {
    if (revealed !== null) {
      setRevealed(null)
      setError(null)
      return
    }
    startTransition(async () => {
      try {
        const value = await revealAction()
        setRevealed(value)
        setError(null)
      } catch (e) {
        setError(describeError(e, t.assetDetail.reveal.error, t.common.offlineError))
      }
    })
  }

  const displayValue = revealed ?? PII_MASK

  return (
    <div
      className="px-3.5 py-[11px] flex items-center gap-2.5"
      style={{ borderBottom: last ? 'none' : '1px solid var(--hairline)' }}
    >
      <div
        className="text-micro shrink-0 tracking-[0.4px]"
        style={{ color: 'var(--ink-3)', width: 76 }}
      >
        {label}
      </div>
      <div
        className="flex-1 text-label font-medium truncate"
        style={
          valueStyle ?? {
            color: 'var(--ink)',
            fontFamily: 'var(--font-numeric)',
          }
        }
      >
        {error ?? displayValue}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        className="text-xs px-2 py-1 rounded-md cursor-pointer border-0 disabled:cursor-default"
        style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}
      >
        {pending
          ? t.assetDetail.reveal.loading
          : revealed !== null
            ? t.assetDetail.reveal.hide
            : t.assetDetail.reveal.show}
      </button>
    </div>
  )
}
