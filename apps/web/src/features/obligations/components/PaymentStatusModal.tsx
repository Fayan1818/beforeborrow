import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { ObligationPaymentOut, PaymentStatus, PaymentStatusUpdate } from '../api'
import { todayISO } from '@/lib/dates'
import { ApiRequestError } from '@/lib/api'

interface PaymentStatusModalProps {
  open: boolean
  onClose: () => void
  payment: ObligationPaymentOut | null
  onSubmit: (paymentId: string, data: PaymentStatusUpdate) => Promise<void>
}

export function PaymentStatusModal({
  open,
  onClose,
  payment,
  onSubmit,
}: PaymentStatusModalProps) {
  const [status, setStatus] = useState<PaymentStatus>('scheduled')
  const [actualPaidDate, setActualPaidDate] = useState(todayISO())
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (payment) {
      setStatus(payment.payment_status)
      setActualPaidDate(payment.actual_paid_date || todayISO())
    }
    setErrorMsg(null)
  }, [payment, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payment) return
    setErrorMsg(null)

    const payload: PaymentStatusUpdate = {
      payment_status: status,
      // If paid, provide actual_paid_date; otherwise null
      actual_paid_date: status === 'paid' ? actualPaidDate || null : null,
    }

    setLoading(true)
    try {
      await onSubmit(payment.id, payload)
      onClose()
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        setErrorMsg(err.error.message || 'Failed to update payment status')
      } else {
        setErrorMsg('An unexpected error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Update Payment Status">
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

        <Field label="Payment Status" required>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PaymentStatus)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              fontSize: 14,
              background: 'var(--color-bg)',
            }}
          >
            <option value="scheduled">Scheduled (Upcoming Commitment)</option>
            <option value="paid">Paid (Confirmed Settlement)</option>
            <option value="planned">Planned (Tentative Outflow)</option>
            <option value="missed">Missed (Past Due / Overdue)</option>
            <option value="disputed">Disputed (Under Review)</option>
            <option value="cancelled">Cancelled (Waived / Voided)</option>
          </select>
        </Field>

        {status === 'paid' && (
          <Field
            label="Actual Payment Date"
            required
            hint="Date the funds were debited from your bank account."
          >
            <input
              type="date"
              value={actualPaidDate}
              onChange={(e) => setActualPaidDate(e.target.value)}
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
        )}

        <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
          {status === 'paid' ? (
            <span>
              ℹ️ Marking this payment as <strong>Paid</strong> records it as a settled transaction and excludes it from future outflow projections.
            </span>
          ) : (
            <span>
              ℹ️ Only genuinely <strong>Paid</strong> transactions reduce projected commitments. Outstanding principal is not modified automatically.
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            Update Status
          </Button>
        </div>
      </form>
    </Modal>
  )
}
