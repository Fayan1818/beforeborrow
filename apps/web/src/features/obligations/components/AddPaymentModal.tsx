import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { ObligationPaymentIn, PaymentStatus } from '../api'
import { parseRupeesToPaise } from '@/lib/money'
import { todayISO } from '@/lib/dates'
import { ApiRequestError } from '@/lib/api'

interface AddPaymentModalProps {
  open: boolean
  onClose: () => void
  obligationId: string
  onSubmit: (data: ObligationPaymentIn) => Promise<void>
}

export function AddPaymentModal({
  open,
  onClose,
  onSubmit,
}: AddPaymentModalProps) {
  const [dueDate, setDueDate] = useState('')
  const [amountRupees, setAmountRupees] = useState('')
  const [interestRupees, setInterestRupees] = useState('')
  const [feeRupees, setFeeRupees] = useState('')
  const [status, setStatus] = useState<PaymentStatus>('scheduled')
  const [actualPaidDate, setActualPaidDate] = useState(todayISO())

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setFieldErrors({})

    if (!dueDate) {
      setFieldErrors((prev) => ({ ...prev, due_date: 'Due date is required' }))
      return
    }

    let amountPaise = 0
    try {
      amountPaise = parseRupeesToPaise(amountRupees)
    } catch (err: unknown) {
      setFieldErrors((prev) => ({
        ...prev,
        amount: err instanceof Error ? err.message : 'Invalid payment amount',
      }))
      return
    }

    let interestPaise = 0
    if (interestRupees.trim()) {
      try {
        interestPaise = parseRupeesToPaise(interestRupees)
      } catch {
        setFieldErrors((prev) => ({ ...prev, interest: 'Invalid interest amount' }))
        return
      }
    }

    let feePaise = 0
    if (feeRupees.trim()) {
      try {
        feePaise = parseRupeesToPaise(feeRupees)
      } catch {
        setFieldErrors((prev) => ({ ...prev, fee: 'Invalid fee amount' }))
        return
      }
    }

    const payload: ObligationPaymentIn = {
      due_date: dueDate,
      amount_paise: amountPaise,
      interest_paise: interestPaise,
      fee_paise: feePaise,
      payment_status: status,
      actual_paid_date: status === 'paid' ? actualPaidDate || null : null,
    }

    setLoading(true)
    try {
      await onSubmit(payload)
      onClose()
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        setErrorMsg(err.error.message || 'Failed to add payment')
      } else {
        setErrorMsg('An unexpected error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Scheduled / Repayment Installment">
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Due Date" required error={fieldErrors.due_date}>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
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

          <Field label="Status" required>
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
              <option value="scheduled">Scheduled</option>
              <option value="paid">Paid</option>
              <option value="planned">Planned</option>
              <option value="missed">Missed</option>
              <option value="disputed">Disputed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
        </div>

        <Field label="Total Installment Amount (INR)" required error={fieldErrors.amount}>
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
              placeholder="e.g. 5000"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Interest Portion (INR)" hint="Optional breakdown">
            <input
              type="text"
              placeholder="0"
              value={interestRupees}
              onChange={(e) => setInterestRupees(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 14,
              }}
            />
          </Field>
          <Field label="Fee / Charges (INR)" hint="Optional breakdown">
            <input
              type="text"
              placeholder="0"
              value={feeRupees}
              onChange={(e) => setFeeRupees(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 14,
              }}
            />
          </Field>
        </div>

        {status === 'paid' && (
          <Field label="Actual Date Paid" required>
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

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            Add Installment
          </Button>
        </div>
      </form>
    </Modal>
  )
}
