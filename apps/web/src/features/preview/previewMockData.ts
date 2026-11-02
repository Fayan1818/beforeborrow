/**
 * Development-only Mock Data for Person B Features.
 * Contains realistic Indian financial figures (in integer paise) and Asia/Kolkata dates.
 */

import { ProfileOut, CashflowRuleOut, SnapshotOut } from '@/features/profile/api'
import { ObligationOut } from '@/features/obligations/api'
import { ImportBatchOut } from '@/features/imports/api'

export function getInitialMockProfile(): ProfileOut {
  return {
    id: 'prof-dev-001',
    opening_cash_paise: 25000000, // ₹2,50,000.00
    balance_as_of: '2026-11-01',
    reserve_floor_paise: 5000000, // ₹50,000.00 emergency buffer
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    data_version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  }
}

export function getInitialMockCashflowRules(): CashflowRuleOut[] {
  return [
    {
      id: 'rule-salary',
      owner_id: 'dev-preview-user-b',
      category: 'Salary',
      direction: 'income',
      amount_paise: 15000000, // ₹1,50,000.00
      frequency: 'monthly',
      timing: 'known',
      due_date: '2026-11-01',
      start_date: '2026-01-01',
      end_date: null,
      notes: 'Monthly Tech Consultant Salary (Direct Deposit)',
      created_at: '2026-11-01T00:00:00Z',
    },
    {
      id: 'rule-freelance',
      owner_id: 'dev-preview-user-b',
      category: 'Freelance Retainer',
      direction: 'income',
      amount_paise: 3500000, // ₹35,000.00
      frequency: 'monthly',
      timing: 'estimated',
      due_date: '2026-11-15',
      start_date: '2026-06-01',
      end_date: null,
      notes: 'UI/UX Design Advisory Retainer',
      created_at: '2026-11-01T00:00:00Z',
    },
    {
      id: 'rule-rent',
      owner_id: 'dev-preview-user-b',
      category: 'Rent',
      direction: 'expense',
      amount_paise: 4200000, // ₹42,000.00
      frequency: 'monthly',
      timing: 'known',
      due_date: '2026-11-05',
      start_date: '2026-01-01',
      end_date: null,
      notes: 'Indiranagar 2BHK Apartment Rent',
      created_at: '2026-11-01T00:00:00Z',
    },
    {
      id: 'rule-sip',
      owner_id: 'dev-preview-user-b',
      category: 'Investments',
      direction: 'expense',
      amount_paise: 2500000, // ₹25,000.00
      frequency: 'monthly',
      timing: 'known',
      due_date: '2026-11-10',
      start_date: '2026-01-01',
      end_date: null,
      notes: 'Nifty 50 Index Fund Monthly SIP',
      created_at: '2026-11-01T00:00:00Z',
    },
    {
      id: 'rule-utilities',
      owner_id: 'dev-preview-user-b',
      category: 'Utilities',
      direction: 'expense',
      amount_paise: 450000, // ₹4,500.00
      frequency: 'monthly',
      timing: 'estimated',
      due_date: '2026-11-18',
      start_date: '2026-01-01',
      end_date: null,
      notes: 'BESCOM Electricity + Airtel Fiber Broadband',
      created_at: '2026-11-01T00:00:00Z',
    },
    {
      id: 'rule-insurance',
      owner_id: 'dev-preview-user-b',
      category: 'Insurance',
      direction: 'expense',
      amount_paise: 350000, // ₹3,500.00
      frequency: 'monthly',
      timing: 'known',
      due_date: '2026-11-25',
      start_date: '2026-01-01',
      end_date: null,
      notes: 'HDFC ERGO Optima Secure Health Insurance',
      created_at: '2026-11-01T00:00:00Z',
    },
  ]
}

