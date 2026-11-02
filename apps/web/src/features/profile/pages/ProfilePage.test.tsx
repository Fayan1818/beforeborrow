import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProfilePage from './ProfilePage'
import * as authHooks from '@/features/auth/hooks'
import * as profileHooks from '../hooks'
import { ProfileOut, CashflowRuleOut } from '../api'

vi.mock('@/features/auth/hooks')
vi.mock('../hooks')

describe('ProfilePage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.mocked(authHooks.useMe).mockReturnValue({
      data: { id: 'user-123', email: 'test@example.com', name: 'Test User', timezone: 'Asia/Kolkata', csrf_token: 'csrf' },
    } as any)
  })

  it('renders loading state when profile is loading', () => {
    vi.mocked(profileHooks.useProfile).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as any)
    vi.mocked(profileHooks.useCashflowRules).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(profileHooks.useCreateProfile).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useUpdateProfile).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useCreateCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useUpdateCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useDeleteCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <ProfilePage />
      </QueryClientProvider>
    )

    expect(screen.getByText(/Loading financial profile baseline.../i)).toBeDefined()
  })

  it('renders empty onboarding prompt when profile does not exist', () => {
    vi.mocked(profileHooks.useProfile).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any)
    vi.mocked(profileHooks.useCashflowRules).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(profileHooks.useCreateProfile).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useUpdateProfile).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useCreateCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useUpdateCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useDeleteCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <ProfilePage />
      </QueryClientProvider>
    )

    expect(screen.getByText('Initialize Your Financial Profile')).toBeDefined()
    expect(screen.getByRole('button', { name: /Set Up Opening Balance/i })).toBeDefined()
  })

  it('renders verified opening cash, reserve floor, and version when profile exists', () => {
    const profile: ProfileOut = {
      id: 'profile-1',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      opening_cash_paise: 5000000, // ₹50,000
      balance_as_of: '2026-02-01',
      reserve_floor_paise: 1000000, // ₹10,000
      data_version: 5,
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
    }

    const rules: CashflowRuleOut[] = [
      {
        id: 'rule-1',
        owner_id: 'user-123',
        category: 'Salary',
        direction: 'income',
        amount_paise: 8000000,
        frequency: 'monthly',
        timing: 'known',
        due_date: '2026-02-01',
        start_date: null,
        end_date: null,
        notes: null,
        created_at: '2026-02-01T00:00:00Z',
      },
      {
        id: 'rule-2',
        owner_id: 'user-123',
        category: 'House Rent',
        direction: 'expense',
        amount_paise: 2000000,
        frequency: 'monthly',
        timing: 'known',
        due_date: '2026-02-05',
        start_date: null,
        end_date: null,
        notes: null,
        created_at: '2026-02-01T00:00:00Z',
      },
    ]

    vi.mocked(profileHooks.useProfile).mockReturnValue({
      data: profile,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any)
    vi.mocked(profileHooks.useCashflowRules).mockReturnValue({
      data: rules,
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(profileHooks.useCreateProfile).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useUpdateProfile).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useCreateCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useUpdateCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useDeleteCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <ProfilePage />
      </QueryClientProvider>
    )

    expect(screen.getByText('Opening Cash Baseline')).toBeDefined()
    expect(screen.getByText('Version 5')).toBeDefined()
    expect(screen.getByText('₹50,000')).toBeDefined()
    expect(screen.getByText('₹10,000')).toBeDefined()
    expect(screen.getByText('₹40,000')).toBeDefined() // Usable liquidity (50,000 - 10,000)

    // Rules
    expect(screen.getByText('Salary')).toBeDefined()
    expect(screen.getByText('House Rent')).toBeDefined()
  })

  it('opens confirm dialog when delete button is clicked on a cashflow rule', () => {
    const profile: ProfileOut = {
      id: 'profile-1',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      opening_cash_paise: 5000000,
      balance_as_of: '2026-02-01',
      reserve_floor_paise: 1000000,
      data_version: 1,
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
    }

    const rules: CashflowRuleOut[] = [
      {
        id: 'rule-1',
        owner_id: 'user-123',
        category: 'Gym Membership',
        direction: 'expense',
        amount_paise: 150000,
        frequency: 'monthly',
        timing: 'known',
        due_date: null,
        start_date: null,
        end_date: null,
        notes: null,
        created_at: '2026-02-01T00:00:00Z',
      },
    ]

    vi.mocked(profileHooks.useProfile).mockReturnValue({
      data: profile,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any)
    vi.mocked(profileHooks.useCashflowRules).mockReturnValue({
      data: rules,
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(profileHooks.useCreateProfile).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useUpdateProfile).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useCreateCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useUpdateCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(profileHooks.useDeleteCashflowRule).mockReturnValue({ mutateAsync: vi.fn() } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <ProfilePage />
      </QueryClientProvider>
    )

    const deleteBtn = screen.getByRole('button', { name: /Delete/i })
    fireEvent.click(deleteBtn)

    expect(screen.getByText('Delete Gym Membership?')).toBeDefined()
  })
})
