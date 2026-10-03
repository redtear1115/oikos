import { Phrase } from '../../_components/Phrase'
import { Ember } from '../../_components/Ember'
import { s } from '../../_components/brand-inner'

/**
 * "Why Futari" block — answers the migrating visitor's "why switch?"
 * before they upload anything (#581). Same three-row shape on every
 * /migrate/<source> page; per-source copy supplies the substance.
 */
export function MigrateDifferentiators({
  heading,
  items,
}: {
  heading: string
  items: readonly { title: string; body: string }[]
}) {
  return (
    <section className={s.band}>
      <h2 className={`${s.h2} m-0 text-xl md:text-title font-medium`}>
        <Phrase text={heading} />
      </h2>
      <ul className={s.rows}>
        {items.map(({ title, body }, i) => (
          <li key={i} className={s.row}>
            <Ember />
            <div>
              <p className={`${s.rowTitle} text-base font-medium`}>
                <span className={`${s.num} text-sm`} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>{' '}
                <Phrase text={title} />
              </p>
              <p className={`${s.rowBody} text-sm`}>{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
