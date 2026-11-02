import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '@/features/auth/hooks'
import { useImportBatches, useImportPreview } from '../hooks'
import { useObligations } from '@/features/obligations/hooks'
import { ImportPreviewResult } from '../api'
import { ImportUploadCard } from '../components/ImportUploadCard'
import { ImportPreviewTable } from '../components/ImportPreviewTable'
import { ImportCommitModal } from '../components/ImportCommitModal'
import { ImportHistoryTable } from '../components/ImportHistoryTable'

export default function ImportsPage() {
  const { data: user } = useMe()
  const { data: batches, isLoading: batchesLoading, refetch: refetchBatches } = useImportBatches(user?.id)
  const { data: obligations = [] } = useObligations(user?.id ?? '')

  const previewMutation = useImportPreview()

  const [activePreview, setActivePreview] = useState<ImportPreviewResult | null>(null)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false)

  // Handle uploading and previewing a new CSV file
  async function handlePreviewFile(file: File) {
    try {
      const result = await previewMutation.mutateAsync(file)
      setActivePreview(result)

      // Auto-select valid pre-matched rows
      const initialSelected = new Set<string>()
      for (const row of result.rows) {
        if (row.is_valid && row.matched_obligation_id) {
          initialSelected.add(row.row_id)
        }
      }
      setSelectedRowIds(initialSelected)
      setMappings({})
    } catch {
      // Handled via previewMutation.error
    }
  }

  function handleToggleRow(rowId: string) {
    setSelectedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  function handleSelectAllValid() {
    if (!activePreview) return
    const next = new Set<string>()
    for (const row of activePreview.rows) {
      if (row.is_valid && (row.matched_obligation_id || mappings[row.row_id])) {
        next.add(row.row_id)
      }
    }
    setSelectedRowIds(next)
  }

  function handleDeselectAll() {
    setSelectedRowIds(new Set())
  }

  function handleMapObligation(rowId: string, obligationId: string) {
    setMappings((prev) => ({
      ...prev,
      [rowId]: obligationId,
    }))
    if (obligationId) {
      setSelectedRowIds((prev) => new Set(prev).add(rowId))
    }
  }

  function handleResetPreview() {
    setActivePreview(null)
    setSelectedRowIds(new Set())
    setMappings({})
    previewMutation.reset()
  }

  function handleCommitSuccess() {
    setIsCommitModalOpen(false)
    handleResetPreview()
    refetchBatches()
  }

  // Calculate total amount in paise for selected rows
  const totalSelectedPaise = useMemo(() => {
    if (!activePreview) return 0
    let total = 0
    for (const row of activePreview.rows) {
      if (selectedRowIds.has(row.row_id) && row.amount_paise) {
        total += row.amount_paise
      }
    }
    return total
  }, [activePreview, selectedRowIds])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
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
            CSV Import Management
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Stage, validate, map, and idempotently commit statement debt schedules
          </p>
        </div>

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
            Obligations
          </Link>
          <Link
            to="/calendar"
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
            Calendar
          </Link>
        </div>
      </div>

      {/* Upload Box (Visible when not actively previewing) */}
      {!activePreview && (
        <ImportUploadCard
          onPreview={handlePreviewFile}
          isLoading={previewMutation.isPending}
          errorMessage={previewMutation.error?.message}
        />
      )}

      {/* Staged Preview Table */}
      {activePreview && (
        <ImportPreviewTable
          preview={activePreview}
          obligations={obligations}
          selectedRowIds={selectedRowIds}
          onToggleRow={handleToggleRow}
          onSelectAllValid={handleSelectAllValid}
          onDeselectAll={handleDeselectAll}
          mappings={mappings}
          onMapObligation={handleMapObligation}
          onOpenCommit={() => setIsCommitModalOpen(true)}
          onResetPreview={handleResetPreview}
        />
      )}

      {/* Commit Modal */}
      {isCommitModalOpen && activePreview && (
        <ImportCommitModal
          batchId={activePreview.import_batch_id}
          selectedRowIds={Array.from(selectedRowIds)}
          mappings={mappings}
          userId={user?.id}
          totalPaise={totalSelectedPaise}
          onClose={() => setIsCommitModalOpen(false)}
          onSuccess={handleCommitSuccess}
        />
      )}

      {/* Past Batches History */}
      <ImportHistoryTable
        batches={batches ?? []}
        isLoading={batchesLoading}
      />
    </div>
  )
}