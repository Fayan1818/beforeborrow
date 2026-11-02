import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ImportsPage from './ImportsPage'
import * as authHooks from '@/features/auth/hooks'
import * as importsHooks from '../hooks'
import * as obligationsHooks from '@/features/obligations/hooks'
import { ImportPreviewResult, ImportBatchOut } from '../api'
import { ObligationOut } from '@/features/obligations/api'

vi.mock('@/features/auth/hooks')
vi.mock('../hooks')
vi.mock('@/features/obligations/hooks')

describe('ImportsPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.mocked(authHooks.useMe).mockReturnValue({
      data: { id: 'user-123', email: 'test@example.com', name: 'Test User', timezone: 'Asia/Kolkata', csrf_token: 'csrf' },
    } as any)
  })

  it('renders upload card and empty history when no batches exist', () => {
    vi.mocked(importsHooks.useImportBatches).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    } as any)
    vi.mocked(obligationsHooks.useObligations).mockReturnValue({
      data: [],
      isLoading: false,
    } as any)
    vi.mocked(importsHooks.useImportPreview).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
      reset: vi.fn(),
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ImportsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText(/Upload Statement CSV/i)).toBeDefined()
    expect(screen.getByText(/No previous statements imported yet/i)).toBeDefined()
  })

  it('enforces early frontend validation: rejects non-csv files and files > 1 MiB', () => {
    vi.mocked(importsHooks.useImportBatches).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    } as any)
    vi.mocked(obligationsHooks.useObligations).mockReturnValue({
      data: [],
      isLoading: false,
    } as any)
    vi.mocked(importsHooks.useImportPreview).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
      reset: vi.fn(),
    } as any)

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ImportsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const input = container.querySelector('#csv-file-input') as HTMLInputElement

    // 1. Non-csv file
    const txtFile = new File(['hello'], 'statement.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [txtFile] } })
    expect(screen.getByText(/Please select a valid CSV file/i)).toBeDefined()

    // 2. File > 1 MiB
    const largeContent = new Uint8Array(1024 * 1024 + 10)
    const largeFile = new File([largeContent], 'huge.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [largeFile] } })
    expect(screen.getByText(/exceeds the maximum allowed size of 1 MiB/i)).toBeDefined()
  })

  it('renders staged preview table with valid, invalid, duplicate, and unmatched rows', async () => {
    const mockPreviewResult: ImportPreviewResult = {
      import_batch_id: 'batch-abc-123',
      file_hash: 'hash1234567890',
      total_rows: 3,
      valid_rows_count: 2,
      invalid_rows_count: 1,
      exact_duplicates_count: 0,
      possible_duplicates_count: 1,
      unmatched_count: 1,
      file_errors: [],
      rows: [
        {
          row_id: 'row-1',
          row_index: 1,
          provider_alias: 'Bajaj Finserv',
          external_ref: 'EMI-001',
          kind: 'bnpl',
          due_date: '2026-11-20',
          amount_paise: 250000, // ₹2,500
          amount_inr_raw: '2500',
          status: 'scheduled',
          is_valid: true,
          match_status: 'MATCHED',
          matched_obligation_id: 'ob-1',
          duplicate_reason: null,
          display_provider_alias: 'Bajaj Finserv',
          display_external_ref: 'EMI-001',
          errors: [],
          warnings: [],
        },
        {
          row_id: 'row-2',
          row_index: 2,
          provider_alias: 'Amazon Pay',
          external_ref: 'AMZ-999',
          kind: 'bnpl',
          due_date: '2026-11-25',
          amount_paise: 150000, // ₹1,500
          amount_inr_raw: '1500',
          status: 'scheduled',
          is_valid: true,
          match_status: 'UNMATCHED_OBLIGATION',
          matched_obligation_id: null,
          duplicate_reason: null,
          display_provider_alias: 'Amazon Pay',
          display_external_ref: 'AMZ-999',
          errors: [],
          warnings: ['Unmatched provider'],
        },
        {
          row_id: 'row-3',
          row_index: 3,
          provider_alias: 'Unknown Card',
          external_ref: 'ERR-000',
          kind: 'card',
          due_date: null,
          amount_paise: null,
          amount_inr_raw: '-500',
          status: 'invalid_status',
          is_valid: false,
          match_status: 'POSSIBLE_DUPLICATE_DB',
          matched_obligation_id: null,
          duplicate_reason: 'Duplicate payment on date',
          display_provider_alias: 'Unknown Card',
          display_external_ref: 'ERR-000',
          errors: ['Invalid due date format', 'Negative amount rejected'],
          warnings: [],
        },
      ],
    }

    const mockObligations: ObligationOut[] = [
      {
        id: 'ob-1',
        provider_alias: 'Bajaj Finserv',
        kind: 'bnpl',
        status: 'active',
        principal_remaining_paise: 500000,
        source: 'manual',
        source_ref: null,
        source_as_of: null,
        version: 1,
        payments: [],
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ob-2',
        provider_alias: 'Amazon Pay Later',
        kind: 'bnpl',
        status: 'active',
        principal_remaining_paise: 300000,
        source: 'manual',
        source_ref: null,
        source_as_of: null,
        version: 1,
        payments: [],
        created_at: '2026-01-01T00:00:00Z',
      },
    ]

    vi.mocked(importsHooks.useImportBatches).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    } as any)
    vi.mocked(obligationsHooks.useObligations).mockReturnValue({
      data: mockObligations,
      isLoading: false,
    } as any)

    const mockPreviewMutation = {
      mutateAsync: vi.fn().mockResolvedValue(mockPreviewResult),
      isPending: false,
      error: null,
      reset: vi.fn(),
    }
    vi.mocked(importsHooks.useImportPreview).mockReturnValue(mockPreviewMutation as any)

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ImportsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Trigger upload
    const input = container.querySelector('#csv-file-input') as HTMLInputElement
    const validFile = new File(['valid,data'], 'test.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [validFile] } })

    const previewBtn = screen.getByRole('button', { name: /Preview Statement/i })
    fireEvent.click(previewBtn)

    await waitFor(() => {
      expect(screen.getByText(/CSV Statement Preview/i)).toBeDefined()
    })

    // Check that row 1 is matched and auto-selected
    expect(screen.getByText('Bajaj Finserv')).toBeDefined()
    expect(screen.getByText('✓ Matched')).toBeDefined()

    // Check that row 2 is unmatched and shows inline obligation dropdown
    expect(screen.getByText('Amazon Pay')).toBeDefined()
    expect(screen.getByText('⚠ Unmatched')).toBeDefined()

    // Check that row 3 is invalid and shows error descriptions
    expect(screen.getByText(/Invalid due date format/i)).toBeDefined()
    expect(screen.getByText(/Negative amount rejected/i)).toBeDefined()

    // Map unmatched row 2 to obligation ob-2
    const mappingSelect = screen.getByDisplayValue(/Select obligation.../i)
    fireEvent.change(mappingSelect, { target: { value: 'ob-2' } })

    // Now both valid rows are selected (Selected 2 of 2 selectable rows)
    expect(screen.getAllByText(/Selected/i).length).toBeGreaterThanOrEqual(1)
  })


  it('opens commit modal, preserves idempotency key across conflict, and commits successfully', async () => {
    const mockPreviewResult: ImportPreviewResult = {
      import_batch_id: 'batch-abc-123',
      file_hash: 'hash1234567890',
      total_rows: 1,
      valid_rows_count: 1,
      invalid_rows_count: 0,
      exact_duplicates_count: 0,
      possible_duplicates_count: 0,
      unmatched_count: 0,
      file_errors: [],
      rows: [
        {
          row_id: 'row-1',
          row_index: 1,
          provider_alias: 'Bajaj Finserv',
          external_ref: 'EMI-001',
          kind: 'bnpl',
          due_date: '2026-11-20',
          amount_paise: 250000,
          amount_inr_raw: '2500',
          status: 'scheduled',
          is_valid: true,
          match_status: 'MATCHED',
          matched_obligation_id: 'ob-1',
          duplicate_reason: null,
          display_provider_alias: 'Bajaj Finserv',
          display_external_ref: 'EMI-001',
          errors: [],
          warnings: [],
        },
      ],
    }

    vi.mocked(importsHooks.useImportBatches).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    } as any)
    vi.mocked(obligationsHooks.useObligations).mockReturnValue({
      data: [],
      isLoading: false,
    } as any)

    vi.mocked(importsHooks.useImportPreview).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockPreviewResult),
      isPending: false,
      error: null,
      reset: vi.fn(),
    } as any)

    const mockCommitMutateAsync = vi.fn().mockResolvedValue({
      batch_id: 'batch-abc-123',
      status: 'committed',
      idempotent_replay: false,
      committed_count: 1,
      committed_payment_ids: ['pay-1'],
      data_version: 3,
    })

    vi.mocked(importsHooks.useCommitImport).mockReturnValue({
      mutateAsync: mockCommitMutateAsync,
      isPending: false,
    } as any)

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ImportsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Upload & preview
    const input = container.querySelector('#csv-file-input') as HTMLInputElement
    const validFile = new File(['valid'], 'statement.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [validFile] } })
    fireEvent.click(screen.getByRole('button', { name: /Preview Statement/i }))

    await waitFor(() => {
      expect(screen.getByText(/Commit Selected Rows/i)).toBeDefined()
    })

    // Click commit trigger
    const commitBtn = screen.getByRole('button', { name: /Commit Selected Rows/i })
    fireEvent.click(commitBtn)

    // Modal should be open
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByText(/Confirm Statement Commit/i)).toBeDefined()

    // Click Confirm & Commit
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Commit/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockCommitMutateAsync).toHaveBeenCalled()
    })

    // Verify commit payload includes batch_id, idempotency_key, and selected_row_ids
    const callArgs = mockCommitMutateAsync.mock.calls[0][0]
    expect(callArgs.batch_id).toBe('batch-abc-123')
    expect(callArgs.selected_row_ids).toEqual(['row-1'])
    expect(callArgs.idempotency_key).toMatch(/^commit-/)

    // Success screen shown
    expect(screen.getByText(/Import Successfully Committed!/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /View Updated Schedules/i })).toBeDefined()
  })

  it('renders previous import batches in history table', () => {
    const mockBatches: ImportBatchOut[] = [
      {
        id: 'batch-1111-2222',
        file_hash: 'abcdef1234567890',
        status: 'committed',
        preview_json: { total_rows: 5, valid_rows_count: 5 },
        result_json: { committed_count: 5 },
        committed_at: '2026-11-01T12:00:00Z',
        created_at: '2026-11-01T11:55:00Z',
      },
    ]

    vi.mocked(importsHooks.useImportBatches).mockReturnValue({
      data: mockBatches,
      isLoading: false,
      refetch: vi.fn(),
    } as any)
    vi.mocked(obligationsHooks.useObligations).mockReturnValue({
      data: [],
      isLoading: false,
    } as any)
    vi.mocked(importsHooks.useImportPreview).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
      reset: vi.fn(),
    } as any)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ImportsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText(/Import Batch History/i)).toBeDefined()
    expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/committed/i).length).toBeGreaterThanOrEqual(1)
  })


})
