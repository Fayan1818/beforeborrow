import { useMemo } from 'react'
import { CalendarEventItem } from '../api'
import { Money } from '@/components/ui/Money'
import { todayISO } from '@/lib/dates'

interface CalendarGridProps {
  year: number
  month: number // 1-indexed
  events: CalendarEventItem[]
  onSelectEvent: (event: CalendarEventItem) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarGrid({ year, month, events, onSelectEvent }: CalendarGridProps) {
  const today = todayISO()

  // Map events by date (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEventItem[]> = {}
    for (const ev of events) {
      if (!map[ev.event_date]) {
        map[ev.event_date] = []
      }
      map[ev.event_date].push(ev)
    }
    return map
  }, [events])

  // Calendar cells computation
  const cells = useMemo(() => {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const firstDayOfWeek = new Date(Date.UTC(year, month - 1, 1)).getUTCDay() // 0 = Sun

    const result: Array<{ dayNumber: number | null; dateStr: string | null }> = []

    // Padding for first week
    for (let i = 0; i < firstDayOfWeek; i++) {
      result.push({ dayNumber: null, dateStr: null })
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(month).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      const dateStr = `${year}-${mm}-${dd}`
      result.push({ dayNumber: d, dateStr })
    }

    // Trailing padding to complete grid rows
    const remainder = result.length % 7
    if (remainder !== 0) {
      for (let i = 0; i < 7 - remainder; i++) {
        result.push({ dayNumber: null, dateStr: null })
      }
    }

    return result
  }, [year, month])

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Weekday Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          textAlign: 'center',
          fontWeight: 600,
          fontSize: 12,
          color: '#64748b',
          padding: '10px 0',
        }}
      >
        {WEEKDAYS.map((wd) => (
          <div key={wd}>{wd}</div>
        ))}
      </div>

      {/* Days Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
        }}
      >
        {cells.map((cell, idx) => {
          if (!cell.dayNumber || !cell.dateStr) {
            return (
              <div
                key={`empty-${idx}`}
                style={{
                  minHeight: 100,
                  background: '#f8fafc',
                  borderRight: (idx + 1) % 7 !== 0 ? '1px solid #f1f5f9' : 'none',
                  borderBottom: '1px solid #f1f5f9',
                }}
              />
            )
          }

          const isToday = cell.dateStr === today
          const dayEvents = eventsByDate[cell.dateStr] ?? []

          return (
            <div
              key={cell.dateStr}
              style={{
                minHeight: 110,
                padding: '8px',
                borderRight: (idx + 1) % 7 !== 0 ? '1px solid #e2e8f0' : 'none',
                borderBottom: '1px solid #e2e8f0',
                background: isToday ? '#f0fdfa' : 'white',
                display: 'flex',
                flexDirection: 'column',
                transition: 'background-color 0.15s ease',
              }}
            >
              {/* Day header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? 'var(--color-primary, #0d9488)' : '#334155',
                    borderRadius: isToday ? '50%' : undefined,
                    width: isToday ? 22 : undefined,
                    height: isToday ? 22 : undefined,
                    display: isToday ? 'flex' : 'inline',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isToday ? '#ccfbf1' : 'transparent',
                  }}
                >
                  {cell.dayNumber}
                </span>

                {isToday && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary, #0d9488)', textTransform: 'uppercase' }}>
                    Today
                  </span>
                )}
              </div>

              {/* Day event chips */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                {dayEvents.map((ev, evIdx) => {
                  const isIncome = ev.direction === 'income'
                  const isPaid = ev.payment_status === 'paid'
                  const title = ev.provider_alias || ev.category

                  return (
                    <button
                      key={`${ev.source_id}-${evIdx}`}
                      onClick={() => onSelectEvent(ev)}
                      title={`${title} - ${isIncome ? '+' : '-'}${ev.amount_paise / 100} (${ev.payment_status})`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '3px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500,
                        textAlign: 'left',
                        cursor: 'pointer',
                        border: 'none',
                        background: isIncome ? '#dcfce7' : '#fee2e2',
                        color: isIncome ? '#166534' : '#991b1b',
                        width: '100%',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 4 }}>
                        {isPaid && '✓ '}
                        {title}
                      </span>
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>
                        <Money paise={ev.amount_paise} />
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
