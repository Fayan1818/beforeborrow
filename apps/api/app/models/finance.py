import uuid
from datetime import date, datetime
from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey,
    ForeignKeyConstraint, Index, Integer, JSON, String, Text, UniqueConstraint, Uuid, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata", nullable=False)
    opening_cash_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_as_of: Mapped[date] = mapped_column(Date, nullable=False)
    reserve_floor_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    data_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("opening_cash_paise >= 0", name="profile_opening_cash_nonneg"),
        CheckConstraint("reserve_floor_paise >= 0", name="profile_reserve_floor_nonneg"),
    )

class CashflowRule(Base):
    __tablename__ = "cashflow_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    frequency: Mapped[str] = mapped_column(String(32), nullable=False, default="once")
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    timing: Mapped[str] = mapped_column(String(16), nullable=False, default="known")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("amount_paise >= 0", name="cashflow_amount_nonneg"),
        CheckConstraint("direction IN ('income', 'expense')", name="cashflow_direction_valid"),
        UniqueConstraint("id", "owner_id", name="uq_cashflow_rules_id_owner_id"),
        Index("ix_cashflow_rules_owner_direction", "owner_id", "direction"),
        Index("ix_cashflow_rules_due_date", "due_date"),
    )

class Obligation(Base):
    __tablename__ = "obligations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_alias: Mapped[str] = mapped_column(String(128), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    principal_remaining_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    source_ref: Mapped[str | None] = mapped_column(String(256), nullable=True)
    source_as_of: Mapped[date | None] = mapped_column(Date, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    payments: Mapped[list["ObligationPayment"]] = relationship(
        back_populates="obligation",
        cascade="all, delete-orphan",
        foreign_keys="[ObligationPayment.obligation_id, ObligationPayment.owner_id]",
    )

    __table_args__ = (
        CheckConstraint("principal_remaining_paise >= 0", name="obligation_principal_nonneg"),
        CheckConstraint("kind IN ('bnpl', 'term_loan', 'card', 'other')", name="obligation_kind_valid"),
        UniqueConstraint("id", "owner_id", name="uq_obligations_id_owner_id"),
        Index("ix_obligations_owner_status", "owner_id", "status"),
        Index("ix_obligations_source_ref", "owner_id", "source_ref"),
    )

class ObligationPayment(Base):
    __tablename__ = "obligation_payments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    obligation_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    interest_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    fee_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    payment_status: Mapped[str] = mapped_column(String(32), nullable=False, default="scheduled")
    actual_paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    obligation: Mapped["Obligation"] = relationship(
        back_populates="payments",
        foreign_keys=[obligation_id, owner_id],
    )

    __table_args__ = (
        CheckConstraint("amount_paise >= 0", name="ob_payment_amount_nonneg"),
        CheckConstraint("interest_paise >= 0", name="ob_payment_interest_nonneg"),
        CheckConstraint("fee_paise >= 0", name="ob_payment_fee_nonneg"),
        ForeignKeyConstraint(
            ["obligation_id", "owner_id"],
            ["obligations.id", "obligations.owner_id"],
            ondelete="CASCADE",
            name="fk_obligation_payments_obligation_owner",
        ),
        Index("ix_obligation_payments_owner_due_date", "owner_id", "due_date"),
        Index("ix_obligation_payments_due_date", "due_date"),
    )

class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    target_amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    protected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    contribution_rule_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    contribution_rule: Mapped["CashflowRule | None"] = relationship(
        foreign_keys=[contribution_rule_id, owner_id],
        primaryjoin="and_(Goal.contribution_rule_id == CashflowRule.id, Goal.owner_id == CashflowRule.owner_id)",
    )

    __table_args__ = (
        CheckConstraint("target_amount_paise >= 0", name="goal_target_nonneg"),
        ForeignKeyConstraint(
            ["contribution_rule_id", "owner_id"],
            ["cashflow_rules.id", "cashflow_rules.owner_id"],
            ondelete="SET NULL",
            name="fk_goals_cashflow_rule_owner",
        ),
    )

class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    preview_json: Mapped[dict | list | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    errors_json: Mapped[dict | list | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    result_json: Mapped[dict | list | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    committed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_import_batches_created_at", "created_at"),
        Index("ix_import_batches_idempotency_key", "idempotency_key"),
        Index("ix_import_batches_owner_idempotency", "owner_id", "idempotency_key", unique=True),
    )
