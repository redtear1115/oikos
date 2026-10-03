import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { Ember } from '../_components/Ember'
import { s } from '../_components/brand-inner'

type Features = Translations['signIn']['features']

// Right-column scenes on /sign-in (#417), restyled as a hairline list with the
// shared ember marker instead of four tinted cards (#1524).
export function FeatureCards({ t }: { t: Features }) {
  const items = [
    { title: t.c1Title, body: t.c1Body },
    { title: t.c2Title, body: t.c2Body },
    { title: t.c3Title, body: t.c3Body },
    { title: t.c4Title, body: t.c4Body },
  ]
  return (
    <ul className={s.rows}>
      {items.map(({ title, body }) => (
        <li key={title} className={s.row}>
          <Ember />
          <div>
            <p className={`${s.rowTitle} text-base font-medium`}>{title}</p>
            <p className={`${s.rowBody} text-sm`}>{body}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
