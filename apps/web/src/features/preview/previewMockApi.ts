/**
 * Development-only Mock API Adapter for Person B Features.
 * Intercepts frontend API requests in preview mode and serves realistic in-memory state.
 * Supports realistic CRUD mutations, payment status changes, and calendar calculations.
 */

import { ApiRequestError } from '@/lib/api'
import {
  ProfileOut,
  ProfileIn,
  CashflowRuleOut,
  CashflowRuleIn,
  CashflowRuleUpdate,
} from '@/features/profile/api'
import {
  ObligationOut,
  ObligationIn,
  ObligationUpdate,
  ObligationPaymentOut,
  ObligationPaymentIn,
  PaymentStatusUpdate,
} from '@/features/obligations/api'
import {
  CalendarScheduleResult,
  CalendarEventItem,
  CalendarDailySummary,
  RollingSevenDayOutflow,
} from '@/features/calendar/api'
import {
  ImportBatchOut,
  ImportPreviewResult,
  ImportCommitRequest,
  ImportCommitResult,
  CSVRowPreview,
} from '@/features/imports/api'
import {
  getInitialMockProfile,
  getInitialMockCashflowRules,
  getInitialMockObligations,
  getInitialMockImportBatches,
  getInitialMockSnapshot,
} from './previewMockData'

class PreviewMockStore {
  public profile: ProfileOut | null = getInitialMockProfile()
  public cashflowRules: CashflowRuleOut[] = getInitialMockCashflowRules()
  public obligations: ObligationOut[] = getInitialMockObligations()
  public importBatches: ImportBatchOut[] = getInitialMockImportBatches()

  public simulateConflict: boolean = false
  public simulateEmpty: boolean = false
  public isActive: boolean = false

  public setActive(active: boolean): void {
    this.isActive = active
  }

  public resetToDefaults(): void {
    this.profile = getInitialMockProfile()
    this.cashflowRules = getInitialMockCashflowRules()
    this.obligations = getInitialMockObligations()
    this.importBatches = getInitialMockImportBatches()
    this.simulateConflict = false
    this.simulateEmpty = false
  }

  public toggleEmptyState(): boolean {
    this.simulateEmpty = !this.simulateEmpty
    if (this.simulateEmpty) {
      this.profile = null
      this.cashflowRules = []
      this.obligations = []
      this.importBatches = []
    } else {
      this.resetToDefaults()
    }
    return this.simulateEmpty
  }

  public toggleConflictSimulation(): boolean {
    this.simulateConflict = !this.simulateConflict
    return this.simulateConflict
  }

  private incrementVersion(): number {
    if (this.profile) {
      this.profile.data_version += 1
      this.profile.updated_at = new Date().toISOString()
      return this.profile.data_version
    }
    return 1
  }

  public async handleRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    // Artificial micro-delay (30ms) for realistic async feel
    await new Promise((resolve) => setTimeout(resolve, 30))

    const url = new URL(path, 'http://localhost')
    const pathname = url.pathname
    const searchParams = url.searchParams

    // 1. Auth check: /auth/me
    if (pathname === '/auth/me') {
      return {
        id: 'dev-preview-user-b',
        email_normalized: 'preview.user@beforeborrow.dev',
        created_at: '2026-11-01T00:00:00Z',
        csrf_token: 'preview-demo-csrf-token',
      } as T
    }

