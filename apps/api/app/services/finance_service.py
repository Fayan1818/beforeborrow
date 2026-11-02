"""
BeforeBorrow - Financial Truth Service (Person B)
Coordinates business operations for financial profiles, cashflow rules,
obligations, repayment schedules, goals, and CSV import batches.

Delegates persistence and concurrency validation to FinanceRepository.
Enforces owner isolation and transactional integrity.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Sequence
import uuid

from app.models.finance import (
    CashflowRule,
    Goal,
    ImportBatch,
    Obligation,
    ObligationPayment,
    Profile,
)
from app.repositories.finance import FinanceRepository
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
)


class FinanceService:
    """
    Business service layer for financial truth domain operations.
    Accepts authenticated owner_id from route dependencies; never trusts
    client-supplied ownership claims.
    """

    def __init__(self, session_or_repo: Any) -> None:
        if isinstance(session_or_repo, FinanceRepository):
            self.repo = session_or_repo
        else:
            self.repo = FinanceRepository(session_or_repo)

    # -----------------------------------------------------------------------
    # Profile & Versioning
    # -----------------------------------------------------------------------

    async def get_profile(self, owner_id: uuid.UUID) -> ProfileOut | None:
        """Fetch the financial profile for the authenticated owner."""
        profile = await self.repo.get_profile(owner_id)
        if profile is None:
            return None
        return ProfileOut.model_validate(profile)

    async def upsert_profile(
        self, owner_id: uuid.UUID, data: ProfileIn
    ) -> ProfileOut:
        """
        Create or update the user's financial profile.
        Validates data.expected_version for optimistic concurrency if updating.
        """
        profile = await self.repo.upsert_profile(owner_id, data)
        return ProfileOut.model_validate(profile)

    # -----------------------------------------------------------------------
    # Cashflow Rules
    # -----------------------------------------------------------------------

    async def list_cashflow_rules(
        self, owner_id: uuid.UUID, direction: str | None = None
    ) -> list[CashflowRuleOut]:
        """List cashflow rules for an owner, optionally filtered by direction."""
        rules = await self.repo.list_cashflow_rules(owner_id, direction=direction)
        return [CashflowRuleOut.model_validate(r) for r in rules]

    async def get_cashflow_rule(
        self, owner_id: uuid.UUID, rule_id: uuid.UUID
    ) -> CashflowRuleOut | None:
        """Fetch a specific cashflow rule belonging to the authenticated owner."""
        rule = await self.repo.get_cashflow_rule(owner_id, rule_id)
        if rule is None:
            return None
        return CashflowRuleOut.model_validate(rule)

    async def create_cashflow_rule(
        self, owner_id: uuid.UUID, data: CashflowRuleIn
    ) -> CashflowRuleOut:
        """Create a new cashflow rule and increment profile data_version."""
        rule = await self.repo.create_cashflow_rule(owner_id, data)
        return CashflowRuleOut.model_validate(rule)

    async def update_cashflow_rule(
        self, owner_id: uuid.UUID, rule_id: uuid.UUID, data: CashflowRuleUpdate
    ) -> CashflowRuleOut | None:
        """
        Update an existing cashflow rule.
        Enforces data.expected_data_version against current profile data_version.
        """
        rule = await self.repo.update_cashflow_rule(owner_id, rule_id, data)
        if rule is None:
            return None
        return CashflowRuleOut.model_validate(rule)

    async def delete_cashflow_rule(
        self, owner_id: uuid.UUID, rule_id: uuid.UUID, expected_data_version: int
    ) -> bool:
        """
        Delete a cashflow rule with optimistic concurrency validation.
        Increments profile data_version upon success.
        """
        return await self.repo.delete_cashflow_rule(
            owner_id, rule_id, expected_data_version=expected_data_version
        )

    # -----------------------------------------------------------------------
    # Obligations & Repayment Schedules
    # -----------------------------------------------------------------------

    async def list_obligations(
        self,
        owner_id: uuid.UUID,
        status: str | None = None,
        kind: str | None = None,
    ) -> list[ObligationOut]:
        """List obligations for the authenticated owner with child payments."""
        obligations = await self.repo.list_obligations(
            owner_id, status=status, kind=kind
        )
        return [ObligationOut.model_validate(o) for o in obligations]

    async def get_obligation(
        self, owner_id: uuid.UUID, obligation_id: uuid.UUID
    ) -> ObligationOut | None:
        """Fetch a specific obligation with payments."""
        obligation = await self.repo.get_obligation(owner_id, obligation_id)
        if obligation is None:
            return None
        return ObligationOut.model_validate(obligation)

    async def create_obligation(
        self, owner_id: uuid.UUID, data: ObligationIn
    ) -> ObligationOut:
        """Create an obligation with child scheduled payments and inherit owner_id."""
        obligation = await self.repo.create_obligation(owner_id, data)
        return ObligationOut.model_validate(obligation)

    async def update_obligation(
        self,
        owner_id: uuid.UUID,
        obligation_id: uuid.UUID,
        data: ObligationUpdate,
    ) -> ObligationOut | None:
        """
        Update an obligation with optimistic concurrency validation.
        Validates data.expected_version and increments obligation & profile version.
        """
        obligation = await self.repo.update_obligation(
            owner_id, obligation_id, data
        )
        if obligation is None:
            return None
        return ObligationOut.model_validate(obligation)

    async def delete_obligation(
        self,
        owner_id: uuid.UUID,
        obligation_id: uuid.UUID,
        expected_version: int,
    ) -> bool:
        """
        Delete an obligation and cascade delete payments.
        Requires and strictly validates expected_version.
        """
        return await self.repo.delete_obligation(
            owner_id, obligation_id, expected_version=expected_version
        )

    # -----------------------------------------------------------------------
    # Payments
    # -----------------------------------------------------------------------

    async def list_payments(
        self,
        owner_id: uuid.UUID,
        obligation_id: uuid.UUID | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        payment_status: str | None = None,
    ) -> list[ObligationPaymentOut]:
        """Fetch scheduled payments for the owner with optional filters."""
        payments = await self.repo.list_payments(
            owner_id,
            obligation_id=obligation_id,
            from_date=from_date,
            to_date=to_date,
            payment_status=payment_status,
        )
        return [ObligationPaymentOut.model_validate(p) for p in payments]

    async def create_payment(
        self,
        owner_id: uuid.UUID,
        obligation_id: uuid.UUID,
        data: ObligationPaymentIn,
    ) -> ObligationPaymentOut:
        """Create a payment for an obligation and increment profile data_version."""
        payment = await self.repo.create_obligation_payment(
            owner_id=owner_id,
            obligation_id=obligation_id,
            due_date=data.due_date,
            amount_paise=data.amount_paise,
            payment_status=data.payment_status,
            actual_paid_date=data.actual_paid_date,
            interest_paise=data.interest_paise,
            fee_paise=data.fee_paise,
        )
        await self.repo.increment_data_version(owner_id)
        return ObligationPaymentOut.model_validate(payment)

    async def get_payment(
        self, owner_id: uuid.UUID, payment_id: uuid.UUID
    ) -> ObligationPaymentOut | None:
        """Fetch a specific payment belonging to the authenticated owner."""
        payment = await self.repo.get_payment(owner_id, payment_id)
        if payment is None:
            return None
        return ObligationPaymentOut.model_validate(payment)

    async def update_payment_status(
        self,
        owner_id: uuid.UUID,
        payment_id: uuid.UUID,
        payment_status: str,
        actual_paid_date: date | None = None,
    ) -> ObligationPaymentOut | None:
        """Update payment status and increment profile data_version."""
        payment = await self.repo.update_payment_status(
            owner_id,
            payment_id,
            payment_status=payment_status,
            actual_paid_date=actual_paid_date,
        )
        if payment is None:
            return None
        return ObligationPaymentOut.model_validate(payment)

    # -----------------------------------------------------------------------
    # Goals
    # -----------------------------------------------------------------------

    async def list_goals(self, owner_id: uuid.UUID) -> list[GoalOut]:
        """List financial goals belonging to the owner."""
        goals = await self.repo.list_goals(owner_id)
        return [GoalOut.model_validate(g) for g in goals]

    async def get_goal(
        self, owner_id: uuid.UUID, goal_id: uuid.UUID
    ) -> GoalOut | None:
        """Fetch a goal belonging to the owner."""
        goal = await self.repo.get_goal(owner_id, goal_id)
        if goal is None:
            return None
        return GoalOut.model_validate(goal)

    async def create_goal(self, owner_id: uuid.UUID, data: GoalIn) -> GoalOut:
        """Create a financial goal, enforcing same-owner contribution rule check."""
        goal = await self.repo.create_goal(owner_id, data)
        return GoalOut.model_validate(goal)

    async def update_goal(
        self, owner_id: uuid.UUID, goal_id: uuid.UUID, data: GoalUpdate
    ) -> GoalOut | None:
        """Update a goal, enforcing same-owner contribution rule check if modified."""
        goal = await self.repo.update_goal(owner_id, goal_id, data)
        if goal is None:
            return None
        return GoalOut.model_validate(goal)

    async def delete_goal(self, owner_id: uuid.UUID, goal_id: uuid.UUID) -> bool:
        """Delete a goal and increment profile data_version."""
        return await self.repo.delete_goal(owner_id, goal_id)

    # -----------------------------------------------------------------------
    # Import Batches
    # -----------------------------------------------------------------------

    async def list_import_batches(
        self, owner_id: uuid.UUID, limit: int = 20
    ) -> list[ImportBatchOut]:
        """Fetch import batches for the authenticated owner."""
        batches = await self.repo.list_import_batches(owner_id, limit=limit)
        return [ImportBatchOut.model_validate(b) for b in batches]

    async def get_import_batch(
        self, owner_id: uuid.UUID, batch_id: uuid.UUID
    ) -> ImportBatchOut | None:
        """Fetch an import batch for the authenticated owner."""
        batch = await self.repo.get_import_batch(owner_id, batch_id)
        if batch is None:
            return None
        return ImportBatchOut.model_validate(batch)

    async def create_import_batch(
        self,
        owner_id: uuid.UUID,
        file_hash: str,
        preview_json: dict | list | None = None,
        errors_json: dict | list | None = None,
    ) -> ImportBatchOut:
        """Create a pending import batch staging preview rows."""
        batch = await self.repo.create_import_batch(
            owner_id,
            file_hash=file_hash,
            preview_json=preview_json,
            errors_json=errors_json,
        )
        return ImportBatchOut.model_validate(batch)

    async def update_import_batch_status(
        self,
        owner_id: uuid.UUID,
        batch_id: uuid.UUID,
        status: str,
        committed_at: datetime | None = None,
    ) -> ImportBatchOut | None:
        """Update an import batch status upon commit."""
        batch = await self.repo.update_import_batch_status(
            owner_id,
            batch_id,
            status=status,
            committed_at=committed_at,
        )
        if batch is None:
            return None
        return ImportBatchOut.model_validate(batch)

    # -----------------------------------------------------------------------
    # Consolidated Snapshot for Engine & Calendar
    # -----------------------------------------------------------------------

    async def get_financial_snapshot(
        self, owner_id: uuid.UUID
    ) -> FinancialSnapshotSchema | None:
        """
        Build an immutable normalized financial snapshot required by Person C's
        decision engine and Person B's calendar service.
        """
        return await self.repo.get_financial_snapshot(owner_id)
