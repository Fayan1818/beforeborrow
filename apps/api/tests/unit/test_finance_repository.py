import asyncio
import uuid
from datetime import date, datetime, timezone
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.identity import User
from app.repositories.finance import (
    CrossOwnerReferenceError,
    FinanceRepository,
    RecordNotFoundError,
    StaleVersionError,
)
from app.schemas.finance import (
    CashflowRuleIn,
    CashflowRuleUpdate,
    GoalIn,
    GoalUpdate,
    ObligationIn,
    ObligationPaymentIn,
    ObligationUpdate,
    ProfileIn,
    ProfileUpdate,
)


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
def two_users(repo_session: Session) -> tuple[User, User]:
    u1 = User(id=uuid.uuid4(), email_normalized="u1@bb.test", password_hash="dummy")
    u2 = User(id=uuid.uuid4(), email_normalized="u2@bb.test", password_hash="dummy")
    repo_session.add_all([u1, u2])
    repo_session.commit()
    return u1, u2


def run_async(coro):
    """Helper to run async repository methods synchronously in tests."""
    return asyncio.run(coro)


def test_profile_upsert_and_data_versioning(repo: FinanceRepository, two_users: tuple[User, User]):
    u1, _ = two_users

    # Initial creation
    p_in = ProfileIn(
        opening_cash_paise=2400000,
        balance_as_of=date(2026, 11, 1),
        reserve_floor_paise=500000,
    )
    p = run_async(repo.upsert_profile(u1.id, p_in))
    assert p.data_version == 1
    assert p.opening_cash_paise == 2400000

    # Second upsert increments version
    p_in2 = ProfileIn(
        opening_cash_paise=2500000,
        balance_as_of=date(2026, 11, 2),
        reserve_floor_paise=500000,
        expected_version=1,
    )
    p2 = run_async(repo.upsert_profile(u1.id, p_in2))
    assert p2.data_version == 2
    assert p2.opening_cash_paise == 2500000

    # Stale expected_version rejected
    p_stale = ProfileIn(
        opening_cash_paise=2600000,
        balance_as_of=date(2026, 11, 3),
        expected_version=1,  # actual is now 2
    )
    with pytest.raises(StaleVersionError):
        run_async(repo.upsert_profile(u1.id, p_stale))


def test_profile_update_optimistic_concurrency(repo: FinanceRepository, two_users: tuple[User, User]):
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=100000, balance_as_of=date(2026, 11, 1))))

    # Valid update
    updated = run_async(repo.update_profile(u1.id, ProfileUpdate(opening_cash_paise=150000, expected_version=1)))
    assert updated.data_version == 2
    assert updated.opening_cash_paise == 150000

    # Stale update
    with pytest.raises(StaleVersionError):
        run_async(repo.update_profile(u1.id, ProfileUpdate(opening_cash_paise=200000, expected_version=1)))


def test_owner_isolation_cashflow_rules(repo: FinanceRepository, two_users: tuple[User, User]):
    u1, u2 = two_users

    # Initialize profiles
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))
    run_async(repo.upsert_profile(u2.id, ProfileIn(opening_cash_paise=2000, balance_as_of=date(2026, 11, 1))))

    # User 1 creates an income rule
    r1 = run_async(repo.create_cashflow_rule(
        u1.id,
        CashflowRuleIn(direction="income", category="Salary", amount_paise=3000000, frequency="monthly"),
    ))

    # User 2 creates an expense rule
    r2 = run_async(repo.create_cashflow_rule(
        u2.id,
        CashflowRuleIn(direction="expense", category="Rent", amount_paise=800000, frequency="monthly"),
    ))

    # User 1 cannot see User 2's rules
    u1_rules = run_async(repo.list_cashflow_rules(u1.id))
    assert len(u1_rules) == 1
    assert u1_rules[0].id == r1.id

    # User 1 cannot get User 2's rule
    assert run_async(repo.get_cashflow_rule(u1.id, r2.id)) is None

    # User 1 cannot update User 2's rule
    assert run_async(repo.update_cashflow_rule(u1.id, r2.id, CashflowRuleUpdate(expected_data_version=2, amount_paise=900000))) is None

    # User 1 cannot delete User 2's rule
    assert run_async(repo.delete_cashflow_rule(u1.id, r2.id, expected_data_version=2)) is False


