'use client'

interface Props {
  value: string  // YYYY-MM-DD
  onChange: (date: string) => void
}

export function MiniCalendar({ value, onChange }: Props) {
  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const [year, month] = value.split('-').map(Number)

  const firstOfMonth = new Date(year, month - 1, 1)
  const firstDay = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="mt-3 px-3 pt-3.5 pb-4 rounded-2xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="text-center text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>
        {year} 年 {month} 月
      </div>
      <div className="grid grid-cols-7 text-[11px] text-center mb-1.5"
        style={{ color: 'var(--ink-3)' }}>
        {['日','一','二','三','四','五','六'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const sel = iso === value
          const isToday = iso === todayIso
          return (
            <button key={i} onClick={() => onChange(iso)}
              className="h-9 border-0 rounded-[10px] cursor-pointer relative transition-[background] duration-100"
              style={{
                background: sel ? 'var(--ink)' : 'transparent',
                color: sel ? '#fff' : 'var(--ink)',
                fontFamily: 'var(--font-numeric)',
                fontSize: 14,
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
