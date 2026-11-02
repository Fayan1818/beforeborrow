"""
Unit tests for CalendarService and Recurrence Engine (Person B).
Verifies recurrence rules, calendar generation, debit-before-credit sorting,
paid vs. planned tracking, and rolling 7-day aggregates.
"""

from datetime import date, timedelta
import uuid
import pytest

from app.engine.types import CashEvent
from app.schemas.finance import (
    CashflowRuleIn,
    FinancialSnapshotSchema,
    GoalIn,
    ObligationIn,
    ObligationPaymentIn,
    SnapshotExpenseRule,
    SnapshotGoal,
    SnapshotIncomeRule,
    SnapshotObligation,
    SnapshotPayment,
)
from app.services.calendar_service import (
    CalendarEventItem,
    CalendarScheduleResult,
    CalendarService,
    expand_calendar_events,
    expand_rule_dates,
)


# ---------------------------------------------------------------------------
# Recurrence Engine Tests
# ---------------------------------------------------------------------------

def test_monthly_recurrence_month_end_clamping_and_recovery():
    """
    Test 1: January 31 monthly recurrence must produce Feb 28 and Mar 31.
    Must compute from original anchor to avoid permanent date drift.
    """
    dates = expand_rule_dates(
        anchor_date=date(2026, 1, 31),
        frequency="monthly",
        from_date=date(2026, 1, 1),
        to_date=date(2026, 4, 30),
    )
    assert dates == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
        date(2026, 4, 30),
    ]


def test_leap_year_february_recurrence():
    """
    Test 2: In a leap year (2024), Jan 31 monthly recurrence produces Feb 29.
    """
    dates = expand_rule_dates(
        anchor_date=date(2024, 1, 31),
        frequency="monthly",
        from_date=date(2024, 1, 1),
        to_date=date(2024, 3, 31),
    )
    assert dates == [
        date(2024, 1, 31),
        date(2024, 2, 29),
        date(2024, 3, 31),
    ]


def test_weekly_recurrence():
    """
    Test 3: Weekly recurrence steps every 7 days without duplication.
    """
    dates = expand_rule_dates(
        anchor_date=date(2026, 11, 1),
        frequency="weekly",
        from_date=date(2026, 11, 1),
        to_date=date(2026, 11, 30),
    )
    assert dates == [
        date(2026, 11, 1),
        date(2026, 11, 8),
        date(2026, 11, 15),
        date(2026, 11, 22),
        date(2026, 11, 29),
    ]


def test_biweekly_recurrence():
    """
    Test 4: Biweekly recurrence steps every 14 days without duplication.
    """
    dates = expand_rule_dates(
        anchor_date=date(2026, 11, 1),
        frequency="biweekly",
        from_date=date(2026, 11, 1),
        to_date=date(2026, 11, 30),
    )
    assert dates == [
        date(2026, 11, 1),
        date(2026, 11, 15),
        date(2026, 11, 29),
    ]


def test_quarterly_recurrence():
    """
    Test 5: Quarterly recurrence steps every 3 months with day clamping.
    """
    dates = expand_rule_dates(
        anchor_date=date(2026, 1, 31),
        frequency="quarterly",
        from_date=date(2026, 1, 1),
        to_date=date(2026, 12, 31),
    )
    assert dates == [
        date(2026, 1, 31),
        date(2026, 4, 30),
        date(2026, 7, 31),
        date(2026, 10, 31),
    ]


def test_yearly_recurrence():
    """
    Test 6: Yearly recurrence steps every year, handling Feb 29 leap years.
    """
    dates = expand_rule_dates(
        anchor_date=date(2024, 2, 29),
        frequency="yearly",
        from_date=date(2024, 1, 1),
        to_date=date(2026, 12, 31),
    )
    assert dates == [
        date(2024, 2, 29),
        date(2025, 2, 28),
        date(2026, 2, 28),
    ]


def test_end_date_handling():
    """
    Test 7: End date strictly stops future recurrence.
    """
    dates = expand_rule_dates(
        anchor_date=date(2026, 11, 1),
        frequency="weekly",
        from_date=date(2026, 11, 1),
        to_date=date(2026, 11, 30),
        end_date=date(2026, 11, 15),
    )
    assert dates == [
        date(2026, 11, 1),
        date(2026, 11, 8),
        date(2026, 11, 15),
    ]


