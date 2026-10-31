import { Button } from './Button'

interface ErrorPanelProps {
  message: string
  requestId?: string
  onRetry?: () => void
}

export function ErrorPanel({ message, requestId, onRetry }: ErrorPanelProps) {
  return (
    <div
      role="alert"
      style={{
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <p style={{ color: 'var(--color-shortfall)', fontWeight: 500 }}>{message}</p>
      {requestId && (
        <p style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
          request_id: {requestId}
        </p>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
