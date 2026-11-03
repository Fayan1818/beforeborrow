"""002 finance tables, constraints, and indexes

Revision ID: 002_finance
Revises: 001_identity
Create Date: 2026-11-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002_finance"
down_revision: Union[str, None] = "001_identity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. profiles
    op.create_table(
        "profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="INR", nullable=False),
        sa.Column("timezone", sa.String(length=64), server_default="Asia/Kolkata", nullable=False),
        sa.Column("opening_cash_paise", sa.BigInteger(), nullable=False),
        sa.Column("balance_as_of", sa.Date(), nullable=False),
        sa.Column("reserve_floor_paise", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("data_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("opening_cash_paise >= 0", name="profile_opening_cash_nonneg"),
        sa.CheckConstraint("reserve_floor_paise >= 0", name="profile_reserve_floor_nonneg"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_id", name="uq_profiles_owner_id"),
    )
    op.create_index("ix_profiles_owner_id", "profiles", ["owner_id"], unique=True)

    # 2. cashflow_rules
    op.create_table(
        "cashflow_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("direction", sa.String(length=8), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("frequency", sa.String(length=32), server_default="once", nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("timing", sa.String(length=16), server_default="known", nullable=False),
        sa.Column("source", sa.String(length=32), server_default="manual", nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount_paise >= 0", name="cashflow_amount_nonneg"),
        sa.CheckConstraint("direction IN ('income', 'expense')", name="cashflow_direction_valid"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "owner_id", name="uq_cashflow_rules_id_owner_id"),
    )
    op.create_index("ix_cashflow_rules_owner_id", "cashflow_rules", ["owner_id"])
    op.create_index("ix_cashflow_rules_owner_direction", "cashflow_rules", ["owner_id", "direction"])
    op.create_index("ix_cashflow_rules_due_date", "cashflow_rules", ["due_date"])

    # 3. obligations
    op.create_table(
        "obligations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("provider_alias", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("principal_remaining_paise", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="active", nullable=False),
        sa.Column("source", sa.String(length=32), server_default="manual", nullable=False),
        sa.Column("source_ref", sa.String(length=256), nullable=True),
        sa.Column("source_as_of", sa.Date(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("principal_remaining_paise >= 0", name="obligation_principal_nonneg"),
        sa.CheckConstraint("kind IN ('bnpl', 'term_loan', 'card', 'other')", name="obligation_kind_valid"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "owner_id", name="uq_obligations_id_owner_id"),
    )
    op.create_index("ix_obligations_owner_id", "obligations", ["owner_id"])
    op.create_index("ix_obligations_owner_status", "obligations", ["owner_id", "status"])
    op.create_index("ix_obligations_source_ref", "obligations", ["owner_id", "source_ref"])

    # 4. obligation_payments
    op.create_table(
        "obligation_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("obligation_id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("interest_paise", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("fee_paise", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("payment_status", sa.String(length=32), server_default="scheduled", nullable=False),
        sa.Column("actual_paid_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount_paise >= 0", name="ob_payment_amount_nonneg"),
        sa.CheckConstraint("interest_paise >= 0", name="ob_payment_interest_nonneg"),
        sa.CheckConstraint("fee_paise >= 0", name="ob_payment_fee_nonneg"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE", name="fk_obligation_payments_owner_id"),
        sa.ForeignKeyConstraint(
            ["obligation_id", "owner_id"],
            ["obligations.id", "obligations.owner_id"],
            ondelete="CASCADE",
            name="fk_obligation_payments_obligation_owner",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_obligation_payments_obligation_id", "obligation_payments", ["obligation_id"])
    op.create_index("ix_obligation_payments_owner_id", "obligation_payments", ["owner_id"])
    op.create_index("ix_obligation_payments_owner_due_date", "obligation_payments", ["owner_id", "due_date"])
    op.create_index("ix_obligation_payments_due_date", "obligation_payments", ["due_date"])

    # 5. goals
    op.create_table(
        "goals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.Column("target_amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("protected", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("contribution_rule_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("target_amount_paise >= 0", name="goal_target_nonneg"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE", name="fk_goals_owner_id"),
        sa.ForeignKeyConstraint(
            ["contribution_rule_id", "owner_id"],
            ["cashflow_rules.id", "cashflow_rules.owner_id"],
            ondelete="NO ACTION",
            name="fk_goals_cashflow_rule_owner",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_goals_owner_id", "goals", ["owner_id"])

    # 6. import_batches
    op.create_table(
        "import_batches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column(
            "preview_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column(
            "errors_json",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column("committed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_import_batches_owner_id", "import_batches", ["owner_id"])
    op.create_index("ix_import_batches_created_at", "import_batches", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_import_batches_created_at", table_name="import_batches")
    op.drop_index("ix_import_batches_owner_id", table_name="import_batches")
    op.drop_table("import_batches")

    op.drop_index("ix_goals_owner_id", table_name="goals")
    op.drop_table("goals")

    op.drop_index("ix_obligation_payments_due_date", table_name="obligation_payments")
    op.drop_index("ix_obligation_payments_owner_due_date", table_name="obligation_payments")
    op.drop_index("ix_obligation_payments_owner_id", table_name="obligation_payments")
    op.drop_index("ix_obligation_payments_obligation_id", table_name="obligation_payments")
    op.drop_table("obligation_payments")

    op.drop_index("ix_obligations_source_ref", table_name="obligations")
    op.drop_index("ix_obligations_owner_status", table_name="obligations")
    op.drop_index("ix_obligations_owner_id", table_name="obligations")
    op.drop_table("obligations")

    op.drop_index("ix_cashflow_rules_due_date", table_name="cashflow_rules")
    op.drop_index("ix_cashflow_rules_owner_direction", table_name="cashflow_rules")
    op.drop_index("ix_cashflow_rules_owner_id", table_name="cashflow_rules")
    op.drop_table("cashflow_rules")

    op.drop_index("ix_profiles_owner_id", table_name="profiles")
    op.drop_table("profiles")
