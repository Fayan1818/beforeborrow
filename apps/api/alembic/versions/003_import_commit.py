"""003 import batch commit idempotency and results

Revision ID: 003_import_commit
Revises: 002_finance
Create Date: 2026-11-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003_import_commit"
down_revision: Union[str, None] = "002_finance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("import_batches") as batch_op:
        batch_op.add_column(
            sa.Column("idempotency_key", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "result_json",
                sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
                nullable=True,
            )
        )
        batch_op.create_index("ix_import_batches_idempotency_key", ["idempotency_key"])
        batch_op.create_index(
            "ix_import_batches_owner_idempotency",
            ["owner_id", "idempotency_key"],
            unique=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("import_batches") as batch_op:
        batch_op.drop_index("ix_import_batches_owner_idempotency")
        batch_op.drop_index("ix_import_batches_idempotency_key")
        batch_op.drop_column("result_json")
        batch_op.drop_column("idempotency_key")
