import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { modelInspectorApi } from './api'

export function useAnalysis(userId: string, id: string) {
  return useQuery({
    queryKey: queryKeys.analysis(userId, id),
    queryFn: ({ signal }) => modelInspectorApi.getAnalysis(id, signal),
  })
}
