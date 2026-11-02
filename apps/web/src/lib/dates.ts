/**
 * Date utilities for BeforeBorrow.
 *
 * - Financial due dates are YYYY-MM-DD date values (no time component).
 * - created_at / timestamps are ISO 8601 UTC.
 * - All display uses Asia/Kolkata timezone.
 *
 * Owner: A
 */
const TIMEZONE = 'Asia/Kolkata'

export function formatFinancialDate(isoDate: string | null | undefined): string {
  if (!isoDate || typeof isoDate !== 'string') return '—'
  const parts = isoDate.split('-')
  if (parts.length < 3) return isoDate
  const [year, month, day] = parts.map(Number)
  if (isNaN(year) || isNaN(month) || isNaN(day)) return isoDate
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(d)
}

/**
 * Format a UTC ISO timestamp for display.
 * Example: "2026-11-01T10:30:00Z" → "1 Nov 2026, 4:00 pm"
 */
export function formatTimestamp(isoUtc: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TIMEZONE,
  }).format(new Date(isoUtc))
}

/**
 * Return today's date as YYYY-MM-DD in Asia/Kolkata.
 */
export function todayISO(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE }).format(new Date())
}

/**
 * Return { from: "YYYY-MM-01", to: "YYYY-MM-DD" } for a given 1-indexed month and year.
 */
export function getMonthRange(year: number, month: number): { from: string; to: string } {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const dd = String(lastDay).padStart(2, '0')
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${dd}`,
  }
}

/**
 * Format Year and 1-indexed Month (e.g., 2026, 11) as "November 2026".
 */
export function formatMonthYear(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0))
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(d)
}
