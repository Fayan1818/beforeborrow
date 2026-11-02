import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { profileApi, SnapshotOut } from '@/features/profile/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { formatFinancialDate } from '@/lib/dates'

export function PreviewSnapshotView() {
  const [showJson, setShowJson] = useState(false)

  const {
    data: snapshotData,
    isLoading,
    error,
    refetch,
  } = useQuery<SnapshotOut>({
    queryKey: ['financial-snapshot', 'dev-preview-user-b'],
    queryFn: ({ signal }) => profileApi.getSnapshot(signal),
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280, color: '#64748b' }}>
        Loading financial snapshot and data quality validation...
      </div>
    )
  }

  if (error || !snapshotData) {
    return (
      <Card title="Financial Snapshot Unavailable">
        <p style={{ color: '#ef4444' }}>
          No financial profile found. Complete onboarding in the Profile tab to generate a valid snapshot.
        </p>
        <Button onClick={() => refetch()} style={{ marginTop: 12 }}>
          Retry Snapshot Generation
        </Button>
      </Card>
    )
  }

  const { snapshot, data_quality } = snapshotData

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Title & Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
            Financial Snapshot & Data Quality Inspector
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            Unified point-in-time financial state passed to the deterministic affordability calculation engine.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => setShowJson(!showJson)}>
            {showJson ? 'Hide Engine JSON' : 'Inspect Engine JSON'}
          </Button>
          <Button variant="secondary" onClick={() => refetch()}>
            Refresh Snapshot
          </Button>
        </div>
      </div>

      {/* 1. Data Quality Validation Card */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 10px',
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 700,
                background: data_quality.is_valid ? '#dcfce7' : '#fee2e2',
                color: data_quality.is_valid ? '#15803d' : '#b91c1c',
              }}
            >
              {data_quality.is_valid ? '✓ DATA QUALITY: PASS' : '⚠ DATA QUALITY: BLOCKED'}
            </span>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              Data Version: <strong>v{data_quality.data_version ?? 'None'}</strong>
            </span>
          </div>
        </div>

        <p style={{ fontSize: 14, color: '#334155', margin: '0 0 16px 0', lineHeight: 1.5 }}>
          {data_quality.summary}
        </p>

        {data_quality.blocking_gaps.length > 0 && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600, color: '#991b1b', fontSize: 13, marginBottom: 4 }}>
              Blocking Gaps (Engine Evaluation Prevented):
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, color: '#b91c1c', fontSize: 13 }}>
              {data_quality.blocking_gaps.map((gap, i) => (
                <li key={i}>{gap}</li>
              ))}
            </ul>
          </div>
        )}

        {data_quality.warnings.length > 0 && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: '#fffbeb',
              border: '1px solid #fde68a',
            }}
          >
            <div style={{ fontWeight: 600, color: '#92400e', fontSize: 13, marginBottom: 4 }}>
              Active Quality Warnings:
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, color: '#b45309', fontSize: 13 }}>
              {data_quality.warnings.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* 2. Key Metrics & Financial Core */}
      {snapshot && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <Card>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
              Opening Cash Balance
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '8px 0 4px 0' }}>
              <Money paise={snapshot.opening_cash_paise} />
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              As of {formatFinancialDate(snapshot.balance_as_of)}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
              Minimum Reserve Floor
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0d9488', margin: '8px 0 4px 0' }}>
              <Money paise={snapshot.reserve_floor_paise} />
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Hard liquidity safety threshold
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
              Recurring Cashflows
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '8px 0 4px 0' }}>
              {snapshot.income_rules.length + snapshot.expense_rules.length} Rules
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {snapshot.income_rules.length} Income • {snapshot.expense_rules.length} Expense
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
              Active Obligations
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '8px 0 4px 0' }}>
              {snapshot.obligations.length} Tracked
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Loans, Cards & BNPL Schedules
            </div>
          </Card>
        </div>
      )}

      {/* 3. Detailed Structure Breakdown */}
      {snapshot && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          <Card title="Snapshot Cashflow Rules">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {snapshot.income_rules.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: '#f0fdf4',
                    border: '1px solid #dcfce7',
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#15803d' }}>+ {r.category}</span>
                  <span style={{ fontWeight: 700, color: '#15803d' }}>
                    <Money paise={r.amount_paise} />
                  </span>
                </div>
              ))}
              {snapshot.expense_rules.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: '#fef2f2',
                    border: '1px solid #fee2e2',
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#b91c1c' }}>- {r.category}</span>
                  <span style={{ fontWeight: 700, color: '#b91c1c' }}>
                    <Money paise={r.amount_paise} />
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Snapshot Obligations">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {snapshot.obligations.map((o) => (
                <div
                  key={o.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: 6,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{o.provider_alias}</div>
                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>
                      {o.kind}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                      <Money paise={o.principal_remaining_paise} />
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>principal</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 4. Engine-Ready Raw JSON Inspector */}
      {showJson && (
        <Card title="Engine Integration Payload (Raw JSON)">
          <pre
            style={{
              padding: 16,
              borderRadius: 8,
              background: '#0f172a',
              color: '#38bdf8',
              fontSize: 12,
              fontFamily: 'monospace',
              overflowX: 'auto',
              maxHeight: 400,
            }}
          >
            {JSON.stringify(snapshotData, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  )
}
