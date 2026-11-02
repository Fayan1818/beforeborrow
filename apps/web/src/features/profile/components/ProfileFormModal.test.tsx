import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProfileFormModal } from './ProfileFormModal'
import { ProfileOut } from '../api'
import { ApiRequestError } from '@/lib/api'

describe('ProfileFormModal', () => {
  const mockOnSubmit = vi.fn()
  const mockOnClose = vi.fn()

  it('renders initialization form with empty fields', () => {
    render(
      <ProfileFormModal
        open={true}
        onClose={mockOnClose}
        profile={null}
        onSubmit={mockOnSubmit}
      />
    )

    expect(screen.getByText('Initialize Financial Profile')).toBeDefined()
    expect(screen.getByText(/Opening Cash Balance/i)).toBeDefined()
    expect(screen.getByPlaceholderText(/e.g. 50000/i)).toBeDefined()
    expect(screen.getByText(/Emergency Reserve Floor/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Initialize Profile/i })).toBeDefined()
  })

  it('validates input and prevents submission on invalid rupee amounts', async () => {
    render(
      <ProfileFormModal
        open={true}
        onClose={mockOnClose}
        profile={null}
        onSubmit={mockOnSubmit}
      />
    )

    const cashInput = screen.getByPlaceholderText(/e.g. 50000/i)
    fireEvent.change(cashInput, { target: { value: '-500' } })

    const submitBtn = screen.getByRole('button', { name: /Initialize Profile/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/Amount cannot be negative/i)).toBeDefined()
    })
    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('converts entered rupees to exact paise and calls onSubmit', async () => {
    mockOnSubmit.mockResolvedValueOnce(undefined)

    render(
      <ProfileFormModal
        open={true}
        onClose={mockOnClose}
        profile={null}
        onSubmit={mockOnSubmit}
      />
    )

    const cashInput = screen.getByPlaceholderText(/e.g. 50000/i)
    fireEvent.change(cashInput, { target: { value: '75000.50' } })

    const reserveInput = screen.getByPlaceholderText(/e.g. 10000/i)
    fireEvent.change(reserveInput, { target: { value: '15000' } })

    const submitBtn = screen.getByRole('button', { name: /Initialize Profile/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          opening_cash_paise: 7500050,
          reserve_floor_paise: 1500000,
          currency: 'INR',
          timezone: 'Asia/Kolkata',
        })
      )
    })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('renders edit mode with existing profile values and includes expected_version', async () => {
    mockOnSubmit.mockResolvedValueOnce(undefined)

    const existingProfile: ProfileOut = {
      id: 'profile-1',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      opening_cash_paise: 5000000,
      balance_as_of: '2026-01-15',
      reserve_floor_paise: 1000000,
      data_version: 3,
      created_at: '2026-01-15T00:00:00Z',
      updated_at: '2026-01-15T00:00:00Z',
    }

    render(
      <ProfileFormModal
        open={true}
        onClose={mockOnClose}
        profile={existingProfile}
        onSubmit={mockOnSubmit}
      />
    )

    expect(screen.getByText('Edit Financial Profile Baseline')).toBeDefined()
    expect(screen.getByText(/Data Version for concurrency:/i)).toBeDefined()

    const submitBtn = screen.getByRole('button', { name: /Save Changes/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          opening_cash_paise: 5000000,
          reserve_floor_paise: 1000000,
          expected_version: 3,
        })
      )
    })
  })

  it('displays user-friendly 409 conflict message when backend rejects stale version', async () => {
    const conflictError = new ApiRequestError(409, {
      code: 'STALE_VERSION',
      message: 'Version conflict',
    })
    mockOnSubmit.mockRejectedValueOnce(conflictError)

    const existingProfile: ProfileOut = {
      id: 'profile-1',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      opening_cash_paise: 5000000,
      balance_as_of: '2026-01-15',
      reserve_floor_paise: 1000000,
      data_version: 2,
      created_at: '2026-01-15T00:00:00Z',
      updated_at: '2026-01-15T00:00:00Z',
    }

    render(
      <ProfileFormModal
        open={true}
        onClose={mockOnClose}
        profile={existingProfile}
        onSubmit={mockOnSubmit}
      />
    )

    const submitBtn = screen.getByRole('button', { name: /Save Changes/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(
        screen.getByText(/Conflict \(409\): The profile was modified concurrently/i)
      ).toBeDefined()
    })
  })
})
