import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '@/features/auth/hooks'
import {
  useObligations,
  useCreateObligation,
  useUpdateObligation,
  useDeleteObligation,
  useUpdatePaymentStatus,
  useCreatePayment,
} from '../hooks'
import {
  ObligationOut,
  ObligationKind,
  ObligationStatus,
  ObligationIn,
  ObligationUpdate,
  PaymentStatusUpdate,
  ObligationPaymentIn,
} from '../api'
import { ObligationFormModal } from '../components/ObligationFormModal'
import { ObligationDetailsModal } from '../components/ObligationDetailsModal'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatFinancialDate } from '@/lib/dates'
import { ApiRequestError } from '@/lib/api'

export default function ObligationsPage() {
  const { data: user } = useMe()
  const userId = user?.id ?? ''

  const {
    data: obligations = [],
    isLoading,
    error,
    refetch,
  } = useObligations(userId)

  const createMutation = useCreateObligation(userId)
  const updateMutation = useUpdateObligation(userId)
  const deleteMutation = useDeleteObligation(userId)
  const updatePaymentStatusMutation = useUpdatePaymentStatus(userId)
  const createPaymentMutation = useCreatePayment(userId)

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | ObligationStatus>('all')
  const [kindFilter, setKindFilter] = useState<'all' | ObligationKind>('all')

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingObligation, setEditingObligation] = useState<ObligationOut | null>(null)

  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [selectedObligationId, setSelectedObligationId] = useState<string | null>(null)

  const [obligationToDelete, setObligationToDelete] = useState<ObligationOut | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Derived selected obligation from the latest query data
  const selectedObligation = useMemo(() => {
    if (!selectedObligationId) return null
    return obligations.find((o) => o.id === selectedObligationId) ?? null
  }, [obligations, selectedObligationId])

  // Filtered obligations
  const filteredObligations = useMemo(() => {
    return obligations.filter((o) => {
      const matchStatus = statusFilter === 'all' || o.status === statusFilter
      const matchKind = kindFilter === 'all' || o.kind === kindFilter
      return matchStatus && matchKind
    })
  }, [obligations, statusFilter, kindFilter])

  // Metrics
  const metrics = useMemo(() => {
    const totalPrincipal = obligations
      .filter((o) => o.status === 'active' || o.status === 'paused' || o.status === 'defaulted')
      .reduce((sum, o) => sum + o.principal_remaining_paise, 0)

    const activeCount = obligations.filter((o) => o.status === 'active').length

    let upcomingCommitmentPaise = 0
    obligations.forEach((o) => {
      if (o.status !== 'closed' && o.payments) {
        o.payments.forEach((p) => {
          if (p.payment_status === 'scheduled' || p.payment_status === 'planned') {
            upcomingCommitmentPaise += p.amount_paise
          }
        })
      }
    })

    return {
      totalPrincipal,
      activeCount,
      upcomingCommitmentPaise,
    }
  }, [obligations])

  const handleCreate = async (data: ObligationIn) => {
    await createMutation.mutateAsync(data)
  }

  const handleUpdate = async (id: string, data: ObligationUpdate) => {
    await updateMutation.mutateAsync({ id, body: data })
  }

  const handleDelete = async () => {
    if (!obligationToDelete) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({
        id: obligationToDelete.id,
        expectedVersion: obligationToDelete.version,
      })
      setObligationToDelete(null)
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.status === 409) {
        setDeleteError(
          'Conflict (409): The obligation was modified in another session. Please reload to see the latest state.'
        )
      } else {
        setDeleteError('Failed to delete obligation. Please try again.')
      }
    }
  }

  const handleUpdatePaymentStatus = async (paymentId: string, data: PaymentStatusUpdate) => {
    if (!selectedObligationId) return
    await updatePaymentStatusMutation.mutateAsync({
      obligationId: selectedObligationId,
      paymentId,
      body: data,
    })
  }

  const handleAddPayment = async (data: ObligationPaymentIn) => {
    if (!selectedObligationId) return
    await createPaymentMutation.mutateAsync({
      obligationId: selectedObligationId,
      body: data,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
            Financial Obligations & Debts
          </h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            Track loans, BNPL, credit cards, and scheduled repayment milestones.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
          <Link
            to="/imports"
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
            Import CSV
          </Link>
          <Button
            onClick={() => {
              setEditingObligation(null)
              setFormModalOpen(true)
            }}
          >
            + Add Obligation
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <Card padding="md">
          <span style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
            Total Outstanding Principal
          </span>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)' }}>
            <Money paise={metrics.totalPrincipal} />
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, display: 'block' }}>
            Across all active & paused accounts
          </span>
        </Card>

        <Card padding="md">
          <span style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
            Active Accounts
          </span>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-primary)' }}>
            {metrics.activeCount}
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, display: 'block' }}>
            {obligations.length} total obligations registered
          </span>
        </Card>

        <Card padding="md">
          <span style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
            Total Upcoming Scheduled
          </span>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0f766e' }}>
            <Money paise={metrics.upcomingCommitmentPaise} />
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, display: 'block' }}>
            Scheduled repayment cashflow drain
          </span>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 16px',
          background: '#ffffff',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Status:</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'active', 'paused', 'paid', 'closed', 'defaulted'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: statusFilter === s ? 600 : 400,
                  background: statusFilter === s ? '#e2e8f0' : 'transparent',
                  color: statusFilter === s ? 'var(--color-text)' : '#64748b',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Kind Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Type:</span>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as 'all' | ObligationKind)}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              fontSize: 12,
              background: '#ffffff',
              color: 'var(--color-text)',
            }}
          >
            <option value="all">All Types</option>
            <option value="term_loan">Term Loan</option>
            <option value="bnpl">BNPL</option>
            <option value="card">Credit Card</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Obligations List */}
      {isLoading ? (
        <Card padding="md">
          <div style={{ color: '#64748b', padding: '24px 0', textAlign: 'center' }}>
            Loading obligations and repayment schedules...
          </div>
        </Card>
      ) : error ? (
        <Card padding="md">
          <div style={{ color: '#ef4444', textAlign: 'center' }}>
            Failed to load obligations.{' '}
            <Button size="sm" variant="secondary" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </Card>
      ) : filteredObligations.length === 0 ? (
        <Card padding="lg" style={{ textAlign: 'center', background: '#ffffff' }}>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 12 }}>
            {obligations.length === 0
              ? 'No obligations registered yet. Add your loans or credit cards to see cashflow impacts.'
              : 'No obligations match your selected filters.'}
          </p>
          {obligations.length === 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditingObligation(null)
                setFormModalOpen(true)
              }}
            >
              Add First Obligation
            </Button>
          )}
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredObligations.map((obligation) => {
            const payments = obligation.payments || []
            const upcomingPayments = payments
              .filter((p) => p.payment_status === 'scheduled' || p.payment_status === 'planned')
              .sort((a, b) => a.due_date.localeCompare(b.due_date))
            const nextPayment = upcomingPayments[0] ?? null
            const paidCount = payments.filter((p) => p.payment_status === 'paid').length

            return (
              <Card
                key={obligation.id}
                padding="md"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 16,
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Left: Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>
                      {obligation.provider_alias}
                    </h3>
                    <StatusBadge status={obligation.status} />
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: '#f1f5f9',
                        color: '#475569',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}
                    >
                      {obligation.kind.replace('_', ' ')}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, color: '#64748b' }}>
                    {obligation.source_ref ? `Ref: ${obligation.source_ref} • ` : ''}
                    Payments: {paidCount} / {payments.length} paid
                    {nextPayment && (
                      <span style={{ marginLeft: 8, color: '#0f766e', fontWeight: 500 }}>
                        • Next: <Money paise={nextPayment.amount_paise} /> due{' '}
                        {formatFinancialDate(nextPayment.due_date)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Center / Right: Amounts */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
                      Outstanding Principal
                    </span>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>
                      <Money paise={obligation.principal_remaining_paise} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setSelectedObligationId(obligation.id)
                        setDetailsModalOpen(true)
                      }}
                    >
                      Schedule ({payments.length})
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingObligation(obligation)
                        setFormModalOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setObligationToDelete(obligation)
                        setDeleteError(null)
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modals */}
      <ObligationFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        obligation={editingObligation}
        onSubmitCreate={handleCreate}
        onSubmitUpdate={handleUpdate}
      />

      <ObligationDetailsModal
        open={detailsModalOpen}
        onClose={() => {
          setDetailsModalOpen(false)
          setSelectedObligationId(null)
        }}
        obligation={selectedObligation}
        onUpdatePaymentStatus={handleUpdatePaymentStatus}
        onAddPayment={handleAddPayment}
      />

      {obligationToDelete && (
        <ConfirmDialog
          open={Boolean(obligationToDelete)}
          title={`Delete ${obligationToDelete.provider_alias}?`}
          description={`Are you sure you want to delete ${obligationToDelete.provider_alias} (Version ${obligationToDelete.version})? All scheduled payment installments associated with this obligation will also be permanently removed.`}
          confirmLabel="Delete Obligation"
          onConfirm={handleDelete}
          onCancel={() => {
            setObligationToDelete(null)
            setDeleteError(null)
          }}
          loading={deleteMutation.isPending}
        />
      )}

      {deleteError && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '12px 20px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            borderRadius: 8,
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            fontSize: 14,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>{deleteError}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setDeleteError(null)
              refetch()
            }}
          >
            Refresh
          </Button>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#b91c1c',
              fontWeight: 700,
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}