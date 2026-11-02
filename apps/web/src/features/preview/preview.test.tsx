import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PreviewShell, PreviewIndexRedirect } from './PreviewShell'
import { PreviewSnapshotView } from './PreviewSnapshotView'
import ProfilePage from '@/features/profile/pages/ProfilePage'
import ObligationsPage from '@/features/obligations/pages/ObligationsPage'
import CalendarPage from '@/features/calendar/pages/CalendarPage'
import ImportsPage from '@/features/imports/pages/ImportsPage'
import { previewMockApi } from './previewMockApi'

function renderPreview(initialEntry = '/__preview/profile') {
  window.history.pushState({}, '', initialEntry)
  previewMockApi.setActive(true)

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  const mockUser = {
    id: 'dev-preview-user-b',
    email_normalized: 'preview.user@beforeborrow.dev',
    created_at: '2026-11-01T00:00:00Z',
    csrf_token: 'preview-demo-csrf-token',
  }
  queryClient.setQueryData(['me'], mockUser)

  const router = createMemoryRouter(
    [
      {
        path: '/__preview',
        element: <PreviewShell />,
        children: [
          { index: true, element: <PreviewIndexRedirect /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'obligations', element: <ObligationsPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'imports', element: <ImportsPage /> },
          { path: 'snapshot', element: <PreviewSnapshotView /> },
        ],
      },
    ],
    { initialEntries: [initialEntry] }
  )

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('Development Preview Mode', () => {
  beforeEach(() => {
    previewMockApi.resetToDefaults()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the preview banner and navigation controls', async () => {
    renderPreview('/__preview/profile')

    expect(screen.getByText(/DEV PREVIEW/i)).toBeDefined()
    expect(screen.getByText(/Person B Visual Inspection Mode/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Reset Demo Data/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Toggle Empty State/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Simulate 409 Conflict/i })).toBeDefined()
  })

  it('renders ProfilePage under /__preview/profile with demo Indian financial profile', async () => {
    renderPreview('/__preview/profile')

    // Check opening cash: ₹2,50,000.00
    await waitFor(() => {
      expect(screen.getAllByText(/2,50,000/i).length).toBeGreaterThanOrEqual(1)
    })

    // Check emergency reserve floor: ₹50,000.00
    expect(screen.getAllByText(/50,000/i).length).toBeGreaterThanOrEqual(1)

    // Check demo cashflow rules
    expect(screen.getByText(/Indiranagar 2BHK Apartment Rent/i)).toBeDefined()
    expect(screen.getByText(/Monthly Tech Consultant Salary/i)).toBeDefined()
  })

  it('renders ObligationsPage under /__preview/obligations with demo loans, cards, and BNPL', async () => {
    renderPreview('/__preview/obligations')

    await waitFor(() => {
      expect(screen.getByText(/HDFC Personal Loan/i)).toBeDefined()
    })

    expect(screen.getByText(/ICICI Coral Credit Card/i)).toBeDefined()
    expect(screen.getByText(/Simpl Pay-in-3 \(Zomato\/Blinkit\)/i)).toBeDefined()
    expect(screen.getByText(/Amazon Pay Later/i)).toBeDefined()
  })

  it('renders CalendarPage under /__preview/calendar with monthly view and scheduled cashflows', async () => {
    renderPreview('/__preview/calendar')

    await waitFor(() => {
      expect(screen.getByText(/Monthly Grid/i)).toBeDefined()
      expect(screen.getByText(/Agenda View/i)).toBeDefined()
      expect(screen.getAllByText(/Scheduled Income/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/Scheduled Outflow/i).length).toBeGreaterThanOrEqual(1)
    })

    // Check calendar grid and 7-day rolling outflows
    expect(screen.getByText(/7-Day Rolling Outflow Commitments/i)).toBeDefined()
    expect(screen.getByText(/HDFC Personal Loan/i)).toBeDefined()
  })

  it('renders ImportsPage under /__preview/imports with upload dropzone and history table', async () => {
    renderPreview('/__preview/imports')

    await waitFor(() => {
      expect(screen.getByText(/CSV Import Management/i)).toBeDefined()
      expect(screen.getByText(/Choose CSV File/i)).toBeDefined()
      expect(screen.getByText(/Import Batch History/i)).toBeDefined()
    })
  })

  it('renders PreviewSnapshotView under /__preview/snapshot with data quality report and engine metrics', async () => {
    renderPreview('/__preview/snapshot')

    await waitFor(() => {
      expect(screen.getByText(/DATA QUALITY: PASS/i)).toBeDefined()
    })

    expect(screen.getByText(/Financial Snapshot & Data Quality Inspector/i)).toBeDefined()
    expect(screen.getByText(/Active Quality Warnings:/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Inspect Engine JSON/i })).toBeDefined()
  })
})
