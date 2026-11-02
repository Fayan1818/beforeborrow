import { formatPaise, parseRupeesToPaise } from '@/lib/money'

interface MoneyProps {
  paise: number
  shortfall?: boolean
  className?: string
  showDecimals?: boolean
}

export function Money({ paise, shortfall = false, className, showDecimals = false }: MoneyProps) {
  if (!Number.isFinite(paise)) return <span className={className}>—</span>

  const display = formatPaise(paise, showDecimals)
  const style = shortfall && paise < 0 ? { color: 'var(--color-shortfall)' } : undefined

  return (
    <span className={className} style={style}>
      {display}
    </span>
  )
}

export function rupeesToPaise(rupees: string): number {
  return parseRupeesToPaise(rupees)
}
