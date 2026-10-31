import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { obligationsApi } from './api'

export function useObligations(userId: string) {
  return useQuery({
    queryKey: queryKeys.obligations(userId),
    queryFn: ({ signal }) => obligationsApi.list(signal),
  })
}
