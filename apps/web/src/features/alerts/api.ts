import { api } from '@/lib/api'

export const alertsApi = {
  list: (signal?: AbortSignal) => api.get<object[]>('/alerts', signal),
  dismiss: (id: string) => api.patch<object>(`/alerts/${id}`, {}),
}
