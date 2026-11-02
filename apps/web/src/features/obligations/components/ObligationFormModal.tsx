import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import {
  ObligationIn,
  ObligationUpdate,
  ObligationOut,
  ObligationKind,
  ObligationStatus,
} from '../api'
import { parseRupeesToPaise, paiseToRupeesInput } from '@/lib/money'
import { ApiRequestError } from '@/lib/api'

interface ObligationFormModalProps {
  open: boolean
  onClose: () => void
  obligation: ObligationOut | null
  onSubmitCreate: (data: ObligationIn) => Promise<void>
  onSubmitUpdate: (id: string, data: ObligationUpdate) => Promise<void>
}

export function ObligationFormModal({
  open,
  onClose,
  obligation,
  onSubmitCreate,
  onSubmitUpdate,
}: ObligationFormModalProps) {
  const isEditing = Boolean(obligation)

  const [providerAlias, setProviderAlias] = useState('')
  const [kind, setKind] = useState<ObligationKind>('term_loan')
  const [principalRupees, setPrincipalRupees] = useState('')
  const [status, setStatus] = useState<ObligationStatus>('active')
  const [sourceRef, setSourceRef] = useState('')

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (obligation) {
      setProviderAlias(obligation.provider_alias)
      setKind(obligation.kind)
      setPrincipalRupees(paiseToRupeesInput(obligation.principal_remaining_paise))
      setStatus(obligation.status)
      setSourceRef(obligation.source_ref || '')
    } else {
      setProviderAlias('')
      setKind('term_loan')
      setPrincipalRupees('')
      setStatus('active')
      setSourceRef('')
    }
    setErrorMsg(null)
    setFieldErrors({})
  }, [obligation, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setFieldErrors({})

    if (!providerAlias.trim()) {
      setFieldErrors((prev) => ({ ...prev, provider_alias: 'Provider name is required' }))
      return
    }

    let principalPaise = 0
    try {
      principalPaise = parseRupeesToPaise(principalRupees || '0')
    } catch (err: unknown) {
      setFieldErrors((prev) => ({
        ...prev,
        principal: err instanceof Error ? err.message : 'Invalid principal amount',
      }))
      return
    }

    setLoading(true)
    try {
      if (isEditing && obligation) {
        const payload: ObligationUpdate = {
          provider_alias: providerAlias.trim(),
          kind,
          principal_remaining_paise: principalPaise,
          status,
          source_ref: sourceRef.trim() || null,
          expected_version: obligation.version,
        }
        await onSubmitUpdate(obligation.id, payload)
      } else {
        const payload: ObligationIn = {
          provider_alias: providerAlias.trim(),
          kind,
          principal_remaining_paise: principalPaise,
          status,
          source_ref: sourceRef.trim() || null,
          payments: [],
        }
        await onSubmitCreate(payload)
      }
      onClose()
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        if (err.status === 409) {
          setErrorMsg(
            'Conflict (409): This obligation was updated in another session. Please reload to see the latest version.'
          )
        } else if (err.status === 422 && err.error.fields) {
          setFieldErrors(err.error.fields)
          setErrorMsg(err.error.message || 'Validation error')
        } else {
          setErrorMsg(err.error.message || 'Failed to save obligation')
        }
      } else {
        setErrorMsg('An unexpected error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Financial Obligation' : 'Add Financial Obligation'}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#ef4444',
              fontSize: 13,
            }}
          >
            {errorMsg}
          </div>
        )}

        <Field label="Lender / Provider Name" required error={fieldErrors.provider_alias}>
          <input
            type="text"
            placeholder="e.g. HDFC Personal Loan, Amazon Pay Later, SBI Credit Card"
            value={providerAlias}
            onChange={(e) => setProviderAlias(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              fontSize: 14,
            }}
            required
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Obligation Type" required>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ObligationKind)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 14,
                background: 'var(--color-bg)',
              }}
            >
              <option value="term_loan">Term Loan (Personal / Auto / Home)</option>
              <option value="bnpl">BNPL (Buy Now Pay Later)</option>
              <option value="card">Credit Card Outstanding</option>
              <option value="other">Other Debt</option>
            </select>
          </Field>

          <Field label="Status" required>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ObligationStatus)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 14,
                background: 'var(--color-bg)',
              }}
            >
              <option value="active">Active (Ongoing Repayment)</option>
              <option value="paused">Paused (Moratorium)</option>
              <option value="paid">Paid Off (Complete)</option>
              <option value="closed">Closed / Settled</option>
              <option value="defaulted">Defaulted (Delinquent)</option>
            </select>
          </Field>
        </div>

        <Field
          label="Outstanding Principal (INR)"
          required
          hint="Current remaining balance owed to the lender."
          error={fieldErrors.principal}
        >
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: 8,
                color: '#64748b',
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              ₹
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 150000"
              value={principalRupees}
              onChange={(e) => setPrincipalRupees(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 28px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 14,
              }}
              required
            />
          </div>
        </Field>

        <Field label="Account / Reference Number (Optional)">
          <input
            type="text"
            placeholder="e.g. LN-8839201"
            value={sourceRef}
            onChange={(e) => setSourceRef(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              fontSize: 14,
            }}
          />
        </Field>

        {isEditing && obligation && (
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Obligation Version: <strong>{obligation.version}</strong>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            {isEditing ? 'Save Changes' : 'Create Obligation'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
