import type { ReactNode } from 'react'

interface Props {
  title?: string
  subtitle?: string
  className?: string
  children: ReactNode
}

export function SectionCard({ title, subtitle, className, children }: Props) {
  return (
    <div
      className={`rounded-2xl px-5 py-4${className ? ` ${className}` : ''}`}
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      {title && (
        <div className="text-sm font-medium mb-1" style={{ color: 'var(--ink)' }}>
          {title}
        </div>
      )}
      {subtitle && (
        <div className="text-xs mb-3" style={{ color: 'var(--ink-3)' }}>
          {subtitle}
        </div>
      )}
      {children}
    </div>
  )
}
