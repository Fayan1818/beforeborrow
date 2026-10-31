import { Modal } from './Modal'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  loading,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p style={{ marginBottom: 'var(--space-2)', color: '#475569' }}>{description}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
