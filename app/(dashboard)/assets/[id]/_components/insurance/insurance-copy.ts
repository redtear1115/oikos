/**
 * Copy bank for SavingsView (v0.8.0). All wording follows Futari's restraint:
 *  - No investment vocab (賺/賠/報酬率)
 *  - "拿回" via 中性 動詞 (回來 / 到帳 / 收到), never 獲利
 *  - 預估 numbers always tagged「估」
 *  - 滿期 wording is time-phased (將到期 → 已到期 → 已收齊), never one line for whole lifecycle
 */

export const SAVINGS_HERO_SUB = {
  notStarted: (maturityDate: string | null) =>
    maturityDate
      ? `這筆每年放進去的，${maturityDate} 會回來`
      : `這筆每年放進去的，未來會回來`,

  partial: (pct: number, yearsLeft: number | null) =>
    yearsLeft !== null && yearsLeft > 0
      ? `已拿回 ${pct}% · 距滿期還有 ${yearsLeft.toFixed(1)} 年`
      : `已拿回 ${pct}%`,

  matured: (total: number) =>
    `滿期了 · 共拿回 NT$ ${total.toLocaleString()}`,

  awaitingMaturity: () =>
    `滿期日已到 · 等候滿期金到帳`,

  notYetActive: (startsAt: string) =>
    `保單將於 ${startsAt} 生效`,
}

export const SAVINGS_RETURN_EMPTY = {
  beforeMaturity: '滿期日還沒到 · 請耐心',
  awaitingMaturity: '滿期日已到 · 滿期金到帳了嗎？',
}

export const SAVINGS_PAYMENT_EMPTY = '還沒記過這份保單的保費 · 戳右下角 +'

export const SAVINGS_MATURING_SOON = (maturityDate: string) => ({
  title: `${maturityDate} 即將到期`,
  subtitle: '別忘了滿期金到帳要記',
  cta: '記滿期金 →',
})

export const SAVINGS_MATURED_AWAITING = {
  title: (maturityDate: string) => `滿期日已到 · ${maturityDate}`,
  status: '待入帳',
  cta: '我已經收到滿期金了 →',
  premiumNote: (total: number, count: number) =>
    `累計繳 NT$ ${total.toLocaleString()} 已記入 ${count} 筆`,
}

export const SAVINGS_NO_EXPECTED_MATURITY = {
  bar: (received: number) =>
    `已拿回 NT$ ${received.toLocaleString()} · 預估金額未設定`,
  ctaLabel: '設定預估金額',
}
