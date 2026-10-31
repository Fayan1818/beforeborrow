type Status = 'ok' | 'caution' | 'shortfall' | 'pending' | 'unknown'

interface StatusBadgeProps {
  status: Status
  label: string
}

const colorMap: Record<Status, { bg: string; color: string }> = {
  ok: { bg: '#d1fae5', color: '#065f46' },
  caution: { bg: '#fef3c7', color: '#92400e' },
  shortfall: { bg: '#fee2e2', color: '#991b1b' },
  pending: { bg: '#e0e7ff', color: '#3730a3' },
  unknown: { bg: '#f1f5f9', color: '#475569' },
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const { bg, color } = colorMap[status] ?? colorMap.unknown
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
      }}
    >
      {label}
    </span>
  )
}
