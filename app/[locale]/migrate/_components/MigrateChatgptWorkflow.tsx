'use client'

import { useRef, useState, type SyntheticEvent } from 'react'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { track } from '@/lib/analytics/track'

type WorkflowCopy = Translations['migrate']['chatgptWorkflow']

/**
 * Shared screenshot→ChatGPT→CSV walkthrough for the non-export migrate pages
 * (#839 P2). Apps with no official CSV export route step 2 through here: the
 * user screenshots their ledger, pastes the prompt into ChatGPT, and uploads
 * the CSV ChatGPT returns. Presentational + a copy-to-clipboard button; the
 * uploaded file is parsed by the existing `futari_generic` path.
 *
 * Collapsed by default since #1011. Expanded, this block runs 600px+ and used
 * to be the first substantial thing a search visitor met — a detailed manual
 * for a bonus entry point, standing in front of the reason to sign up. It is
 * not hidden (the markup still ships, so crawlers and anyone who wants it get
 * the whole thing one click away); it just no longer sets the page's agenda.
 *
 * `source` is the page slug (e.g. 'simple-daily-money'), passed through to the
 * copy-prompt and expand analytics events so we can see which app drives them.
 */
export function MigrateChatgptWorkflow({
  copy,
  source,
}: {
  copy: WorkflowCopy
  source: string
}) {
  const [copied, setCopied] = useState(false)
  const expandedOnce = useRef(false)

  function handleToggle(e: SyntheticEvent<HTMLDetailsElement>) {
    if (!e.currentTarget.open || expandedOnce.current) return
    expandedOnce.current = true
    track('migrate_workflow_expanded', { migrate_source: source })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copy.prompt)
      setCopied(true)
      track('migrate_prompt_copied', { migrate_source: source })
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure context / permissions) — the prompt is
      // still visible and selectable below, so this is a soft failure.
    }
  }

  return (
    <details
      className="group rounded-card bg-surface-alt border border-hairline"
      onToggle={handleToggle}
    >
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer p-5 md:p-6 flex items-start justify-between gap-4">
        <h2 className="m-0 flex-1 min-w-0 text-xl md:text-title font-medium text-ink">
          {copy.heading}
          <span className="block mt-1.5 text-sm font-normal leading-[1.7] text-ink-3">
            {copy.toggleHint}
          </span>
        </h2>
        <ChevronGlyph />
      </summary>

      <div className="px-5 pb-5 md:px-6 md:pb-6 space-y-5">
        <p className="m-0 text-sm md:text-base leading-[1.7]" style={{ color: 'var(--ink-2)' }}>
          {copy.intro}
        </p>

        <ol className="m-0 list-none p-0 space-y-3">
          {copy.substeps.map((text, i) => (
            <li
              key={i}
              className="flex gap-4 items-start text-sm md:text-base leading-[1.7]"
              style={{ color: 'var(--ink-2)' }}
            >
              <span
                aria-hidden
                className="shrink-0 inline-flex items-center justify-center text-xs"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  fontFamily: 'var(--font-fraunces)',
                  fontStyle: 'italic',
                  color: 'var(--ink-3)',
                }}
              >
                {i + 1}
              </span>
              <span className="flex-1 min-w-0">{text}</span>
            </li>
          ))}
        </ol>

        {/* Copyable ChatGPT prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--ink-3)', letterSpacing: '0.4px' }}>
              {copy.promptLabel}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-bubble text-sm font-medium cursor-pointer transition-opacity"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--ink-3)',
                color: 'var(--ink)',
              }}
            >
              <CopyGlyph />
              {copied ? copy.copied : copy.copy}
            </button>
          </div>
          <pre
            className="m-0 overflow-x-auto whitespace-pre-wrap break-words text-sm leading-[1.7] rounded-tile p-4"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              color: 'var(--ink)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {copy.prompt}
          </pre>
        </div>

        {/* CSV format example */}
        <div className="space-y-2">
          <span className="text-xs" style={{ color: 'var(--ink-3)', letterSpacing: '0.4px' }}>
            {copy.formatLabel}
          </span>
          <pre
            className="m-0 overflow-x-auto text-sm leading-[1.7] rounded-tile p-4"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              color: 'var(--ink-2)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {copy.formatExample}
          </pre>
          <p className="m-0 text-xs leading-[1.6]" style={{ color: 'var(--ink-3)' }}>
            {copy.note}
          </p>
        </div>

        <p className="m-0 pt-4 border-t border-hairline text-xs leading-[1.6] text-ink-3">
          {copy.settingsHint}
        </p>
      </div>
    </details>
  )
}

/** Disclosure affordance for the <summary>; flips when the block is open. */
function ChevronGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="mt-1 shrink-0 text-ink-3 transition-transform group-open:rotate-180"
    >
      <path
        d="M6 9.5 L12 15.5 L18 9.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CopyGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 15 H4.5 C3.67 15 3 14.33 3 13.5 V4.5 C3 3.67 3.67 3 4.5 3 H13.5 C14.33 3 15 3.67 15 4.5 V5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
