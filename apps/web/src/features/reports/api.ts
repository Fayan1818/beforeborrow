import { api } from '@/lib/api'

export const reportsApi = {
  createReceipt: (body: object) => api.post<object>('/receipts', body),
  getReceipt: (id: string, signal?: AbortSignal) => api.get<object>(`/receipts/${id}`, signal),
  exportReceipt: (id: string, signal?: AbortSignal) =>
    api.get<object>(`/receipts/${id}/export`, signal),
}
