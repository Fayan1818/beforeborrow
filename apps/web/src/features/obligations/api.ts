import { api } from '@/lib/api'

// ---------------------------------------------------------------------------
// TypeScript Interfaces matching Backend Finance Schemas
// ---------------------------------------------------------------------------

export type ObligationKind = 'bnpl' | 'term_loan' | 'card' | 'other'
export type ObligationStatus = 'active' | 'paid' | 'paused' | 'closed' | 'defaulted'
export type PaymentStatus = 'planned' | 'scheduled' | 'paid' | 'missed' | 'cancelled' | 'disputed'

export interface ObligationPaymentIn {
  due_date: string // YYYY-MM-DD
  amount_paise: number
  interest_paise?: number
  fee_paise?: number
  payment_status?: PaymentStatus
  actual_paid_date?: string | null
}

export interface PaymentStatusUpdate {
  payment_status: PaymentStatus
  actual_paid_date?: string | null
}

export interface ObligationPaymentOut {
  id: string
  obligation_id: string
  owner_id: string
  due_date: string
  amount_paise: number
  interest_paise: number
  fee_paise: number
  payment_status: PaymentStatus
  actual_paid_date: string | null
  created_at: string
}

export interface ObligationIn {
  provider_alias: string
  kind: ObligationKind
  principal_remaining_paise: number
  status?: ObligationStatus
  source?: string
  source_ref?: string | null
  source_as_of?: string | null
  payments?: ObligationPaymentIn[]
}

export interface ObligationUpdate {
  provider_alias?: string
  kind?: ObligationKind
  principal_remaining_paise?: number
  status?: ObligationStatus
  source?: string
  source_ref?: string | null
  source_as_of?: string | null
  expected_version: number
}

export interface ObligationOut {
  id: string
  provider_alias: string
  kind: ObligationKind
  principal_remaining_paise: number
  status: ObligationStatus
  source: string
  source_ref: string | null
  source_as_of: string | null
  version: number
  payments: ObligationPaymentOut[]
  created_at: string
}

// ---------------------------------------------------------------------------
// Obligations & Payments API Client
// ---------------------------------------------------------------------------

export const obligationsApi = {
  list: (filters?: { status?: string; kind?: string }, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.kind) params.set('kind', filters.kind)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return api.get<ObligationOut[]>(`/obligations${qs}`, signal)
  },
  get: (id: string, signal?: AbortSignal) =>
    api.get<ObligationOut>(`/obligations/${id}`, signal),
  create: (body: ObligationIn, signal?: AbortSignal) =>
    api.post<ObligationOut>('/obligations', body, signal),
  update: (id: string, body: ObligationUpdate, signal?: AbortSignal) =>
    api.patch<ObligationOut>(`/obligations/${id}`, body, signal),
  delete: (id: string, expectedVersion: number, signal?: AbortSignal) =>
    api.delete<void>(`/obligations/${id}?expected_version=${expectedVersion}`, signal),

  listPayments: (obligationId: string, signal?: AbortSignal) =>
    api.get<ObligationPaymentOut[]>(`/obligations/${obligationId}/payments`, signal),
  createPayment: (obligationId: string, body: ObligationPaymentIn, signal?: AbortSignal) =>
    api.post<ObligationPaymentOut>(`/obligations/${obligationId}/payments`, body, signal),
  updatePaymentStatus: (
    obligationId: string,
    paymentId: string,
    body: PaymentStatusUpdate,
    signal?: AbortSignal
  ) =>
    api.patch<ObligationPaymentOut>(
      `/obligations/${obligationId}/payments/${paymentId}`,
      body,
      signal
    ),
}
