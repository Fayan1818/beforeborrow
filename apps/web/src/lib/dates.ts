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

/**
 * Format a YYYY-MM-DD financial date for display.
 * Example: "2026-11-05" → "5 Nov 2026"
 */
export function formatFinancialDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
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
