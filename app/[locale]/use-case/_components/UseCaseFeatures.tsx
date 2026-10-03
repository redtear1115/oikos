import type { Translations } from '@/lib/i18n/locales/zh-TW'
import type { UseCaseDef } from '@/lib/use-case/cases'
import { Phrase } from '../../_components/Phrase'
import { Ember } from '../../_components/Ember'
import { s } from '../../_components/brand-inner'

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
    <section className={s.band}>
      <h2 className={`${s.h2} m-0 text-xl md:text-title font-medium`}>
        <Phrase text={heading} />
      </h2>
      <ul className={s.rows}>
        {featureKeys.map((key) => {
          const f = features[key]
          return (
            <li key={key} className={s.row}>
              <Ember />
              <div>
                <p className={`${s.rowTitle} text-base font-medium`}>{f.title}</p>
                <p className={`${s.rowBody} text-sm`}>{f.body}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
