'use client'

import { useState } from 'react'

interface Props {
  value: string  // YYYY-MM-DD
  onChange: (date: string) => void
}

/**
 * Calendar grid for picking a date. The view month is local state — initialised
 * from `value` but decoupled, so users can navigate to a prior or future month
 * (e.g. logging a settlement on the 1st but recording it on the 5th of the next month).
 * Selecting a day calls `onChange` with the ISO date and leaves the view month alone.
 */
export function MiniCalendar({ value, onChange }: Props) {
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const [valueY, valueM] = value.split('-').map(Number)
  const [view, setView] = useState({ year: valueY, month: valueM })

  const firstOfMonth = new Date(view.year, view.month - 1, 1)
  const firstDay = firstOfMonth.getDay()
  const daysInMonth = new Date(view.year, view.month, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const goPrev = () => {
    setView((v) => v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 })
  }
  const goNext = () => {
    setView((v) => v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 })
  }

  return (
    <div className="mt-3 px-3 pt-3.5 pb-4 rounded-2xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={goPrev}
          aria-label="上個月"
          className="w-8 h-8 rounded-full bg-transparent border-0 cursor-pointer flex items-center justify-center text-[18px] leading-none"
          style={{ color: 'var(--ink-2)' }}
        >
          ‹
        </button>
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {view.year} 年 {view.month} 月
        </div>
        <button
          type="button"
          onClick={goNext}
          aria-label="下個月"
          className="w-8 h-8 rounded-full bg-transparent border-0 cursor-pointer flex items-center justify-center text-[18px] leading-none"
          style={{ color: 'var(--ink-2)' }}
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-[11px] text-center mb-1.5"
        style={{ color: 'var(--ink-3)' }}>
        {['日','一','二','三','四','五','六'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />
          const iso = `${view.year}-${String(view.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const sel = iso === value
          const isToday = iso === todayIso
          return (
            <button key={i} type="button" onClick={() => onChange(iso)}
              className="h-9 border-0 rounded-[10px] cursor-pointer relative transition-[background] duration-100 text-sm"
              style={{
                background: sel ? 'var(--ink)' : 'transparent',
                color: sel ? '#fff' : 'var(--ink)',
                fontFamily: 'var(--font-numeric)',
                fontWeight: isToday ? 600 : 400,
              }}>
              {d}
              {isToday && !sel && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: 'var(--accent)' }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
