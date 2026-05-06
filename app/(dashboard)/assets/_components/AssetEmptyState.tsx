export function AssetEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center pt-16 pb-12 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        aria-hidden="true"
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <ellipse cx="12" cy="15" rx="4" ry="3.5" fill="var(--ink-3)" opacity="0.6" />
          <circle cx="7.5" cy="10.5" r="1.6" fill="var(--ink-3)" opacity="0.6" />
          <circle cx="11" cy="8.5" r="1.6" fill="var(--ink-3)" opacity="0.6" />
          <circle cx="13" cy="8.5" r="1.6" fill="var(--ink-3)" opacity="0.6" />
          <circle cx="16.5" cy="10.5" r="1.6" fill="var(--ink-3)" opacity="0.6" />
        </svg>
      </div>
      <div className="text-base font-medium mb-2" style={{ color: 'var(--ink)' }}>
        還沒有愛物
      </div>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)', maxWidth: 240 }}>
        新增一台車、寵物、孩子或保單，<br />開始記錄花在他們身上的時間與心意。
      </div>
    </div>
  )
}
