import { formatFinancialDate, formatTimestamp } from '@/lib/dates'

interface DateTextProps {
  value: string
  type?: 'date' | 'timestamp'
  className?: string
}

export function DateText({ value, type = 'date', className }: DateTextProps) {
  const display = type === 'timestamp' ? formatTimestamp(value) : formatFinancialDate(value)
  return <time dateTime={value} className={className}>{display}</time>
}
