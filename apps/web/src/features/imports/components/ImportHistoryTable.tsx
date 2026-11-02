import { ImportBatchOut } from '../api'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatTimestamp } from '@/lib/dates'

interface ImportHistoryTableProps {
  batches: ImportBatchOut[]
  isLoading: boolean
}

export function ImportHistoryTable({ batches, isLoading }: ImportHistoryTableProps) {
  if (isLoading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#64748b', background: 'white', borderRadius: 8 }}>
        Loading import history...
      </div>
    )
  }

  if (!batches || batches.length === 0) {
    return (
      <div
        style={{
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 40,
          textAlign: 'center',
          color: '#64748b',
        }}
      >
        <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>No previous statements imported yet.</p>
        <p style={{ margin: '6px 0 0', fontSize: 13 }}>
          Upload a statement CSV to stage and commit debt schedules.
        </p>
      </div>
    )
  }

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
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
          Import Batch History
        </h3>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
          Audit trail of staged and committed financial statements
        </p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
              <th style={{ padding: '10px 16px' }}>Batch ID</th>
              <th style={{ padding: '10px 16px' }}>Created Date</th>
              <th style={{ padding: '10px 16px' }}>Status</th>
              <th style={{ padding: '10px 16px' }}>Rows Staged</th>
              <th style={{ padding: '10px 16px' }}>Committed Payments</th>
              <th style={{ padding: '10px 16px' }}>File Hash</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => {
              const previewData = batch.preview_json as { total_rows?: number; valid_rows_count?: number } | null
              const resultData = batch.result_json as { committed_count?: number } | null

              return (
                <tr key={batch.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {/* Batch ID */}
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12 }}>
                    <span title={batch.id}>{batch.id.slice(0, 8)}...</span>
                  </td>

                  {/* Created Date */}
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    {formatTimestamp(batch.created_at)}
                  </td>

                  {/* Status Badge */}
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge status={batch.status} />
                  </td>

                  {/* Rows Staged */}
                  <td style={{ padding: '12px 16px' }}>
                    {previewData?.total_rows ?? '—'}
                  </td>

                  {/* Committed count */}
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                    {resultData?.committed_count ?? (batch.status === 'committed' ? 'Yes' : '0')}
                  </td>

                  {/* File Hash */}
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>
                    <span title={batch.file_hash}>{batch.file_hash.slice(0, 12)}...</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