def test_inclusive_date_range_filtering():
    """
    Test 8: Inclusive query window bounds [from_date, to_date].
    """
    dates = expand_rule_dates(
        anchor_date=date(2026, 11, 1),
        frequency="weekly",
        from_date=date(2026, 11, 8),
        to_date=date(2026, 11, 22),
    )
    assert dates == [
        date(2026, 11, 8),
        date(2026, 11, 15),
        date(2026, 11, 22),
    ]


# ---------------------------------------------------------------------------
# Calendar Aggregation Tests
# ---------------------------------------------------------------------------

class MockRule:
    def __init__(self, id, direction, category, amount_paise, due_date=None, start_date=None, frequency="monthly", end_date=None, timing="known"):
        self.id = id
        self.direction = direction
        self.category = category
        self.amount_paise = amount_paise
        self.due_date = due_date
        self.start_date = start_date
        self.frequency = frequency
        self.end_date = end_date
        self.timing = timing


class MockPayment:
    def __init__(self, id, due_date, amount_paise, payment_status="scheduled", actual_paid_date=None):
        self.id = id
        self.due_date = due_date
        self.amount_paise = amount_paise
        self.payment_status = payment_status
        self.actual_paid_date = actual_paid_date


class MockObligation:
    def __init__(self, id, provider_alias, kind, payments):
        self.id = id
        self.provider_alias = provider_alias
        self.kind = kind
        self.payments = payments


class MockGoal:
    def __init__(self, id, label, contribution_rule_id=None, protected=True):
        self.id = id
        self.label = label
        self.contribution_rule_id = contribution_rule_id
        self.protected = protected


def test_income_and_expense_event_generation():
    """
    Test 9: Income and expense rules generate correct events and enforce
    debit-before-credit ordering on the same calendar date.
    """
    r_income = MockRule(
        id=uuid.uuid4(),
        direction="income",
        category="Salary",
        amount_paise=5000000,
        due_date=date(2026, 11, 5),
        frequency="monthly",
    )
    r_expense = MockRule(
        id=uuid.uuid4(),
        direction="expense",
        category="Rent",
        amount_paise=1500000,
        due_date=date(2026, 11, 5),
        frequency="monthly",
    )

    res = expand_calendar_events(
        cashflow_rules=[r_income, r_expense],
        obligations=[],
        from_date=date(2026, 11, 1),
        to_date=date(2026, 11, 30),
    )

    assert len(res.events) == 2
    # Debit-before-credit: Rent (outflow) MUST appear before Salary (income)
    assert res.events[0].category == "Rent"
    assert res.events[0].is_outflow is True
    assert res.events[1].category == "Salary"
    assert res.events[1].is_income is True

    # Check totals
    assert res.total_scheduled_income_paise == 5000000
    assert res.total_scheduled_outflow_paise == 1500000
    assert res.net_scheduled_cashflow_paise == 3500000


def test_explicit_bnpl_and_loan_repayment_schedules():
    """
    Test 10: Explicit BNPL and loan repayment schedules generate outflow events.
    """
    p1 = MockPayment(uuid.uuid4(), date(2026, 11, 10), 600000)
    p2 = MockPayment(uuid.uuid4(), date(2026, 11, 24), 600000)
    ob = MockObligation(uuid.uuid4(), "ZestMoney", "bnpl", [p1, p2])

    res = expand_calendar_events(
        cashflow_rules=[],
        obligations=[ob],
        from_date=date(2026, 11, 1),
        to_date=date(2026, 11, 30),
    )

    assert len(res.events) == 2
    assert res.events[0].event_date == date(2026, 11, 10)
    assert res.events[0].amount_paise == 600000
    assert res.events[0].provider_alias == "ZestMoney"
    assert res.events[0].obligation_kind == "bnpl"
    assert res.total_scheduled_outflow_paise == 1200000


