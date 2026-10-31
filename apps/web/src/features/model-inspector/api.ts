import { api } from '@/lib/api'

export const modelInspectorApi = {
  getAnalysis: (id: string, signal?: AbortSignal) =>
    api.get<object>(`/analyses/${id}`, signal),
}
