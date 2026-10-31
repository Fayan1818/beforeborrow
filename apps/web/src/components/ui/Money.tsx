interface MoneyProps {
  paise: number
  shortfall?: boolean
  className?: string
}

const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function Money({ paise, shortfall = false, className }: MoneyProps) {
  if (!Number.isFinite(paise)) return <span className={className}>—</span>

  const display = formatter.format(paise / 100)
  const style = shortfall && paise < 0 ? { color: 'var(--color-shortfall)' } : undefined

  return (
    <span className={className} style={style}>
      {display}
    </span>
  )
}

export function rupeesToPaise(rupees: string): number {
  const n = parseFloat(rupees.replace(/,/g, ''))
  if (!Number.isFinite(n)) throw new Error('Invalid amount')
  return Math.round(n * 100)
}
