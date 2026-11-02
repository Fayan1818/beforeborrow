import { describe, it, expect } from 'vitest'
import { formatFinancialDate, todayISO } from './dates'

describe('Date utilities: formatFinancialDate', () => {
  it('formats standard financial date without drift', () => {
    expect(formatFinancialDate('2026-11-05')).toBe('5 Nov 2026')
    expect(formatFinancialDate('2026-01-01')).toBe('1 Jan 2026')
    expect(formatFinancialDate('2026-12-31')).toBe('31 Dec 2026')
  })

  it('handles month end dates accurately without permanent drift', () => {
    expect(formatFinancialDate('2026-01-31')).toBe('31 Jan 2026')
    expect(formatFinancialDate('2026-02-28')).toBe('28 Feb 2026')
    expect(formatFinancialDate('2024-02-29')).toBe('29 Feb 2024') // Leap year
    expect(formatFinancialDate('2026-03-31')).toBe('31 Mar 2026')
  })

  it('handles empty, null, undefined, and invalid inputs gracefully', () => {
    expect(formatFinancialDate(null)).toBe('—')
    expect(formatFinancialDate(undefined)).toBe('—')
    expect(formatFinancialDate('')).toBe('—')
    expect(formatFinancialDate('invalid-date')).toBe('invalid-date')
  })
})

describe('Date utilities: todayISO', () => {
  it('returns valid YYYY-MM-DD date string', () => {
    const today = todayISO()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
