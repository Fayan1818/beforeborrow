"""
BeforeBorrow - Snapshot Builder Service (Person B)
Bridge between Person B's financial truth persistence and Person C's pure calculation engine.

Responsibilities:
- Build an immutable, normalized FinancialSnapshot compatible with Person C.
- Run rigorous data-quality and completeness checks.
- Prevent missing required data from quietly defaulting to zero.
- Identify blocking gaps (e.g. missing profile, obligations without payment schedules)
  and non-blocking quality notices (e.g. estimated timing, stale source data).
- Keep data-quality metadata separate from the engine's immutable calculation snapshot.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Sequence
import uuid

from app.engine.types import FinancialSnapshot as EngineFinancialSnapshot
from app.models.finance import CashflowRule, Goal, Obligation, Profile
from app.repositories.finance import FinanceRepository
from app.schemas.finance import (
    FinancialSnapshotSchema,
    SnapshotExpenseRule,
    SnapshotGoal,
    SnapshotIncomeRule,
    SnapshotObligation,
    SnapshotPayment,
)


# ---------------------------------------------------------------------------
# Data Quality Models
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class QualityIssue:
    """An individual data quality notice or blocking gap."""
    code: str
    severity: str  # "BLOCKING" or "WARNING"
    message: str
    field: str | None = None
    source_id: str | None = None


@dataclass(frozen=True)
class SnapshotDataQualityReport:
    """Consolidated assessment of the financial data's completeness and freshness."""
    is_valid: bool
    data_version: int | None
    blocking_gaps: tuple[str, ...]
    warnings: tuple[str, ...]
    issues: tuple[QualityIssue, ...]
    quality_score: int  # 0 to 100
    summary: str


@dataclass(frozen=True)
class SnapshotBuildResult:
    """
    Combined output of the snapshot builder.
    If is_valid is False, snapshot is None because incomplete data must never
    produce a misleading calculation.
    """
    snapshot: EngineFinancialSnapshot | None
    snapshot_schema: FinancialSnapshotSchema | None
    data_quality: SnapshotDataQualityReport

    @property
    def is_valid(self) -> bool:
        return self.data_quality.is_valid

    @property
    def blocking_gaps(self) -> tuple[str, ...]:
        return self.data_quality.blocking_gaps

    @property
    def warnings(self) -> tuple[str, ...]:
        return self.data_quality.warnings


# ---------------------------------------------------------------------------
# Data Quality Validator
# ---------------------------------------------------------------------------

