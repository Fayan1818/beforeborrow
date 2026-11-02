import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ObligationsPage from './ObligationsPage'
import * as authHooks from '@/features/auth/hooks'
import * as obligationsHooks from '../hooks'
import { ObligationOut } from '../api'

vi.mock('@/features/auth/hooks')
vi.mock('../hooks')

describe('ObligationsPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.mocked(authHooks.useMe).mockReturnValue({
      data: { id: 'user-123', email: 'test@example.com', name: 'Test User', timezone: 'Asia/Kolkata', csrf_token: 'csrf' },
    } as any)
  })

  it('renders loading state', () => {
    vi.mocked(obligationsHooks.useObligations).mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as any)
    vi.mocked(obligationsHooks.useCreateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useDeleteObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdatePaymentStatus).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useCreatePayment).mockReturnValue({ mutateAsync: vi.fn() } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ObligationsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText(/Loading obligations and repayment schedules.../i)).toBeDefined()
  })

  it('renders empty state when no obligations exist', () => {
    vi.mocked(obligationsHooks.useObligations).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any)
    vi.mocked(obligationsHooks.useCreateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useDeleteObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdatePaymentStatus).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useCreatePayment).mockReturnValue({ mutateAsync: vi.fn() } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ObligationsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText(/No obligations registered yet/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Add First Obligation/i })).toBeDefined()
  })

  it('displays obligations summary metrics and lists obligations correctly', () => {
    const obligations: ObligationOut[] = [
      {
        id: 'ob-1',
        provider_alias: 'HDFC Personal Loan',
        kind: 'term_loan',
        status: 'active',
        principal_remaining_paise: 15000000, // ₹1,50,000
        source: 'manual',
        source_ref: 'PL-991',
        source_as_of: null,
        version: 1,
        created_at: '2026-01-01T00:00:00Z',
        payments: [
          {
            id: 'p-1',
            obligation_id: 'ob-1',
            owner_id: 'user-123',
            due_date: '2026-02-15',
            amount_paise: 1200000, // ₹12,000
            interest_paise: 200000,
            fee_paise: 0,
            payment_status: 'scheduled',
            actual_paid_date: null,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      {
        id: 'ob-2',
        provider_alias: 'Flipkart Pay Later',
        kind: 'bnpl',
        status: 'closed',
        principal_remaining_paise: 0,
        source: 'manual',
        source_ref: null,
        source_as_of: null,
        version: 2,
        created_at: '2026-01-01T00:00:00Z',
        payments: [],
      },
    ]

    vi.mocked(obligationsHooks.useObligations).mockReturnValue({
      data: obligations,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any)
    vi.mocked(obligationsHooks.useCreateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useDeleteObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdatePaymentStatus).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useCreatePayment).mockReturnValue({ mutateAsync: vi.fn() } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ObligationsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Metric 1: Total outstanding principal from active obligation = ₹1,50,000
    expect(screen.getAllByText('₹1,50,000').length).toBeGreaterThanOrEqual(1)

    // Metric 2: Active Accounts count = 1
    expect(screen.getByText('1')).toBeDefined()

    // Metric 3: Upcoming scheduled commitment = ₹12,000
    expect(screen.getAllByText('₹12,000').length).toBeGreaterThanOrEqual(1)

    // Obligation items in list
    expect(screen.getByText('HDFC Personal Loan')).toBeDefined()
    expect(screen.getByText('Flipkart Pay Later')).toBeDefined()
  })

  it('filters obligations by status', () => {
    const obligations: ObligationOut[] = [
      {
        id: 'ob-1',
        provider_alias: 'HDFC Personal Loan',
        kind: 'term_loan',
        status: 'active',
        principal_remaining_paise: 15000000,
        source: 'manual',
        source_ref: null,
        source_as_of: null,
        version: 1,
        created_at: '2026-01-01T00:00:00Z',
        payments: [],
      },
      {
        id: 'ob-2',
        provider_alias: 'Old Closed Card',
        kind: 'card',
        status: 'closed',
        principal_remaining_paise: 0,
        source: 'manual',
        source_ref: null,
        source_as_of: null,
        version: 2,
        created_at: '2026-01-01T00:00:00Z',
        payments: [],
      },
    ]

    vi.mocked(obligationsHooks.useObligations).mockReturnValue({
      data: obligations,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any)
    vi.mocked(obligationsHooks.useCreateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useDeleteObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdatePaymentStatus).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useCreatePayment).mockReturnValue({ mutateAsync: vi.fn() } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ObligationsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Click 'active' filter button
    const activeFilterBtn = screen.getByRole('button', { name: 'active' })
    fireEvent.click(activeFilterBtn)

    expect(screen.getByText('HDFC Personal Loan')).toBeDefined()
    expect(screen.queryByText('Old Closed Card')).toBeNull()
  })

  it('opens delete confirm dialog with expected version', () => {
    const obligations: ObligationOut[] = [
      {
        id: 'ob-1',
        provider_alias: 'HDFC Personal Loan',
        kind: 'term_loan',
        status: 'active',
        principal_remaining_paise: 15000000,
        source: 'manual',
        source_ref: null,
        source_as_of: null,
        version: 4,
        created_at: '2026-01-01T00:00:00Z',
        payments: [],
      },
    ]

    vi.mocked(obligationsHooks.useObligations).mockReturnValue({
      data: obligations,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any)
    vi.mocked(obligationsHooks.useCreateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useDeleteObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdatePaymentStatus).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useCreatePayment).mockReturnValue({ mutateAsync: vi.fn() } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ObligationsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const deleteBtn = screen.getByRole('button', { name: /Delete/i })
    fireEvent.click(deleteBtn)

    expect(screen.getByText('Delete HDFC Personal Loan?')).toBeDefined()
    expect(screen.getByText(/Version 4/i)).toBeDefined()
  })
})
