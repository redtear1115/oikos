import Link from 'next/link'

export function UseCaseCta({
  label,
  signInHref,
}: {
  label: string
  signInHref: string
}) {
  return (
    <div className="text-center md:text-left">
      <Link
        href={signInHref}
        className="inline-flex items-center justify-center h-12 px-6 rounded-xl text-white text-base font-medium"
        style={{ background: 'var(--ink)', textDecoration: 'none' }}
      >
        {label}
      </Link>
    </div>
  )
}