def validate_data_quality(
    profile: Profile | None,
    rules: Sequence[CashflowRule],
    obligations: Sequence[Obligation],
    goals: Sequence[Goal],
) -> SnapshotDataQualityReport:
    """
    Evaluates financial truth completeness and identifies all blocking gaps
    and data quality warnings.
    """
    issues: list[QualityIssue] = []

    # 1. Profile Checks
    if profile is None:
        issues.append(
            QualityIssue(
                code="MISSING_PROFILE",
                severity="BLOCKING",
                message="Missing financial profile: Profile setup must be completed before analysis.",
                field="profile",
            )
        )
    else:
        if profile.balance_as_of is None:
            issues.append(
                QualityIssue(
                    code="MISSING_BALANCE_DATE",
                    severity="BLOCKING",
                    message="Missing opening balance date: Opening cash requires a valid as-of date.",
                    field="balance_as_of",
                )
            )
        if profile.opening_cash_paise < 0:
            issues.append(
                QualityIssue(
                    code="INVALID_OPENING_CASH",
                    severity="BLOCKING",
                    message="Invalid opening cash: Cash balance cannot be negative.",
                    field="opening_cash_paise",
                )
            )

    # 2. Obligation Checks
    for ob in obligations:
        ob_id_str = str(ob.id)
        payments = getattr(ob, "payments", []) or []

        # Active obligations must have an explicit payment schedule
        # "A missing schedule shows 'needs details' and cannot quietly contribute zero to the model."
        if ob.status == "active" and len(payments) == 0:
            issues.append(
                QualityIssue(
                    code="MISSING_PAYMENT_SCHEDULE",
                    severity="BLOCKING",
                    message=(
                        f"Missing obligation schedule: Obligation '{ob.provider_alias}' has no scheduled "
                        "payments. Explicit installments or repayment schedule required."
                    ),
                    field="payments",
                    source_id=ob_id_str,
                )
            )

        # Credit card repayment terms check
        if ob.kind == "card" and len(payments) == 0:
            issues.append(
                QualityIssue(
                    code="UNKNOWN_CARD_TERMS",
                    severity="BLOCKING",
                    message=(
                        f"Unknown credit card repayment terms: Card '{ob.provider_alias}' has no statement "
                        "due date or payment schedule recorded."
                    ),
                    field="payments",
                    source_id=ob_id_str,
                )
            )

        # Source data staleness (> 30 days old relative to profile balance date)
        if ob.source_as_of and profile and profile.balance_as_of:
            staleness_days = (profile.balance_as_of - ob.source_as_of).days
            if staleness_days > 30:
                issues.append(
                    QualityIssue(
                        code="STALE_SOURCE_DATA",
                        severity="WARNING",
                        message=(
                            f"Stale obligation data: Obligation '{ob.provider_alias}' data is "
                            f"{staleness_days} days old (as of {ob.source_as_of})."
                        ),
                        field="source_as_of",
                        source_id=ob_id_str,
                    )
                )

        # Unconfirmed source data from CSV or external statement
        if getattr(ob, "confirmed_at", None) is None and ob.source in ("csv", "import", "statement"):
            issues.append(
                QualityIssue(
                    code="UNCONFIRMED_OBLIGATION",
                    severity="WARNING",
                    message=f"Unconfirmed obligation: Obligation '{ob.provider_alias}' has not been confirmed.",
                    field="confirmed_at",
                    source_id=ob_id_str,
                )
            )

    # 3. Cashflow Rule Checks
    for r in rules:
        r_id_str = str(r.id)
        if r.direction == "income":
            if r.timing == "estimated":
                issues.append(
                    QualityIssue(
                        code="ESTIMATED_INCOME_TIMING",
                        severity="WARNING",
                        message=f"Estimated income timing: Income rule '{r.category}' has estimated arrival timing.",
                        field="timing",
                        source_id=r_id_str,
                    )
                )
            if r.due_date is None and r.start_date is None:
                issues.append(
                    QualityIssue(
                        code="UNSCHEDULED_INCOME",
                        severity="WARNING",
                        message=f"Unscheduled income: Income rule '{r.category}' has no anchor date.",
                        field="due_date",
                        source_id=r_id_str,
                    )
                )
        elif r.direction == "expense":
            if r.timing == "estimated":
                issues.append(
                    QualityIssue(
                        code="ESTIMATED_EXPENSE_AMOUNT",
                        severity="WARNING",
                        message=f"Estimated expense amount: Expense rule '{r.category}' has estimated amount/timing.",
                        field="timing",
                        source_id=r_id_str,
                    )
                )

    blocking_gaps = tuple(i.message for i in issues if i.severity == "BLOCKING")
    warnings = tuple(i.message for i in issues if i.severity == "WARNING")
    is_valid = len(blocking_gaps) == 0

    # Calculate 0-100 quality score
    base_score = 100
    base_score -= len(blocking_gaps) * 40
    base_score -= len(warnings) * 10
    quality_score = max(0, min(100, base_score))

    summary: str
    if not is_valid:
        summary = f"Blocked by {len(blocking_gaps)} critical data gap(s). Snapshot cannot be used for calculation."
    elif warnings:
        summary = f"Valid snapshot with {len(warnings)} quality notice(s)."
    else:
        summary = "Verified complete financial snapshot ready for calculation engine."

    return SnapshotDataQualityReport(
        is_valid=is_valid,
        data_version=profile.data_version if profile else None,
        blocking_gaps=blocking_gaps,
        warnings=warnings,
        issues=tuple(issues),
        quality_score=quality_score,
        summary=summary,
    )


# ---------------------------------------------------------------------------
# Snapshot Service Class
# ---------------------------------------------------------------------------

class SnapshotService:
    """
    Coordinates snapshot assembly from the repository and performs data-quality
    verification before handing off to Person C's calculation engine.
    """

    def __init__(self, session_or_repo: Any) -> None:
        if isinstance(session_or_repo, FinanceRepository):
            self.repo = session_or_repo
        else:
            self.repo = FinanceRepository(session_or_repo)

    async def build_snapshot(self, owner_id: uuid.UUID) -> SnapshotBuildResult:
        """
        Builds a validated, normalized financial snapshot for the authenticated user.
        If blocking gaps exist, returns snapshot=None to prevent misleading calculations.
        """
        profile = await self.repo.get_profile(owner_id)
        rules = await self.repo.list_cashflow_rules(owner_id)
        obligations = await self.repo.list_obligations(owner_id, status="active")
        goals = await self.repo.list_goals(owner_id)

        # Run data quality validation
        quality_report = validate_data_quality(
            profile=profile,
            rules=rules,
            obligations=obligations,
            goals=goals,
        )

        if not quality_report.is_valid or profile is None:
            return SnapshotBuildResult(
                snapshot=None,
                snapshot_schema=None,
                data_quality=quality_report,
            )

        # Build FinancialSnapshotSchema
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

        schema = FinancialSnapshotSchema(
            opening_cash_paise=profile.opening_cash_paise,
            balance_as_of=profile.balance_as_of,
            reserve_floor_paise=profile.reserve_floor_paise,
            income_rules=income_rules,
            expense_rules=expense_rules,
            obligations=snapshot_obs,
            goals=snapshot_goals,
            data_version=profile.data_version,
        )

        engine_snapshot = schema.to_engine_snapshot()

        return SnapshotBuildResult(
            snapshot=engine_snapshot,
            snapshot_schema=schema,
            data_quality=quality_report,
        )
