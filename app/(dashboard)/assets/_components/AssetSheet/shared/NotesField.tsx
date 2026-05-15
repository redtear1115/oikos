import { Field } from './Field'

interface Props {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
}

// Cap at 2000 chars (matches lib/validators.ts NOTES_MAX_LEN); empty/whitespace
// treated as null on submit.
export function NotesField({ label, placeholder, value, onChange }: Props) {
  return (
    <Field label={label}>
      {id => (
        <textarea
          id={id}
          value={value}
          onChange={e => onChange(e.target.value.slice(0, 2000))}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-transparent border-0 outline-none text-base resize-y"
          style={{ color: 'var(--ink)', minHeight: 64 }}
        />
      )}
    </Field>
  )
}
