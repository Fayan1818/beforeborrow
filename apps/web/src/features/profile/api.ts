import { api } from '@/lib/api'

export interface ProfileOut {
  id: string
  currency: string
  timezone: string
  opening_cash_paise: number
  balance_as_of: string
  reserve_floor_paise: number
  data_version: number
  updated_at: string
}

export const profileApi = {
  get: (signal?: AbortSignal) => api.get<ProfileOut>('/profile', signal),
  upsert: (body: object) => api.put<ProfileOut>('/profile', body),
}
