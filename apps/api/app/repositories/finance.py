import asyncio
import uuid
from datetime import date, datetime, timezone
from typing import Any, Sequence

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.models.finance import (
    CashflowRule,
    Goal,
    ImportBatch,
    Obligation,
    ObligationPayment,
    Profile,
)
from app.schemas.finance import (
    CashflowRuleIn,
    CashflowRuleUpdate,
    FinancialSnapshotSchema,
    GoalIn,
    GoalUpdate,
    ObligationIn,
    ObligationUpdate,
    ProfileIn,
    ProfileUpdate,
    SnapshotExpenseRule,
    SnapshotGoal,
    SnapshotIncomeRule,
    SnapshotObligation,
    SnapshotPayment,
)


class FinanceRepositoryError(Exception):
    """Base exception for finance repository errors."""
    pass


class StaleVersionError(FinanceRepositoryError):
    """Raised when an operation provides an expected_version that does not match the database."""
    pass


class CrossOwnerReferenceError(FinanceRepositoryError):
    """Raised when an entity references a record owned by a different user."""
    pass


class RecordNotFoundError(FinanceRepositoryError):
    """Raised when a required record does not exist within the owner scope."""
    pass


async def _exec(session: Any, statement: Any) -> Any:
    """Execute a statement supporting both AsyncSession and sync Session for unit testing."""
    res = session.execute(statement)
    if asyncio.iscoroutine(res):
        return await res
    return res


async def _flush(session: Any) -> None:
    """Flush the session supporting both AsyncSession and sync Session."""
    res = session.flush()
    if asyncio.iscoroutine(res):
        await res


async def _delete(session: Any, instance: Any) -> None:
    """Delete an instance supporting both AsyncSession and sync Session."""
    res = session.delete(instance)
    if asyncio.iscoroutine(res):
        await res


