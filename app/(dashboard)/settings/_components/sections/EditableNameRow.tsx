'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EditTextSheet } from '@/app/(dashboard)/_components/EditTextSheet'

interface Props {
  /** Section row label (e.g. "帳本名稱"). */
  label: string
  /** Current value shown on the row and seeded into the edit input. */
  value: string
  /** Server action invoked with the new trimmed value. EditTextSheet
   *  surfaces rejection as inline error and keeps the sheet open. */
  onSave: (next: string) => Promise<unknown>
}

export function EditableNameRow({ label, value, onSave }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-5 py-4 rounded-card text-left bg-transparent cursor-pointer"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{label}</div>
        <div className="text-sm flex items-center gap-2 shrink-0" style={{ color: 'var(--ink-3)' }}>
          <span style={{ color: 'var(--ink-2)' }}>「{value}」</span>
          <span>›</span>
        </div>
      </button>
      <EditTextSheet
        open={open}
        title={label}
        initialValue={value}
        onClose={() => setOpen(false)}
        onSubmit={async (v) => {
          await onSave(v)
          router.refresh()
        }}
      />
    </>
  )
}
