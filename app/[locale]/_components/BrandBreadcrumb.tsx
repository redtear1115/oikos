import Link from 'next/link'

export type Crumb = { label: string; href?: string }

/**
 * Light visible breadcrumb for brand detail pages (#1523). It is the way home
 * below md, where the header's 「回首頁」 link is hidden, and it mirrors the
 * BreadcrumbList JSON-LD on the same page: the last crumb is the current page
 * (no link, aria-current), every earlier crumb is a real page.
 * Links are 44px tall (`min-h-11`); the 12px text is unchanged.
 */
export function BrandBreadcrumb({ label, crumbs }: { label: string; crumbs: Crumb[] }) {
  return (
    <nav aria-label={label}>
      <ol className="m-0 p-0 list-none flex flex-wrap items-center text-xs" style={{ color: 'var(--ink-2)' }}>
        {crumbs.map((c, i) => (
          <li key={c.label} className="inline-flex items-center">
            {i > 0 && (
              <span aria-hidden="true" className="px-1" style={{ color: 'var(--ink-3)' }}>
                /
              </span>
            )}
            {c.href ? (
              <Link href={c.href} className="inline-flex items-center justify-center min-h-11 min-w-11 underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="inline-flex items-center min-h-11" style={{ color: 'var(--ink)' }}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
