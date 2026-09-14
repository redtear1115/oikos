import type { Locale } from '@/lib/i18n/locales-meta'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import type { BlogPost } from '@/lib/blog-feed'
import { withUtm } from '@/lib/utm'

/**
 * Dev-log section pinned below the 3-column sign-in grid (issue #460).
 *
 * Build-time render — `posts` is fetched in the parent Server Component
 * with `next.revalidate`, so this is plain static HTML with no client JS.
 * Each card is an external `<a>` to southern-light.dev; we do NOT mirror
 * the article body into Futari — this is an index + traffic referral only.
 */
export function BlogSection({
  posts,
  t,
  locale,
}: {
  posts: BlogPost[]
  t: Translations
  locale: Locale
}) {
  if (posts.length === 0) return null

  const dateFmt = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <section
      className="mx-auto w-full max-w-7xl px-6 pb-16 lg:px-12"
      aria-labelledby="blog-section-heading"
    >
      <h2
        id="blog-section-heading"
        className="mb-6 text-sm text-ink-2 tracking-[2px] uppercase"
      >
        {t.signIn.blog.heading}
      </h2>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {posts.map(post => (
          <li key={post.link}>
            <a
              href={withUtm(post.link, { source: 'futari_landing', medium: 'blog_section' })}
              target="_blank"
              rel="noopener noreferrer"
              className="block h-full rounded-lg border border-ink-3 p-4 transition-opacity hover:opacity-80 focus-visible:oik-focus-ring"
            >
              {post.pubDate && (
                <div className="mb-2 text-xs text-ink-2">
                  {dateFmt.format(new Date(post.pubDate))}
                </div>
              )}
              <div className="text-sm text-ink leading-relaxed">
                {post.title}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
