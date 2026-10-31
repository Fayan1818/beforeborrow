type Source = 'manual' | 'csv_import' | 'mock_aa'

interface SourceBadgeProps {
  source: Source
}

const config: Record<Source, { label: string; color: string }> = {
  manual: { label: 'Manual entry', color: '#475569' },
  csv_import: { label: 'CSV import', color: '#1d4ed8' },
  mock_aa: { label: 'DEMO — simulated', color: '#b45309' },
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const { label, color } = config[source] ?? config.manual
  return (
    <span style={{ fontSize: '11px', color, fontWeight: 500 }}>
      {label}
    </span>
  )
}
