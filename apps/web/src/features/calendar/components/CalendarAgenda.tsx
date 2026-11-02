import { CalendarDailySummary, CalendarEventItem } from '../api'
import { Money } from '@/components/ui/Money'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatFinancialDate, todayISO } from '@/lib/dates'

interface CalendarAgendaProps {
  dailySummaries: CalendarDailySummary[]
  onSelectEvent: (event: CalendarEventItem) => void
}

export function CalendarAgenda({ dailySummaries, onSelectEvent }: CalendarAgendaProps) {
  const today = todayISO()

  if (!dailySummaries || dailySummaries.length === 0) {
    return (
      <div
        style={{
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 48,
          textAlign: 'center',
          color: '#64748b',
        }}
      >
        <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>No scheduled cash events for this period.</p>
        <p style={{ margin: '8px 0 0', fontSize: 13 }}>
          Add income rules, expenses, or obligations to see your dated schedule.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {dailySummaries.map((day) => {
        const isToday = day.event_date === today

        return (
          <div
            key={day.event_date}
            style={{
              background: 'white',
              border: isToday ? '1px solid var(--color-primary, #0d9488)' : '1px solid #e2e8f0',
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            {/* Day Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                background: isToday ? '#f0fdfa' : '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                  {formatFinancialDate(day.event_date)}
                </span>
                {isToday && (
                  <span
                    style={{
                      background: '#ccfbf1',
                      color: 'var(--color-primary, #0d9488)',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      textTransform: 'uppercase',
                    }}
                  >
                    Today
                  </span>
                )}
              </div>

              {/* Day Metrics */}
              <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                {day.scheduled_income_paise > 0 && (
                  <span style={{ color: '#166534', fontWeight: 600 }}>
                    +<Money paise={day.scheduled_income_paise} />
                  </span>
                )}
                {day.scheduled_outflow_paise > 0 && (
                  <span style={{ color: '#991b1b', fontWeight: 600 }}>
                    -<Money paise={day.scheduled_outflow_paise} />
                  </span>
                )}
                <span style={{ color: day.net_paise >= 0 ? '#15803d' : '#b91c1c', fontWeight: 700 }}>
                  Net: {day.net_paise >= 0 ? '+' : ''}
                  <Money paise={day.net_paise} />
                </span>
              </div>
            </div>

            {/* Events List */}
            <div style={{ padding: '8px 16px' }}>
              {day.events.map((ev, evIdx) => {
                const isIncome = ev.direction === 'income'

                return (
                  <div
                    key={`${ev.source_id}-${evIdx}`}
                    onClick={() => onSelectEvent(ev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: evIdx < day.events.length - 1 ? '1px solid #f1f5f9' : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: isIncome ? '#dcfce7' : '#fee2e2',
                          color: isIncome ? '#166534' : '#991b1b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        {isIncome ? '↓' : '↑'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
                          {ev.provider_alias || ev.category}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                          <span style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>
                            {ev.category}
                          </span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>•</span>
                          <span style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>
                            {ev.source_type.replace('_', ' ')}
                          </span>
                          {ev.is_protected_goal && (
                            <>
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>•</span>
                              <span style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}>Protected Goal</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <StatusBadge status={ev.payment_status} />
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: isIncome ? '#15803d' : '#b91c1c',
                          minWidth: 90,
                          textAlign: 'right',
                        }}
                      >
                        {isIncome ? '+' : '-'}
                        <Money paise={ev.amount_paise} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
