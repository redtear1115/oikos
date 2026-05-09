'use client'

import { useState } from 'react'

interface Props {
  value: string  // YYYY-MM-DD
  onChange: (date: string) => void
}

type Mode = 'days' | 'months' | 'years'

/**
 * Calendar grid for picking a date. View state is local — initialised from `value`
 * but decoupled, so users can navigate freely. Tap the header to zoom out
 * (days → months → years); tap a cell in months/years view to drill back down.
 */
export function MiniCalendar({ value, onChange }: Props) {
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const [valueY, valueM] = value.split('-').map(Number)
  const [view, setView] = useState({ year: valueY, month: valueM })
  const [mode, setMode] = useState<Mode>('days')

  if (mode === 'days') {
    const firstOfMonth = new Date(view.year, view.month - 1, 1)
    const firstDay = firstOfMonth.getDay()
    const daysInMonth = new Date(view.year, view.month, 0).getDate()

    const cells: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)

    const goPrev = () =>
      setView(v => v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 })
    const goNext = () =>
      setView(v => v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 })

    return (
      <Shell>
        <Header
          prevLabel="上個月"
          nextLabel="下個月"
          onPrev={goPrev}
          onNext={goNext}
          title={`${view.year} 年 ${view.month} 月 ˅`}
          titleAriaLabel="選擇月份"
          onTitle={() => setMode('months')}
        />
        <div className="grid grid-cols-7 text-micro text-center mb-1.5"
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
      </Shell>
    )
  }

  if (mode === 'months') {
    const goPrev = () => setView(v => ({ ...v, year: v.year - 1 }))
    const goNext = () => setView(v => ({ ...v, year: v.year + 1 }))
    return (
      <Shell>
        <Header
          prevLabel="上一年"
          nextLabel="下一年"
          onPrev={goPrev}
          onNext={goNext}
          title={`${view.year} 年 ˅`}
          titleAriaLabel="選擇年份"
          onTitle={() => setMode('years')}
        />
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
            const sel = view.year === valueY && m === valueM
            return (
              <button key={m} type="button"
                onClick={() => { setView(v => ({ ...v, month: m })); setMode('days') }}
                className="h-11 border-0 rounded-[10px] cursor-pointer text-sm"
                style={{
                  background: sel ? 'var(--ink)' : 'transparent',
                  color: sel ? '#fff' : 'var(--ink)',
                  fontFamily: 'var(--font-numeric)',
                }}>
                {m} 月
              </button>
            )
          })}
        </div>
      </Shell>
    )
  }

  // mode === 'years' — 3×4 grid: 1 overflow year, 10 in-decade, 1 overflow year.
  const decadeStart = Math.floor(view.year / 10) * 10
  const goPrev = () => setView(v => ({ ...v, year: v.year - 10 }))
  const goNext = () => setView(v => ({ ...v, year: v.year + 10 }))
  return (
    <Shell>
      <Header
        prevLabel="上一個十年"
        nextLabel="下一個十年"
        onPrev={goPrev}
        onNext={goNext}
        title={`${decadeStart} – ${decadeStart + 9} ˅`}
      />
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 12 }, (_, i) => decadeStart - 1 + i).map(y => {
          const sel = y === valueY
          const overflow = y < decadeStart || y > decadeStart + 9
          return (
            <button key={y} type="button"
              onClick={() => { setView(v => ({ ...v, year: y })); setMode('months') }}
              className="h-11 border-0 rounded-[10px] cursor-pointer text-sm"
              style={{
                background: sel ? 'var(--ink)' : 'transparent',
                color: sel ? '#fff' : 'var(--ink)',
                fontFamily: 'var(--font-numeric)',
                opacity: overflow && !sel ? 0.4 : 1,
              }}>
              {y}
            </button>
          )
        })}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 px-3 pt-3.5 pb-4 rounded-2xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      {children}
    </div>
  )
}

interface HeaderProps {
  prevLabel: string
  nextLabel: string
  onPrev: () => void
  onNext: () => void
  title: string
  titleAriaLabel?: string
  onTitle?: () => void
}

function Header({ prevLabel, nextLabel, onPrev, onNext, title, titleAriaLabel, onTitle }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <button type="button" onClick={onPrev} aria-label={prevLabel}
        className="w-8 h-8 rounded-full bg-transparent border-0 cursor-pointer flex items-center justify-center text-button leading-none"
        style={{ color: 'var(--ink-2)' }}>‹</button>
      {onTitle ? (
        <button type="button" onClick={onTitle} aria-label={titleAriaLabel}
          className="text-sm font-semibold bg-transparent border-0 cursor-pointer px-2 py-1 rounded"
          style={{ color: 'var(--ink)' }}>
          {title}
        </button>
      ) : (
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</div>
      )}
      <button type="button" onClick={onNext} aria-label={nextLabel}
        className="w-8 h-8 rounded-full bg-transparent border-0 cursor-pointer flex items-center justify-center text-button leading-none"
        style={{ color: 'var(--ink-2)' }}>›</button>
    </div>
  )
}
