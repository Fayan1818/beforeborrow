import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { calendarApi, CalendarScheduleResult } from './api'

export function useCalendar(userId: string | undefined, from: string, to: string) {
  return useQuery<CalendarScheduleResult>({
    queryKey: userId ? queryKeys.calendar(userId, from, to) : ['calendar', from, to],
    queryFn: ({ signal }) => calendarApi.get(from, to, signal),
    enabled: Boolean(userId && from && to),
  })
}
