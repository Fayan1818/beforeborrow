import uuid
from datetime import date, datetime, timezone
import pytest
from pydantic import ValidationError

from app.engine.types import FinancialSnapshot as EngineFinancialSnapshot
from app.schemas.finance import (
    CashflowRuleIn,
    CashflowRuleOut,
    CashflowRuleUpdate,
    FinancialSnapshotSchema,
    GoalIn,
    GoalOut,
    GoalUpdate,
    ImportBatchOut,
    ObligationIn,
    ObligationOut,
    ObligationPaymentIn,
    ObligationPaymentOut,
    ObligationUpdate,
    ProfileIn,
    ProfileOut,
    ProfileUpdate,
    SnapshotExpenseRule,
    SnapshotGoal,
    SnapshotIncomeRule,
    SnapshotObligation,
    SnapshotPayment,
)


def test_profile_in_valid():
    """Valid profile input passes validation."""
    data = ProfileIn(
        opening_cash_paise=2400000,
        balance_as_of=date(2026, 11, 1),
        reserve_floor_paise=500000,
        currency="INR",
        timezone="Asia/Kolkata",
    )
    assert data.opening_cash_paise == 2400000
    assert data.reserve_floor_paise == 500000
    assert data.currency == "INR"


def test_profile_rejects_negative_and_fractional_money():
    """Negative and float monetary values must be rejected."""
    # Negative paise
    with pytest.raises(ValidationError):
        ProfileIn(
            opening_cash_paise=-100,
            balance_as_of=date(2026, 11, 1),
        )

    # Float paise (rejected by strict=True)
    with pytest.raises(ValidationError):
        ProfileIn(
            opening_cash_paise=2400.50,  # type: ignore
            balance_as_of=date(2026, 11, 1),
        )

    # Boolean paise (rejected by strict=True)
    with pytest.raises(ValidationError):
        ProfileIn(
            opening_cash_paise=True,  # type: ignore
            balance_as_of=date(2026, 11, 1),
        )


def test_cashflow_rule_validation():
    """CashflowRuleIn validates direction, timing, frequency, and date ordering."""
    rule = CashflowRuleIn(
        direction="income",
        category="Salary",
        amount_paise=3000000,
        start_date=date(2026, 11, 1),
        end_date=date(2026, 11, 30),
        frequency="monthly",
        timing="known",
    )
    assert rule.direction == "income"
    assert rule.amount_paise == 3000000

    # Invalid direction
    with pytest.raises(ValidationError):
        CashflowRuleIn(
            direction="investment",  # type: ignore
            category="Stocks",
            amount_paise=100000,
        )

    # Invalid date ordering: end_date earlier than start_date
    with pytest.raises(ValidationError) as exc_info:
        CashflowRuleIn(
            direction="expense",
            category="Rent",
            amount_paise=800000,
            start_date=date(2026, 11, 30),
            end_date=date(2026, 11, 1),
        )
    assert "end_date cannot be earlier than start_date" in str(exc_info.value)


def test_cashflow_rule_update_validation():
    """CashflowRuleUpdate requires expected_data_version >= 1 and validates date ordering."""
    update = CashflowRuleUpdate(expected_data_version=1, amount_paise=900000)
    assert update.expected_data_version == 1
    assert update.amount_paise == 900000

    # Missing expected_data_version -> ValidationError
    with pytest.raises(ValidationError):
        CashflowRuleUpdate(amount_paise=900000)  # type: ignore

    # Non-positive expected_data_version -> ValidationError
    with pytest.raises(ValidationError):
        CashflowRuleUpdate(expected_data_version=0)

    # Invalid date order in update
    with pytest.raises(ValidationError):
        CashflowRuleUpdate(
            expected_data_version=1,
            start_date=date(2026, 11, 30),
            end_date=date(2026, 11, 1),
        )


def test_obligation_validation():
    """ObligationIn validates kind, status, and child payments."""
    ob = ObligationIn(
        provider_alias="ZestMoney",
        kind="bnpl",
        principal_remaining_paise=2400000,
        status="active",
        payments=[
            ObligationPaymentIn(
                due_date=date(2026, 11, 1),
                amount_paise=600000,
            ),
            ObligationPaymentIn(
                due_date=date(2026, 11, 15),
                amount_paise=600000,
            ),
        ],
    )
    assert ob.kind == "bnpl"
    assert len(ob.payments) == 2
    assert ob.payments[0].amount_paise == 600000

    # Invalid obligation kind
    with pytest.raises(ValidationError):
        ObligationIn(
            provider_alias="ShadyLender",
            kind="payday_loan",  # type: ignore
            principal_remaining_paise=500000,
        )

    # Float payment amount rejected
    with pytest.raises(ValidationError):
        ObligationPaymentIn(
            due_date=date(2026, 11, 1),
            amount_paise=6000.50,  # type: ignore
        )


def test_goal_validation():
    """GoalIn validates non-negative target amounts."""
    goal = GoalIn(
        label="Emergency Reserve",
        target_amount_paise=5000000,
        target_date=date(2027, 3, 31),
        protected=True,
    )
    assert goal.label == "Emergency Reserve"
    assert goal.protected is True

    with pytest.raises(ValidationError):
        GoalIn(
            label="Negative Goal",
            target_amount_paise=-10,
        )


def test_financial_snapshot_to_engine():
    """FinancialSnapshotSchema transforms seamlessly into EngineFinancialSnapshot."""
    snap = FinancialSnapshotSchema(
        opening_cash_paise=2400000,
        balance_as_of=date(2026, 11, 1),
        reserve_floor_paise=500000,
        income_rules=[
            SnapshotIncomeRule(
                id=uuid.uuid4(),
                category="Salary",
                amount_paise=3000000,
                due_date=date(2026, 11, 7),
                start_date=None,
                frequency="monthly",
                end_date=None,
                timing="known",
            )
        ],
        expense_rules=[
            SnapshotExpenseRule(
                id=uuid.uuid4(),
                category="Rent",
                amount_paise=800000,
                due_date=date(2026, 11, 3),
                start_date=None,
                frequency="monthly",
                end_date=None,
                timing="known",
            )
        ],
        obligations=[
            SnapshotObligation(
                id=uuid.uuid4(),
                provider_alias="Bank EMI",
                kind="term_loan",
                principal_remaining_paise=4800000,
                payments=[
                    SnapshotPayment(
                        id=uuid.uuid4(),
                        due_date=date(2026, 11, 5),
                        amount_paise=400000,
                        interest_paise=0,
                        fee_paise=0,
                        payment_status="scheduled",
                    )
                ],
            )
        ],
        goals=[
            SnapshotGoal(
                id=uuid.uuid4(),
                label="Emergency Fund",
                target_amount_paise=5000000,
                target_date=date(2027, 1, 1),
                protected=True,
                contribution_rule_id=None,
            )
        ],
        data_version=3,
    )

    engine_snap = snap.to_engine_snapshot()
    assert isinstance(engine_snap, EngineFinancialSnapshot)
    assert engine_snap.opening_cash_paise == 2400000
    assert engine_snap.data_version == 3
    assert len(engine_snap.income_rules) == 1
    assert len(engine_snap.expense_rules) == 1
    assert len(engine_snap.obligations) == 1
    assert len(engine_snap.goals) == 1
    assert engine_snap.obligations[0].payments[0].amount_paise == 400000
