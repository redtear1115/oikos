import Link from 'next/link'
import { Ember } from './Ember'
import { s } from './brand-inner'

/**
 * One hairline row that links to a sibling page: ember marker, name, one-line
 * description, arrow. Shared by the /use-case and /migrate hubs and their
 * cross-link blocks (#1524). The cta text stays in the link for its accessible
 * name; the arrow is the visible affordance.
 */
export function LampLinkRow({
  href,
  name,
  description,
  cta,
}: {
  href: string
  name: string
  description: string
  cta: string
}) {
  return (
    <li>
      <Link href={href} className={s.link}>
        <Ember />
        <p className={`${s.rowTitle} text-base font-medium`}>{name}</p>
        <p className={`${s.rowBody} text-sm`}>{description}</p>
        <span className={s.arrow} aria-hidden="true">
          →
        </span>
        <span className="sr-only">{cta}</span>
      </Link>
    </li>
  )
}
