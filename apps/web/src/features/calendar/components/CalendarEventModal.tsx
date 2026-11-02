import { useEffect } from 'react'
import { CalendarEventItem } from '../api'
import { Money } from '@/components/ui/Money'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatFinancialDate } from '@/lib/dates'

interface CalendarEventModalProps {
  event: CalendarEventItem | null
  onClose: () => void
}

export function CalendarEventModal({ event, onClose }: CalendarEventModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (event) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [event, onClose])

  if (!event) return null

  const isIncome = event.direction === 'income'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-event-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          maxWidth: '480px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 id="calendar-event-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {event.provider_alias || event.category}
            </h3>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
              {formatFinancialDate(event.event_date)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#94a3b8',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Amount Hero */}
        <div
          style={{
            padding: 16,
            borderRadius: 6,
            background: isIncome ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${isIncome ? '#bbf7d0' : '#fecaca'}`,
            marginBottom: 20,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 500, color: isIncome ? '#166534' : '#991b1b', textTransform: 'uppercase' }}>
            {isIncome ? 'Scheduled Income' : 'Scheduled Outflow'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: isIncome ? '#15803d' : '#b91c1c', marginTop: 4 }}>
            {isIncome ? '+' : '-'}
            <Money paise={event.amount_paise} />
          </div>
        </div>

        {/* Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, marginBottom: 20 }}>
          <div>
            <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Category</div>
            <div style={{ fontWeight: 500, marginTop: 2 }}>{event.category}</div>
          </div>

          <div>
            <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Payment Status</div>
            <div style={{ marginTop: 2 }}>
              <StatusBadge status={event.payment_status} />
            </div>
          </div>

          <div>
            <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Source Type</div>
            <div style={{ fontWeight: 500, marginTop: 2, textTransform: 'capitalize' }}>
              {event.source_type.replace('_', ' ')}
            </div>
          </div>

          <div>
            <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Timing</div>
            <div style={{ fontWeight: 500, marginTop: 2, textTransform: 'capitalize' }}>
              {event.timing}
            </div>
          </div>

          {event.obligation_kind && (
            <div>
              <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Obligation Kind</div>
              <div style={{ fontWeight: 500, marginTop: 2, textTransform: 'capitalize' }}>
                {event.obligation_kind.replace('_', ' ')}
              </div>
            </div>
          )}

          {event.actual_paid_date && (
            <div>
              <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Actual Paid Date</div>
              <div style={{ fontWeight: 500, marginTop: 2, color: '#15803d' }}>
                {formatFinancialDate(event.actual_paid_date)}
              </div>
            </div>
          )}

          {event.is_protected_goal && (
            <div style={{ gridColumn: 'span 2' }}>
              <span
                style={{
                  display: 'inline-block',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                ★ Protected Goal Contribution
              </span>
            </div>
          )}

          {event.is_already_reflected && (
            <div style={{ gridColumn: 'span 2', color: '#64748b', fontSize: 12, fontStyle: 'italic' }}>
              ℹ Already reflected in opening cash balance.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              fontWeight: 500,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
