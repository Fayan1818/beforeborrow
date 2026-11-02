import { useMemo } from 'react'
import { ImportPreviewResult } from '../api'
import { ObligationOut } from '@/features/obligations/api'
import { Money } from '@/components/ui/Money'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatFinancialDate } from '@/lib/dates'

interface ImportPreviewTableProps {
  preview: ImportPreviewResult
  obligations: ObligationOut[]
  selectedRowIds: Set<string>
  onToggleRow: (rowId: string) => void
  onSelectAllValid: () => void
  onDeselectAll: () => void
  mappings: Record<string, string>
  onMapObligation: (rowId: string, obligationId: string) => void
  onOpenCommit: () => void
  onResetPreview: () => void
}

export function ImportPreviewTable({
  preview,
  obligations,
  selectedRowIds,
  onToggleRow,
  onSelectAllValid,
  onDeselectAll,
  mappings,
  onMapObligation,
  onOpenCommit,
  onResetPreview,
}: ImportPreviewTableProps) {
  // Compute how many rows are currently selectable (valid & mapped or pre-matched)
  const selectableRows = useMemo(() => {
    return preview.rows.filter((row) => {
      if (!row.is_valid) return false
      const hasObligation = row.matched_obligation_id || mappings[row.row_id]
      return Boolean(hasObligation)
    })
  }, [preview.rows, mappings])

  const allSelectableSelected =
    selectableRows.length > 0 && selectableRows.every((r) => selectedRowIds.has(r.row_id))

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 20,
        marginBottom: 24,
      }}
    >
      {/* Header and Summary Metrics */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
            CSV Statement Preview
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Batch ID: <span style={{ fontFamily: 'monospace' }}>{preview.import_batch_id}</span>
          </p>
        </div>

        <button
          onClick={onResetPreview}
          style={{
            background: 'none',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 500,
            color: '#475569',
            cursor: 'pointer',
          }}
        >
          Discard Preview
        </button>
      </div>

      {/* Summary KPI Badges */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 12px', borderRadius: 6, fontSize: 12 }}>
          Total Rows: <strong>{preview.total_rows}</strong>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '6px 12px', borderRadius: 6, fontSize: 12 }}>
          Valid: <strong>{preview.valid_rows_count}</strong>
        </div>
        {preview.invalid_rows_count > 0 && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '6px 12px', borderRadius: 6, fontSize: 12 }}>
            Invalid: <strong>{preview.invalid_rows_count}</strong>
          </div>
        )}
        {preview.exact_duplicates_count > 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '6px 12px', borderRadius: 6, fontSize: 12 }}>
            Exact Duplicates: <strong>{preview.exact_duplicates_count}</strong>
          </div>
        )}
        {preview.possible_duplicates_count > 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '6px 12px', borderRadius: 6, fontSize: 12 }}>
            Possible Duplicates: <strong>{preview.possible_duplicates_count}</strong>
          </div>
        )}
        {preview.unmatched_count > 0 && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '6px 12px', borderRadius: 6, fontSize: 12 }}>
            Requires Obligation Mapping: <strong>{preview.unmatched_count}</strong>
          </div>
        )}
      </div>

      {/* File Errors Banner if any */}
      {preview.file_errors.length > 0 && (
        <div
          style={{
            padding: 12,
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: '#991b1b',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          <strong>File-Level Errors:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
            {preview.file_errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={allSelectableSelected ? onDeselectAll : onSelectAllValid}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: '1px solid #cbd5e1',
              background: 'white',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {allSelectableSelected ? 'Deselect All' : 'Select All Valid'}
          </button>
          <span style={{ fontSize: 13, color: '#475569' }}>
            Selected <strong>{selectedRowIds.size}</strong> of {selectableRows.length} selectable rows
          </span>
        </div>

        <button
          onClick={onOpenCommit}
          disabled={selectedRowIds.size === 0}
          style={{
            padding: '8px 18px',
            borderRadius: 6,
            background: selectedRowIds.size > 0 ? 'var(--color-primary, #0d9488)' : '#cbd5e1',
            color: 'white',
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor: selectedRowIds.size > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          Commit Selected Rows ({selectedRowIds.size})
        </button>
      </div>

      {/* Preview Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
              <th style={{ padding: '8px 10px', width: 40 }}>Select</th>
              <th style={{ padding: '8px 10px' }}>Row #</th>
              <th style={{ padding: '8px 10px' }}>Provider Alias</th>
              <th style={{ padding: '8px 10px' }}>Ext Ref</th>
              <th style={{ padding: '8px 10px' }}>Kind</th>
              <th style={{ padding: '8px 10px' }}>Due Date</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '8px 10px' }}>Status</th>
              <th style={{ padding: '8px 10px' }}>Match State</th>
              <th style={{ padding: '8px 10px' }}>Target Obligation</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => {
              const isSelected = selectedRowIds.has(row.row_id)
              const mappedObligationId = mappings[row.row_id] || row.matched_obligation_id
              const isUnmatched = row.match_status === 'UNMATCHED_OBLIGATION'
              const canSelect = row.is_valid && Boolean(mappedObligationId)

              return (
                <tr
                  key={row.row_id}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: !row.is_valid
                      ? '#fff1f2'
                      : isSelected
                      ? '#f0fdfa'
                      : 'transparent',
                  }}
                >
                  {/* Selection Checkbox */}
                  <td style={{ padding: '10px' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!canSelect}
                      onChange={() => onToggleRow(row.row_id)}
                      title={
                        !row.is_valid
                          ? 'Invalid row cannot be selected'
                          : isUnmatched && !mappings[row.row_id]
                          ? 'Must map to an obligation before selecting'
                          : undefined
                      }
                      style={{ cursor: canSelect ? 'pointer' : 'not-allowed' }}
                    />
                  </td>

                  {/* Row index */}
                  <td style={{ padding: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                    {row.row_index}
                  </td>

                  {/* Provider Alias */}
                  <td style={{ padding: '10px', fontWeight: 600 }}>
                    {row.provider_alias || <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>

                  {/* External Ref */}
                  <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>
                    {row.external_ref || <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>

                  {/* Kind */}
                  <td style={{ padding: '10px', textTransform: 'capitalize' }}>
                    {row.kind ? row.kind.replace('_', ' ') : '—'}
                  </td>

                  {/* Due Date */}
                  <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                    {row.due_date ? formatFinancialDate(row.due_date) : '—'}
                  </td>

                  {/* Amount */}
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>
                    {row.amount_paise !== null ? (
                      <Money paise={row.amount_paise} />
                    ) : (
                      <span style={{ color: '#b91c1c' }}>{row.amount_inr_raw || 'Invalid'}</span>
                    )}
                  </td>

                  {/* Payment status */}
                  <td style={{ padding: '10px' }}>
                    <StatusBadge status={row.status} />
                  </td>

                  {/* Match & Duplicate Status */}
                  <td style={{ padding: '10px' }}>
                    {row.match_status === 'MATCHED' && (
                      <span style={{ color: '#166534', fontWeight: 600, fontSize: 12 }}>
                        ✓ Matched
                      </span>
                    )}
                    {row.match_status === 'UNMATCHED_OBLIGATION' && (
                      <span style={{ color: '#b45309', fontWeight: 600, fontSize: 12 }}>
                        ⚠ Unmatched
                      </span>
                    )}
                    {row.match_status.startsWith('EXACT_DUPLICATE') && (
                      <span style={{ color: '#b91c1c', fontWeight: 600, fontSize: 12 }} title={row.duplicate_reason || ''}>
                        ✕ Duplicate
                      </span>
                    )}
                    {row.match_status.startsWith('POSSIBLE_DUPLICATE') && (
                      <span style={{ color: '#b45309', fontWeight: 600, fontSize: 12 }} title={row.duplicate_reason || ''}>
                        ⚠ Review Dup
                      </span>
                    )}

                    {/* Row Errors */}
                    {row.errors.length > 0 && (
                      <div style={{ color: '#b91c1c', fontSize: 11, marginTop: 4 }}>
                        {row.errors.join(', ')}
                      </div>
                    )}
                  </td>

                  {/* Target Obligation Mapping */}
                  <td style={{ padding: '10px' }}>
                    {isUnmatched ? (
                      <select
                        value={mappings[row.row_id] || ''}
                        onChange={(e) => onMapObligation(row.row_id, e.target.value)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: mappings[row.row_id] ? '1px solid #10b981' : '1px solid #f59e0b',
                          background: 'white',
                          fontSize: 12,
                          maxWidth: 180,
                        }}
                      >
                        <option value="">Select obligation...</option>
                        {obligations
                          .filter((o) => !row.kind || o.kind === row.kind || row.kind === 'other')
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.provider_alias} ({o.kind.replace('_', ' ')})
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {row.matched_obligation_id ? 'Auto-matched' : '—'}
                      </span>
                    )}
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
