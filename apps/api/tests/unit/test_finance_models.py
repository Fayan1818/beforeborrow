import uuid
from datetime import date
import pytest
from sqlalchemy import BigInteger, create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.db.base import Base
from app.models.identity import User
from app.models.finance import (
    CashflowRule,
    Goal,
    ImportBatch,
    Obligation,
    ObligationPayment,
    Profile,
)


def test_alembic_migration_chain():
    """Verify that Alembic recognizes 002_finance as the single head chained to 001_identity."""
    cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert heads == ["002_finance"]

    revisions = list(script.walk_revisions())
    assert len(revisions) == 2
    assert revisions[0].revision == "002_finance"
    assert revisions[0].down_revision == "001_identity"
    assert revisions[1].revision == "001_identity"
    assert revisions[1].down_revision is None


def test_monetary_columns_use_bigint():
    """All monetary columns must use BigInteger (paise)."""
    monetary_columns = [
        (Profile, "opening_cash_paise"),
        (Profile, "reserve_floor_paise"),
        (CashflowRule, "amount_paise"),
        (Obligation, "principal_remaining_paise"),
        (ObligationPayment, "amount_paise"),
        (ObligationPayment, "interest_paise"),
        (ObligationPayment, "fee_paise"),
        (Goal, "target_amount_paise"),
    ]
    for model, col_name in monetary_columns:
        col = getattr(model, col_name)
        assert isinstance(col.type, BigInteger), f"{model.__tablename__}.{col_name} is not BigInteger"


def test_table_indexes_and_fks():
    """Verify owner-scoped indexes and foreign key delete cascades."""
    tables = Base.metadata.tables
    assert "profiles" in tables
    assert "cashflow_rules" in tables
    assert "obligations" in tables
    assert "obligation_payments" in tables
    assert "goals" in tables
    assert "import_batches" in tables

    # profiles owner_id is unique
    profile_table = tables["profiles"]
    assert any(
        c.name == "uq_profiles_owner_id"
        or (hasattr(c, "columns") and list(c.columns.keys()) == ["owner_id"])
        for c in profile_table.constraints
    )

    # obligation_payments cascades from obligations and has owner_id
    op_table = tables["obligation_payments"]
    assert "owner_id" in op_table.columns
    composite_ob_fk = next(
        fk for fk in op_table.foreign_key_constraints
        if fk.name == "fk_obligation_payments_obligation_owner"
    )
    assert composite_ob_fk.ondelete == "CASCADE"

    # goals composite fk to cashflow_rules
    goals_table = tables["goals"]
    goal_rule_fk = next(
        fk for fk in goals_table.foreign_key_constraints
        if fk.name == "fk_goals_cashflow_rule_owner"
    )
    assert goal_rule_fk.ondelete == "SET NULL"


@pytest.fixture
def sqlite_session():
    """In-memory SQLite database session with enforced foreign keys."""
    engine = create_engine("sqlite:///:memory:")
    # Enable SQLite foreign key enforcement
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys = ON")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    Base.metadata.drop_all(engine)


def test_one_profile_per_user(sqlite_session: Session):
    """A user cannot have multiple financial profiles."""
    user = User(id=uuid.uuid4(), email_normalized="test@example.com", password_hash="dummy")
    sqlite_session.add(user)
    sqlite_session.commit()

    p1 = Profile(
        owner_id=user.id,
        opening_cash_paise=2400000,
        balance_as_of=date(2026, 11, 1),
        reserve_floor_paise=500000,
    )
    sqlite_session.add(p1)
    sqlite_session.commit()

    p2 = Profile(
        owner_id=user.id,
        opening_cash_paise=1000000,
        balance_as_of=date(2026, 11, 1),
    )
    sqlite_session.add(p2)
    with pytest.raises(IntegrityError):
        sqlite_session.commit()
    sqlite_session.rollback()


def test_negative_monetary_constraints(sqlite_session: Session):
    """Negative monetary values are rejected by check constraints."""
    user = User(id=uuid.uuid4(), email_normalized="neg@example.com", password_hash="dummy")
    sqlite_session.add(user)
    sqlite_session.commit()

    # Negative opening cash
    p_neg = Profile(
        owner_id=user.id,
        opening_cash_paise=-100,
        balance_as_of=date(2026, 11, 1),
    )
    sqlite_session.add(p_neg)
    with pytest.raises(IntegrityError):
        sqlite_session.commit()
    sqlite_session.rollback()

    # Negative obligation principal
    ob_neg = Obligation(
        owner_id=user.id,
        provider_alias="Test",
        kind="bnpl",
        principal_remaining_paise=-500,
    )
    sqlite_session.add(ob_neg)
    with pytest.raises(IntegrityError):
        sqlite_session.commit()
    sqlite_session.rollback()


