import { api } from '@/lib/api'

export const decisionApi = {
  createScenario: (body: object) => api.post<object>('/scenarios', body),
  updateScenario: (id: string, body: object) => api.put<object>(`/scenarios/${id}`, body),
  analyze: (scenarioId: string, body: object) =>
    api.post<object>(`/scenarios/${scenarioId}/analyze`, body),
  counterfactuals: (scenarioId: string, body: object) =>
    api.post<object>(`/scenarios/${scenarioId}/counterfactuals`, body),
}
