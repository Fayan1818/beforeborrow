import uuid
from datetime import date, datetime
from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey,
    Integer, String, Text, Uuid, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata", nullable=False)
    opening_cash_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_as_of: Mapped[date] = mapped_column(Date, nullable=False)
    reserve_floor_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    data_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class CashflowRule(Base):
    __tablename__ = "cashflow_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
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
    )

class Obligation(Base):
    __tablename__ = "obligations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
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

    payments: Mapped[list["ObligationPayment"]] = relationship(back_populates="obligation", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("principal_remaining_paise >= 0", name="obligation_principal_nonneg"),
    )

class ObligationPayment(Base):
    __tablename__ = "obligation_payments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    obligation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("obligations.id", ondelete="CASCADE"), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    interest_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    fee_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    payment_status: Mapped[str] = mapped_column(String(32), nullable=False, default="scheduled")
    actual_paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    obligation: Mapped["Obligation"] = relationship(back_populates="payments")

    __table_args__ = (
        CheckConstraint("amount_paise >= 0", name="ob_payment_amount_nonneg"),
    )

class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    target_amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    protected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    contribution_rule_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cashflow_rules.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("target_amount_paise >= 0", name="goal_target_nonneg"),
    )

class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    preview_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    errors_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    committed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
