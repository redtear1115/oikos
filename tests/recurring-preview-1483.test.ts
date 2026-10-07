import { describe, it, expect } from 'vitest'
import { previewNextDates } from '@/lib/recurring'

// #1483 — next-dates preview under the day-of-month field.

const base = { endsOn: null, intervalMonths: 1, isEdit: false, today: '2026-10-07' }

describe('previewNextDates', () => {
  it('day 31 monthly from October clamps to month end: 10/31, 11/30, 12/31', () => {
    expect(previewNextDates({ ...base, startsOn: '2026-10-07', dayOfMonth: 31 }))
      .toEqual(['2026-10-31', '2026-11-30', '2026-12-31'])
  })

  it('February: leap year gives the 29th, non-leap the 28th, and March snaps back to the 31st', () => {
    expect(previewNextDates({ ...base, today: '2028-01-10', startsOn: '2028-01-10', dayOfMonth: 31 }))
      .toEqual(['2028-01-31', '2028-02-29', '2028-03-31'])
    expect(previewNextDates({ ...base, today: '2027-01-10', startsOn: '2027-01-10', dayOfMonth: 31 }))
      .toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
  })

  it('interval 3 and 12 step by that many months', () => {
    expect(previewNextDates({ ...base, intervalMonths: 3, startsOn: '2026-10-07', dayOfMonth: 15 }))
      .toEqual(['2026-10-15', '2027-01-15', '2027-04-15'])
    expect(previewNextDates({ ...base, intervalMonths: 12, startsOn: '2026-10-07', dayOfMonth: 15 }))
      .toEqual(['2026-10-15', '2027-10-15', '2028-10-15'])
  })

  it('endsOn cuts the list, and can empty it', () => {
    expect(previewNextDates({ ...base, endsOn: '2026-11-30', startsOn: '2026-10-07', dayOfMonth: 31 }))
      .toEqual(['2026-10-31', '2026-11-30'])
    expect(previewNextDates({ ...base, endsOn: '2026-10-01', startsOn: '2026-10-07', dayOfMonth: 31 })).toEqual([])
  })

  it('create keeps today when it is the day; edit starts from the next period (> vs >=)', () => {
    const rule = { ...base, startsOn: '2026-01-07', dayOfMonth: 7 }
    expect(previewNextDates({ ...rule, isEdit: false })).toEqual(['2026-10-07', '2026-11-07', '2026-12-07'])
    expect(previewNextDates({ ...rule, isEdit: true })).toEqual(['2026-11-07', '2026-12-07', '2027-01-07'])
  })

  it('an empty / partial startsOn (cleared date input) yields nothing', () => {
    expect(previewNextDates({ ...base, startsOn: '', dayOfMonth: 7 })).toEqual([])
  })
})