def test_obligation_versioning_and_cascade(repo: FinanceRepository, two_users: tuple[User, User]):
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    # Create obligation with scheduled payments
    ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(
            provider_alias="ZestMoney",
            kind="bnpl",
            principal_remaining_paise=2400000,
            payments=[
                ObligationPaymentIn(due_date=date(2026, 11, 1), amount_paise=600000),
                ObligationPaymentIn(due_date=date(2026, 11, 15), amount_paise=600000),
            ],
        ),
    ))
    assert ob.version == 1
    assert len(ob.payments) == 2
    assert ob.payments[0].owner_id == u1.id

    # Check profile data_version was incremented
    p = run_async(repo.get_profile(u1.id))
    assert p.data_version == 2

    # Update obligation with expected_version
    ob_updated = run_async(repo.update_obligation(
        u1.id,
        ob.id,
        ObligationUpdate(
            provider_alias="ZestMoney Updated",
            expected_version=1,
        ),
    ))
    assert ob_updated is not None
    assert ob_updated.version == 2
    assert ob_updated.provider_alias == "ZestMoney Updated"

    # Stale version update rejected
    with pytest.raises(StaleVersionError):
        run_async(repo.update_obligation(
            u1.id,
            ob.id,
            ObligationUpdate(expected_version=1),
        ))

    # Query payments by date range
    payments = run_async(repo.list_payments(u1.id, from_date=date(2026, 11, 1), to_date=date(2026, 11, 10)))
    assert len(payments) == 1
    assert payments[0].due_date == date(2026, 11, 1)

    # Stale version delete rejected
    with pytest.raises(StaleVersionError):
        run_async(repo.delete_obligation(u1.id, ob.id, expected_version=1))

    # Verify obligation and payments still exist after rejected deletion
    assert run_async(repo.get_obligation(u1.id, ob.id)) is not None
    assert len(run_async(repo.list_payments(u1.id))) == 2

    # Delete obligation cascades payments with correct version
    deleted = run_async(repo.delete_obligation(u1.id, ob.id, expected_version=2))
    assert deleted is True
    assert run_async(repo.get_obligation(u1.id, ob.id)) is None
    assert len(run_async(repo.list_payments(u1.id))) == 0


def test_goal_cross_owner_rule_rejected(repo: FinanceRepository, two_users: tuple[User, User]):
    u1, u2 = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))
    run_async(repo.upsert_profile(u2.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    # User 2 creates a rule
    rule_u2 = run_async(repo.create_cashflow_rule(
        u2.id,
        CashflowRuleIn(direction="expense", category="U2 Goal Rule", amount_paise=500000),
    ))

    # User 1 tries to link User 2's rule to their own goal -> rejected
    with pytest.raises(CrossOwnerReferenceError):
        run_async(repo.create_goal(
            u1.id,
            GoalIn(label="Stolen Rule Goal", target_amount_paise=1000000, contribution_rule_id=rule_u2.id),
        ))

    # User 1 creates goal without rule -> succeeds
    goal_standalone = run_async(repo.create_goal(
        u1.id,
        GoalIn(label="Standalone Emergency", target_amount_paise=5000000),
    ))
    assert goal_standalone.contribution_rule_id is None


def test_snapshot_builder(repo: FinanceRepository, two_users: tuple[User, User]):
    u1, _ = two_users

    # Establish baseline data
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=2400000, balance_as_of=date(2026, 11, 1), reserve_floor_paise=500000)))
    run_async(repo.create_cashflow_rule(u1.id, CashflowRuleIn(direction="income", category="Salary", amount_paise=3000000, due_date=date(2026, 11, 7))))
    run_async(repo.create_cashflow_rule(u1.id, CashflowRuleIn(direction="expense", category="Rent", amount_paise=800000, due_date=date(2026, 11, 3))))
    run_async(repo.create_obligation(
        u1.id,
        ObligationIn(
            provider_alias="Bank EMI",
            kind="term_loan",
            principal_remaining_paise=4800000,
            payments=[ObligationPaymentIn(due_date=date(2026, 11, 5), amount_paise=400000)],
        ),
    ))
    run_async(repo.create_goal(u1.id, GoalIn(label="Emergency Fund", target_amount_paise=5000000)))

    # Fetch snapshot
    snapshot = run_async(repo.get_financial_snapshot(u1.id))
    assert snapshot is not None
    assert snapshot.opening_cash_paise == 2400000
    assert len(snapshot.income_rules) == 1
    assert len(snapshot.expense_rules) == 1
    assert len(snapshot.obligations) == 1
    assert len(snapshot.goals) == 1

    # Convert to Engine FinancialSnapshot dataclass
    engine_snapshot = snapshot.to_engine_snapshot()
    assert engine_snapshot.opening_cash_paise == 2400000
    assert engine_snapshot.data_version == snapshot.data_version
    assert len(engine_snapshot.income_rules) == 1


