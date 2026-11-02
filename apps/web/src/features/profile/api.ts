import { api } from '@/lib/api'

// ---------------------------------------------------------------------------
// TypeScript Interfaces matching Backend Finance Schemas
// ---------------------------------------------------------------------------

export type CashflowDirection = 'income' | 'expense'
export type CashflowTiming = 'known' | 'estimated'
export type CashflowFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

export interface ProfileIn {
  opening_cash_paise: number
  balance_as_of: string // YYYY-MM-DD
  reserve_floor_paise?: number
  currency?: string
  timezone?: string
  expected_version?: number | null
}

export interface ProfileOut {
  id: string
  opening_cash_paise: number
  balance_as_of: string
  reserve_floor_paise: number
  currency: string
  timezone: string
  data_version: number
  created_at: string
  updated_at: string
}

export interface CashflowRuleIn {
  category: string
  direction: CashflowDirection
  amount_paise: number
  frequency: CashflowFrequency
  timing?: CashflowTiming
  due_date?: string | null
  start_date?: string | null
  end_date?: string | null
  notes?: string | null
}

export interface CashflowRuleUpdate {
  category?: string
  direction?: CashflowDirection
  amount_paise?: number
  frequency?: CashflowFrequency
  timing?: CashflowTiming
  due_date?: string | null
  start_date?: string | null
  end_date?: string | null
  notes?: string | null
  expected_data_version: number
}

export interface CashflowRuleOut {
  id: string
  owner_id: string
  category: string
  direction: CashflowDirection
  amount_paise: number
  frequency: CashflowFrequency
  timing: CashflowTiming
  due_date: string | null
  start_date: string | null
  end_date: string | null
  notes: string | null
  created_at: string
}

export interface SnapshotDataQualityOut {
  is_valid: boolean
  data_version: number | null
  blocking_gaps: string[]
  warnings: string[]
  summary: string
}

export interface SnapshotOut {
  snapshot: {
    opening_cash_paise: number
    balance_as_of: string
    reserve_floor_paise: number
    currency: string
    timezone: string
    data_version: number
    income_rules: Array<{ id: string; category: string; amount_paise: number; due_date: string | null; frequency: string }>
    expense_rules: Array<{ id: string; category: string; amount_paise: number; due_date: string | null; frequency: string }>
    obligations: Array<{ id: string; provider_alias: string; kind: string; principal_remaining_paise: number }>
    goals: Array<{ id: string; name: string; target_amount_paise: number; target_date: string; is_protected: boolean }>
  } | null
  data_quality: SnapshotDataQualityOut
}

// ---------------------------------------------------------------------------
// Profile & Cashflow Rules API Client
// ---------------------------------------------------------------------------

export const profileApi = {
  get: (signal?: AbortSignal) => api.get<ProfileOut>('/profile', signal),
  create: (body: ProfileIn, signal?: AbortSignal) => api.post<ProfileOut>('/profile', body, signal),
  update: (body: ProfileIn, signal?: AbortSignal) => api.put<ProfileOut>('/profile', body, signal),
  getSnapshot: (signal?: AbortSignal) => api.get<SnapshotOut>('/profile/financial-snapshot', signal),

  listCashflowRules: (direction?: CashflowDirection, signal?: AbortSignal) => {
    const query = direction ? `?direction=${direction}` : ''
    return api.get<CashflowRuleOut[]>(`/cashflow-rules${query}`, signal)
  },
  getCashflowRule: (id: string, signal?: AbortSignal) =>
    api.get<CashflowRuleOut>(`/cashflow-rules/${id}`, signal),
  createCashflowRule: (body: CashflowRuleIn, signal?: AbortSignal) =>
    api.post<CashflowRuleOut>('/cashflow-rules', body, signal),
  updateCashflowRule: (id: string, body: CashflowRuleUpdate, signal?: AbortSignal) =>
    api.patch<CashflowRuleOut>(`/cashflow-rules/${id}`, body, signal),
  deleteCashflowRule: (id: string, expectedDataVersion: number, signal?: AbortSignal) =>
    api.delete<void>(`/cashflow-rules/${id}?expected_data_version=${expectedDataVersion}`, signal),
}
