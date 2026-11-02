import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PaymentStatusModal } from './PaymentStatusModal'
import { ObligationPaymentOut } from '../api'

describe('PaymentStatusModal', () => {
  const mockOnSubmit = vi.fn()
  const mockOnClose = vi.fn()

  const samplePayment: ObligationPaymentOut = {
    id: 'pay-123',
    obligation_id: 'ob-1',
    owner_id: 'user-1',
    due_date: '2026-02-15',
    amount_paise: 500000,
    interest_paise: 50000,
    fee_paise: 0,
    payment_status: 'scheduled',
    actual_paid_date: null,
    created_at: '2026-01-01T00:00:00Z',
  }

  it('renders modal with current payment status', () => {
    render(
      <PaymentStatusModal
        open={true}
        onClose={mockOnClose}
        payment={samplePayment}
        onSubmit={mockOnSubmit}
      />
    )

    expect(screen.getByText('Update Payment Status')).toBeDefined()
    expect(screen.getByText('Payment Status')).toBeDefined()
    expect(screen.getByRole('button', { name: /Update Status/i })).toBeDefined()
  })

  it('reveals actual payment date input when status is changed to paid', async () => {
    mockOnSubmit.mockResolvedValueOnce(undefined)

    render(
      <PaymentStatusModal
        open={true}
        onClose={mockOnClose}
        payment={samplePayment}
        onSubmit={mockOnSubmit}
      />
    )

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'paid' } })

    expect(screen.getByText('Actual Payment Date')).toBeDefined()

    const submitBtn = screen.getByRole('button', { name: /Update Status/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        'pay-123',
        expect.objectContaining({
          payment_status: 'paid',
          actual_paid_date: expect.any(String),
        })
      )
    })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('clears actual_paid_date when status is changed from paid to missed/cancelled/scheduled', async () => {
    mockOnSubmit.mockResolvedValueOnce(undefined)

    const paidPayment: ObligationPaymentOut = {
      ...samplePayment,
      payment_status: 'paid',
      actual_paid_date: '2026-02-14',
    }

    render(
      <PaymentStatusModal
        open={true}
        onClose={mockOnClose}
        payment={paidPayment}
        onSubmit={mockOnSubmit}
      />
    )

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'missed' } })

    const submitBtn = screen.getByRole('button', { name: /Update Status/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        'pay-123',
        expect.objectContaining({
          payment_status: 'missed',
          actual_paid_date: null,
        })
      )
    })
  })
})
