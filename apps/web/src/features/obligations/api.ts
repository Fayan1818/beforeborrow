import { api } from '@/lib/api'

export interface ObligationOut {
  id: string
  provider_alias: string
  kind: string
  principal_remaining_paise: number
  status: string
  source: string
  version: number
  payments: Array<{
    id: string
    due_date: string
    amount_paise: number
    payment_status: string
  }>
  created_at: string
}

export const obligationsApi = {
  list: (signal?: AbortSignal) => api.get<ObligationOut[]>('/obligations', signal),
  create: (body: object) => api.post<ObligationOut>('/obligations', body),
  update: (id: string, body: object) => api.patch<ObligationOut>(`/obligations/${id}`, body),
  delete: (id: string) => api.delete<void>(`/obligations/${id}`),
}
