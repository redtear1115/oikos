'use client'

import { useState } from 'react'
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
 * `source` is the page slug (e.g. 'simple-daily-money'), passed through to the
 * copy-prompt analytics event so we can see which app drives prompt copies.
 */
export function MigrateChatgptWorkflow({
  copy,
  source,
}: {
  copy: WorkflowCopy
  source: string
}) {
  const [copied, setCopied] = useState(false)

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
    <section
      className="rounded-card p-5 md:p-6 space-y-5"
      style={{ background: 'var(--surface-alt)', border: '1px solid var(--hairline)' }}
    >
      <div className="space-y-2">
        <h2
          className="m-0 text-[20px] md:text-[22px] font-medium"
          style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
        >
          {copy.heading}
        </h2>
        <p className="m-0 text-sm md:text-base leading-[1.7]" style={{ color: 'var(--ink-2)' }}>
          {copy.intro}
        </p>
      </div>

      <ol className="m-0 list-none p-0 space-y-3">
        {copy.substeps.map((text, i) => (
          <li
            key={i}
            className="flex gap-4 items-start text-sm md:text-base leading-[1.7]"
            style={{ color: 'var(--ink-2)' }}
          >
            <span
              aria-hidden
              className="shrink-0 inline-flex items-center justify-center"
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                fontFamily: 'var(--font-fraunces)',
                fontStyle: 'italic',
                fontSize: 13,
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
    </section>
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
