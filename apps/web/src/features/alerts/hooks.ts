import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { alertsApi } from './api'

export function useAlerts(userId: string) {
  return useQuery({
    queryKey: queryKeys.alerts(userId),
    queryFn: ({ signal }) => alertsApi.list(signal),
  })
}
