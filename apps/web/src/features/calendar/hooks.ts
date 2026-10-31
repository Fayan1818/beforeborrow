import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { calendarApi } from './api'

export function useCalendar(userId: string, from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.calendar(userId, from, to),
    queryFn: ({ signal }) => calendarApi.get(from, to, signal),
  })
}
