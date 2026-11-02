import { useState, useId, useEffect, useMemo } from 'react'
import { useCommitImport } from '../hooks'
import { ImportCommitResult } from '../api'
import { Money } from '@/components/ui/Money'
import { ApiRequestError } from '@/lib/api'

interface ImportCommitModalProps {
  batchId: string
  selectedRowIds: string[]
  mappings: Record<string, string>
  userId: string | undefined
  totalPaise: number
  onClose: () => void
  onSuccess: () => void
}

export function ImportCommitModal({
  batchId,
  selectedRowIds,
  mappings,
  userId,
  totalPaise,
  onClose,
  onSuccess,
}: ImportCommitModalProps) {
  const commitMutation = useCommitImport(userId)
  const clientRand = useId()

  // Generate a STABLE idempotency key for this commit batch.
  // Reused across retries of the identical commit request.
  const idempotencyKey = useMemo(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `commit-${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`
    }
    return `commit-${Date.now()}-${clientRand.replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 32)
  }, [batchId, clientRand])

  const [conflictError, setConflictError] = useState<string | null>(null)
  const [genericError, setGenericError] = useState<string | null>(null)
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !commitMutation.isPending && !commitResult) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, commitMutation.isPending, commitResult])

  async function handleConfirmCommit() {
    setConflictError(null)
    setGenericError(null)

    // Filter mappings to only include selected rows
    const cleanMappings: Record<string, string> = {}
    for (const rowId of selectedRowIds) {
      if (mappings[rowId]) {
        cleanMappings[rowId] = mappings[rowId]
      }
    }

    try {
      const result = await commitMutation.mutateAsync({
        batch_id: batchId,
        idempotency_key: idempotencyKey,
        selected_row_ids: selectedRowIds,
        obligation_mappings: cleanMappings,
      })
      setCommitResult(result)
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        if (err.status === 409) {
          setConflictError(
            `Commit conflict (409): ${err.message || 'Idempotency conflict or concurrent mutation detected. You can retry with the same key.'}`
          )
        } else if (err.status === 422) {
          setGenericError(`Validation error (422): ${err.message}`)
        } else {
          setGenericError(err.message || 'Commit failed')
        }
      } else if (err instanceof Error) {
        setGenericError(err.message)
      } else {
        setGenericError('Unexpected error occurred during commit')
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="commit-modal-title"
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
        if (e.target === e.currentTarget && !commitMutation.isPending && !commitResult) {
          onClose()
        }
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
        {!commitResult ? (
          <>
            <h3 id="commit-modal-title" style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              Confirm Statement Commit
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              You are about to record repayment records into your active financial profile.
              This operation is atomic and idempotent.
            </p>

            {/* Commit Details Card */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: 16,
                marginBottom: 16,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                  Selected Payments
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                  {selectedRowIds.length}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                  Total Scheduled
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#b91c1c', marginTop: 2 }}>
                  <Money paise={totalPaise} />
                </div>
              </div>

              <div style={{ gridColumn: 'span 2', fontSize: 11, color: '#64748b' }}>
                Idempotency Key: <code style={{ background: '#e2e8f0', padding: '2px 4px', borderRadius: 3 }}>{idempotencyKey}</code>
              </div>
            </div>

            {/* Conflict Banner */}
            {conflictError && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 6,
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                <strong>Conflict:</strong> {conflictError}
              </div>
            )}

            {/* Generic Error Banner */}
            {genericError && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 6,
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                <strong>Error:</strong> {genericError}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={commitMutation.isPending}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: commitMutation.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCommit}
                disabled={commitMutation.isPending}
                style={{
                  padding: '8px 20px',
                  borderRadius: 6,
                  background: 'var(--color-primary, #0d9488)',
                  color: 'white',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: commitMutation.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {commitMutation.isPending ? 'Committing...' : 'Confirm & Commit'}
              </button>
            </div>
          </>
        ) : (
          /* Success Screen */
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: '#dcfce7',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              ✓
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              Import Successfully Committed!
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>
              Created <strong>{commitResult.committed_count}</strong> payment records in your obligations schedule.
              {commitResult.idempotent_replay && ' (Idempotent replay detected)'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button
                onClick={onSuccess}
                style={{
                  padding: '8px 24px',
                  borderRadius: 6,
                  background: 'var(--color-primary, #0d9488)',
                  color: 'white',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                View Updated Schedules
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