class FinanceRepository:
    """
    Database access layer for all Task B financial domain entities.
    Strictly enforces owner isolation, version-aware optimistic concurrency,
    and automatic profile data_version incrementing.
    """

    def __init__(self, session: Any) -> None:
        self.session = session

    # -----------------------------------------------------------------------
    # Profile & Versioning
    # -----------------------------------------------------------------------

    async def get_profile(self, owner_id: uuid.UUID) -> Profile | None:
        """Fetch the financial profile for an owner."""
        stmt = select(Profile).where(Profile.owner_id == owner_id)
        res = await _exec(self.session, stmt)
        return res.scalar_one_or_none()

    async def increment_data_version(self, owner_id: uuid.UUID) -> int:
        """
        Atomically increment the profile data_version after any accepted financial mutation.
        If no profile exists yet, this is a no-op returning 1.
        """
        profile = await self.get_profile(owner_id)
        if profile is not None:
            profile.data_version += 1
            await _flush(self.session)
            return profile.data_version
        return 1

    async def upsert_profile(self, owner_id: uuid.UUID, data: ProfileIn) -> Profile:
        """
        Create or update the user's financial profile.
        If the profile exists and expected_version is provided, validates concurrency.
        """
        profile = await self.get_profile(owner_id)
        if profile is not None:
            if data.expected_version is not None and profile.data_version != data.expected_version:
                raise StaleVersionError(
                    f"Profile version conflict: expected {data.expected_version}, current is {profile.data_version}"
                )
            profile.opening_cash_paise = data.opening_cash_paise
            profile.balance_as_of = data.balance_as_of
            profile.reserve_floor_paise = data.reserve_floor_paise
            profile.currency = data.currency
            profile.timezone = data.timezone
            profile.data_version += 1
        else:
            profile = Profile(
                owner_id=owner_id,
                opening_cash_paise=data.opening_cash_paise,
                balance_as_of=data.balance_as_of,
                reserve_floor_paise=data.reserve_floor_paise,
                currency=data.currency,
                timezone=data.timezone,
                data_version=1,
            )
            self.session.add(profile)

        await _flush(self.session)
        return profile

    async def update_profile(self, owner_id: uuid.UUID, data: ProfileUpdate) -> Profile:
        """Update an existing financial profile with mandatory optimistic concurrency check."""
        profile = await self.get_profile(owner_id)
        if profile is None:
            raise RecordNotFoundError(f"No profile found for owner {owner_id}")

        if profile.data_version != data.expected_version:
            raise StaleVersionError(
                f"Profile version conflict: expected {data.expected_version}, current is {profile.data_version}"
            )

        if data.opening_cash_paise is not None:
            profile.opening_cash_paise = data.opening_cash_paise
        if data.balance_as_of is not None:
            profile.balance_as_of = data.balance_as_of
        if data.reserve_floor_paise is not None:
            profile.reserve_floor_paise = data.reserve_floor_paise
        if data.currency is not None:
            profile.currency = data.currency
        if data.timezone is not None:
            profile.timezone = data.timezone

        profile.data_version += 1
        await _flush(self.session)
        return profile

    # -----------------------------------------------------------------------
    # Cashflow Rules
    # -----------------------------------------------------------------------

    async def list_cashflow_rules(
        self, owner_id: uuid.UUID, direction: str | None = None
    ) -> Sequence[CashflowRule]:
        """List all cashflow rules for an owner, optionally filtered by direction."""
        stmt = select(CashflowRule).where(CashflowRule.owner_id == owner_id)
        if direction:
            stmt = stmt.where(CashflowRule.direction == direction)
        stmt = stmt.order_by(CashflowRule.created_at.asc())
        res = await _exec(self.session, stmt)
        return res.scalars().all()

    async def get_cashflow_rule(
        self, owner_id: uuid.UUID, rule_id: uuid.UUID
    ) -> CashflowRule | None:
        """Fetch a specific cashflow rule belonging to the owner."""
        stmt = select(CashflowRule).where(
            CashflowRule.id == rule_id,
            CashflowRule.owner_id == owner_id,
        )
        res = await _exec(self.session, stmt)
        return res.scalar_one_or_none()

    async def create_cashflow_rule(
        self, owner_id: uuid.UUID, data: CashflowRuleIn
    ) -> CashflowRule:
        """Create a new cashflow rule and increment profile data_version."""
        rule = CashflowRule(
            owner_id=owner_id,
            direction=data.direction,
            category=data.category,
            amount_paise=data.amount_paise,
            due_date=data.due_date,
            start_date=data.start_date,
            frequency=data.frequency,
            end_date=data.end_date,
            timing=data.timing,
            source=data.source,
        )
        self.session.add(rule)
        await self.increment_data_version(owner_id)
        await _flush(self.session)
        return rule

    async def update_cashflow_rule(
        self, owner_id: uuid.UUID, rule_id: uuid.UUID, data: CashflowRuleUpdate
    ) -> CashflowRule | None:
        """
        Update an existing cashflow rule and increment profile data_version.
        Validates expected_data_version against the owner's profile data_version.
        """
        rule = await self.get_cashflow_rule(owner_id, rule_id)
        if rule is None:
            return None

        profile = await self.get_profile(owner_id)
        current_data_version = profile.data_version if profile is not None else 1
        if current_data_version != data.expected_data_version:
            raise StaleVersionError(
                f"Cashflow rule update conflict: expected data_version {data.expected_data_version}, current is {current_data_version}"
            )

        if data.direction is not None:
            rule.direction = data.direction
        if data.category is not None:
            rule.category = data.category
        if data.amount_paise is not None:
            rule.amount_paise = data.amount_paise
        if data.due_date is not None:
            rule.due_date = data.due_date
        if data.start_date is not None:
            rule.start_date = data.start_date
        if data.frequency is not None:
            rule.frequency = data.frequency
        if data.end_date is not None:
            rule.end_date = data.end_date
        if data.timing is not None:
            rule.timing = data.timing
        if data.source is not None:
            rule.source = data.source

        await self.increment_data_version(owner_id)
        await _flush(self.session)
        return rule

    async def delete_cashflow_rule(
        self, owner_id: uuid.UUID, rule_id: uuid.UUID, expected_data_version: int
    ) -> bool:
        """
        Delete a cashflow rule and increment profile data_version.
        Validates expected_data_version against the owner's profile data_version.
        """
        rule = await self.get_cashflow_rule(owner_id, rule_id)
        if rule is None:
            return False

        profile = await self.get_profile(owner_id)
        current_data_version = profile.data_version if profile is not None else 1
        if current_data_version != expected_data_version:
            raise StaleVersionError(
                f"Cashflow rule deletion conflict: expected data_version {expected_data_version}, current is {current_data_version}"
            )

        # If any goal points to this rule in SQLite test context, set contribution_rule_id to None
        stmt_goals = select(Goal).where(
            Goal.owner_id == owner_id, Goal.contribution_rule_id == rule_id
        )
        res_goals = await _exec(self.session, stmt_goals)
        for linked_goal in res_goals.scalars().all():
            linked_goal.contribution_rule_id = None

        await _delete(self.session, rule)
        await self.increment_data_version(owner_id)
        await _flush(self.session)
        return True

    # -----------------------------------------------------------------------
    # Obligations & Scheduled Payments
    # -----------------------------------------------------------------------

    async def list_obligations(
        self,
        owner_id: uuid.UUID,
        status: str | None = None,
        kind: str | None = None,
    ) -> Sequence[Obligation]:
        """List obligations for an owner with payments eagerly loaded."""
        stmt = (
            select(Obligation)
            .options(selectinload(Obligation.payments))
            .where(Obligation.owner_id == owner_id)
        )
        if status:
            stmt = stmt.where(Obligation.status == status)
        if kind:
            stmt = stmt.where(Obligation.kind == kind)
        stmt = stmt.order_by(Obligation.created_at.asc())
        res = await _exec(self.session, stmt)
        return res.scalars().all()

    async def get_obligation(
        self, owner_id: uuid.UUID, obligation_id: uuid.UUID
    ) -> Obligation | None:
        """Fetch a specific obligation with its scheduled payments."""
        stmt = (
            select(Obligation)
            .options(selectinload(Obligation.payments))
            .where(Obligation.id == obligation_id, Obligation.owner_id == owner_id)
        )
        res = await _exec(self.session, stmt)
        return res.scalar_one_or_none()

    async def create_obligation(
        self, owner_id: uuid.UUID, data: ObligationIn
    ) -> Obligation:
        """
        Create a new obligation with child scheduled payments.
        Enforces that all child payments inherit the same owner_id.
        """
        obligation = Obligation(
            owner_id=owner_id,
            provider_alias=data.provider_alias,
            kind=data.kind,
            principal_remaining_paise=data.principal_remaining_paise,
            status=data.status,
            source=data.source,
            source_ref=data.source_ref,
            source_as_of=data.source_as_of,
            version=1,
        )
        self.session.add(obligation)
        await _flush(self.session)

        for p in data.payments:
            payment = ObligationPayment(
                obligation_id=obligation.id,
                owner_id=owner_id,
                due_date=p.due_date,
                amount_paise=p.amount_paise,
                interest_paise=p.interest_paise,
                fee_paise=p.fee_paise,
                payment_status=p.payment_status,
                actual_paid_date=p.actual_paid_date,
            )
            self.session.add(payment)

        await self.increment_data_version(owner_id)
        await _flush(self.session)
        created = await self.get_obligation(owner_id, obligation.id)
        assert created is not None
        return created

    async def update_obligation(
        self, owner_id: uuid.UUID, obligation_id: uuid.UUID, data: ObligationUpdate
    ) -> Obligation | None:
        """
        Update an obligation with optimistic concurrency validation.
        Increments obligation version and profile data_version.
        """
        obligation = await self.get_obligation(owner_id, obligation_id)
        if obligation is None:
            return None

        if obligation.version != data.expected_version:
            raise StaleVersionError(
                f"Obligation version conflict: expected {data.expected_version}, current is {obligation.version}"
            )

        if data.provider_alias is not None:
            obligation.provider_alias = data.provider_alias
        if data.kind is not None:
            obligation.kind = data.kind
        if data.principal_remaining_paise is not None:
            obligation.principal_remaining_paise = data.principal_remaining_paise
        if data.status is not None:
            obligation.status = data.status
        if data.source is not None:
            obligation.source = data.source
        if data.source_ref is not None:
            obligation.source_ref = data.source_ref
        if data.source_as_of is not None:
            obligation.source_as_of = data.source_as_of

        if data.payments is not None:
            # Replace payments
            for existing in list(obligation.payments):
                await _delete(self.session, existing)
            await _flush(self.session)

            for p in data.payments:
                new_p = ObligationPayment(
                    obligation_id=obligation.id,
                    owner_id=owner_id,
                    due_date=p.due_date,
                    amount_paise=p.amount_paise,
                    interest_paise=p.interest_paise,
                    fee_paise=p.fee_paise,
                    payment_status=p.payment_status,
                    actual_paid_date=p.actual_paid_date,
                )
                self.session.add(new_p)

        obligation.version += 1
        await self.increment_data_version(owner_id)
        await _flush(self.session)
        updated = await self.get_obligation(owner_id, obligation.id)
        return updated

    async def delete_obligation(
        self,
        owner_id: uuid.UUID,
        obligation_id: uuid.UUID,
        expected_version: int,
    ) -> bool:
        """Delete an obligation and cascade delete payments, validating version."""
        obligation = await self.get_obligation(owner_id, obligation_id)
        if obligation is None:
            return False

        if obligation.version != expected_version:
            raise StaleVersionError(
                f"Obligation version conflict: expected {expected_version}, current is {obligation.version}"
            )

        await _delete(self.session, obligation)
        await self.increment_data_version(owner_id)
        await _flush(self.session)
        return True

    # -----------------------------------------------------------------------
    # Payment Direct Queries
    # -----------------------------------------------------------------------

    async def list_payments(
        self,
        owner_id: uuid.UUID,
        from_date: date | None = None,
        to_date: date | None = None,
        payment_status: str | None = None,
    ) -> Sequence[ObligationPayment]:
        """Fetch scheduled obligation payments for an owner with date-range filters."""
        stmt = select(ObligationPayment).where(ObligationPayment.owner_id == owner_id)
        if from_date is not None:
            stmt = stmt.where(ObligationPayment.due_date >= from_date)
        if to_date is not None:
            stmt = stmt.where(ObligationPayment.due_date <= to_date)
        if payment_status is not None:
            stmt = stmt.where(ObligationPayment.payment_status == payment_status)
        stmt = stmt.order_by(ObligationPayment.due_date.asc())
        res = await _exec(self.session, stmt)
        return res.scalars().all()

    async def get_payment(
        self, owner_id: uuid.UUID, payment_id: uuid.UUID
    ) -> ObligationPayment | None:
        """Fetch a specific payment belonging to the owner."""
        stmt = select(ObligationPayment).where(
            ObligationPayment.id == payment_id,
            ObligationPayment.owner_id == owner_id,
        )
        res = await _exec(self.session, stmt)
        return res.scalar_one_or_none()

    async def update_payment_status(
        self,
        owner_id: uuid.UUID,
        payment_id: uuid.UUID,
        payment_status: str,
        actual_paid_date: date | None = None,
    ) -> ObligationPayment | None:
        """Update an obligation payment's status and increment profile data_version."""
        payment = await self.get_payment(owner_id, payment_id)
        if payment is None:
            return None

        payment.payment_status = payment_status
        payment.actual_paid_date = actual_paid_date
        await self.increment_data_version(owner_id)
        await _flush(self.session)
        return payment

    # -----------------------------------------------------------------------
    # Goals
    # -----------------------------------------------------------------------

    async def list_goals(self, owner_id: uuid.UUID) -> Sequence[Goal]:
        """List all financial goals for an owner."""
        stmt = select(Goal).where(Goal.owner_id == owner_id).order_by(Goal.created_at.asc())
        res = await _exec(self.session, stmt)
        return res.scalars().all()

    async def get_goal(self, owner_id: uuid.UUID, goal_id: uuid.UUID) -> Goal | None:
        """Fetch a goal belonging to the owner."""
        stmt = select(Goal).where(Goal.id == goal_id, Goal.owner_id == owner_id)
        res = await _exec(self.session, stmt)
        return res.scalar_one_or_none()

    async def create_goal(self, owner_id: uuid.UUID, data: GoalIn) -> Goal:
        """
        Create a financial goal.
        If contribution_rule_id is provided, verifies that it belongs to the same owner.
        """
        if data.contribution_rule_id is not None:
            rule = await self.get_cashflow_rule(owner_id, data.contribution_rule_id)
            if rule is None:
                raise CrossOwnerReferenceError(
                    f"Cashflow rule {data.contribution_rule_id} does not exist or does not belong to user {owner_id}"
                )

        goal = Goal(
            owner_id=owner_id,
            label=data.label,
            target_amount_paise=data.target_amount_paise,
            target_date=data.target_date,
            protected=data.protected,
            contribution_rule_id=data.contribution_rule_id,
        )
        self.session.add(goal)
        await self.increment_data_version(owner_id)
        await _flush(self.session)
        return goal

    async def update_goal(
        self, owner_id: uuid.UUID, goal_id: uuid.UUID, data: GoalUpdate
    ) -> Goal | None:
        """Update a goal, verifying same-owner link if contribution_rule_id changes."""
        goal = await self.get_goal(owner_id, goal_id)
        if goal is None:
            return None

        if data.contribution_rule_id is not None:
            rule = await self.get_cashflow_rule(owner_id, data.contribution_rule_id)
            if rule is None:
                raise CrossOwnerReferenceError(
                    f"Cashflow rule {data.contribution_rule_id} does not exist or does not belong to user {owner_id}"
                )
            goal.contribution_rule_id = data.contribution_rule_id

        if data.label is not None:
            goal.label = data.label
        if data.target_amount_paise is not None:
            goal.target_amount_paise = data.target_amount_paise
        if data.target_date is not None:
            goal.target_date = data.target_date
        if data.protected is not None:
            goal.protected = data.protected

        await self.increment_data_version(owner_id)
        await _flush(self.session)
        return goal

    async def delete_goal(self, owner_id: uuid.UUID, goal_id: uuid.UUID) -> bool:
        """Delete a goal and increment profile data_version."""
        goal = await self.get_goal(owner_id, goal_id)
        if goal is None:
            return False

        await _delete(self.session, goal)
        await self.increment_data_version(owner_id)
        await _flush(self.session)
        return True

    # -----------------------------------------------------------------------
    # Import Batches
    # -----------------------------------------------------------------------

    async def list_import_batches(
        self, owner_id: uuid.UUID, limit: int = 20
    ) -> Sequence[ImportBatch]:
        """Fetch import batches for an owner ordered by creation date desc."""
        stmt = (
            select(ImportBatch)
            .where(ImportBatch.owner_id == owner_id)
            .order_by(ImportBatch.created_at.desc())
            .limit(limit)
        )
        res = await _exec(self.session, stmt)
        return res.scalars().all()

    async def get_import_batch(
        self, owner_id: uuid.UUID, batch_id: uuid.UUID
    ) -> ImportBatch | None:
        """Fetch a specific import batch belonging to the owner."""
        stmt = select(ImportBatch).where(
            ImportBatch.id == batch_id, ImportBatch.owner_id == owner_id
        )
        res = await _exec(self.session, stmt)
        return res.scalar_one_or_none()

    async def create_import_batch(
        self,
        owner_id: uuid.UUID,
        file_hash: str,
        preview_json: dict | list | None = None,
        errors_json: dict | list | None = None,
    ) -> ImportBatch:
        """Create a pending import batch staging structured JSON preview rows."""
        batch = ImportBatch(
            owner_id=owner_id,
            file_hash=file_hash,
            status="pending",
            preview_json=preview_json,
            errors_json=errors_json,
        )
        self.session.add(batch)
        await _flush(self.session)
        return batch

    async def update_import_batch_status(
        self,
        owner_id: uuid.UUID,
        batch_id: uuid.UUID,
        status: str,
        committed_at: datetime | None = None,
    ) -> ImportBatch | None:
        """Update an import batch status upon commit."""
        batch = await self.get_import_batch(owner_id, batch_id)
        if batch is None:
            return None

        batch.status = status
        if committed_at is not None:
            batch.committed_at = committed_at
        await _flush(self.session)
        return batch

    # -----------------------------------------------------------------------
    # Engine C Financial Snapshot Builder
    # -----------------------------------------------------------------------

    async def get_financial_snapshot(
        self, owner_id: uuid.UUID
    ) -> FinancialSnapshotSchema | None:
        """
        Build an immutable normalized financial snapshot required by Person C's decision engine.
        Returns None if the user has no financial profile established yet.
        """
        profile = await self.get_profile(owner_id)
        if profile is None:
            return None

        rules = await self.list_cashflow_rules(owner_id)
        obligations = await self.list_obligations(owner_id, status="active")
        goals = await self.list_goals(owner_id)

        income_rules = [
            SnapshotIncomeRule(
                id=r.id,
                category=r.category,
                amount_paise=r.amount_paise,
                due_date=r.due_date,
                start_date=r.start_date,
                frequency=r.frequency,
                end_date=r.end_date,
                timing=r.timing,
            )
            for r in rules
            if r.direction == "income"
        ]

        expense_rules = [
            SnapshotExpenseRule(
                id=r.id,
                category=r.category,
                amount_paise=r.amount_paise,
                due_date=r.due_date,
                start_date=r.start_date,
                frequency=r.frequency,
                end_date=r.end_date,
                timing=r.timing,
            )
            for r in rules
            if r.direction == "expense"
        ]

        snapshot_obs = [
            SnapshotObligation(
                id=o.id,
                provider_alias=o.provider_alias,
                kind=o.kind,
                principal_remaining_paise=o.principal_remaining_paise,
                payments=[
                    SnapshotPayment(
                        id=p.id,
                        due_date=p.due_date,
                        amount_paise=p.amount_paise,
                        interest_paise=p.interest_paise,
                        fee_paise=p.fee_paise,
                        payment_status=p.payment_status,
                    )
                    for p in o.payments
                ],
            )
            for o in obligations
        ]

        snapshot_goals = [
            SnapshotGoal(
                id=g.id,
                label=g.label,
                target_amount_paise=g.target_amount_paise,
                target_date=g.target_date,
                protected=g.protected,
                contribution_rule_id=g.contribution_rule_id,
            )
            for g in goals
        ]

        return FinancialSnapshotSchema(
            opening_cash_paise=profile.opening_cash_paise,
            balance_as_of=profile.balance_as_of,
            reserve_floor_paise=profile.reserve_floor_paise,
            income_rules=income_rules,
            expense_rules=expense_rules,
            obligations=snapshot_obs,
            goals=snapshot_goals,
            data_version=profile.data_version,
        )
