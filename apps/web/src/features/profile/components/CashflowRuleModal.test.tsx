import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CashflowRuleModal } from './CashflowRuleModal'
import { CashflowRuleOut } from '../api'
import { ApiRequestError } from '@/lib/api'

describe('CashflowRuleModal', () => {
  const mockOnSubmitCreate = vi.fn()
  const mockOnSubmitUpdate = vi.fn()
  const mockOnClose = vi.fn()

  it('renders modal in create mode with default direction', () => {
    render(
      <CashflowRuleModal
        open={true}
        onClose={mockOnClose}
        rule={null}
        defaultDirection="income"
        profileDataVersion={2}
        onSubmitCreate={mockOnSubmitCreate}
        onSubmitUpdate={mockOnSubmitUpdate}
      />
    )

    expect(screen.getByText('Add Recurring Income')).toBeDefined()
    expect(screen.getByText('Category / Source Name')).toBeDefined()
    expect(screen.getByPlaceholderText(/e.g. Salary, Consulting/i)).toBeDefined()
  })

  it('validates empty category and invalid amount', async () => {
    const { container } = render(
      <CashflowRuleModal
        open={true}
        onClose={mockOnClose}
        rule={null}
        profileDataVersion={2}
        onSubmitCreate={mockOnSubmitCreate}
        onSubmitUpdate={mockOnSubmitUpdate}
      />
    )

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Category name is required/i)).toBeDefined()
    })
    expect(mockOnSubmitCreate).not.toHaveBeenCalled()
  })

  it('creates a new rule with amount converted to paise', async () => {
    mockOnSubmitCreate.mockResolvedValueOnce(undefined)

    render(
      <CashflowRuleModal
        open={true}
        onClose={mockOnClose}
        rule={null}
        defaultDirection="expense"
        profileDataVersion={1}
        onSubmitCreate={mockOnSubmitCreate}
        onSubmitUpdate={mockOnSubmitUpdate}
      />
    )

    const categoryInput = screen.getByPlaceholderText(/e.g. House Rent, Groceries/i)
    fireEvent.change(categoryInput, { target: { value: 'House Rent' } })

    const amountInput = screen.getByPlaceholderText(/e.g. 50000/i)
    fireEvent.change(amountInput, { target: { value: '25000' } })

    const submitBtn = screen.getByRole('button', { name: /Add Rule/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockOnSubmitCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'House Rent',
          direction: 'expense',
          amount_paise: 2500000,
          frequency: 'monthly',
          timing: 'known',
        })
      )
    })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('updates an existing rule including expected_data_version', async () => {
    mockOnSubmitUpdate.mockResolvedValueOnce(undefined)

    const existingRule: CashflowRuleOut = {
      id: 'rule-123',
      owner_id: 'user-1',
      category: 'Freelance Design',
      direction: 'income',
      amount_paise: 4000000,
      frequency: 'monthly',
      timing: 'estimated',
      due_date: '2026-02-05',
      start_date: null,
      end_date: null,
      notes: 'Client retainer',
      created_at: '2026-01-01T00:00:00Z',
    }

    render(
      <CashflowRuleModal
        open={true}
        onClose={mockOnClose}
        rule={existingRule}
        profileDataVersion={4}
        onSubmitCreate={mockOnSubmitCreate}
        onSubmitUpdate={mockOnSubmitUpdate}
      />
    )

    expect(screen.getByText('Edit Cashflow Rule')).toBeDefined()

    const submitBtn = screen.getByRole('button', { name: /Save Changes/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockOnSubmitUpdate).toHaveBeenCalledWith(
        'rule-123',
        expect.objectContaining({
          category: 'Freelance Design',
          amount_paise: 4000000,
          expected_data_version: 4,
        })
      )
    })
  })

  it('displays 409 conflict message when profile version changes', async () => {
    mockOnSubmitUpdate.mockRejectedValueOnce(
      new ApiRequestError(409, { code: 'STALE_VERSION', message: 'Stale version' })
    )

    const existingRule: CashflowRuleOut = {
      id: 'rule-123',
      owner_id: 'user-1',
      category: 'Freelance Design',
      direction: 'income',
      amount_paise: 4000000,
      frequency: 'monthly',
      timing: 'known',
      due_date: null,
      start_date: null,
      end_date: null,
      notes: null,
      created_at: '2026-01-01T00:00:00Z',
    }

    render(
      <CashflowRuleModal
        open={true}
        onClose={mockOnClose}
        rule={existingRule}
        profileDataVersion={3}
        onSubmitCreate={mockOnSubmitCreate}
        onSubmitUpdate={mockOnSubmitUpdate}
      />
    )

    const submitBtn = screen.getByRole('button', { name: /Save Changes/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(
        screen.getByText(/Conflict \(409\): Your financial profile version has changed concurrently/i)
      ).toBeDefined()
    })
  })
})