def test_cashflow_rule_concurrency_and_data_version(repo: FinanceRepository, two_users: tuple[User, User]):
    """
    Test cashflow-rule concurrency:
    - Stale update rejected, leaves data unchanged and data_version un-incremented.
    - Stale delete rejected, leaves data unchanged and data_version un-incremented.
    - Successful update/delete increments data_version exactly once.
    """
    test_user, _ = two_users
    # 1. Establish profile (version=1)
    run_async(repo.upsert_profile(test_user.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))
    p = run_async(repo.get_profile(test_user.id))
    assert p.data_version == 1

    # 2. Create rule -> increments data_version to 2
    rule = run_async(repo.create_cashflow_rule(
        test_user.id,
        CashflowRuleIn(direction="income", category="Salary", amount_paise=5000000),
    ))
    p = run_async(repo.get_profile(test_user.id))
    assert p.data_version == 2
    assert rule.amount_paise == 5000000

    # 3. Stale update with expected_data_version=1 -> rejected
    with pytest.raises(StaleVersionError):
        run_async(repo.update_cashflow_rule(
            test_user.id,
            rule.id,
            CashflowRuleUpdate(expected_data_version=1, amount_paise=6000000),
        ))

    # Verify data unchanged and data_version not incremented
    p = run_async(repo.get_profile(test_user.id))
    assert p.data_version == 2
    current_rule = run_async(repo.get_cashflow_rule(test_user.id, rule.id))
    assert current_rule is not None
    assert current_rule.amount_paise == 5000000

    # 4. Valid update with expected_data_version=2 -> succeeds and increments data_version to 3
    updated_rule = run_async(repo.update_cashflow_rule(
        test_user.id,
        rule.id,
        CashflowRuleUpdate(expected_data_version=2, amount_paise=6000000),
    ))
    assert updated_rule is not None
    assert updated_rule.amount_paise == 6000000
    p = run_async(repo.get_profile(test_user.id))
    assert p.data_version == 3

    # 5. Stale delete with expected_data_version=2 -> rejected
    with pytest.raises(StaleVersionError):
        run_async(repo.delete_cashflow_rule(test_user.id, rule.id, expected_data_version=2))

    # Verify rule still exists and data_version not incremented
    p = run_async(repo.get_profile(test_user.id))
    assert p.data_version == 3
    assert run_async(repo.get_cashflow_rule(test_user.id, rule.id)) is not None

    # 6. Valid delete with expected_data_version=3 -> succeeds and increments data_version to 4
    deleted = run_async(repo.delete_cashflow_rule(test_user.id, rule.id, expected_data_version=3))
    assert deleted is True
    p = run_async(repo.get_profile(test_user.id))
    assert p.data_version == 4
    assert run_async(repo.get_cashflow_rule(test_user.id, rule.id)) is None


def test_payment_queries_and_status_update(repo: FinanceRepository, two_users: tuple[User, User]):
    """
    Test get_payment() and update_payment_status() with owner isolation and versioning.
    """
    u1, u2 = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))
    run_async(repo.upsert_profile(u2.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(
            provider_alias="Test EMI",
            kind="term_loan",
            principal_remaining_paise=1000000,
            payments=[
                ObligationPaymentIn(due_date=date(2026, 11, 10), amount_paise=500000),
                ObligationPaymentIn(due_date=date(2026, 12, 10), amount_paise=500000),
            ],
        ),
    ))
    payment_id = ob.payments[0].id

    # 1. get_payment() owner isolation
    p1 = run_async(repo.get_payment(u1.id, payment_id))
    assert p1 is not None
    assert p1.amount_paise == 500000

    # User 2 cannot get User 1's payment
    assert run_async(repo.get_payment(u2.id, payment_id)) is None
    # Non-existent payment returns None
    assert run_async(repo.get_payment(u1.id, uuid.uuid4())) is None

    # 2. update_payment_status() owner isolation
    assert run_async(repo.update_payment_status(u2.id, payment_id, "paid")) is None

    # 3. Successful update_payment_status() by owner
    p_before = run_async(repo.get_profile(u1.id))
    v_before = p_before.data_version

    updated_payment = run_async(repo.update_payment_status(
        u1.id,
        payment_id,
        payment_status="paid",
        actual_paid_date=date(2026, 11, 9),
    ))
    assert updated_payment is not None
    assert updated_payment.payment_status == "paid"
    assert updated_payment.actual_paid_date == date(2026, 11, 9)

    # Verifies data_version was incremented
    p_after = run_async(repo.get_profile(u1.id))
    assert p_after.data_version == v_before + 1