export function getInitialMockObligations(): ObligationOut[] {
  return [
    {
      id: 'ob-hdfc-loan',
      provider_alias: 'HDFC Personal Loan',
      kind: 'term_loan',
      principal_remaining_paise: 45000000, // ₹4,50,000.00
      status: 'active',
      source: 'manual',
      source_ref: 'HDFC-PL-2024-8891',
      source_as_of: '2026-11-01',
      version: 1,
      created_at: '2026-10-01T00:00:00Z',
      payments: [
        {
          id: 'pay-hdfc-01',
          obligation_id: 'ob-hdfc-loan',
          owner_id: 'dev-preview-user-b',
          due_date: '2026-10-05',
          amount_paise: 2500000, // ₹25,000.00
          interest_paise: 450000,
          fee_paise: 0,
          payment_status: 'paid',
          actual_paid_date: '2026-10-05',
          created_at: '2026-10-01T00:00:00Z',
        },
        {
          id: 'pay-hdfc-02',
          obligation_id: 'ob-hdfc-loan',
          owner_id: 'dev-preview-user-b',
          due_date: '2026-11-05',
          amount_paise: 2500000,
          interest_paise: 440000,
          fee_paise: 0,
          payment_status: 'scheduled',
          actual_paid_date: null,
          created_at: '2026-10-01T00:00:00Z',
        },
        {
          id: 'pay-hdfc-03',
          obligation_id: 'ob-hdfc-loan',
          owner_id: 'dev-preview-user-b',
          due_date: '2026-12-05',
          amount_paise: 2500000,
          interest_paise: 430000,
          fee_paise: 0,
          payment_status: 'planned',
          actual_paid_date: null,
          created_at: '2026-10-01T00:00:00Z',
        },
      ],
    },
    {
      id: 'ob-icici-card',
      provider_alias: 'ICICI Coral Credit Card',
      kind: 'card',
      principal_remaining_paise: 7850000, // ₹78,500.00
      status: 'active',
      source: 'manual',
      source_ref: 'CARD-ENDING-4421',
      source_as_of: '2026-11-01',
      version: 1,
      created_at: '2026-10-15T00:00:00Z',
      payments: [
        {
          id: 'pay-card-01',
          obligation_id: 'ob-icici-card',
          owner_id: 'dev-preview-user-b',
          due_date: '2026-10-20',
          amount_paise: 3500000, // ₹35,000.00
          interest_paise: 0,
          fee_paise: 0,
          payment_status: 'paid',
          actual_paid_date: '2026-10-19',
          created_at: '2026-10-15T00:00:00Z',
        },
        {
          id: 'pay-card-02',
          obligation_id: 'ob-icici-card',
          owner_id: 'dev-preview-user-b',
          due_date: '2026-11-20',
          amount_paise: 4350000, // ₹43,500.00
          interest_paise: 0,
          fee_paise: 0,
          payment_status: 'scheduled',
          actual_paid_date: null,
          created_at: '2026-10-15T00:00:00Z',
        },
        {
          id: 'pay-card-disputed',
          obligation_id: 'ob-icici-card',
          owner_id: 'dev-preview-user-b',
          due_date: '2026-11-20',
          amount_paise: 120000, // ₹1,200.00
          interest_paise: 0,
          fee_paise: 0,
          payment_status: 'disputed',
          actual_paid_date: null,
          created_at: '2026-11-01T00:00:00Z',
        },
      ],
    },
    {
      id: 'ob-simpl-bnpl',
      provider_alias: 'Simpl Pay-in-3 (Zomato/Blinkit)',
      kind: 'bnpl',
      principal_remaining_paise: 640000, // ₹6,400.00
      status: 'active',
      source: 'manual',
      source_ref: 'SIMPL-BNPL-992',
      source_as_of: '2026-11-01',
      version: 1,
      created_at: '2026-10-01T00:00:00Z',
      payments: [
        {
          id: 'pay-simpl-01',
          obligation_id: 'ob-simpl-bnpl',
          owner_id: 'dev-preview-user-b',
          due_date: '2026-10-15',
          amount_paise: 320000, // ₹3,200.00
          interest_paise: 0,
          fee_paise: 5000,
          payment_status: 'missed',
          actual_paid_date: null,
          created_at: '2026-10-01T00:00:00Z',
        },
        {
          id: 'pay-simpl-02',
          obligation_id: 'ob-simpl-bnpl',
          owner_id: 'dev-preview-user-b',
          due_date: '2026-11-15',
          amount_paise: 320000, // ₹3,200.00
          interest_paise: 0,
          fee_paise: 0,
          payment_status: 'scheduled',
          actual_paid_date: null,
          created_at: '2026-10-01T00:00:00Z',
        },
      ],
    },
    {
      id: 'ob-amazon-bnpl',
      provider_alias: 'Amazon Pay Later (Monitor Purchase)',
      kind: 'bnpl',
      principal_remaining_paise: 0,
      status: 'paid',
      source: 'csv_import',
      source_ref: 'AMZN-EMI-4402',
      source_as_of: '2026-10-10',
      version: 1,
      created_at: '2026-08-10T00:00:00Z',
      payments: [
        {
          id: 'pay-amzn-01',
          obligation_id: 'ob-amazon-bnpl',
          owner_id: 'dev-preview-user-b',
          due_date: '2026-09-10',
          amount_paise: 450000,
          interest_paise: 0,
          fee_paise: 0,
          payment_status: 'paid',
          actual_paid_date: '2026-09-10',
          created_at: '2026-08-10T00:00:00Z',
        },
        {
          id: 'pay-amzn-02',
          obligation_id: 'ob-amazon-bnpl',
          owner_id: 'dev-preview-user-b',
          due_date: '2026-10-10',
          amount_paise: 450000,
          interest_paise: 0,
          fee_paise: 0,
          payment_status: 'paid',
          actual_paid_date: '2026-10-09',
          created_at: '2026-08-10T00:00:00Z',
        },
      ],
    },
  ]
}

