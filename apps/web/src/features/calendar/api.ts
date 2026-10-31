import { api } from '@/lib/api'

export const calendarApi = {
  get: (from: string, to: string, signal?: AbortSignal) =>
    api.get<object>(`/calendar?from=${from}&to=${to}`, signal),
}
