import { api } from '@/lib/api'

export interface CSVRowPreview {
  row_id: string
  row_index: number
  provider_alias: string
  external_ref: string
  kind: string
  due_date: string | null // YYYY-MM-DD
  amount_paise: number | null
  amount_inr_raw: string
  status: string
  is_valid: boolean
  match_status:
    | 'MATCHED'
    | 'UNMATCHED_OBLIGATION'
    | 'EXACT_DUPLICATE_FILE'
    | 'EXACT_DUPLICATE_DB'
    | 'POSSIBLE_DUPLICATE_DB'
    | string
  matched_obligation_id: string | null
  duplicate_reason: string | null
  display_provider_alias: string | null
  display_external_ref: string | null
  errors: string[]
  warnings: string[]
}

export interface ImportPreviewResult {
  import_batch_id: string
  file_hash: string
  total_rows: number
  valid_rows_count: number
  invalid_rows_count: number
  exact_duplicates_count: number
  possible_duplicates_count: number
  unmatched_count: number
  rows: CSVRowPreview[]
  file_errors: string[]
}

export interface ImportBatchOut {
  id: string
  file_hash: string
  status: string
  preview_json?: {
    total_rows?: number
    valid_rows_count?: number
    invalid_rows_count?: number
  } | null
  errors_json?: string[] | Record<string, unknown> | null
  idempotency_key?: string | null
  result_json?: {
    committed_count?: number
  } | null
  committed_at: string | null
  created_at: string
}

export interface ImportCommitRequest {
  batch_id: string
  idempotency_key: string
  selected_row_ids: string[]
  obligation_mappings: Record<string, string> // row_id -> obligation_id
}

export interface ImportCommitResult {
  batch_id: string
  status: string
  idempotent_replay: boolean
  committed_count: number
  committed_payment_ids: string[]
  data_version: number
}

export const importsApi = {
  list: (signal?: AbortSignal) => api.get<ImportBatchOut[]>('/imports', signal),

  preview: async (file: File, signal?: AbortSignal): Promise<ImportPreviewResult> => {
    const form = new FormData()
    form.append('file', file)
    return api.postForm<ImportPreviewResult>('/imports/preview', form, signal)
  },

  commit: (body: ImportCommitRequest, signal?: AbortSignal): Promise<ImportCommitResult> =>
    api.post<ImportCommitResult>(`/imports/${body.batch_id}/commit`, body, signal),
}