def test_goal_lifecycle_and_updates(repo: FinanceRepository, two_users: tuple[User, User]):
    """
    Test get_goal(), update_goal(), and delete_goal() with owner isolation and cross-owner checks.
    """
    u1, u2 = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))
    run_async(repo.upsert_profile(u2.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    r1 = run_async(repo.create_cashflow_rule(
        u1.id,
        CashflowRuleIn(direction="income", category="SIP", amount_paise=100000),
    ))
    r2 = run_async(repo.create_cashflow_rule(
        u2.id,
        CashflowRuleIn(direction="income", category="SIP U2", amount_paise=200000),
    ))

    goal = run_async(repo.create_goal(
        u1.id,
        GoalIn(label="Vacation", target_amount_paise=2000000, contribution_rule_id=r1.id),
    ))

    # 1. get_goal() and list_goals()
    assert run_async(repo.get_goal(u1.id, goal.id)) is not None
    assert run_async(repo.get_goal(u2.id, goal.id)) is None
    assert len(run_async(repo.list_goals(u1.id))) == 1
    assert len(run_async(repo.list_goals(u2.id))) == 0

    # 2. update_goal() owner isolation
    assert run_async(repo.update_goal(u2.id, goal.id, GoalUpdate(label="Hacked"))) is None

    # Cross-owner rule link rejected on update
    with pytest.raises(CrossOwnerReferenceError):
        run_async(repo.update_goal(u1.id, goal.id, GoalUpdate(contribution_rule_id=r2.id)))

    # Valid update
    updated_goal = run_async(repo.update_goal(
        u1.id,
        goal.id,
        GoalUpdate(label="New Vacation", target_amount_paise=2500000, protected=True),
    ))
    assert updated_goal is not None
    assert updated_goal.label == "New Vacation"
    assert updated_goal.target_amount_paise == 2500000
    assert updated_goal.protected is True

    # 3. delete_goal()
    assert run_async(repo.delete_goal(u2.id, goal.id)) is False
    assert run_async(repo.delete_goal(u1.id, goal.id)) is True
    assert run_async(repo.get_goal(u1.id, goal.id)) is None


def test_import_batches_lifecycle(repo: FinanceRepository, two_users: tuple[User, User]):
    """
    Test create_import_batch(), list_import_batches(), get_import_batch(),
    and update_import_batch_status() with owner isolation.
    """
    u1, u2 = two_users

    # 1. create_import_batch()
    batch = run_async(repo.create_import_batch(
        u1.id,
        file_hash="sha256_mock_abc123",
        preview_json={"rows": [{"date": "2026-11-01", "amount": 500}]},
        errors_json=None,
    ))
    assert batch.id is not None
    assert batch.owner_id == u1.id
    assert batch.status == "pending"
    assert batch.file_hash == "sha256_mock_abc123"

    # 2. list_import_batches() owner isolation
    u1_batches = run_async(repo.list_import_batches(u1.id))
    assert len(u1_batches) == 1
    assert u1_batches[0].id == batch.id

    u2_batches = run_async(repo.list_import_batches(u2.id))
    assert len(u2_batches) == 0

    # 3. get_import_batch() owner isolation
    assert run_async(repo.get_import_batch(u1.id, batch.id)) is not None
    assert run_async(repo.get_import_batch(u2.id, batch.id)) is None
    assert run_async(repo.get_import_batch(u1.id, uuid.uuid4())) is None

    # 4. update_import_batch_status()
    assert run_async(repo.update_import_batch_status(u2.id, batch.id, "committed")) is None

    commit_time = datetime.now(timezone.utc)
    updated_batch = run_async(repo.update_import_batch_status(
        u1.id,
        batch.id,
        status="committed",
        committed_at=commit_time,
    ))
    assert updated_batch is not None
    assert updated_batch.status == "committed"
    assert updated_batch.committed_at is not None


def test_payment_status_transitions_and_actual_paid_date_semantics(repo: FinanceRepository, two_users: tuple[User, User]):
    """
    Test all payment status transitions:
    - paid -> planned
    - paid -> scheduled
    - paid -> missed
    - paid -> cancelled
    - paid -> disputed
    - Non-paid payment with supplied actual_paid_date raises ValueError.
    - Paid payment without supplied actual_paid_date defaults to Asia/Kolkata date.
    - Outstanding principal remains unchanged across all transitions.
    """
    from app.repositories.finance import KOLKATA_TZ, get_kolkata_today
    u1, _ = two_users

    # Establish profile
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=10000, balance_as_of=date(2026, 11, 1))))

    # Create obligation with initial principal 500,000 paise
    ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(
            provider_alias="Bank Loan",
            kind="term_loan",
            principal_remaining_paise=500000,
            payments=[],
        ),
    ))
    ob_id = ob.id

    # Create payment as paid with explicit date
    explicit_date = date(2026, 11, 5)
    pay = run_async(repo.create_obligation_payment(
        u1.id,
        ob_id,
        due_date=date(2026, 11, 15),
        amount_paise=100000,
        payment_status="paid",
        actual_paid_date=explicit_date,
    ))
    assert pay.payment_status == "paid"
    assert pay.actual_paid_date == explicit_date

    # 1. paid -> planned (clears actual_paid_date)
    p_planned = run_async(repo.update_payment_status(u1.id, pay.id, "planned"))
    assert p_planned.payment_status == "planned"
    assert p_planned.actual_paid_date is None

    # planned -> paid (no date supplied -> defaults to get_kolkata_today())
    today_ist = get_kolkata_today()
    p_paid1 = run_async(repo.update_payment_status(u1.id, pay.id, "paid"))
    assert p_paid1.payment_status == "paid"
    assert p_paid1.actual_paid_date == today_ist

    # 2. paid -> scheduled (clears actual_paid_date)
    p_sched = run_async(repo.update_payment_status(u1.id, pay.id, "scheduled"))
    assert p_sched.payment_status == "scheduled"
    assert p_sched.actual_paid_date is None

    # scheduled -> paid (defaults to get_kolkata_today())
    p_paid2 = run_async(repo.update_payment_status(u1.id, pay.id, "paid"))
    assert p_paid2.payment_status == "paid"
    assert p_paid2.actual_paid_date == today_ist

    # 3. paid -> missed (clears actual_paid_date)
    p_missed = run_async(repo.update_payment_status(u1.id, pay.id, "missed"))
    assert p_missed.payment_status == "missed"
    assert p_missed.actual_paid_date is None

    # missed -> paid (defaults to get_kolkata_today())
    p_paid3 = run_async(repo.update_payment_status(u1.id, pay.id, "paid"))
    assert p_paid3.payment_status == "paid"
    assert p_paid3.actual_paid_date == today_ist

    # 4. paid -> cancelled (clears actual_paid_date)
    p_cancelled = run_async(repo.update_payment_status(u1.id, pay.id, "cancelled"))
    assert p_cancelled.payment_status == "cancelled"
    assert p_cancelled.actual_paid_date is None

    # cancelled -> paid (defaults to get_kolkata_today())
    p_paid4 = run_async(repo.update_payment_status(u1.id, pay.id, "paid"))
    assert p_paid4.payment_status == "paid"
    assert p_paid4.actual_paid_date == today_ist

    # 5. paid -> disputed (clears actual_paid_date)
    p_disputed = run_async(repo.update_payment_status(u1.id, pay.id, "disputed"))
    assert p_disputed.payment_status == "disputed"
    assert p_disputed.actual_paid_date is None

    # 6. Reject non-paid status when actual_paid_date is supplied
    for non_paid in ("planned", "scheduled", "missed", "cancelled", "disputed"):
        with pytest.raises(ValueError) as exc_info:
            run_async(repo.update_payment_status(u1.id, pay.id, non_paid, actual_paid_date=date(2026, 11, 10)))
        assert "cannot be set for non-paid payments" in str(exc_info.value)

    # Reject creating non-paid payment with supplied actual_paid_date
    with pytest.raises(ValueError):
        run_async(repo.create_obligation_payment(
            u1.id,
            ob_id,
            due_date=date(2026, 12, 1),
            amount_paise=50000,
            payment_status="scheduled",
            actual_paid_date=date(2026, 12, 1),
        ))

    # 7. Verify outstanding principal remained completely unchanged (500000 paise)
    ob_refreshed = run_async(repo.get_obligation(u1.id, ob_id))
    assert ob_refreshed.principal_remaining_paise == 500000


def test_kolkata_timezone_midnight_behavior():
    """
    Test Asia/Kolkata date boundary around UTC midnight:
    UTC 18:29:59 is 23:59:59 IST (previous day in IST).
    UTC 18:30:00 is 00:00:00 IST (crosses into new day in IST).
    """
    from app.repositories.finance import KOLKATA_TZ
    # 1 second before midnight in Kolkata
    t_before = datetime.fromisoformat("2026-11-01T18:29:59+00:00").astimezone(KOLKATA_TZ)
    assert t_before.date() == date(2026, 11, 1)

    # Exactly midnight in Kolkata
    t_midnight = datetime.fromisoformat("2026-11-01T18:30:00+00:00").astimezone(KOLKATA_TZ)
    assert t_midnight.date() == date(2026, 11, 2)
