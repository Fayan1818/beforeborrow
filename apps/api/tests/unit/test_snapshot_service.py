"""
Unit tests for SnapshotService (Person B).
Verifies snapshot assembly, conversion to Person C's dataclass,
blocking gap detection, data_version preservation, and owner isolation.
"""

from datetime import date
import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.engine.types import FinancialSnapshot as EngineFinancialSnapshot
from app.models.identity import User
from app.repositories.finance import FinanceRepository
from app.schemas.finance import (
    CashflowRuleIn,
    GoalIn,
    ObligationIn,
    ObligationPaymentIn,
    ProfileIn,
)
from app.services.snapshot_service import SnapshotService, validate_data_quality


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
def snapshot_svc(repo: FinanceRepository) -> SnapshotService:
    return SnapshotService(repo)


@pytest.fixture
def two_users(repo_session: Session) -> tuple[User, User]:
    u1 = User(id=uuid.uuid4(), email_normalized="user1@bb.test", password_hash="dummy")
    u2 = User(id=uuid.uuid4(), email_normalized="user2@bb.test", password_hash="dummy")
    repo_session.add_all([u1, u2])
    repo_session.commit()
    return u1, u2


def run_async(coro):
    import asyncio
    return asyncio.run(coro)


def test_snapshot_assembly_and_engine_conversion(
    snapshot_svc: SnapshotService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test 15 & 16: Complete snapshot assembly and conversion to Person C's
    pure Engine FinancialSnapshot dataclass.
    """
    u1, _ = two_users
    # Establish complete profile and financial data
    run_async(repo.upsert_profile(
        u1.id,
        ProfileIn(
            opening_cash_paise=2400000,
            balance_as_of=date(2026, 11, 1),
            reserve_floor_paise=500000,
            currency="INR",
            timezone="Asia/Kolkata",
        ),
    ))
    run_async(repo.create_cashflow_rule(
        u1.id,
        CashflowRuleIn(direction="income", category="Salary", amount_paise=3000000, due_date=date(2026, 11, 5)),
    ))
    run_async(repo.create_cashflow_rule(
        u1.id,
        CashflowRuleIn(direction="expense", category="Rent", amount_paise=800000, due_date=date(2026, 11, 5)),
    ))
    run_async(repo.create_obligation(
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
    run_async(repo.create_goal(
        u1.id,
        GoalIn(label="Emergency Fund", target_amount_paise=5000000, protected=True),
    ))

    result = run_async(snapshot_svc.build_snapshot(u1.id))
    assert result.is_valid is True
    assert len(result.blocking_gaps) == 0
    assert result.snapshot is not None

    # Verify compatibility with Person C's FinancialSnapshot dataclass
    engine_snap = result.snapshot
    assert isinstance(engine_snap, EngineFinancialSnapshot)
    assert engine_snap.opening_cash_paise == 2400000
    assert engine_snap.balance_as_of == date(2026, 11, 1)
    assert engine_snap.reserve_floor_paise == 500000
    assert len(engine_snap.income_rules) == 1
    assert len(engine_snap.expense_rules) == 1
    assert len(engine_snap.obligations) == 1
    assert len(engine_snap.goals) == 1


def test_missing_profile_detection(
    snapshot_svc: SnapshotService, two_users: tuple[User, User]
):
    """
    Test 17: Missing profile is detected as a blocking gap.
    Returns snapshot=None to prevent misleading calculations.
    """
    u1, _ = two_users
    # No profile created for u1
    result = run_async(snapshot_svc.build_snapshot(u1.id))
    assert result.is_valid is False
    assert result.snapshot is None
    assert any("Missing financial profile" in gap for gap in result.blocking_gaps)


def test_missing_obligation_schedule_detection(
    snapshot_svc: SnapshotService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test 18: An active obligation without a payment schedule is identified
    as a critical blocking gap. Never replaces missing values with zero.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(
        u1.id,
        ProfileIn(
            opening_cash_paise=1000000,
            balance_as_of=date(2026, 11, 1),
        ),
    ))
    # Obligation with NO payment schedule
    run_async(repo.create_obligation(
        u1.id,
        ObligationIn(
            provider_alias="Mystery Debt",
            kind="term_loan",
            principal_remaining_paise=5000000,
            payments=[],
        ),
    ))

    result = run_async(snapshot_svc.build_snapshot(u1.id))
    assert result.is_valid is False
    assert result.snapshot is None
    assert any("Missing obligation schedule" in gap for gap in result.blocking_gaps)


def test_data_version_preservation(
    snapshot_svc: SnapshotService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test 19: Snapshot accurately preserves the current profile data_version.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(
        u1.id,
        ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1)),
    ))
    # Add rules to increment data_version
    run_async(repo.create_cashflow_rule(
        u1.id,
        CashflowRuleIn(direction="income", category="Salary", amount_paise=5000000),
    ))
    run_async(repo.create_cashflow_rule(
        u1.id,
        CashflowRuleIn(direction="expense", category="Rent", amount_paise=1000000),
    ))

    p = run_async(repo.get_profile(u1.id))
    expected_version = p.data_version
    assert expected_version == 3

    result = run_async(snapshot_svc.build_snapshot(u1.id))
    assert result.is_valid is True
    assert result.snapshot is not None
    assert result.snapshot.data_version == expected_version
    assert result.data_quality.data_version == expected_version


def test_owner_isolation_in_snapshot(
    snapshot_svc: SnapshotService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test 20: User 1's snapshot includes only User 1's financial data,
    never including User 2's rules or obligations.
    """
    u1, u2 = two_users
    # Profile for u1 and u2
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=10000, balance_as_of=date(2026, 11, 1))))
    run_async(repo.upsert_profile(u2.id, ProfileIn(opening_cash_paise=20000, balance_as_of=date(2026, 11, 1))))

    # u1 creates salary rule
    run_async(repo.create_cashflow_rule(
        u1.id,
        CashflowRuleIn(direction="income", category="Salary U1", amount_paise=5000000),
    ))
    # u2 creates rent rule and obligation
    run_async(repo.create_cashflow_rule(
        u2.id,
        CashflowRuleIn(direction="expense", category="Rent U2", amount_paise=800000),
    ))
    run_async(repo.create_obligation(
        u2.id,
        ObligationIn(
            provider_alias="U2 Loan",
            kind="term_loan",
            principal_remaining_paise=1000000,
            payments=[ObligationPaymentIn(due_date=date(2026, 11, 15), amount_paise=1000000)],
        ),
    ))

    # Snapshot for u1
    snap_u1 = run_async(snapshot_svc.build_snapshot(u1.id))
    assert snap_u1.is_valid is True
    assert len(snap_u1.snapshot.income_rules) == 1
    assert snap_u1.snapshot.income_rules[0].category == "Salary U1"
    assert len(snap_u1.snapshot.expense_rules) == 0
    assert len(snap_u1.snapshot.obligations) == 0

    # Snapshot for u2
    snap_u2 = run_async(snapshot_svc.build_snapshot(u2.id))
    assert snap_u2.is_valid is True
    assert len(snap_u2.snapshot.income_rules) == 0
    assert len(snap_u2.snapshot.expense_rules) == 1
    assert snap_u2.snapshot.expense_rules[0].category == "Rent U2"
    assert len(snap_u2.snapshot.obligations) == 1
