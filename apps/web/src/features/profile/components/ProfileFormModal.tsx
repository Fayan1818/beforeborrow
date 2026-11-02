import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { ProfileIn, ProfileOut } from '../api'
import { parseRupeesToPaise, paiseToRupeesInput } from '@/lib/money'
import { todayISO } from '@/lib/dates'
import { ApiRequestError } from '@/lib/api'

interface ProfileFormModalProps {
  open: boolean
  onClose: () => void
  profile: ProfileOut | null
  onSubmit: (data: ProfileIn) => Promise<void>
}

export function ProfileFormModal({ open, onClose, profile, onSubmit }: ProfileFormModalProps) {
  const isEditing = Boolean(profile)

  const [openingCashRupees, setOpeningCashRupees] = useState(
    profile ? paiseToRupeesInput(profile.opening_cash_paise) : ''
  )
  const [balanceAsOf, setBalanceAsOf] = useState(profile ? profile.balance_as_of : todayISO())
  const [reserveFloorRupees, setReserveFloorRupees] = useState(
    profile ? paiseToRupeesInput(profile.reserve_floor_paise) : '0'
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setFieldErrors({})

    let openingPaise = 0
    let reservePaise = 0

    try {
      openingPaise = parseRupeesToPaise(openingCashRupees)
    } catch (err: unknown) {
      setFieldErrors((prev) => ({
        ...prev,
        opening_cash: err instanceof Error ? err.message : 'Invalid opening cash',
      }))
      return
    }

    try {
      reservePaise = parseRupeesToPaise(reserveFloorRupees || '0')
    } catch (err: unknown) {
      setFieldErrors((prev) => ({
        ...prev,
        reserve_floor: err instanceof Error ? err.message : 'Invalid reserve floor',
      }))
      return
    }

    if (!balanceAsOf) {
      setFieldErrors((prev) => ({ ...prev, balance_as_of: 'As-of date is required' }))
      return
    }

    const payload: ProfileIn = {
      opening_cash_paise: openingPaise,
      balance_as_of: balanceAsOf,
      reserve_floor_paise: reservePaise,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      expected_version: profile ? profile.data_version : undefined,
    }

    setLoading(true)
    try {
      await onSubmit(payload)
      onClose()
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        if (err.status === 409) {
          setErrorMsg(
            'Conflict (409): The profile was modified concurrently in another session. Please reload to see the latest version.'
          )
        } else if (err.status === 422 && err.error.fields) {
          setFieldErrors(err.error.fields)
          setErrorMsg(err.error.message || 'Validation error')
        } else {
          setErrorMsg(err.error.message || 'Failed to save profile')
        }
      } else {
        setErrorMsg('An unexpected error occurred while saving profile')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Financial Profile Baseline' : 'Initialize Financial Profile'}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

        <Field
          label="Opening Cash Balance (INR)"
          required
          hint="Total available liquid bank cash as of the opening date."
          error={fieldErrors.opening_cash}
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
              placeholder="e.g. 50000 or 50000.50"
              value={openingCashRupees}
              onChange={(e) => setOpeningCashRupees(e.target.value)}
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

        <Field
          label="Balance As-Of Date"
          required
          hint="The date when opening cash was verified in your account."
          error={fieldErrors.balance_as_of}
        >
          <input
            type="date"
            value={balanceAsOf}
            onChange={(e) => setBalanceAsOf(e.target.value)}
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

        <Field
          label="Emergency Reserve Floor (INR)"
          hint="Minimum safety buffer you aim to maintain in your account (defaults to ₹0)."
          error={fieldErrors.reserve_floor}
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
              placeholder="e.g. 10000"
              value={reserveFloorRupees}
              onChange={(e) => setReserveFloorRupees(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 28px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 14,
              }}
            />
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Currency">
            <input
              type="text"
              value="INR (Indian Rupee)"
              disabled
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: '#f8fafc',
                color: '#64748b',
                fontSize: 13,
              }}
            />
          </Field>
          <Field label="Timezone">
            <input
              type="text"
              value="Asia/Kolkata (+05:30)"
              disabled
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: '#f8fafc',
                color: '#64748b',
                fontSize: 13,
              }}
            />
          </Field>
        </div>

        {isEditing && profile && (
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Data Version for concurrency: <strong>{profile.data_version}</strong>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            {isEditing ? 'Save Changes' : 'Initialize Profile'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
