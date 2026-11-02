import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import {
  CashflowRuleIn,
  CashflowRuleUpdate,
  CashflowRuleOut,
  CashflowDirection,
  CashflowFrequency,
  CashflowTiming,
} from '../api'
import { parseRupeesToPaise, paiseToRupeesInput } from '@/lib/money'
import { ApiRequestError } from '@/lib/api'

interface CashflowRuleModalProps {
  open: boolean
  onClose: () => void
  rule: CashflowRuleOut | null
  defaultDirection?: CashflowDirection
  profileDataVersion: number
  onSubmitCreate: (data: CashflowRuleIn) => Promise<void>
  onSubmitUpdate: (id: string, data: CashflowRuleUpdate) => Promise<void>
}

export function CashflowRuleModal({
  open,
  onClose,
  rule,
  defaultDirection = 'expense',
  profileDataVersion,
  onSubmitCreate,
  onSubmitUpdate,
}: CashflowRuleModalProps) {
  const isEditing = Boolean(rule)

  const [category, setCategory] = useState('')
  const [direction, setDirection] = useState<CashflowDirection>(defaultDirection)
  const [amountRupees, setAmountRupees] = useState('')
  const [frequency, setFrequency] = useState<CashflowFrequency>('monthly')
  const [timing, setTiming] = useState<CashflowTiming>('known')
  const [dueDate, setDueDate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (rule) {
      setCategory(rule.category)
      setDirection(rule.direction)
      setAmountRupees(paiseToRupeesInput(rule.amount_paise))
      setFrequency(rule.frequency)
      setTiming(rule.timing)
      setDueDate(rule.due_date || '')
      setStartDate(rule.start_date || '')
      setEndDate(rule.end_date || '')
      setNotes(rule.notes || '')
    } else {
      setCategory('')
      setDirection(defaultDirection)
      setAmountRupees('')
      setFrequency('monthly')
      setTiming('known')
      setDueDate('')
      setStartDate('')
      setEndDate('')
      setNotes('')
    }
    setErrorMsg(null)
    setFieldErrors({})
  }, [rule, defaultDirection, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setFieldErrors({})

    if (!category.trim()) {
      setFieldErrors((prev) => ({ ...prev, category: 'Category name is required' }))
      return
    }

    let amountPaise = 0
    try {
      amountPaise = parseRupeesToPaise(amountRupees)
    } catch (err: unknown) {
      setFieldErrors((prev) => ({
        ...prev,
        amount: err instanceof Error ? err.message : 'Invalid amount',
      }))
      return
    }

    setLoading(true)
    try {
      if (isEditing && rule) {
        const payload: CashflowRuleUpdate = {
          category: category.trim(),
          direction,
          amount_paise: amountPaise,
          frequency,
          timing,
          due_date: dueDate || null,
          start_date: startDate || null,
          end_date: endDate || null,
          notes: notes.trim() || null,
          expected_data_version: profileDataVersion,
        }
        await onSubmitUpdate(rule.id, payload)
      } else {
        const payload: CashflowRuleIn = {
          category: category.trim(),
          direction,
          amount_paise: amountPaise,
          frequency,
          timing,
          due_date: dueDate || null,
          start_date: startDate || null,
          end_date: endDate || null,
          notes: notes.trim() || null,
        }
        await onSubmitCreate(payload)
      }
      onClose()
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        if (err.status === 409) {
          setErrorMsg(
            'Conflict (409): Your financial profile version has changed concurrently. Please reload to fetch the latest state.'
          )
        } else if (err.status === 422 && err.error.fields) {
          setFieldErrors(err.error.fields)
          setErrorMsg(err.error.message || 'Validation error')
        } else {
          setErrorMsg(err.error.message || 'Failed to save cashflow rule')
        }
      } else {
        setErrorMsg('An unexpected error occurred while saving rule')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `Edit Cashflow Rule` : `Add Recurring ${direction === 'income' ? 'Income' : 'Expense'}`}
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Direction" required>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as CashflowDirection)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 14,
                background: 'var(--color-bg)',
              }}
            >
              <option value="income">Income (Cash Inflow)</option>
              <option value="expense">Expense (Cash Outflow)</option>
            </select>
          </Field>

          <Field label="Frequency" required>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as CashflowFrequency)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 14,
                background: 'var(--color-bg)',
              }}
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly (Every 2 weeks)</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
              <option value="once">One-time</option>
            </select>
          </Field>
        </div>

        <Field label="Category / Source Name" required error={fieldErrors.category}>
          <input
            type="text"
            placeholder={direction === 'income' ? 'e.g. Salary, Consulting' : 'e.g. House Rent, Groceries'}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
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
          <Field label="Amount per Occurrence (INR)" required error={fieldErrors.amount}>
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
                placeholder="e.g. 50000"
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

          <Field label="Timing Confidence" required>
            <select
              value={timing}
              onChange={(e) => setTiming(e.target.value as CashflowTiming)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 14,
                background: 'var(--color-bg)',
              }}
            >
              <option value="known">Known (Exact Date & Amount)</option>
              <option value="estimated">Estimated (Projected)</option>
            </select>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Anchor Due Date" hint="Day of recurring transaction">
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
            />
          </Field>
          <Field label="Start Date" hint="Optional series start">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
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

        <Field label="End Date (Optional)" hint="Leave blank if ongoing indefinite recurrence">
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              fontSize: 14,
            }}
          />
        </Field>

        <Field label="Notes (Optional)">
          <input
            type="text"
            placeholder="e.g. Credited on 1st of month by employer"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              fontSize: 14,
            }}
          />
        </Field>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            {isEditing ? 'Save Changes' : 'Add Rule'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
