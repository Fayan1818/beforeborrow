interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: '#64748b' }}>
      <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>{title}</p>
      {description && <p style={{ fontSize: '14px', marginBottom: 16 }}>{description}</p>}
      {action}
    </div>
  )
}
