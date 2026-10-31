import { useMutation } from '@tanstack/react-query'
import { decisionApi } from './api'

export function useCreateScenario() {
  return useMutation({ mutationFn: decisionApi.createScenario })
}

export function useAnalyzeScenario(scenarioId: string) {
  return useMutation({ mutationFn: (body: object) => decisionApi.analyze(scenarioId, body) })
}
