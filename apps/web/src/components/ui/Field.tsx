import { ReactNode } from 'react'

interface FieldProps {
  label: string
  error?: string
  required?: boolean
  hint?: string
  children: ReactNode
}

export function Field({ label, error, required, hint, children }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text)' }}>
        {label}
        {required && <span aria-hidden style={{ color: 'var(--color-shortfall)', marginLeft: 2 }}>*</span>}
      </label>
      {hint && <span style={{ fontSize: '12px', color: '#64748b' }}>{hint}</span>}
      {children}
      {error && (
        <span role="alert" style={{ fontSize: '12px', color: 'var(--color-shortfall)' }}>
          {error}
        </span>
      )}
    </div>
  )
}
