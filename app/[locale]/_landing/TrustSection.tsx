import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { ShieldOutlineGlyph } from './FutariMark'

type LandingStrings = Translations['landing']

type Props = {
  t: LandingStrings
  /** `compact` = inline 3-badge row (desktop hero). `full` = standalone section
   *  with narrative + three stacked cards (between Features and footer). */
  variant: 'compact' | 'full'
}

export function TrustSection({ t, variant }: Props) {
  if (variant === 'compact') {
    return <CompactTrustRow t={t} />
  }
  return <FullTrustSection t={t} />
}

function CompactTrustRow({ t }: { t: LandingStrings }) {
  return (
    <div
      className="flex items-center gap-6"
      style={{ color: 'var(--ink-2)' }}
    >
      <span className="text-xs" style={{ letterSpacing: '0.3px' }}>
        {t.trustFree}
      </span>
      <span style={{ color: 'var(--hairline)' }}>·</span>
      <span className="text-xs" style={{ letterSpacing: '0.3px' }}>
        {t.trustPwa}
      </span>
      <span style={{ color: 'var(--hairline)' }}>·</span>
      <div className="flex items-center gap-1.5">
        <ShieldOutlineGlyph />
        <span className="text-xs" style={{ letterSpacing: '0.3px' }}>
          {t.trustEncrypted}
        </span>
      </div>
    </div>
  )
}

function FullTrustSection({ t }: { t: LandingStrings }) {
  return (
    <section
      className="relative z-10 px-5 md:px-16 py-16 md:py-28"
      style={{ background: 'var(--bg)' }}
    >
      <div className="max-w-md md:max-w-[720px] mx-auto text-center">
        {/* The narrative line is the trust statement — serif standalone, no
            card chrome around it. The three trust facts that used to sit in
            three identical cards collapse to a single inline row underneath. */}
        <p
          className="m-0 text-[24px] md:text-[34px] leading-[1.45] md:leading-[1.35]"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 400,
            color: 'var(--ink)',
            letterSpacing: '-0.3px',
          }}
        >
          {t.trust.narrative}
        </p>

        <ul
          className="m-0 mt-8 md:mt-10 p-0 list-none flex flex-col md:flex-row md:justify-center items-center gap-3 md:gap-x-6 md:gap-y-0 text-sm md:text-base"
          style={{ color: 'var(--ink-2)' }}
        >
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" style={{ color: 'var(--ink-2)' }}>
              <LockGlyph size={18} />
            </span>
            <span className="font-medium" style={{ color: 'var(--ink)' }}>
              {t.trust.encryption.title}
            </span>
          </li>
          <li
            aria-hidden="true"
            className="hidden md:block"
            style={{ color: 'var(--hairline)' }}
          >
            ·
          </li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" style={{ color: 'var(--ink-2)' }}>
              <ExportGlyph size={18} />
            </span>
            <span className="font-medium" style={{ color: 'var(--ink)' }}>
              {t.trust.portability.title}
            </span>
          </li>
          <li
            aria-hidden="true"
            className="hidden md:block"
            style={{ color: 'var(--hairline)' }}
          >
            ·
          </li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" style={{ color: 'var(--ink-2)' }}>
              <HeartGlyph size={18} />
            </span>
            <span className="font-medium" style={{ color: 'var(--ink)' }}>
              {t.trust.forever.title}
            </span>
          </li>
        </ul>
      </div>
    </section>
  )
}

function LockGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="4.5"
        y="10.5"
        width="15"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 10.5 V 7.5 C 8 5.3 9.8 3.5 12 3.5 C 14.2 3.5 16 5.3 16 7.5 V 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="15.5" r="1.3" fill="currentColor" />
    </svg>
  )
}

function ExportGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5 V 14.5 M 7.5 10 L 12 14.5 L 16.5 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 17 V 19.5 C 5 20.05 5.45 20.5 6 20.5 H 18 C 18.55 20.5 19 20.05 19 19.5 V 17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function HeartGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20 C 12 20 4 14.5 4 9 C 4 6.5 6 4.5 8.5 4.5 C 10.2 4.5 11.3 5.4 12 6.5 C 12.7 5.4 13.8 4.5 15.5 4.5 C 18 4.5 20 6.5 20 9 C 20 14.5 12 20 12 20 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