    // 2. Profile endpoints
    if (pathname === '/profile') {
      if (method === 'GET') {
        if (!this.profile) {
          throw new ApiRequestError(404, { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' })
        }
        return this.profile as T
      }

      if (method === 'POST' || method === 'PUT') {
        if (this.simulateConflict) {
          this.simulateConflict = false
          throw new ApiRequestError(409, {
            code: 'VERSION_CONFLICT',
            message: 'Profile version mismatch (simulated conflict: expected version 1, current 2)',
          })
        }

        const payload = body as ProfileIn
        const currentVersion = this.profile?.data_version ?? 0
        this.profile = {
          id: this.profile?.id ?? 'prof-dev-001',
          opening_cash_paise: payload.opening_cash_paise,
          balance_as_of: payload.balance_as_of,
          reserve_floor_paise: payload.reserve_floor_paise ?? 0,
          currency: payload.currency ?? 'INR',
          timezone: payload.timezone ?? 'Asia/Kolkata',
          data_version: currentVersion + 1,
          created_at: this.profile?.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        return this.profile as T
      }
    }

    // 3. Snapshot endpoint: /snapshot or /profile/financial-snapshot
    if (pathname === '/snapshot' || pathname === '/profile/financial-snapshot') {
      if (!this.profile) {
        throw new ApiRequestError(404, { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' })
      }
      return getInitialMockSnapshot(this.profile, this.cashflowRules, this.obligations) as T
    }

    // 4. Cashflow rules: /cashflow-rules
    if (pathname === '/cashflow-rules') {
      if (method === 'GET') {
        const direction = searchParams.get('direction')
        if (direction) {
          return this.cashflowRules.filter((r) => r.direction === direction) as T
        }
        return this.cashflowRules as T
      }

      if (method === 'POST') {
        if (this.simulateConflict) {
          this.simulateConflict = false
          throw new ApiRequestError(409, {
            code: 'VERSION_CONFLICT',
            message: 'Data version conflict. Please refresh and try again.',
          })
        }

        const payload = body as CashflowRuleIn
        const newRule: CashflowRuleOut = {
          id: `rule-${Date.now()}`,
          owner_id: 'dev-preview-user-b',
          category: payload.category,
          direction: payload.direction,
          amount_paise: payload.amount_paise,
          frequency: payload.frequency,
          timing: payload.timing ?? 'known',
          due_date: payload.due_date ?? null,
          start_date: payload.start_date ?? null,
          end_date: payload.end_date ?? null,
          notes: payload.notes ?? null,
          created_at: new Date().toISOString(),
        }
        this.cashflowRules.push(newRule)
        this.incrementVersion()
        return newRule as T
      }
    }

    // 4b. Cashflow rule detail: /cashflow-rules/:id
    const ruleMatch = pathname.match(/^\/cashflow-rules\/([^/]+)$/)
    if (ruleMatch) {
      const ruleId = ruleMatch[1]
      const index = this.cashflowRules.findIndex((r) => r.id === ruleId)
      if (index === -1) {
        throw new ApiRequestError(404, { code: 'NOT_FOUND', message: 'Cashflow rule not found' })
      }

      if (method === 'GET') {
        return this.cashflowRules[index] as T
      }

      if (method === 'PATCH') {
        if (this.simulateConflict) {
          this.simulateConflict = false
          throw new ApiRequestError(409, {
            code: 'VERSION_CONFLICT',
            message: 'Cashflow rule data version mismatch.',
          })
        }

        const payload = body as CashflowRuleUpdate
        const existing = this.cashflowRules[index]
        const updated: CashflowRuleOut = {
          ...existing,
          category: payload.category ?? existing.category,
          direction: payload.direction ?? existing.direction,
          amount_paise: payload.amount_paise ?? existing.amount_paise,
          frequency: payload.frequency ?? existing.frequency,
          timing: payload.timing ?? existing.timing,
          due_date: payload.due_date !== undefined ? payload.due_date : existing.due_date,
          start_date: payload.start_date !== undefined ? payload.start_date : existing.start_date,
          end_date: payload.end_date !== undefined ? payload.end_date : existing.end_date,
          notes: payload.notes !== undefined ? payload.notes : existing.notes,
        }
        this.cashflowRules[index] = updated
        this.incrementVersion()
        return updated as T
      }

      if (method === 'DELETE') {
        this.cashflowRules.splice(index, 1)
        this.incrementVersion()
        return undefined as T
      }
    }

    // 5. Obligations: /obligations
    if (pathname === '/obligations') {
      if (method === 'GET') {
        const status = searchParams.get('status')
        const kind = searchParams.get('kind')
        let results = [...this.obligations]
        if (status && status !== 'all') {
          results = results.filter((o) => o.status === status)
        }
        if (kind && kind !== 'all') {
          results = results.filter((o) => o.kind === kind)
        }
        return results as T
      }

      if (method === 'POST') {
        const payload = body as ObligationIn
        const obId = `ob-${Date.now()}`
        const payments: ObligationPaymentOut[] = (payload.payments ?? []).map((p, idx) => ({
          id: `pay-${obId}-${idx + 1}`,
          obligation_id: obId,
          owner_id: 'dev-preview-user-b',
          due_date: p.due_date,
          amount_paise: p.amount_paise,
          interest_paise: p.interest_paise ?? 0,
          fee_paise: p.fee_paise ?? 0,
          payment_status: p.payment_status ?? 'scheduled',
          actual_paid_date: p.actual_paid_date ?? null,
          created_at: new Date().toISOString(),
        }))

        const newObligation: ObligationOut = {
          id: obId,
          provider_alias: payload.provider_alias,
          kind: payload.kind,
          principal_remaining_paise: payload.principal_remaining_paise,
          status: payload.status ?? 'active',
          source: payload.source ?? 'manual',
          source_ref: payload.source_ref ?? null,
          source_as_of: payload.source_as_of ?? null,
          version: 1,
          payments,
          created_at: new Date().toISOString(),
        }
        this.obligations.push(newObligation)
        this.incrementVersion()
        return newObligation as T
      }
    }

    // 5b. Obligation detail: /obligations/:id
    const obMatch = pathname.match(/^\/obligations\/([^/]+)$/)
    if (obMatch) {
      const obId = obMatch[1]
      const index = this.obligations.findIndex((o) => o.id === obId)
      if (index === -1) {
        throw new ApiRequestError(404, { code: 'NOT_FOUND', message: 'Obligation not found' })
      }

      if (method === 'GET') {
        return this.obligations[index] as T
      }

      if (method === 'PATCH') {
        const payload = body as ObligationUpdate
        const existing = this.obligations[index]
        const updated: ObligationOut = {
          ...existing,
          provider_alias: payload.provider_alias ?? existing.provider_alias,
          kind: payload.kind ?? existing.kind,
          principal_remaining_paise:
            payload.principal_remaining_paise ?? existing.principal_remaining_paise,
          status: payload.status ?? existing.status,
          source: payload.source ?? existing.source,
          source_ref: payload.source_ref !== undefined ? payload.source_ref : existing.source_ref,
          source_as_of:
            payload.source_as_of !== undefined ? payload.source_as_of : existing.source_as_of,
          version: existing.version + 1,
        }
        this.obligations[index] = updated
        this.incrementVersion()
        return updated as T
      }

      if (method === 'DELETE') {
        this.obligations.splice(index, 1)
        this.incrementVersion()
        return undefined as T
      }
    }

    // 5c. Obligation payments list / add: /obligations/:id/payments
    const obPaymentsMatch = pathname.match(/^\/obligations\/([^/]+)\/payments$/)
    if (obPaymentsMatch) {
      const obId = obPaymentsMatch[1]
      const ob = this.obligations.find((o) => o.id === obId)
      if (!ob) {
        throw new ApiRequestError(404, { code: 'NOT_FOUND', message: 'Obligation not found' })
      }

      if (method === 'GET') {
        return ob.payments as T
      }

      if (method === 'POST') {
        const payload = body as ObligationPaymentIn
        const newPayment: ObligationPaymentOut = {
          id: `pay-${Date.now()}`,
          obligation_id: obId,
          owner_id: 'dev-preview-user-b',
          due_date: payload.due_date,
          amount_paise: payload.amount_paise,
          interest_paise: payload.interest_paise ?? 0,
          fee_paise: payload.fee_paise ?? 0,
          payment_status: payload.payment_status ?? 'scheduled',
          actual_paid_date: payload.actual_paid_date ?? null,
          created_at: new Date().toISOString(),
        }
        ob.payments.push(newPayment)
        this.incrementVersion()
        return newPayment as T
      }
    }

    // 5d. Obligation payment status update: /obligations/:id/payments/:payment_id
    const payStatusMatch = pathname.match(/^\/obligations\/([^/]+)\/payments\/([^/]+)$/)
    if (payStatusMatch) {
      const obId = payStatusMatch[1]
      const payId = payStatusMatch[2]
      const ob = this.obligations.find((o) => o.id === obId)
      if (!ob) {
        throw new ApiRequestError(404, { code: 'NOT_FOUND', message: 'Obligation not found' })
      }
      const payment = ob.payments.find((p) => p.id === payId)
      if (!payment) {
        throw new ApiRequestError(404, { code: 'NOT_FOUND', message: 'Payment not found' })
      }

      if (method === 'PATCH') {
        const payload = body as PaymentStatusUpdate
        payment.payment_status = payload.payment_status

        // Payment status semantics:
        if (payload.payment_status === 'paid') {
          payment.actual_paid_date = payload.actual_paid_date ?? '2026-11-02'
        } else {
          payment.actual_paid_date = null
        }

        this.incrementVersion()
        return payment as T
      }
    }

    // 6. Calendar: /calendar
    if (pathname === '/calendar') {
      const from = searchParams.get('from') ?? '2026-11-01'
      const to = searchParams.get('to') ?? '2026-11-30'

      const events: CalendarEventItem[] = []

      // Rules events
      for (const rule of this.cashflowRules) {
        const eventDate = rule.due_date ?? `${from.substring(0, 7)}-05`
        if (eventDate >= from && eventDate <= to) {
          events.push({
            event_date: eventDate,
            amount_paise: rule.amount_paise,
            direction: rule.direction === 'income' ? 'income' : 'outflow',
            category: rule.category,
            source_type: 'cashflow_rule',
            source_id: rule.id,
            timing: rule.timing,
            payment_status: 'scheduled',
            provider_alias: null,
            obligation_kind: null,
            goal_id: null,
            is_protected_goal: false,
            is_already_reflected: false,
            actual_paid_date: null,
          })
        }
      }

      // Obligation payment events
      for (const ob of this.obligations) {
        for (const p of ob.payments) {
          if (p.due_date >= from && p.due_date <= to) {
            events.push({
              event_date: p.due_date,
              amount_paise: p.amount_paise,
              direction: 'outflow',
              category: `${ob.provider_alias} Installment`,
              source_type: 'obligation_payment',
              source_id: p.id,
              timing: 'known',
              payment_status:
                p.payment_status === 'paid'
                  ? 'paid'
                  : p.payment_status === 'planned'
                  ? 'planned'
                  : 'scheduled',
              provider_alias: ob.provider_alias,
              obligation_kind: ob.kind,
              goal_id: null,
              is_protected_goal: false,
              is_already_reflected: p.payment_status === 'paid',
              actual_paid_date: p.actual_paid_date,
            })
          }
        }
      }

      // Group into daily summaries
      const dailyMap = new Map<string, CalendarEventItem[]>()
      for (const ev of events) {
        const list = dailyMap.get(ev.event_date) ?? []
        list.push(ev)
        dailyMap.set(ev.event_date, list)
      }

      const daily_summaries: CalendarDailySummary[] = []
      let total_scheduled_income_paise = 0
      let total_scheduled_outflow_paise = 0

      for (const [dateStr, dayEvents] of dailyMap.entries()) {
        const income = dayEvents
          .filter((e) => e.direction === 'income')
          .reduce((acc, e) => acc + e.amount_paise, 0)
        const outflow = dayEvents
          .filter((e) => e.direction === 'outflow')
          .reduce((acc, e) => acc + e.amount_paise, 0)

        total_scheduled_income_paise += income
        total_scheduled_outflow_paise += outflow

        daily_summaries.push({
          event_date: dateStr,
          events: dayEvents,
          scheduled_income_paise: income,
          scheduled_outflow_paise: outflow,
          net_paise: income - outflow,
        })
      }

      daily_summaries.sort((a, b) => a.event_date.localeCompare(b.event_date))

      // Rolling 7-day outflows
      const rolling_7d_outflows: RollingSevenDayOutflow[] = [
        {
          window_start: '2026-11-01',
          window_end: '2026-11-07',
          outflow_paise: 6700000, // Rent + HDFC Loan
          event_count: 2,
        },
        {
          window_start: '2026-11-08',
          window_end: '2026-11-14',
          outflow_paise: 2500000, // SIP
          event_count: 1,
        },
        {
          window_start: '2026-11-15',
          window_end: '2026-11-21',
          outflow_paise: 4670000, // Simpl + Card + Utilities
          event_count: 3,
        },
      ]

      const result: CalendarScheduleResult = {
        from_date: from,
        to_date: to,
        events,
        daily_summaries,
        rolling_7d_outflows,
        total_scheduled_income_paise,
        total_scheduled_outflow_paise,
        net_scheduled_cashflow_paise:
          total_scheduled_income_paise - total_scheduled_outflow_paise,
        total_event_count: events.length,
        disclaimer:
          'Preview mode calendar schedule based on in-memory mock profile, cashflow rules, and obligations.',
      }

      return result as T
    }

    // 7. Imports: /imports
    if (pathname === '/imports') {
      if (method === 'GET') {
        return this.importBatches as T
      }
    }

    // 7b. Imports preview: /imports/preview
    if (pathname === '/imports/preview') {
      const mockRows: CSVRowPreview[] = [
        {
          row_id: 'row-demo-1',
          row_index: 1,
          provider_alias: 'HDFC Personal Loan',
          external_ref: 'HDFC-PL-2024-8891',
          kind: 'term_loan',
          due_date: '2026-12-05',
          amount_paise: 2500000,
          amount_inr_raw: '25,000.00',
          status: 'VALID',
          is_valid: true,
          match_status: 'MATCHED',
          matched_obligation_id: 'ob-hdfc-loan',
          duplicate_reason: null,
          display_provider_alias: 'HDFC Personal Loan',
          display_external_ref: 'HDFC-PL-2024-8891',
          errors: [],
          warnings: [],
        },
        {
          row_id: 'row-demo-2',
          row_index: 2,
          provider_alias: 'ICICI Coral Credit Card',
          external_ref: 'CARD-ENDING-4421',
          kind: 'card',
          due_date: '2026-12-20',
          amount_paise: 3850000,
          amount_inr_raw: '38,500.00',
          status: 'VALID',
          is_valid: true,
          match_status: 'MATCHED',
          matched_obligation_id: 'ob-icici-card',
          duplicate_reason: null,
          display_provider_alias: 'ICICI Coral Credit Card',
          display_external_ref: 'CARD-ENDING-4421',
          errors: [],
          warnings: [],
        },
        {
          row_id: 'row-demo-3',
          row_index: 3,
          provider_alias: 'Bajaj Finserv EMI',
          external_ref: 'BJ-NO-COST-551',
          kind: 'bnpl',
          due_date: '2026-12-15',
          amount_paise: 1800000,
          amount_inr_raw: '18,000.00',
          status: 'UNMATCHED',
          is_valid: true,
          match_status: 'UNMATCHED_OBLIGATION',
          matched_obligation_id: null,
          duplicate_reason: null,
          display_provider_alias: 'Bajaj Finserv EMI',
          display_external_ref: 'BJ-NO-COST-551',
          errors: [],
          warnings: ['Provider not found in existing obligations. Select an obligation to map.'],
        },
        {
          row_id: 'row-demo-4',
          row_index: 4,
          provider_alias: 'HDFC Personal Loan',
          external_ref: 'HDFC-PL-2024-8891',
          kind: 'term_loan',
          due_date: '2026-10-05',
          amount_paise: 2500000,
          amount_inr_raw: '25,000.00',
          status: 'DUPLICATE',
          is_valid: false,
          match_status: 'EXACT_DUPLICATE_DB',
          matched_obligation_id: 'ob-hdfc-loan',
          duplicate_reason: 'Matching payment already exists in database for this date and amount',
          display_provider_alias: 'HDFC Personal Loan',
          display_external_ref: 'HDFC-PL-2024-8891',
          errors: ['Duplicate of existing payment pay-hdfc-01'],
          warnings: [],
        },
        {
          row_id: 'row-demo-5',
          row_index: 5,
          provider_alias: 'Unknown Merchant',
          external_ref: 'UNKNOWN-REF',
          kind: 'other',
          due_date: '2026-13-45', // invalid date format
          amount_paise: null,
          amount_inr_raw: '-500.00',
          status: 'INVALID',
          is_valid: false,
          match_status: 'UNMATCHED_OBLIGATION',
          matched_obligation_id: null,
          duplicate_reason: null,
          display_provider_alias: 'Unknown Merchant',
          display_external_ref: 'UNKNOWN-REF',
          errors: ['Invalid due date format', 'Negative or missing monetary amount'],
          warnings: [],
        },
      ]

      const previewResult: ImportPreviewResult = {
        import_batch_id: `batch-${Date.now()}`,
        file_hash: 'preview-simulated-file-sha256',
        total_rows: mockRows.length,
        valid_rows_count: 3,
        invalid_rows_count: 1,
        exact_duplicates_count: 1,
        possible_duplicates_count: 0,
        unmatched_count: 1,
        rows: mockRows,
        file_errors: [],
      }
      return previewResult as T
    }

    // 7c. Imports commit: /imports/:batch_id/commit
    const commitMatch = pathname.match(/^\/imports\/([^/]+)\/commit$/)
    if (commitMatch) {
      const payload = body as ImportCommitRequest
      const batchId = commitMatch[1]

      const newBatch: ImportBatchOut = {
        id: batchId,
        file_hash: 'preview-simulated-file-sha256',
        status: 'committed',
        preview_json: {
          total_rows: payload.selected_row_ids.length,
          valid_rows_count: payload.selected_row_ids.length,
          invalid_rows_count: 0,
        },
        result_json: {
          committed_count: payload.selected_row_ids.length,
        },
        idempotency_key: payload.idempotency_key,
        committed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }
      this.importBatches.unshift(newBatch)

      const result: ImportCommitResult = {
        batch_id: batchId,
        status: 'committed',
        idempotent_replay: false,
        committed_count: payload.selected_row_ids.length,
        committed_payment_ids: payload.selected_row_ids.map((id) => `pay-imported-${id}`),
        data_version: this.incrementVersion(),
      }
      return result as T
    }

    // Fallback unknown endpoint
    throw new ApiRequestError(404, {
      code: 'PREVIEW_ROUTE_NOT_FOUND',
      message: `Preview mock API does not handle [${method}] ${pathname}`,
    })
  }
}

export const previewMockApi = new PreviewMockStore()
