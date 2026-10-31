import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { reportsApi } from './api'

export function useReceipt(userId: string, id: string) {
  return useQuery({
    queryKey: queryKeys.receipt(userId, id),
    queryFn: ({ signal }) => reportsApi.getReceipt(id, signal),
  })
}
