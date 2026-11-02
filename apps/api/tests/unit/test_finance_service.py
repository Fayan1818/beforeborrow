"""
Unit tests for FinanceService (Person B).
Verifies service operations for profiles, cashflow rules, obligations,
payments, goals, and import batches.
"""

from datetime import date
import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.identity import User
from app.repositories.finance import FinanceRepository, StaleVersionError
from app.schemas.finance import (
    CashflowRuleIn,
    CashflowRuleUpdate,
    GoalIn,
    GoalUpdate,
    ObligationIn,
    ObligationPaymentIn,
    ObligationUpdate,
    ProfileIn,
)
from app.services.finance_service import FinanceService


@pytest.fixture
def repo_session():
    """Isolated SQLite database session with enforced foreign keys."""
    engine = create_engine("sqlite:///:memory:")
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys = ON")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    Base.metadata.drop_all(engine)


@pytest.fixture
def repo(repo_session: Session) -> FinanceRepository:
    return FinanceRepository(repo_session)


@pytest.fixture
def finance_svc(repo: FinanceRepository) -> FinanceService:
    return FinanceService(repo)


@pytest.fixture
def two_users(repo_session: Session) -> tuple[User, User]:
    u1 = User(id=uuid.uuid4(), email_normalized="u1@bb.test", password_hash="dummy")
    u2 = User(id=uuid.uuid4(), email_normalized="u2@bb.test", password_hash="dummy")
    repo_session.add_all([u1, u2])
    repo_session.commit()
    return u1, u2


def run_async(coro):
    import asyncio
    return asyncio.run(coro)


def test_finance_service_profile_lifecycle(
    finance_svc: FinanceService, two_users: tuple[User, User]
):
    """Test profile retrieval and upsert through FinanceService."""
    u1, _ = two_users
    # Initially no profile
    prof = run_async(finance_svc.get_profile(u1.id))
    assert prof is None

    # Upsert profile
    created = run_async(finance_svc.upsert_profile(
        u1.id,
        ProfileIn(
            opening_cash_paise=2400000,
            balance_as_of=date(2026, 11, 1),
            reserve_floor_paise=500000,
        ),
    ))
    assert created.opening_cash_paise == 2400000
    assert created.data_version == 1

    # Fetch profile
    fetched = run_async(finance_svc.get_profile(u1.id))
    assert fetched is not None
    assert fetched.opening_cash_paise == 2400000


def test_finance_service_cashflow_rules(
    finance_svc: FinanceService, two_users: tuple[User, User]
):
    """Test cashflow rule operations through FinanceService."""
    u1, _ = two_users
    run_async(finance_svc.upsert_profile(
        u1.id,
        ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1)),
    ))

    # Create rule
    rule = run_async(finance_svc.create_cashflow_rule(
        u1.id,
        CashflowRuleIn(direction="income", category="Salary", amount_paise=5000000),
    ))
    assert rule.amount_paise == 5000000

    # List rules
    rules = run_async(finance_svc.list_cashflow_rules(u1.id))
    assert len(rules) == 1

    # Update rule
    updated = run_async(finance_svc.update_cashflow_rule(
        u1.id,
        rule.id,
        CashflowRuleUpdate(expected_data_version=2, amount_paise=5500000),
    ))
    assert updated is not None
    assert updated.amount_paise == 5500000

    # Delete rule
    deleted = run_async(finance_svc.delete_cashflow_rule(u1.id, rule.id, expected_data_version=3))
    assert deleted is True
    assert run_async(finance_svc.get_cashflow_rule(u1.id, rule.id)) is None


def test_finance_service_obligations_and_payments(
    finance_svc: FinanceService, two_users: tuple[User, User]
):
    """Test obligation and payment operations through FinanceService."""
    u1, _ = two_users
    run_async(finance_svc.upsert_profile(
        u1.id,
        ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1)),
    ))

    ob = run_async(finance_svc.create_obligation(
        u1.id,
        ObligationIn(
            provider_alias="ZestMoney",
            kind="bnpl",
            principal_remaining_paise=1200000,
            payments=[
                ObligationPaymentIn(due_date=date(2026, 11, 10), amount_paise=600000),
                ObligationPaymentIn(due_date=date(2026, 11, 24), amount_paise=600000),
            ],
        ),
    ))
    assert ob.version == 1
    assert len(ob.payments) == 2

    # Update obligation
    updated = run_async(finance_svc.update_obligation(
        u1.id,
        ob.id,
        ObligationUpdate(provider_alias="ZestMoney Updated", expected_version=1),
    ))
    assert updated is not None
    assert updated.version == 2

    # Update payment status
    payment_id = ob.payments[0].id
    p_up = run_async(finance_svc.update_payment_status(
        u1.id, payment_id, "paid", actual_paid_date=date(2026, 11, 9)
    ))
    assert p_up is not None
    assert p_up.payment_status == "paid"

    # Delete obligation
    del_ok = run_async(finance_svc.delete_obligation(u1.id, ob.id, expected_version=2))
    assert del_ok is True
    assert run_async(finance_svc.get_obligation(u1.id, ob.id)) is None
