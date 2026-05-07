export interface SavingsProgress {
  premiumTotal: number
  returnTotal: number
  expectedTotalPayment: number | null
  expectedMaturity: number | null
  estimatedRemaining: number | null
  payProgress: number | null
  returnProgress: number | null
  timeProgress: number | null
  payRatio: number | null
  returnRatio: number | null
  daysToMaturity: number | null
  yearsLeft: number | null
  isMatured: boolean
  isMaturingSoon: boolean
  hasOverpaid: boolean
  hasOverReceived: boolean
  awaitingMaturity: boolean
}

export interface SavingsProgressInput {
  premiumTotal: number
  returnTotal: number
  annualPremium: number | null
  termYears: number | null
  expectedMaturity: number | null
  startsAt: string | null
  endsAt: string | null
  now?: Date
}

const OVER_TOLERANCE = 1.05
const MS_PER_DAY = 1000 * 60 * 60 * 24
const DAYS_PER_YEAR = 365.25
const MATURING_SOON_DAYS = 30

export function computeSavingsProgress(input: SavingsProgressInput): SavingsProgress {
  const expectedTotalPayment =
    input.annualPremium !== null && input.termYears !== null
      ? input.annualPremium * input.termYears
      : null

  const payRatio =
    expectedTotalPayment !== null && expectedTotalPayment > 0
      ? input.premiumTotal / expectedTotalPayment
      : null

  const payProgress = payRatio !== null ? Math.min(1, payRatio) : null
  const hasOverpaid = payRatio !== null && payRatio > OVER_TOLERANCE

  const returnRatio =
    input.expectedMaturity !== null && input.expectedMaturity > 0
      ? input.returnTotal / input.expectedMaturity
      : null

  const returnProgress = returnRatio !== null ? Math.min(1, returnRatio) : null
  const hasOverReceived = returnRatio !== null && returnRatio > OVER_TOLERANCE
  const estimatedRemaining =
    input.expectedMaturity !== null
      ? Math.max(0, input.expectedMaturity - input.returnTotal)
      : null

  const now = input.now ?? new Date()
  let timeProgress: number | null = null
  let daysToMaturity: number | null = null
  let yearsLeft: number | null = null
  let isMatured = false
  let isMaturingSoon = false

  if (input.startsAt && input.endsAt) {
    const start = new Date(input.startsAt).getTime()
    const end = new Date(input.endsAt).getTime()
    const nowMs = now.getTime()
    const total = end - start
    if (total > 0) {
      timeProgress = Math.max(0, Math.min(1, (nowMs - start) / total))
    }
    const msToMaturity = end - nowMs
    daysToMaturity = msToMaturity / MS_PER_DAY
    yearsLeft = msToMaturity / (MS_PER_DAY * DAYS_PER_YEAR)
    isMatured = nowMs >= end
    isMaturingSoon = !isMatured && daysToMaturity > 0 && daysToMaturity <= MATURING_SOON_DAYS
  }

  return {
    premiumTotal: input.premiumTotal,
    returnTotal: input.returnTotal,
    expectedTotalPayment,
    expectedMaturity: input.expectedMaturity,
    estimatedRemaining,
    payProgress,
    returnProgress,
    timeProgress,
    payRatio,
    returnRatio,
    daysToMaturity,
    yearsLeft,
    isMatured,
    isMaturingSoon,
    hasOverpaid,
    hasOverReceived,
    awaitingMaturity:
      isMatured &&
      input.expectedMaturity !== null &&
      input.returnTotal < input.expectedMaturity,
  }
}