def test_obligation_payment_ownership_and_cascade(sqlite_session: Session):
    """ObligationPayment owner_id must match obligation owner_id, and delete cascades."""
    user1 = User(id=uuid.uuid4(), email_normalized="u1@example.com", password_hash="dummy")
    user2 = User(id=uuid.uuid4(), email_normalized="u2@example.com", password_hash="dummy")
    sqlite_session.add_all([user1, user2])
    sqlite_session.commit()

    ob = Obligation(
        owner_id=user1.id,
        provider_alias="LazyPay",
        kind="bnpl",
        principal_remaining_paise=1200000,
    )
    sqlite_session.add(ob)
    sqlite_session.commit()

    # Valid payment with same owner
    pay1 = ObligationPayment(
        obligation_id=ob.id,
        owner_id=user1.id,
        due_date=date(2026, 11, 15),
        amount_paise=600000,
    )
    sqlite_session.add(pay1)
    sqlite_session.commit()

    # Invalid payment with MISMATCHED owner (user2)
    pay_mismatch = ObligationPayment(
        obligation_id=ob.id,
        owner_id=user2.id,
        due_date=date(2026, 12, 15),
        amount_paise=600000,
    )
    sqlite_session.add(pay_mismatch)
    with pytest.raises(IntegrityError):
        sqlite_session.commit()
    sqlite_session.rollback()

    # Verify payments exist
    payments = sqlite_session.scalars(
        select(ObligationPayment).where(ObligationPayment.obligation_id == ob.id)
    ).all()
    assert len(payments) == 1
    assert payments[0].owner_id == user1.id

    # Cascade delete obligation
    sqlite_session.delete(ob)
    sqlite_session.commit()

    # Verify payments are deleted
    payments_after = sqlite_session.scalars(
        select(ObligationPayment).where(ObligationPayment.obligation_id == ob.id)
    ).all()
    assert len(payments_after) == 0


def test_goal_same_owner_rule_enforcement(sqlite_session: Session):
    """A goal cannot reference a cashflow rule belonging to another user."""
    user1 = User(id=uuid.uuid4(), email_normalized="owner1@example.com", password_hash="dummy")
    user2 = User(id=uuid.uuid4(), email_normalized="owner2@example.com", password_hash="dummy")
    sqlite_session.add_all([user1, user2])
    sqlite_session.commit()

    rule1 = CashflowRule(
        owner_id=user1.id,
        direction="expense",
        category="Emergency Goal SIP",
        amount_paise=1000000,
        frequency="monthly",
    )
    sqlite_session.add(rule1)
    sqlite_session.commit()

    # Goal for user1 referencing user1's rule -> succeeds
    g1 = Goal(
        owner_id=user1.id,
        label="Emergency Reserve",
        target_amount_paise=5000000,
        contribution_rule_id=rule1.id,
    )
    sqlite_session.add(g1)
    sqlite_session.commit()

    # Goal for user2 referencing user1's rule -> MUST FAIL
    g_mismatch = Goal(
        owner_id=user2.id,
        label="Cross Owner Goal",
        target_amount_paise=2000000,
        contribution_rule_id=rule1.id,
    )
    sqlite_session.add(g_mismatch)
    with pytest.raises(IntegrityError):
        sqlite_session.commit()
    sqlite_session.rollback()

    # Goal with NO contribution rule (None) -> succeeds
    g_unlinked = Goal(
        owner_id=user1.id,
        label="Standalone Goal",
        target_amount_paise=3000000,
        contribution_rule_id=None,
    )
    sqlite_session.add(g_unlinked)
    sqlite_session.commit()


def test_import_batch_structured_json(sqlite_session: Session):
    """ImportBatch stores structured JSON data (JSONB in Postgres, JSON in SQLite)."""
    user = User(id=uuid.uuid4(), email_normalized="import@example.com", password_hash="dummy")
    sqlite_session.add(user)
    sqlite_session.commit()

    preview_payload = [
        {"row": 1, "provider": "Provider-A", "amount_paise": 600000, "status": "valid"},
        {"row": 2, "provider": "Provider-B", "amount_paise": 300000, "status": "duplicate"},
    ]
    errors_payload = {"total_errors": 0, "rows": []}

    batch = ImportBatch(
        owner_id=user.id,
        file_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        status="preview",
        preview_json=preview_payload,
        errors_json=errors_payload,
    )
    sqlite_session.add(batch)
    sqlite_session.commit()

    loaded = sqlite_session.scalar(select(ImportBatch).where(ImportBatch.id == batch.id))
    assert loaded is not None
    assert loaded.preview_json == preview_payload
    assert loaded.preview_json[0]["amount_paise"] == 600000
    assert loaded.errors_json == errors_payload
