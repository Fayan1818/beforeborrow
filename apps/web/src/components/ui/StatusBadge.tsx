export type Status =
  | 'ok'
  | 'caution'
  | 'shortfall'
  | 'pending'
  | 'unknown'
  | 'paid'
  | 'scheduled'
  | 'planned'
  | 'missed'
  | 'cancelled'
  | 'disputed'
  | 'active'
  | 'paused'
  | 'closed'
  | 'defaulted'

interface StatusBadgeProps {
  status: Status | string
  label?: string
}

const colorMap: Record<string, { bg: string; color: string }> = {
  ok: { bg: '#d1fae5', color: '#065f46' },
  active: { bg: '#d1fae5', color: '#065f46' },
  paid: { bg: '#d1fae5', color: '#065f46' },
  caution: { bg: '#fef3c7', color: '#92400e' },
  paused: { bg: '#fef3c7', color: '#92400e' },
  disputed: { bg: '#fef3c7', color: '#92400e' },
  shortfall: { bg: '#fee2e2', color: '#991b1b' },
  missed: { bg: '#fee2e2', color: '#991b1b' },
  defaulted: { bg: '#fee2e2', color: '#991b1b' },
  pending: { bg: '#e0e7ff', color: '#3730a3' },
  scheduled: { bg: '#e0e7ff', color: '#3730a3' },
  planned: { bg: '#f1f5f9', color: '#475569' },
  cancelled: { bg: '#f1f5f9', color: '#64748b' },
  closed: { bg: '#f1f5f9', color: '#64748b' },
  unknown: { bg: '#f1f5f9', color: '#475569' },
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const norm = status.toLowerCase()
  const { bg, color } = colorMap[norm] ?? colorMap.unknown
  const displayLabel = label ?? status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <span
      style={{
        background: bg,
        color,
        borderRadius: 999,
        padding: '2px 10px',
        fontSize: '12px',
        fontWeight: 600,
        display: 'inline-block',
        textTransform: 'capitalize',
      }}
    >
      {displayLabel}
    </span>
  )
}
