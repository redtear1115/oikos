import type { Translations } from '@/lib/i18n/locales/zh-TW'
import type { UseCaseDef } from '@/lib/use-case/cases'

type FeatureKey = keyof Translations['useCase']['features']

const FEATURE_ICONS: Record<FeatureKey, string> = {
  split: '⇌',
  trip: '✈',
  asset: '♥',
  realtime: '⟳',
  encrypt: '⚿',
  history: '◎',
}

export function UseCaseFeatures({
  heading,
  featureKeys,
  features,
}: {
  heading: string
  featureKeys: UseCaseDef['features']
  features: Translations['useCase']['features']
}) {
  return (
    <section className="space-y-4">
      <h2
        className="m-0 text-[20px] md:text-[22px] font-medium"
        style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
      >
        {heading}
      </h2>
      <ul className="m-0 list-none p-0 grid grid-cols-1 md:grid-cols-2 gap-3">
        {featureKeys.map((key) => {
          const f = features[key]
          return (
            <li
              key={key}
              className="rounded-[16px] px-5 py-4"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="shrink-0 text-[18px] mt-0.5"
                  aria-hidden
                  style={{ color: 'var(--accent)', fontFamily: 'var(--font-fraunces)' }}
                >
                  {FEATURE_ICONS[key]}
                </span>
                <div>
                  <p
                    className="m-0 text-meta font-medium"
                    style={{ color: 'var(--ink)', letterSpacing: '-0.1px' }}
                  >
                    {f.title}
                  </p>
                  <p
                    className="m-0 mt-1 text-sm leading-[1.65]"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    {f.body}
                  </p>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
