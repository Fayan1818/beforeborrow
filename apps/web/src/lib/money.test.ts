import { describe, it, expect } from 'vitest'
import { parseRupeesToPaise, formatPaise, paiseToRupeesInput } from './money'

describe('Money utilities: parseRupeesToPaise', () => {
  it('converts whole rupee amounts to integer paise', () => {
    expect(parseRupeesToPaise('100')).toBe(10000)
    expect(parseRupeesToPaise('1')).toBe(100)
    expect(parseRupeesToPaise('50000')).toBe(5000000)
  })

  it('converts rupee amounts with 2 decimal places to integer paise without floating-point errors', () => {
    expect(parseRupeesToPaise('1.15')).toBe(115)
    expect(parseRupeesToPaise('10.99')).toBe(1099)
    expect(parseRupeesToPaise('25000.50')).toBe(2500050)
    expect(parseRupeesToPaise('0.05')).toBe(5)
    expect(parseRupeesToPaise('0.01')).toBe(1)
  })

  it('converts single decimal place values correctly', () => {
    expect(parseRupeesToPaise('5.5')).toBe(550)
    expect(parseRupeesToPaise('0.1')).toBe(10)
  })

  it('handles zero values', () => {
    expect(parseRupeesToPaise('0')).toBe(0)
    expect(parseRupeesToPaise('0.00')).toBe(0)
    expect(parseRupeesToPaise('0.0')).toBe(0)
  })

  it('rejects empty inputs', () => {
    expect(() => parseRupeesToPaise('')).toThrow(/cannot be empty/)
    expect(() => parseRupeesToPaise('   ')).toThrow(/cannot be empty/)
  })

  it('handles comma-formatted strings', () => {
    expect(parseRupeesToPaise('1,50,000')).toBe(15000000)
    expect(parseRupeesToPaise('10,000.50')).toBe(1000050)
  })

  it('rejects negative numbers', () => {
    expect(() => parseRupeesToPaise('-100')).toThrow(/cannot be negative/)
  })

  it('rejects invalid number strings', () => {
    expect(() => parseRupeesToPaise('abc')).toThrow(/valid rupee amount/)
    expect(() => parseRupeesToPaise('12.34.56')).toThrow(/valid rupee amount/)
  })

  it('rejects more than 2 decimal places', () => {
    expect(() => parseRupeesToPaise('10.123')).toThrow(/more than 2 decimal places/)
  })
})

describe('Money utilities: formatPaise', () => {
  it('formats amounts in Indian numbering format', () => {
    expect(formatPaise(10000000)).toBe('₹1,00,000') // 1 lakh
    expect(formatPaise(1000000000)).toBe('₹1,00,00,000') // 1 crore
    expect(formatPaise(50000)).toBe('₹500')
    expect(formatPaise(0)).toBe('₹0')
  })

  it('handles fractional paise with decimals', () => {
    expect(formatPaise(1050, true)).toBe('₹10.50')
    expect(formatPaise(1000, true)).toBe('₹10.00')
    expect(formatPaise(1025)).toBe('₹10.25')
  })

  it('handles negative paise amounts', () => {
    const formatted = formatPaise(-50000)
    expect(formatted).toContain('-₹')
    expect(formatted).toContain('500')
  })
})

describe('Money utilities: paiseToRupeesInput', () => {
  it('converts integer paise back to input string without precision loss', () => {
    expect(paiseToRupeesInput(10000)).toBe('100')
    expect(paiseToRupeesInput(1050)).toBe('10.50')
    expect(paiseToRupeesInput(1005)).toBe('10.05')
    expect(paiseToRupeesInput(0)).toBe('0')
  })
})
