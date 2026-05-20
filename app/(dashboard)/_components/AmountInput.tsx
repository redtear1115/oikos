'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'

/** Count digit characters in `s` up to (not including) index `end`. */
function countDigits(s: string, end: number): number {
  let n = 0
  for (let i = 0; i < end && i < s.length; i++) {
    if (s[i] >= '0' && s[i] <= '9') n++
  }
  return n
}

/** Index in `formatted` (comma-grouped) right after the `target`-th digit.
 *  Lets us restore the caret to the same logical digit after re-formatting. */
function caretForDigitCount(formatted: string, target: number): number {
  if (target <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] >= '0' && formatted[i] <= '9') {
      seen++
      if (seen === target) return i + 1
    }
  }
  return formatted.length
}

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

  // Inserting thousand separators shifts every character after the caret, so a
  // naive controlled input drops the caret at the end after each keystroke.
  // On each edit we remember how many digits sat left of the caret; after React
  // commits the re-formatted value we put the caret back after that same digit.
  // null = change came from outside (reset / select-on-open) — leave caret alone.
  const caretDigitsRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || caretDigitsRef.current === null) return
    const pos = caretForDigitCount(display, caretDigitsRef.current)
    el.setSelectionRange(pos, pos)
    caretDigitsRef.current = null
  }, [display, ref])
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
          const raw = e.target.value
          const caret = e.target.selectionStart ?? raw.length
          const digitsBeforeCaret = countDigits(raw, caret)
          const next = raw
            .replace(/[^0-9]/g, '')
            .slice(0, maxDigits)
            .replace(/^0+(\d)/, '$1')
          // Clamp to the surviving digit count (handles truncation / leading-zero strip).
          caretDigitsRef.current = Math.min(digitsBeforeCaret, next.length)
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
