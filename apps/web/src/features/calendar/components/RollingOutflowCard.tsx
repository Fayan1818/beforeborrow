import { RollingSevenDayOutflow } from '../api'
import { Money } from '@/components/ui/Money'
import { formatFinancialDate } from '@/lib/dates'

interface RollingOutflowCardProps {
  outflows: RollingSevenDayOutflow[]
}

export function RollingOutflowCard({ outflows }: RollingOutflowCardProps) {
  if (!outflows || outflows.length === 0) return null

  // Take the primary or first few active 7-day rolling windows
  const activeWindows = outflows.slice(0, 4)

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
            7-Day Rolling Outflow Commitments
          </h4>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
            Continuous rolling windows computed by backend calendar engine
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        {activeWindows.map((w, idx) => (
          <div
            key={`${w.window_start}-${w.window_end}-${idx}`}
            style={{
              padding: 12,
              borderRadius: 6,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
              {formatFinancialDate(w.window_start)} – {formatFinancialDate(w.window_end)}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#b91c1c', marginTop: 4 }}>
              <Money paise={w.outflow_paise} />
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {w.event_count} {w.event_count === 1 ? 'outflow event' : 'outflow events'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
