/**
 * Precision money formatting and parsing utilities for BeforeBorrow.
 *
 * Backend monetary values are ALWAYS integer paise (1 INR = 100 paise).
 * All conversions between Rupee display strings and integer paise avoid
 * IEEE 754 floating-point precision errors using exact string splitting.
 */

const inrFormatterNoDecimal = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrFormatterWithDecimal = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Format integer paise to Indian Rupee currency string.
 * Example: 5000000 -> "₹50,000" (or "₹50,000.50" if paise has fraction).
 */
export function formatPaise(paise: number, alwaysShowDecimals = false): string {
  if (!Number.isFinite(paise)) return '—'
  const rupees = paise / 100
  if (alwaysShowDecimals || paise % 100 !== 0) {
    return inrFormatterWithDecimal.format(rupees)
  }
  return inrFormatterNoDecimal.format(rupees)
}

/**
 * Safely parse a user-entered Rupee string into exact integer paise.
 * Rejects negative numbers, multiple decimals, and more than 2 decimal digits.
 *
 * Examples:
 *   "5000"      -> 500000
 *   "5,000.5"   -> 500050
 *   "5,000.50"  -> 500050
 *   "0"         -> 0
 */
export function parseRupeesToPaise(input: string): number {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string')
  }

  const clean = input.replace(/,/g, '').trim()
  if (!clean) {
    throw new Error('Amount cannot be empty')
  }

  if (clean.startsWith('-')) {
    throw new Error('Amount cannot be negative')
  }

  if (clean.includes('.')) {
    const parts = clean.split('.')
    if (parts.length > 2) {
      throw new Error('Please enter a valid rupee amount')
    }
    if (parts[1].length > 2) {
      throw new Error('Amount cannot have more than 2 decimal places')
    }
  }

  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    throw new Error('Please enter a valid rupee amount')
  }

  const [wholePart, fracPart = ''] = clean.split('.')
  const wholePaise = parseInt(wholePart, 10) * 100
  const fracPaise = parseInt(fracPart.padEnd(2, '0').slice(0, 2), 10)

  return wholePaise + fracPaise
}

/**
 * Convert integer paise to a plain string representation in Rupees for input fields.
 * Example: 500050 -> "5000.50", 500000 -> "5000"
 */
export function paiseToRupeesInput(paise: number): string {
  if (!Number.isFinite(paise) || paise < 0) return '0'
  const whole = Math.floor(paise / 100)
  const frac = paise % 100
  if (frac === 0) return whole.toString()
  return `${whole}.${frac.toString().padStart(2, '0')}`
}
