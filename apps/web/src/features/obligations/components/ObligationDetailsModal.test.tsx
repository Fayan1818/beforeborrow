import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ObligationDetailsModal } from './ObligationDetailsModal'
import { ObligationOut } from '../api'

describe('ObligationDetailsModal', () => {
  const mockOnClose = vi.fn()
  const mockOnUpdatePaymentStatus = vi.fn()
  const mockOnAddPayment = vi.fn()

  const sampleObligation: ObligationOut = {
    id: 'ob-1',
    provider_alias: 'Axis Bank Loan',
    kind: 'term_loan',
    status: 'active',
    principal_remaining_paise: 20000000,
    source: 'manual',
    source_ref: 'AXIS-9921',
    source_as_of: null,
    version: 3,
    created_at: '2026-01-01T00:00:00Z',
    payments: [
      {
        id: 'p1',
        obligation_id: 'ob-1',
        owner_id: 'user-1',
        due_date: '2026-01-10',
        amount_paise: 2500000,
        interest_paise: 500000,
        fee_paise: 0,
        payment_status: 'paid',
        actual_paid_date: '2026-01-10',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'p2',
        obligation_id: 'ob-1',
        owner_id: 'user-1',
        due_date: '2026-02-10',
        amount_paise: 2500000,
        interest_paise: 500000,
        fee_paise: 0,
        payment_status: 'scheduled',
        actual_paid_date: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'p3',
        obligation_id: 'ob-1',
        owner_id: 'user-1',
        due_date: '2026-03-10',
        amount_paise: 2500000,
        interest_paise: 500000,
        fee_paise: 0,
        payment_status: 'planned',
        actual_paid_date: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
  }

  it('renders modal with summary and repayment installments', () => {
    render(
      <ObligationDetailsModal
        open={true}
        onClose={mockOnClose}
        obligation={sampleObligation}
        onUpdatePaymentStatus={mockOnUpdatePaymentStatus}
        onAddPayment={mockOnAddPayment}
      />
    )

    expect(screen.getByText(/Axis Bank Loan — Details & Repayment Schedule/i)).toBeDefined()
    expect(screen.getByText(/Outstanding Principal/i)).toBeDefined()
    expect(screen.getByText(/Settled to Date/i)).toBeDefined()
    expect(screen.getByText(/Repayment Installments \(3\)/i)).toBeDefined()

    // Confirmed Paid
    expect(screen.getByText('Paid')).toBeDefined()
    // Upcoming Scheduled & Planned
    expect(screen.getByText('Scheduled')).toBeDefined()
    expect(screen.getByText('Planned')).toBeDefined()
  })

  it('correctly calculates settled payments vs remaining commitments', () => {
    render(
      <ObligationDetailsModal
        open={true}
        onClose={mockOnClose}
        obligation={sampleObligation}
        onUpdatePaymentStatus={mockOnUpdatePaymentStatus}
        onAddPayment={mockOnAddPayment}
      />
    )

    // Settled is 25,000 (from 1 paid payment of 2500000 paise)
    expect(screen.getAllByText('₹25,000').length).toBeGreaterThanOrEqual(1)

    // Remaining scheduled commitments is 50,000 (from 2 upcoming payments of 2500000 paise each)
    expect(screen.getByText('₹50,000')).toBeDefined()
  })
})
