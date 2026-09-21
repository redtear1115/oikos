import { useId } from 'react'

interface FieldProps {
  label: string
  htmlFor?: string
  children: React.ReactNode | ((id: string) => React.ReactNode)
}

export function Field({ label, htmlFor, children }: FieldProps) {
  const generatedId = useId()
  const isRenderProp = typeof children === 'function'
  const effectiveId = htmlFor ?? (isRenderProp ? generatedId : undefined)
  return (
    <div
      className="py-3 border-b border-b-hairline"
    >
      {effectiveId ? (
        <label htmlFor={effectiveId} className="block text-xs mb-1 tracking-wide text-ink-3">
          {label}
        </label>
      ) : (
        <div className="text-xs mb-1 tracking-wide text-ink-3">{label}</div>
      )}
      {isRenderProp ? (children as (id: string) => React.ReactNode)(effectiveId!) : children}
    </div>
  )
}
