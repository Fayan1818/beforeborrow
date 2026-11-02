import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ObligationFormModal } from './ObligationFormModal'
import { ObligationOut } from '../api'
import { ApiRequestError } from '@/lib/api'

describe('ObligationFormModal', () => {
  const mockOnSubmitCreate = vi.fn()
  const mockOnSubmitUpdate = vi.fn()
  const mockOnClose = vi.fn()

  it('renders creation form with empty fields', () => {
    render(
      <ObligationFormModal
        open={true}
        onClose={mockOnClose}
        obligation={null}
        onSubmitCreate={mockOnSubmitCreate}
        onSubmitUpdate={mockOnSubmitUpdate}
      />
    )

    expect(screen.getByText('Add Financial Obligation')).toBeDefined()
    expect(screen.getByText('Lender / Provider Name')).toBeDefined()
    expect(screen.getByText('Obligation Type')).toBeDefined()
    expect(screen.getByText('Outstanding Principal (INR)')).toBeDefined()
    expect(screen.getByRole('button', { name: /Create Obligation/i })).toBeDefined()
  })

  it('validates missing provider name and prevents submit', async () => {
    const { container } = render(
      <ObligationFormModal
        open={true}
        onClose={mockOnClose}
        obligation={null}
        onSubmitCreate={mockOnSubmitCreate}
        onSubmitUpdate={mockOnSubmitUpdate}
      />
    )

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Provider name is required/i)).toBeDefined()
    })
    expect(mockOnSubmitCreate).not.toHaveBeenCalled()
  })

  it('converts principal to integer paise and creates obligation', async () => {
    mockOnSubmitCreate.mockResolvedValueOnce(undefined)

    render(
      <ObligationFormModal
        open={true}
        onClose={mockOnClose}
        obligation={null}
        onSubmitCreate={mockOnSubmitCreate}
        onSubmitUpdate={mockOnSubmitUpdate}
      />
    )

    const nameInput = screen.getByPlaceholderText(/e.g. HDFC Personal Loan/i)
    fireEvent.change(nameInput, { target: { value: 'HDFC Car Loan' } })

    const principalInput = screen.getByPlaceholderText(/e.g. 150000/i)
    fireEvent.change(principalInput, { target: { value: '350000' } })

    const submitBtn = screen.getByRole('button', { name: /Create Obligation/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockOnSubmitCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_alias: 'HDFC Car Loan',
          kind: 'term_loan',
          principal_remaining_paise: 35000000,
          status: 'active',
          payments: [],
        })
      )
    })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('populates edit form and includes expected_version', async () => {
    mockOnSubmitUpdate.mockResolvedValueOnce(undefined)

    const existingObligation: ObligationOut = {
      id: 'ob-1',
      provider_alias: 'Amazon Pay Later',
      kind: 'bnpl',
      status: 'active',
      principal_remaining_paise: 1200000,
      source: 'manual',
      source_ref: 'APL-12345',
      source_as_of: null,
      version: 2,
      created_at: '2026-01-01T00:00:00Z',
      payments: [],
    }

    render(
      <ObligationFormModal
        open={true}
        onClose={mockOnClose}
        obligation={existingObligation}
        onSubmitCreate={mockOnSubmitCreate}
        onSubmitUpdate={mockOnSubmitUpdate}
      />
    )

    expect(screen.getByText('Edit Financial Obligation')).toBeDefined()
    expect(screen.getByText(/Obligation Version:/i)).toBeDefined()

    const submitBtn = screen.getByRole('button', { name: /Save Changes/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockOnSubmitUpdate).toHaveBeenCalledWith(
        'ob-1',
        expect.objectContaining({
          provider_alias: 'Amazon Pay Later',
          kind: 'bnpl',
          principal_remaining_paise: 1200000,
          expected_version: 2,
        })
      )
    })
  })

  it('handles 409 conflict error properly on concurrent update', async () => {
    mockOnSubmitUpdate.mockRejectedValueOnce(
      new ApiRequestError(409, { code: 'STALE_VERSION', message: 'Stale version' })
    )

    const existingObligation: ObligationOut = {
      id: 'ob-1',
      provider_alias: 'Amazon Pay Later',
      kind: 'bnpl',
      status: 'active',
      principal_remaining_paise: 1200000,
      source: 'manual',
      source_ref: null,
      source_as_of: null,
      version: 1,
      created_at: '2026-01-01T00:00:00Z',
      payments: [],
    }

    render(
      <ObligationFormModal
        open={true}
        onClose={mockOnClose}
        obligation={existingObligation}
        onSubmitCreate={mockOnSubmitCreate}
        onSubmitUpdate={mockOnSubmitUpdate}
      />
    )

    const submitBtn = screen.getByRole('button', { name: /Save Changes/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(
        screen.getByText(/Conflict \(409\): This obligation was updated in another session/i)
      ).toBeDefined()
    })
  })
})
