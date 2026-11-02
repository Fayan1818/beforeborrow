import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ObligationOut, ObligationPaymentOut, PaymentStatusUpdate, ObligationPaymentIn } from '../api'
import { PaymentStatusModal } from './PaymentStatusModal'
import { AddPaymentModal } from './AddPaymentModal'
import { formatFinancialDate } from '@/lib/dates'

interface ObligationDetailsModalProps {
  open: boolean
  onClose: () => void
  obligation: ObligationOut | null
  onUpdatePaymentStatus: (paymentId: string, data: PaymentStatusUpdate) => Promise<void>
  onAddPayment: (data: ObligationPaymentIn) => Promise<void>
}

export function ObligationDetailsModal({
  open,
  onClose,
  obligation,
  onUpdatePaymentStatus,
  onAddPayment,
}: ObligationDetailsModalProps) {
  const [statusModalPayment, setStatusModalPayment] = useState<ObligationPaymentOut | null>(null)
  const [addPaymentOpen, setAddPaymentOpen] = useState(false)

  if (!obligation) return null

  const payments = obligation.payments || []

  // Split payments into confirmed paid vs upcoming/other
  const paidPayments = payments.filter((p) => p.payment_status === 'paid')
  const upcomingPayments = payments.filter((p) => p.payment_status !== 'paid')

  const totalPaidPaise = paidPayments.reduce((sum, p) => sum + p.amount_paise, 0)
  const totalUpcomingPaise = upcomingPayments.reduce((sum, p) => sum + p.amount_paise, 0)

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`${obligation.provider_alias} — Details & Repayment Schedule`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
              padding: 16,
              background: '#f8fafc',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div>
              <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Type</span>
              <strong style={{ fontSize: 14, textTransform: 'capitalize' }}>
                {obligation.kind.replace('_', ' ')}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Status</span>
              <StatusBadge status={obligation.status} />
            </div>

            <div>
              <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Outstanding Principal</span>
              <strong style={{ fontSize: 18, color: 'var(--color-text)' }}>
                <Money paise={obligation.principal_remaining_paise} />
              </strong>
            </div>

            <div>
              <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>Settled to Date</span>
              <strong style={{ fontSize: 16, color: '#0f766e' }}>
                <Money paise={totalPaidPaise} />
              </strong>
            </div>
          </div>

          {/* Payment Schedule Section */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>
                  Repayment Installments ({payments.length})
                </h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Remaining scheduled commitments: <Money paise={totalUpcomingPaise} />
                </span>
              </div>
              <Button size="sm" onClick={() => setAddPaymentOpen(true)}>
                + Add Installment
              </Button>
            </div>

            {payments.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  borderRadius: 8,
                }}
              >
                <p style={{ color: '#64748b', fontSize: 14, marginBottom: 10 }}>
                  No payment schedule entered yet.
                </p>
                <Button size="sm" variant="secondary" onClick={() => setAddPaymentOpen(true)}>
                  Add First Scheduled Payment
                </Button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                    textAlign: 'left',
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', color: '#64748b' }}>
                      <th style={{ padding: '8px 12px' }}>Due Date</th>
                      <th style={{ padding: '8px 12px' }}>Amount</th>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                      <th style={{ padding: '8px 12px' }}>Actual Paid Date</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const isPaid = p.payment_status === 'paid'
                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isPaid ? '#f0fdf4' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                            {formatFinancialDate(p.due_date)}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                            <Money paise={p.amount_paise} />
                            {(p.interest_paise > 0 || p.fee_paise > 0) && (
                              <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>
                                Int: <Money paise={p.interest_paise} /> | Fee:{' '}
                                <Money paise={p.fee_paise} />
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <StatusBadge status={p.payment_status} />
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>
                            {p.actual_paid_date ? formatFinancialDate(p.actual_paid_date) : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setStatusModalPayment(p)}
                            >
                              Update
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Payment Status Modal */}
      {statusModalPayment && (
        <PaymentStatusModal
          open={Boolean(statusModalPayment)}
          onClose={() => setStatusModalPayment(null)}
          payment={statusModalPayment}
          onSubmit={async (pId, updateData) => {
            await onUpdatePaymentStatus(pId, updateData)
            setStatusModalPayment(null)
          }}
        />
      )}

      {/* Add Payment Modal */}
      {addPaymentOpen && (
        <AddPaymentModal
          open={addPaymentOpen}
          onClose={() => setAddPaymentOpen(false)}
          obligationId={obligation.id}
          onSubmit={async (paymentData) => {
            await onAddPayment(paymentData)
            setAddPaymentOpen(false)
          }}
        />
      )}
    </>
  )
}
