import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '@/features/auth/hooks'
import { useCalendar } from '../hooks'
import { CalendarEventItem } from '../api'
import { CalendarGrid } from '../components/CalendarGrid'
import { CalendarAgenda } from '../components/CalendarAgenda'
import { CalendarEventModal } from '../components/CalendarEventModal'
import { RollingOutflowCard } from '../components/RollingOutflowCard'
import { Money } from '@/components/ui/Money'
import { getMonthRange, formatMonthYear, todayISO } from '@/lib/dates'

export default function CalendarPage() {
  const { data: user } = useMe()

  // Initialize with current date in Asia/Kolkata
  const today = todayISO()
  const [initialYear, initialMonth] = today.split('-').map(Number)

  const [year, setYear] = useState<number>(initialYear)
  const [month, setMonth] = useState<number>(initialMonth)
  const [viewMode, setViewMode] = useState<'grid' | 'agenda'>('grid')
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(null)

  // Compute [from, to] for the selected month
  const { from, to } = useMemo(() => getMonthRange(year, month), [year, month])

  const { data, isLoading, isError, error, refetch } = useCalendar(user?.id, from, to)

  function handlePrevMonth() {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function handleNextMonth() {
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  function handleGoToday() {
    setYear(initialYear)
    setMonth(initialMonth)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
            Financial Calendar
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Scheduled income, debt payments, and cash commitments on actual dates
          </p>
        </div>

        {/* Action Links */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            to="/obligations"
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#334155',
              fontWeight: 500,
              fontSize: 13,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Manage Obligations
          </Link>
          <Link
            to="/imports"
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              background: 'var(--color-primary, #0d9488)',
              color: 'white',
              fontWeight: 600,
              fontSize: 13,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Import CSV Statement
          </Link>
        </div>
      </div>

      {/* Month Navigation & Controls Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '12px 16px',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {/* Navigation Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={handlePrevMonth}
              aria-label="Previous month"
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: '1px solid #cbd5e1',
                background: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              ◀
            </button>
            <button
              onClick={handleNextMonth}
              aria-label="Next month"
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: '1px solid #cbd5e1',
                background: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              ▶
            </button>
          </div>

          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a', minWidth: 160 }}>
            {formatMonthYear(year, month)}
          </h2>

          <button
            onClick={handleGoToday}
            style={{
              padding: '5px 10px',
              borderRadius: 4,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Today
          </button>
        </div>

        {/* View Mode Toggle */}
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 6, padding: 2 }}>
          <button
            onClick={() => setViewMode('grid')}
            style={{
              padding: '6px 14px',
              borderRadius: 5,
              border: 'none',
              background: viewMode === 'grid' ? 'white' : 'transparent',
              color: viewMode === 'grid' ? 'var(--color-primary, #0d9488)' : '#64748b',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            Monthly Grid
          </button>
          <button
            onClick={() => setViewMode('agenda')}
            style={{
              padding: '6px 14px',
              borderRadius: 5,
              border: 'none',
              background: viewMode === 'agenda' ? 'white' : 'transparent',
              color: viewMode === 'agenda' ? 'var(--color-primary, #0d9488)' : '#64748b',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: viewMode === 'agenda' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            Agenda View
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
          }}
        >
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
            <div style={{ color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>
              Scheduled Income
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#166534', marginTop: 4 }}>
              +<Money paise={data.total_scheduled_income_paise} />
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
            <div style={{ color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>
              Scheduled Outflow
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#b91c1c', marginTop: 4 }}>
              -<Money paise={data.total_scheduled_outflow_paise} />
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
            <div style={{ color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>
              Net Scheduled Cashflow
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: data.net_scheduled_cashflow_paise >= 0 ? '#15803d' : '#b91c1c',
                marginTop: 4,
              }}
            >
              {data.net_scheduled_cashflow_paise >= 0 ? '+' : ''}
              <Money paise={data.net_scheduled_cashflow_paise} />
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
            <div style={{ color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>
              Total Events
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              {data.total_event_count}
            </div>
          </div>
        </div>
      )}

      {/* 7-Day Rolling Outflows */}
      {data?.rolling_7d_outflows && <RollingOutflowCard outflows={data.rolling_7d_outflows} />}

      {/* Loading & Error States */}
      {isLoading && (
        <div style={{ padding: 48, textAlign: 'center', color: '#64748b', background: 'white', borderRadius: 8 }}>
          Loading financial calendar schedule...
        </div>
      )}

      {isError && (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <strong>Error loading calendar:</strong> {(error as Error)?.message || 'Failed to fetch schedule'}
          </div>
          <button
            onClick={() => refetch()}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              background: '#991b1b',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Calendar Views */}
      {!isLoading && !isError && data && (
        <>
          {viewMode === 'grid' ? (
            <CalendarGrid
              year={year}
              month={month}
              events={data.events}
              onSelectEvent={(ev) => setSelectedEvent(ev)}
            />
          ) : (
            <CalendarAgenda
              dailySummaries={data.daily_summaries}
              onSelectEvent={(ev) => setSelectedEvent(ev)}
            />
          )}

          {/* Disclaimer text from backend */}
          {data.disclaimer && (
            <div
              style={{
                fontSize: 12,
                color: '#64748b',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: '10px 14px',
                lineHeight: 1.5,
              }}
            >
              ℹ {data.disclaimer}
            </div>
          )}
        </>
      )}

      {/* Event Details Modal */}
      <CalendarEventModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  )
}