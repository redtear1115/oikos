'use client'

import { useState, useEffect } from 'react'
import { CalIcon, Chevron } from '@/app/(dashboard)/_components/sheet-icons'
import { MiniCalendar } from './MiniCalendar'
import { localTodayISO, dateLabel, weekday } from '@/lib/local-date'

interface DateFieldProps {
  value: string  // ISO date string e.g. "2026-05-05"
  onChange: (iso: string) => void
  open: boolean  // parent sheet open state; resets calendar on reopen
}

export function DateField({ value, onChange, open }: DateFieldProps) {
  const [showCal, setShowCal] = useState(false)
  useEffect(() => { if (open) setShowCal(false) }, [open])

  return (
    <>
      <button onClick={() => setShowCal(v => !v)}
        className="w-full flex items-center gap-3 px-3.5 py-3 rounded-[14px] cursor-pointer text-left"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <CalIcon />
        <div className="flex-1 text-left">
          <div className="text-body font-medium" style={{ color: 'var(--ink)' }}>{dateLabel(value)}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{value === localTodayISO() ? '今天' : weekday(value)}</div>
        </div>
        <Chevron />
      </button>
      {showCal && <MiniCalendar value={value} onChange={d => { onChange(d); setShowCal(false) }} />}
    </>
  )
}
