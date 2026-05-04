/**
 * 模式切換佔位 — 視覺保留，永遠在「支出」狀態。
 *
 * 功能本身（支出 / 進帳 切換 + 連動 hero card 內容 + 開 IncomeSheet）
 * 跟 Phase 2 保險 + IncomeSheet 一起 ship。詳見
 * docs/superpowers/specs/2026-05-04-incomesheet-design-spec.md
 *
 * 用在三個 dashboard hero variant 頂部：BalanceHero / SoloBanner /
 * Dashboard 內的 solo+dismissed 簡化 CTA。實作時把這個元件升級為有狀態的
 * 真 toggle，三處的 trigger 邏輯就一起改一處。
 */
export function ModeTogglePlaceholder() {
  return (
    <div
      className="flex items-center gap-1 rounded-full p-1 mb-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      aria-hidden="true"
    >
      <div
        className="flex-1 h-9 rounded-full flex items-center justify-center text-sm font-medium"
        style={{ background: 'var(--ink)', color: 'white' }}
      >
        支出
      </div>
      <div
        className="flex-1 h-9 rounded-full flex items-center justify-center text-sm font-medium"
        style={{ color: 'var(--ink-3)', opacity: 0.4 }}
      >
        進帳
      </div>
    </div>
  )
}
