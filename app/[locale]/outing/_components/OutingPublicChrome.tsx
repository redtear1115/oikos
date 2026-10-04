import type { ReactNode } from 'react'

// Shared frame for the public outing pages (#1558). Server-safe: no hooks.

export function OutingHeader({ title }: { title: string }) {
  return (
    <header className="px-4 pt-12 pb-1">
      <h1 className="text-xl font-medium text-ink break-words">{title}</h1>
    </header>
  )
}

/** Invalid link / no access: a title and one line, never any outing content. */
export function OutingMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 pt-16 flex flex-col gap-2">
      <h1 className="text-xl font-medium text-ink">{title}</h1>
      <p className="text-sm text-ink-3">{body}</p>
    </div>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-card p-4 bg-surface border border-hairline">{children}</section>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-sm font-medium mb-2 text-ink-2">{children}</div>
}
