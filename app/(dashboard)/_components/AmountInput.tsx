'use client'

import { useRef, type RefObject } from 'react'

interface AmountInputProps {
  /** Digit-only string ('', '0' to '9999999'). The component never sees
   *  commas — callers holding `number` state convert at the boundary. */
  value: string
  onChange: (next: string) => void
  /** Currency prefix rendered before the digits (e.g. "NT$",
   *  `currencySymbol(code)`). */
  symbol: string
  /** Screen-reader label for the inner input. */
  ariaLabel: string
  /** Caret color (default `var(--accent)`). Income-themed sheets pass
   *  `DEFAULT_INCOME_PALETTE.ink`. */
  caretColor?: string
  /** Max digit count before further input is ignored (default 7). */
  maxDigits?: number
  /** Optional ref to the inner input — passed to `useFocusAndSelectOnOpen`
   *  by callers that want type-to-replace on sheet open. */
  inputRef?: RefObject<HTMLInputElement | null>
}

/**
 * Shared hero amount entry used inside sheets (AddSheet / IncomeSheet /
 * SettlementSheet / RecurringRuleSheet × 2). Renders a tap-anywhere
 * label that focuses + selects the inner numeric input, with a leading
 * currency symbol and comma-grouped formatting.
 *
 * The component is unopinionated about layout above/below it: callers
 * own the section header ("金額") and any payer/recipient toggle that
 * sits beneath the input.
 */
export function AmountInput({
  value,
  onChange,
  symbol,
  ariaLabel,
  caretColor = 'var(--accent)',
  maxDigits = 7,
  inputRef,
}: AmountInputProps) {
  const fallbackRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? fallbackRef

  const display = value ? parseInt(value, 10).toLocaleString('en-US') : ''
  // Min 2ch so empty/single-digit values still have a comfortable hit area;
  // grows with formatted (comma-separated) length (up to 9ch for 7 digits).
  const width = `${Math.max(display.length || 1, 2)}ch`

  return (
    <label
      className="flex items-baseline justify-center gap-1.5 min-h-[60px] cursor-text"
      onClick={() => {
        const el = ref.current
        if (!el) return
        el.focus()
        el.select()
      }}
    >
      <span
        className="text-title font-medium"
        style={{ color: value ? 'var(--ink-2)' : 'var(--ink-3)' }}
      >
        {symbol}
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="done"
        value={display}
        onChange={(e) => {
          const next = e.target.value
            .replace(/[^0-9]/g, '')
            .slice(0, maxDigits)
            .replace(/^0+(\d)/, '$1')
          onChange(next)
        }}
        placeholder="0"
        aria-label={ariaLabel}
        className="tnum tracking-[-2px] leading-none bg-transparent border-0 outline-none text-center"
        style={{
          fontFamily: 'var(--font-numeric)',
          fontSize: 'var(--fs-amount-lg)',
          fontWeight: 600,
          color: value ? 'var(--ink)' : 'var(--ink-3)',
          width,
          caretColor,
        }}
      />
    </label>
  )
}
