import Image from 'next/image'
import type { Locale } from '@/lib/i18n/locales-meta'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import type { BlogPost } from '@/lib/blog-feed'
import { withUtm } from '@/lib/utm'
import { Ember } from '../_components/Ember'
import { s } from '../_components/brand-inner'

const VISIBLE = 5

/**
 * Dev-log section pinned below the 3-column sign-in grid (issue #460).
 *
 * Build-time render — `posts` is fetched in the parent Server Component
 * with `next.revalidate`, so this is plain static HTML with no client JS.
 * Each row is an external `<a>` to southern-light.dev; we do NOT mirror
 * the article body into Futari — this is an index + traffic referral only.
 *
 * #1524: a hairline list, latest five visible, the rest behind a native
 * <details> (no JS; every entry stays in the DOM). Above it, a lazily loaded
 * crop of the hero illustration is the page's lamp structure.
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

  const row = (post: BlogPost) => (
    <li key={post.link}>
      <a
        href={withUtm(post.link, { source: 'futari_landing', medium: 'blog_section' })}
        target="_blank"
        rel="noopener noreferrer"
        className={`${s.link} ${s.stack} focus-visible:oik-focus-ring`}
      >
        <Ember />
        <div>
          {post.pubDate && (
            <p className={`${s.devDate} m-0 text-xs`}>{dateFmt.format(new Date(post.pubDate))}</p>
          )}
          <p className={`${s.rowTitle} text-sm mt-1`}>{post.title}</p>
        </div>
        <span className={s.arrow} aria-hidden="true">
          →
        </span>
      </a>
    </li>
  )

  return (
    <section
      className="mx-auto w-full max-w-7xl px-6 pb-16 lg:px-12"
      aria-labelledby="blog-section-heading"
    >
      <div className={s.window} aria-hidden="true">
        <Image
          src="/illustration-hero.png"
          alt=""
          width={1376}
          height={768}
          loading="lazy"
          sizes="(min-width: 1280px) 1216px, 100vw"
          className={s.windowImg}
        />
      </div>
      <h2 id="blog-section-heading" className="mb-4 text-sm text-ink-2 tracking-[2px] uppercase">
        {t.signIn.blog.heading}
      </h2>
      <ul className={s.rows}>{posts.slice(0, VISIBLE).map(row)}</ul>
      {posts.length > VISIBLE && (
        <details className={s.more}>
          <summary className="text-sm">
            <Ember />
            {t.signIn.blog.more}
          </summary>
          <ul className={s.rows}>{posts.slice(VISIBLE).map(row)}</ul>
        </details>
      )}
    </section>
  )
}