export function getInitialMockImportBatches(): ImportBatchOut[] {
  return [
    {
      id: 'batch-001',
      file_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      status: 'committed',
      preview_json: {
        total_rows: 14,
        valid_rows_count: 14,
        invalid_rows_count: 0,
      },
      result_json: {
        committed_count: 14,
      },
      committed_at: '2026-10-25T14:32:00Z',
      created_at: '2026-10-25T14:30:15Z',
    },
    {
      id: 'batch-002',
      file_hash: '8743b52063cd84097a65d1633f5c74f5',
      status: 'pending',
      preview_json: {
        total_rows: 5,
        valid_rows_count: 4,
        invalid_rows_count: 1,
      },
      result_json: null,
      committed_at: null,
      created_at: '2026-11-02T10:15:00Z',
    },
  ]
}

export function getInitialMockSnapshot(
  profile: ProfileOut,
  rules: CashflowRuleOut[],
  obligations: ObligationOut[]
): SnapshotOut {
  const activeObligations = obligations.filter((o) => o.status === 'active')
  return {
    snapshot: {
      opening_cash_paise: profile.opening_cash_paise,
      balance_as_of: profile.balance_as_of,
      reserve_floor_paise: profile.reserve_floor_paise,
      currency: profile.currency,
      timezone: profile.timezone,
      data_version: profile.data_version,
      income_rules: rules
        .filter((r) => r.direction === 'income')
        .map((r) => ({
          id: r.id,
          category: r.category,
          amount_paise: r.amount_paise,
          due_date: r.due_date,
          frequency: r.frequency,
        })),
      expense_rules: rules
        .filter((r) => r.direction === 'expense')
        .map((r) => ({
          id: r.id,
          category: r.category,
          amount_paise: r.amount_paise,
          due_date: r.due_date,
          frequency: r.frequency,
        })),
      obligations: activeObligations.map((o) => ({
        id: o.id,
        provider_alias: o.provider_alias,
        kind: o.kind,
        principal_remaining_paise: o.principal_remaining_paise,
      })),
      goals: [
        {
          id: 'goal-emergency-fund',
          name: 'Emergency Buffer 3 Months',
          target_amount_paise: 15000000,
          target_date: '2027-03-31',
          is_protected: true,
        },
      ],
    },
    data_quality: {
      is_valid: true,
      data_version: profile.data_version,
      blocking_gaps: [],
      warnings: [
        '1 obligation payment currently in disputed status (ICICI Coral Card)',
        '1 obligation payment currently marked missed (Simpl Pay-in-3)',
      ],
      summary: 'Verified profile with active obligations, recurring cashflow rules, and protected goals.',
    },
  }
}
