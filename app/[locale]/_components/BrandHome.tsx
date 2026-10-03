import Link from 'next/link'
import { FutariMark } from '../_landing/FutariMark'

/**
 * Wordmark link back to the locale home, shared by the brand pages that have no
 * landing header of their own (sign-in, use-case, migrate; #1523).
 * `min-h-11` is the 44px target; the 22px mark and the text stay as they were.
 */
export function BrandHome({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex items-center gap-2 min-h-11"
      style={{ textDecoration: 'none', color: 'var(--ink)' }}
    >
      <FutariMark size={22} />
      <span
        className="text-base md:text-title font-medium"
        style={{ fontFamily: 'var(--font-fraunces)', letterSpacing: '-0.2px' }}
      >
        Futari
      </span>
    </Link>
  )
}
