import { Ember } from '../../_components/Ember'
import { s } from '../../_components/brand-inner'

type PainPoint = { heading: string; body: string }

export function UseCasePainPoints({ items }: { items: readonly PainPoint[] }) {
  return (
    <section>
      <ul className={s.rows}>
        {items.map(({ heading, body }) => (
          <li key={heading} className={s.row}>
            <Ember />
            <div>
              <p className={`${s.rowTitle} text-base font-medium`}>{heading}</p>
              <p className={`${s.rowBody} text-sm`}>{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
