import { forwardRef } from 'react'
import { Field } from './Field'

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  maxLength?: number
}

export const NameField = forwardRef<HTMLInputElement, Props>(function NameField(
  { label, value, onChange, placeholder, maxLength = 32 },
  ref,
) {
  return (
    <Field label={label}>
      {id => (
        <input
          id={id}
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value.slice(0, maxLength))}
          placeholder={placeholder}
          className="w-full bg-transparent border-0 outline-none text-base"
          style={{ color: 'var(--ink)' }}
        />
      )}
    </Field>
  )
})