def test_paid_versus_planned_handling():
    """
    Test 11: A payment marked as 'paid' on or before balance_as_of is marked
    as already reflected and is NOT deducted from future scheduled totals.
    """
    # Paid installment before balance_as_of (2026-11-01)
    p_paid = MockPayment(
        uuid.uuid4(),
        due_date=date(2026, 10, 25),
        amount_paise=500000,
        payment_status="paid",
        actual_paid_date=date(2026, 10, 25),
    )
    # Scheduled future installment
    p_future = MockPayment(
        uuid.uuid4(),
        due_date=date(2026, 11, 10),
        amount_paise=500000,
        payment_status="scheduled",
    )
    ob = MockObligation(uuid.uuid4(), "HDFC EMI", "term_loan", [p_paid, p_future])

    res = expand_calendar_events(
        cashflow_rules=[],
        obligations=[ob],
        from_date=date(2026, 10, 20),
        to_date=date(2026, 11, 20),
        balance_as_of=date(2026, 11, 1),
    )

    assert len(res.events) == 2
    # p_paid has is_already_reflected=True
    ev_paid = next(e for e in res.events if e.event_date == date(2026, 10, 25))
    assert ev_paid.is_already_reflected is True
    assert ev_paid.payment_status == "paid"

    # p_future has is_already_reflected=False
    ev_future = next(e for e in res.events if e.event_date == date(2026, 11, 10))
    assert ev_future.is_already_reflected is False

    # Only p_future is counted in scheduled future outflow!
    assert res.total_scheduled_outflow_paise == 500000
    # Engine cash events stream excludes already-reflected payment
    assert len(res.engine_cash_events) == 1
    assert res.engine_cash_events[0].event_date == date(2026, 11, 10)


def test_duplicate_payment_prevention():
    """
    Test 12: Identical source records are deduplicated.
    """
    p_id = uuid.uuid4()
    p1 = MockPayment(p_id, date(2026, 11, 10), 500000)
    p2 = MockPayment(p_id, date(2026, 11, 10), 500000)
    ob = MockObligation(uuid.uuid4(), "Card", "card", [p1, p2])

    res = expand_calendar_events(
        cashflow_rules=[],
        obligations=[ob],
        from_date=date(2026, 11, 1),
        to_date=date(2026, 11, 30),
    )

    assert len(res.events) == 1
    assert res.total_scheduled_outflow_paise == 500000


def test_seven_day_outflow_aggregates():
    """
    Test 13: Seven-day rolling outflow summaries accurately aggregate.
    """
    p1 = MockPayment(uuid.uuid4(), date(2026, 11, 2), 100000)
    p2 = MockPayment(uuid.uuid4(), date(2026, 11, 5), 200000)
    p3 = MockPayment(uuid.uuid4(), date(2026, 11, 12), 300000)
    ob = MockObligation(uuid.uuid4(), "Bank", "term_loan", [p1, p2, p3])

    res = expand_calendar_events(
        cashflow_rules=[],
        obligations=[ob],
        from_date=date(2026, 11, 1),
        to_date=date(2026, 11, 14),
    )

    # Window [2026-11-01, 2026-11-07] contains p1 (100000) and p2 (200000) -> 300000
    w1 = next(w for w in res.rolling_7d_outflows if w.window_start == date(2026, 11, 1))
    assert w1.outflow_paise == 300000
    assert w1.event_count == 2

    # Window [2026-11-08, 2026-11-14] contains p3 (300000)
    w8 = next(w for w in res.rolling_7d_outflows if w.window_start == date(2026, 11, 8))
    assert w8.outflow_paise == 300000
    assert w8.event_count == 1


def test_protected_goal_contributions_no_double_counting():
    """
    Test 14: Protected goal linked to a cashflow rule tags the rule event
    without generating a duplicate second event.
    """
    rule_id = uuid.uuid4()
    r_goal = MockRule(
        id=rule_id,
        direction="expense",
        category="Emergency SIP",
        amount_paise=500000,
        due_date=date(2026, 11, 10),
        frequency="once",
    )
    goal = MockGoal(
        id=uuid.uuid4(),
        label="Emergency Fund",
        contribution_rule_id=rule_id,
        protected=True,
    )

    res = expand_calendar_events(
        cashflow_rules=[r_goal],
        obligations=[],
        goals=[goal],
        from_date=date(2026, 11, 1),
        to_date=date(2026, 11, 30),
    )

    assert len(res.events) == 1
    assert res.events[0].is_protected_goal is True
    assert res.events[0].goal_id == str(goal.id)
    assert res.total_scheduled_outflow_paise == 500000
