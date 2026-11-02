import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import CalendarPage from './CalendarPage'
import * as authHooks from '@/features/auth/hooks'
import * as calendarHooks from '../hooks'
import { CalendarScheduleResult } from '../api'

vi.mock('@/features/auth/hooks')
vi.mock('../hooks')

describe('CalendarPage', () => {
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
    vi.mocked(calendarHooks.useCalendar).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CalendarPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText(/Loading financial calendar schedule.../i)).toBeDefined()
  })

  it('renders error state and handles retry', () => {
    const mockRefetch = vi.fn()
    vi.mocked(calendarHooks.useCalendar).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network timeout'),
      refetch: mockRefetch,
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CalendarPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText(/Network timeout/i)).toBeDefined()
    const retryBtn = screen.getByRole('button', { name: /Retry/i })
    fireEvent.click(retryBtn)
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('renders calendar data with KPI summary cards and events in monthly grid', () => {
    const mockCalendarData: CalendarScheduleResult = {
      from_date: '2026-11-01',
      to_date: '2026-11-30',
      total_scheduled_income_paise: 6000000, // ₹60,000
      total_scheduled_outflow_paise: 2500000, // ₹25,000
      net_scheduled_cashflow_paise: 3500000, // ₹35,000
      total_event_count: 2,
      events: [
        {
          event_date: '2026-11-01',
          amount_paise: 6000000,
          direction: 'income',
          category: 'Salary',
          source_type: 'cashflow_rule',
          source_id: 'cfr-1',
          timing: 'known',
          payment_status: 'scheduled',
          provider_alias: null,
          obligation_kind: null,
          goal_id: null,
          is_protected_goal: false,
          is_already_reflected: false,
          actual_paid_date: null,
        },
        {
          event_date: '2026-11-15',
          amount_paise: 2500000,
          direction: 'outflow',
          category: 'Debt',
          source_type: 'obligation_payment',
          source_id: 'p-1',
          timing: 'known',
          payment_status: 'paid',
          provider_alias: 'HDFC Home Loan',
          obligation_kind: 'term_loan',
          goal_id: null,
          is_protected_goal: false,
          is_already_reflected: false,
          actual_paid_date: '2026-11-15',
        },
      ],
      daily_summaries: [
        {
          event_date: '2026-11-01',
          scheduled_income_paise: 6000000,
          scheduled_outflow_paise: 0,
          net_paise: 6000000,
          events: [
            {
              event_date: '2026-11-01',
              amount_paise: 6000000,
              direction: 'income',
              category: 'Salary',
              source_type: 'cashflow_rule',
              source_id: 'cfr-1',
              timing: 'known',
              payment_status: 'scheduled',
              provider_alias: null,
              obligation_kind: null,
              goal_id: null,
              is_protected_goal: false,
              is_already_reflected: false,
              actual_paid_date: null,
            },
          ],
        },
        {
          event_date: '2026-11-15',
          scheduled_income_paise: 0,
          scheduled_outflow_paise: 2500000,
          net_paise: -2500000,
          events: [
            {
              event_date: '2026-11-15',
              amount_paise: 2500000,
              direction: 'outflow',
              category: 'Debt',
              source_type: 'obligation_payment',
              source_id: 'p-1',
              timing: 'known',
              payment_status: 'paid',
              provider_alias: 'HDFC Home Loan',
              obligation_kind: 'term_loan',
              goal_id: null,
              is_protected_goal: false,
              is_already_reflected: false,
              actual_paid_date: '2026-11-15',
            },
          ],
        },
      ],
      rolling_7d_outflows: [
        {
          window_start: '2026-11-15',
          window_end: '2026-11-21',
          outflow_paise: 2500000,
          event_count: 1,
        },
      ],
      disclaimer: 'Scheduled events and aggregates based on recorded rules.',
    }

    vi.mocked(calendarHooks.useCalendar).mockReturnValue({
      data: mockCalendarData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CalendarPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Summary metrics
    expect(screen.getAllByText('₹60,000').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('₹25,000').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('₹35,000').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)

    // Event title in grid (HDFC Home Loan with checkmark for paid status)
    expect(screen.getByText(/HDFC Home Loan/i)).toBeDefined()
    expect(screen.getByText(/Salary/i)).toBeDefined()

    // 7-day rolling window
    expect(screen.getByText(/7-Day Rolling Outflow Commitments/i)).toBeDefined()

    // Disclaimer
    expect(screen.getByText(/Scheduled events and aggregates based on recorded rules/i)).toBeDefined()
  })

  it('switches to agenda view and opens event modal on click', () => {
    const mockCalendarData: CalendarScheduleResult = {
      from_date: '2026-11-01',
      to_date: '2026-11-30',
      total_scheduled_income_paise: 5000000,
      total_scheduled_outflow_paise: 1500000,
      net_scheduled_cashflow_paise: 3500000,
      total_event_count: 1,
      events: [
        {
          event_date: '2026-11-10',
          amount_paise: 1500000,
          direction: 'outflow',
          category: 'Loan EMI',
          source_type: 'obligation_payment',
          source_id: 'p-1',
          timing: 'known',
          payment_status: 'scheduled',
          provider_alias: 'Axis Bank Loan',
          obligation_kind: 'term_loan',
          goal_id: null,
          is_protected_goal: false,
          is_already_reflected: false,
          actual_paid_date: null,
        },
      ],
      daily_summaries: [
        {
          event_date: '2026-11-10',
          scheduled_income_paise: 0,
          scheduled_outflow_paise: 1500000,
          net_paise: -1500000,
          events: [
            {
              event_date: '2026-11-10',
              amount_paise: 1500000,
              direction: 'outflow',
              category: 'Loan EMI',
              source_type: 'obligation_payment',
              source_id: 'p-1',
              timing: 'known',
              payment_status: 'scheduled',
              provider_alias: 'Axis Bank Loan',
              obligation_kind: 'term_loan',
              goal_id: null,
              is_protected_goal: false,
              is_already_reflected: false,
              actual_paid_date: null,
            },
          ],
        },
      ],
      rolling_7d_outflows: [],
      disclaimer: 'Disclaimer info',
    }

    vi.mocked(calendarHooks.useCalendar).mockReturnValue({
      data: mockCalendarData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CalendarPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Switch to Agenda View
    const agendaBtn = screen.getByRole('button', { name: /Agenda View/i })
    fireEvent.click(agendaBtn)

    // Check that agenda day item is present
    expect(screen.getByText('Axis Bank Loan')).toBeDefined()

    // Click on event item to open modal
    const eventRow = screen.getByText('Axis Bank Loan')
    fireEvent.click(eventRow)

    // Modal should open
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getAllByText(/Scheduled Outflow/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Axis Bank Loan/i).length).toBeGreaterThanOrEqual(1)
  })


  it('navigates previous and next month', () => {
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
        disclaimer: '',
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CalendarPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const prevBtn = screen.getByRole('button', { name: /Previous month/i })
    const nextBtn = screen.getByRole('button', { name: /Next month/i })

    // Click prev and next
    fireEvent.click(prevBtn)
    fireEvent.click(nextBtn)
  })
})
