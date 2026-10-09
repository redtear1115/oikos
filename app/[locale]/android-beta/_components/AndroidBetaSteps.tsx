'use client'

import { track } from '@/lib/analytics/track'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

const BUTTON_CLASS =
  'fc-edge inline-flex items-center justify-center h-12 px-6 rounded-xl bg-ink no-underline text-[var(--on-fill)] text-base font-medium'

interface Props {
  t: Translations['androidBeta']
  /** Closed-test Google Group URL. Empty renders no step buttons at all. */
  groupUrl: string
  /** Play opt-in URL (step 2). Only meaningful once the group is on the tester list. */
  optinUrl: string
  /** Locale-pinned sign-in href, the "use the web version" exit. */
  webHref: string
}

/**
 * Body of /android-beta (#1648): two steps, the ask, the privacy line, a web
 * exit. Props rather than module constants so the empty-group state can be
 * tested for real: with `groupUrl` empty there is no anchor to the group and
 * none to play.google.com/apps/testing (a step-2 button alone would send the
 * visitor to an opt-in page that rejects them). Failure of that guard looks
 * like a visitor tapping a button that leads nowhere, with no error anywhere.
 *
 * Temporary: removed with #1553.
 */
export function AndroidBetaSteps({ t, groupUrl, optinUrl, webHref }: Props) {
  const open = !!groupUrl
  const heading = 'text-base font-medium m-0'

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1
          className="text-page leading-tight m-0 mb-3"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {t.title}
        </h1>
        <p className="text-sm leading-relaxed m-0 text-ink-2">{open ? t.intro : t.closed}</p>
      </header>

      {open && (
        <ol className="list-none p-0 m-0 flex flex-col gap-6">
          <li className="flex flex-col gap-2 items-start">
            <h2 className={`${heading} text-ink`}>{t.step1Title}</h2>
            <p className="text-sm leading-relaxed m-0 text-ink-2">{t.step1Body}</p>
            <a
              href={groupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={BUTTON_CLASS}
              onClick={() => track('android_beta_step_clicked', { step: 'join_group' })}
            >
              {t.step1Cta}
            </a>
          </li>
          <li className="flex flex-col gap-2 items-start">
            <h2 className={`${heading} text-ink`}>{t.step2Title}</h2>
            <p className="text-sm leading-relaxed m-0 text-ink-2">{t.step2Body}</p>
            <a
              href={optinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={BUTTON_CLASS}
              onClick={() => track('android_beta_step_clicked', { step: 'open_testing' })}
            >
              {t.step2Cta}
            </a>
          </li>
        </ol>
      )}

      {open && (
        <section className="flex flex-col gap-2">
          <h2 className={`${heading} text-ink`}>{t.askTitle}</h2>
          <p className="text-sm leading-relaxed m-0 text-ink-2">{t.askBody}</p>
        </section>
      )}

      {open && <p className="text-xs leading-relaxed m-0 text-ink-2">{t.privacy}</p>}

      <a
        href={webHref}
        className="inline-flex items-center min-h-11 text-sm underline underline-offset-4 self-start text-ink"
      >
        {t.useWebVersion}
      </a>
    </div>
  )
}
