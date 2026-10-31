import { ReactNode, useEffect, useRef } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      style={{
        borderRadius: 'var(--radius)',
        border: '1px solid var(--color-border)',
        padding: 'var(--space-3)',
        width: 'min(480px, 90vw)',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}
    >
      <h2 style={{ marginBottom: 'var(--space-2)' }}>{title}</h2>
      {children}
    </dialog>
  )
}
