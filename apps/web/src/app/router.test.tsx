import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import ProfilePage from '@/features/profile/pages/ProfilePage'
import ObligationsPage from '@/features/obligations/pages/ObligationsPage'
import CalendarPage from '@/features/calendar/pages/CalendarPage'
import ImportsPage from '@/features/imports/pages/ImportsPage'
import * as authHooks from '@/features/auth/hooks'
import * as profileHooks from '@/features/profile/hooks'
import * as obligationsHooks from '@/features/obligations/hooks'
import * as calendarHooks from '@/features/calendar/hooks'
import * as importsHooks from '@/features/imports/hooks'

vi.mock('@/features/auth/hooks')
vi.mock('@/features/profile/hooks')
vi.mock('@/features/obligations/hooks')
vi.mock('@/features/calendar/hooks')
vi.mock('@/features/imports/hooks')

describe('Person B Route and Navigation Integration', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    vi.mocked(authHooks.useMe).mockReturnValue({
      data: { id: 'user-123', email: 'test@example.com', name: 'Test User', timezone: 'Asia/Kolkata', csrf_token: 'csrf' },
      isLoading: false,
      isError: false,
    } as any)

    vi.mocked(profileHooks.useProfile).mockReturnValue({
      data: null,
      isLoading: false,
      refetch: vi.fn(),
    } as any)
    vi.mocked(profileHooks.useCashflowRules).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    } as any)

    vi.mocked(obligationsHooks.useObligations).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    } as any)
    vi.mocked(obligationsHooks.useCreateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdateObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useDeleteObligation).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useUpdatePaymentStatus).mockReturnValue({ mutateAsync: vi.fn() } as any)
    vi.mocked(obligationsHooks.useCreatePayment).mockReturnValue({ mutateAsync: vi.fn() } as any)

    vi.mocked(calendarHooks.useCalendar).mockReturnValue({
      data: {
        from_date: '2026-11-01',
        to_date: '2026-11-30',
        total_scheduled_income_paise: 0,
        total_scheduled_outflow_paise: 0,
        net_scheduled_cashflow_paise: 0,
        total_event_count: 0,
        events: [],
        daily_summaries: [],
        rolling_7d_outflows: [],
        disclaimer: 'Calendar disclaimer',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any)

    vi.mocked(importsHooks.useImportBatches).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    } as any)
    vi.mocked(importsHooks.useImportPreview).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
      reset: vi.fn(),
    } as any)
  })

  function createTestRouter(initialPath: string) {
    return createMemoryRouter(
      [
        {
          element: (
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          ),
          children: [
            { path: '/profile', element: <ProfilePage /> },
            { path: '/obligations', element: <ObligationsPage /> },
            { path: '/calendar', element: <CalendarPage /> },
            { path: '/imports', element: <ImportsPage /> },
          ],
        },
      ],
      { initialEntries: [initialPath] }
    )
  }

  it('renders Profile page at /profile and displays sidebar navigation links', () => {
    const router = createTestRouter('/profile')
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    expect(screen.getAllByText(/Financial Profile/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('link', { name: /Obligations/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /Calendar/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /CSV Import/i })).toBeDefined()

  })

  it('renders Obligations page at /obligations', () => {
    const router = createTestRouter('/obligations')
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    expect(screen.getByText(/Financial Obligations & Debts/i)).toBeDefined()
    expect(screen.getByRole('link', { name: /Import CSV/i })).toBeDefined()
  })

  it('renders Calendar page at /calendar', () => {
    const router = createTestRouter('/calendar')
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    expect(screen.getByText(/Financial Calendar/i)).toBeDefined()
  })

  it('renders CSV Import page at /imports', () => {
    const router = createTestRouter('/imports')
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    expect(screen.getByText(/CSV Import Management/i)).toBeDefined()
  })
})
