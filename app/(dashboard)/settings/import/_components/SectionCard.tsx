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
        // A real heading (#1182) so each wizard step is navigable by heading,
        // and focusable (tabIndex -1, never in the tab order) so ImportContent
        // can move focus here when the step changes — otherwise the Next
        // button unmounts under the user and focus silently falls to <body>.
        <h2 tabIndex={-1} className="text-sm font-medium mb-1 focus:outline-none" style={{ color: 'var(--ink)' }}>
          {title}
        </h2>
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
