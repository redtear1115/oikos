'use client'

import Link from 'next/link'
import { track } from '@/lib/analytics/track'
import { Ember } from '../../_components/Ember'
import { s } from '../../_components/brand-inner'

/**
 * LampLinkRow's markup (app/[locale]/_components/LampLinkRow.tsx), plus the
 * `feature_outing_link_clicked` click. A client twin rather than an onClick
 * prop on the shared row, so the hubs and migrate pages keep a server row.
 * Keep the two in step.
 */
export function FeatureLinkRow({
  href,
  name,
  description,
  cta,
  source,
}: {
  href: string
  name: string
  description: string
  cta: string
  source: 'use_case_travel' | 'use_case_aa_split'
}) {
  return (
    <li>
      <Link href={href} className={s.link} onClick={() => track('feature_outing_link_clicked', { source })}>
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
