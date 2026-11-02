import { useState } from 'react'
import { useMe } from '@/features/auth/hooks'
import {
  useProfile,
  useCreateProfile,
  useUpdateProfile,
  useCashflowRules,
  useCreateCashflowRule,
  useUpdateCashflowRule,
  useDeleteCashflowRule,
} from '../hooks'
import { CashflowRuleOut, CashflowDirection, ProfileIn, CashflowRuleIn, CashflowRuleUpdate } from '../api'
import { ProfileFormModal } from '../components/ProfileFormModal'
import { CashflowRuleModal } from '../components/CashflowRuleModal'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatFinancialDate } from '@/lib/dates'
import { ApiRequestError } from '@/lib/api'

export default function ProfilePage() {
  const { data: user } = useMe()
  const userId = user?.id ?? ''

  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useProfile(userId)

  const [selectedDirection, setSelectedDirection] = useState<'all' | CashflowDirection>('all')
  const {
    data: cashflowRules = [],
    isLoading: rulesLoading,
    error: rulesError,
  } = useCashflowRules(userId, selectedDirection === 'all' ? undefined : selectedDirection)

  const createProfileMutation = useCreateProfile(userId)
  const updateProfileMutation = useUpdateProfile(userId)
  const createRuleMutation = useCreateCashflowRule(userId)
  const updateRuleMutation = useUpdateCashflowRule(userId)
  const deleteRuleMutation = useDeleteCashflowRule(userId)

  // Profile modal state
  const [profileModalOpen, setProfileModalOpen] = useState(false)

  // Cashflow rule modal state
  const [ruleModalOpen, setRuleModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<CashflowRuleOut | null>(null)
  const [defaultRuleDirection, setDefaultRuleDirection] = useState<CashflowDirection>('income')

  // Delete confirmation state
  const [ruleToDelete, setRuleToDelete] = useState<CashflowRuleOut | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const isProfileNotFound = (profileError as ApiRequestError)?.status === 404

  const handleProfileSubmit = async (data: ProfileIn) => {
    if (profile) {
      await updateProfileMutation.mutateAsync(data)
    } else {
      await createProfileMutation.mutateAsync(data)
    }
  }

  const handleCreateRule = async (data: CashflowRuleIn) => {
    await createRuleMutation.mutateAsync(data)
  }

  const handleUpdateRule = async (id: string, data: CashflowRuleUpdate) => {
    await updateRuleMutation.mutateAsync({ id, body: data })
  }

  const handleDeleteRule = async () => {
    if (!ruleToDelete || !profile) return
    setDeleteError(null)
    try {
      await deleteRuleMutation.mutateAsync({
        id: ruleToDelete.id,
        expectedDataVersion: profile.data_version,
      })
      setRuleToDelete(null)
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.status === 409) {
        setDeleteError(
          'Conflict (409): The financial profile version has changed. Please refresh the page.'
        )
      } else {
        setDeleteError('Failed to delete cashflow rule. Please try again.')
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Page Header */}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
          Financial Profile & Cashflow Truth
        </h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>
          Establish your true opening cash baseline and recurring income and expense commitments.
        </p>
      </div>

      {/* Profile Section */}
      {profileLoading ? (
        <Card padding="md">
          <div style={{ color: '#64748b', padding: '16px 0', textAlign: 'center' }}>
            Loading financial profile baseline...
          </div>
        </Card>
      ) : isProfileNotFound || !profile ? (
        <Card padding="lg" style={{ border: '2px dashed #cbd5e1', textAlign: 'center', background: '#f8fafc' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>
            Initialize Your Financial Profile
          </h2>
          <p style={{ color: '#64748b', fontSize: 14, maxWidth: 480, margin: '0 auto 20px' }}>
            Before running financial assessments, BeforeBorrow needs to know your verified opening cash balance and reserve floor.
          </p>
          <Button onClick={() => setProfileModalOpen(true)}>
            Set Up Opening Balance
          </Button>
        </Card>
      ) : (
        <Card padding="md">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)' }}>
                  Opening Cash Baseline
                </h2>
                <span
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Version {profile.data_version}
                </span>
              </div>
              <p style={{ color: '#64748b', fontSize: 13 }}>
                Verified as of {formatFinancialDate(profile.balance_as_of)} ({profile.timezone})
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setProfileModalOpen(true)}>
              Edit Baseline
            </Button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <div>
              <span style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 2 }}>
                Available Bank Cash
              </span>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)' }}>
                <Money paise={profile.opening_cash_paise} />
              </div>
            </div>

            <div>
              <span style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 2 }}>
                Emergency Reserve Floor
              </span>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#b45309' }}>
                <Money paise={profile.reserve_floor_paise} />
              </div>
            </div>

            <div>
              <span style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 2 }}>
                Effective Usable Liquidity
              </span>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-primary)' }}>
                <Money paise={Math.max(0, profile.opening_cash_paise - profile.reserve_floor_paise)} />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Cashflow Rules Section */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)' }}>
              Recurring Cashflow Rules
            </h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
              Fixed and estimated recurring income and living expense commitments.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Filter Pills */}
            <div
              style={{
                display: 'inline-flex',
                background: '#e2e8f0',
                padding: 3,
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {(['all', 'income', 'expense'] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setSelectedDirection(dir)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: 'none',
                    fontWeight: selectedDirection === dir ? 600 : 400,
                    background: selectedDirection === dir ? '#ffffff' : 'transparent',
                    color: selectedDirection === dir ? 'var(--color-text)' : '#64748b',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {dir}
                </button>
              ))}
            </div>

            <Button
              size="sm"
              disabled={!profile}
              onClick={() => {
                setDefaultRuleDirection('income')
                setEditingRule(null)
                setRuleModalOpen(true)
              }}
            >
              + Add Rule
            </Button>
          </div>
        </div>

        {rulesLoading ? (
          <Card padding="md">
            <div style={{ color: '#64748b', padding: '16px 0', textAlign: 'center' }}>
              Loading cashflow rules...
            </div>
          </Card>
        ) : rulesError ? (
          <Card padding="md">
            <div style={{ color: '#ef4444', textAlign: 'center' }}>
              Failed to load cashflow rules.
            </div>
          </Card>
        ) : cashflowRules.length === 0 ? (
          <Card padding="lg" style={{ textAlign: 'center', background: '#ffffff' }}>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 12 }}>
              {selectedDirection === 'all'
                ? 'No recurring cashflow rules added yet.'
                : `No recurring ${selectedDirection} rules found.`}
            </p>
            {profile && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDefaultRuleDirection(selectedDirection === 'expense' ? 'expense' : 'income')
                  setEditingRule(null)
                  setRuleModalOpen(true)
                }}
              >
                Add Your First {selectedDirection === 'expense' ? 'Expense' : 'Income'} Rule
              </Button>
            )}
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cashflowRules.map((rule) => {
              const isIncome = rule.direction === 'income'
              return (
                <Card
                  key={rule.id}
                  padding="md"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 16,
                    borderLeft: `4px solid ${isIncome ? '#0d9488' : '#ef4444'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        background: isIncome ? '#ccfbf1' : '#fee2e2',
                        color: isIncome ? '#0f766e' : '#b91c1c',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 16,
                      }}
                    >
                      {isIncome ? '↓' : '↑'}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text)' }}>
                          {rule.category}
                        </span>
                        <StatusBadge
                          status={isIncome ? 'ok' : 'caution'}
                          label={isIncome ? 'Income' : 'Expense'}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: rule.timing === 'known' ? '#f1f5f9' : '#fef3c7',
                            color: rule.timing === 'known' ? '#475569' : '#92400e',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                          }}
                        >
                          {rule.timing}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                        Recurrence: <strong style={{ textTransform: 'capitalize' }}>{rule.frequency}</strong>
                        {rule.due_date && ` • Anchor Date: ${formatFinancialDate(rule.due_date)}`}
                        {rule.notes && ` • ${rule.notes}`}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: isIncome ? '#0f766e' : '#b91c1c',
                        }}
                      >
                        {isIncome ? '+' : '-'}<Money paise={rule.amount_paise} />
                      </div>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        per {rule.frequency}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditingRule(rule)
                          setRuleModalOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setRuleToDelete(rule)
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
      </div>

      {/* Modals */}
      <ProfileFormModal
        open={profileModalOpen}
        onClose={() => {
          setProfileModalOpen(false)
          refetchProfile()
        }}
        profile={profile ?? null}
        onSubmit={handleProfileSubmit}
      />

      <CashflowRuleModal
        open={ruleModalOpen}
        onClose={() => setRuleModalOpen(false)}
        rule={editingRule}
        defaultDirection={defaultRuleDirection}
        profileDataVersion={profile?.data_version ?? 1}
        onSubmitCreate={handleCreateRule}
        onSubmitUpdate={handleUpdateRule}
      />

      {ruleToDelete && (
        <ConfirmDialog
          open={Boolean(ruleToDelete)}
          title={`Delete ${ruleToDelete.category}?`}
          description={`Are you sure you want to delete this recurring ${ruleToDelete.direction} rule (${ruleToDelete.category})? This will update your profile version and remove it from cashflow projections.`}
          confirmLabel="Delete Rule"
          onConfirm={handleDeleteRule}
          onCancel={() => {
            setRuleToDelete(null)
            setDeleteError(null)
          }}
          loading={deleteRuleMutation.isPending}
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
              refetchProfile()
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