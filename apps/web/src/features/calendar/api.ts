import { api } from '@/lib/api'

export type EventDirection = 'income' | 'outflow'
export type EventSourceType = 'cashflow_rule' | 'obligation_payment' | 'goal_contribution'
export type CalendarPaymentStatus = 'scheduled' | 'paid' | 'planned'

export interface CalendarEventItem {
  event_date: string // YYYY-MM-DD
  amount_paise: number
  direction: EventDirection
  category: string
  source_type: EventSourceType
  source_id: string
  timing: 'known' | 'estimated'
  payment_status: CalendarPaymentStatus
  provider_alias?: string | null
  obligation_kind?: string | null
  goal_id?: string | null
  is_protected_goal: boolean
  is_already_reflected: boolean
  actual_paid_date?: string | null
}

export interface CalendarDailySummary {
  event_date: string // YYYY-MM-DD
  events: CalendarEventItem[]
  scheduled_income_paise: number
  scheduled_outflow_paise: number
  net_paise: number
}

export interface RollingSevenDayOutflow {
  window_start: string
  window_end: string
  outflow_paise: number
  event_count: number
}

export interface CalendarScheduleResult {
  from_date: string
  to_date: string
  events: CalendarEventItem[]
  daily_summaries: CalendarDailySummary[]
  rolling_7d_outflows: RollingSevenDayOutflow[]
  total_scheduled_income_paise: number
  total_scheduled_outflow_paise: number
  net_scheduled_cashflow_paise: number
  total_event_count: number
  disclaimer: string
}

export const calendarApi = {
  get: (from: string, to: string, signal?: AbortSignal) =>
    api.get<CalendarScheduleResult>(`/calendar?from=${from}&to=${to}`, signal),
}
