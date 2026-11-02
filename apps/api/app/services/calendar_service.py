"""
BeforeBorrow - Financial Calendar Service (Person B)
Converts saved financial rules, explicit repayment schedules, and goal
contributions into dated calendar events.

Features:
- Recurrence expansion using python-dateutil (monthly anchor-clamping, leap years).
- Debit-before-credit intra-day sorting.
- Paid vs. planned payment tracking (avoids re-deducting already-reflected payments).
- Protected goal contribution tagging without double-counting.
- Seven-day rolling outflow summaries and daily groupings.
- Conversion to Person C's pure Engine CashEvent dataclass.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Iterable, Sequence
import uuid

from dateutil.relativedelta import relativedelta

from app.engine.types import CashEvent
from app.models.finance import CashflowRule, Goal, Obligation, ObligationPayment, Profile
from app.repositories.finance import FinanceRepository
from app.schemas.finance import FinancialSnapshotSchema


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CalendarEventItem:
    """
    Rich calendar event model maintaining source lineage, payment status,
    and direction for presentation and calculation.
    """
    event_date: date
    amount_paise: int
    direction: str  # "income" or "outflow"
    category: str
    source_type: str  # "cashflow_rule", "obligation_payment", "goal_contribution"
    source_id: str
    timing: str = "known"  # "known" or "estimated"
    payment_status: str = "scheduled"  # "scheduled" or "paid"
    provider_alias: str | None = None
    obligation_kind: str | None = None
    goal_id: str | None = None
    is_protected_goal: bool = False
    is_already_reflected: bool = False
    actual_paid_date: date | None = None

    @property
    def is_income(self) -> bool:
        return self.direction == "income"

    @property
    def is_outflow(self) -> bool:
        return self.direction in ("outflow", "expense")

    def to_cash_event(self) -> CashEvent:
        """
        Convert to Person C's immutable CashEvent dataclass.
        Signed convention: positive for income, negative for outflow.
        """
        signed_amount = self.amount_paise if self.is_income else -self.amount_paise
        return CashEvent(
            event_date=self.event_date,
            amount_paise=signed_amount,
            category=self.category,
            source_id=self.source_id,
        )


@dataclass(frozen=True)
class CalendarDailySummary:
    """Consolidated summary of scheduled cash events for a specific calendar date."""
    event_date: date
    events: tuple[CalendarEventItem, ...]
    scheduled_income_paise: int
    scheduled_outflow_paise: int
    net_paise: int


@dataclass(frozen=True)
class RollingSevenDayOutflow:
    """Seven-day rolling scheduled outflow window summary."""
    window_start: date
    window_end: date
    outflow_paise: int
    event_count: int


@dataclass(frozen=True)
class CalendarScheduleResult:
    """Complete calendar view and aggregated metrics over the queried window."""
    from_date: date
    to_date: date
    events: tuple[CalendarEventItem, ...]
    daily_summaries: tuple[CalendarDailySummary, ...]
    rolling_7d_outflows: tuple[RollingSevenDayOutflow, ...]
    total_scheduled_income_paise: int
    total_scheduled_outflow_paise: int
    net_scheduled_cashflow_paise: int
    total_event_count: int
    engine_cash_events: tuple[CashEvent, ...]
    disclaimer: str = (
        "Scheduled events and aggregates based on recorded rules and commitments; "
        "not a guaranteed forecast or credit approval."
    )


# ---------------------------------------------------------------------------
# Recurrence Engine
# ---------------------------------------------------------------------------

def expand_rule_dates(
    anchor_date: date,
    frequency: str,
    from_date: date,
    to_date: date,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[date]:
    """
    Expand a recurrence pattern into explicit calendar dates within [from_date, to_date].

    Key requirements:
    1. Monthly dates calculated from original recurrence anchor to avoid permanent drift.
    2. January 31 monthly produces Feb 28 (or 29 in leap year) and then March 31.
    3. Leap years handled correctly (including yearly Feb 29).
    4. End dates and inclusive query bounds respected.
    5. Deduplicated and strictly sorted.
    """
    if from_date > to_date:
        return []

    freq = frequency.lower().strip()
    effective_start = max(anchor_date, start_date) if start_date else anchor_date

    # Single-occurrence rule
    if freq == "once":
        if (
            from_date <= anchor_date <= to_date
            and (not start_date or anchor_date >= start_date)
            and (not end_date or anchor_date <= end_date)
        ):
            return [anchor_date]
        return []

    # Map frequency to step parameters
    step_delta: relativedelta
    if freq == "weekly":
        step_delta = relativedelta(weeks=1)
    elif freq == "biweekly":
        step_delta = relativedelta(weeks=2)
    elif freq == "monthly":
        step_delta = relativedelta(months=1)
    elif freq == "quarterly":
        step_delta = relativedelta(months=3)
    elif freq == "yearly":
        step_delta = relativedelta(years=1)
    else:
        # Fallback to single occurrence if frequency unrecognized
        if from_date <= anchor_date <= to_date:
            return [anchor_date]
        return []

    results: list[date] = []
    k = 0
    max_iterations = 2000  # Guard against unbounded loops

    while k < max_iterations:
        # Always compute from the original anchor_date: anchor + k * delta
        # In python-dateutil, relativedelta(months=k) on Jan 31 preserves day=31,
        # clamping to Feb 28/29, then expanding back to Mar 31.
        if freq == "weekly":
            curr_date = anchor_date + relativedelta(weeks=k)
        elif freq == "biweekly":
            curr_date = anchor_date + relativedelta(weeks=2 * k)
        elif freq == "monthly":
            curr_date = anchor_date + relativedelta(months=k)
        elif freq == "quarterly":
            curr_date = anchor_date + relativedelta(months=3 * k)
        elif freq == "yearly":
            curr_date = anchor_date + relativedelta(years=k)
        else:
            break

        # Stop if beyond query end or rule end_date
        if curr_date > to_date:
            break
        if end_date and curr_date > end_date:
            break

        # Include if within requested query window and after effective start
        if curr_date >= from_date and curr_date >= effective_start:
            results.append(curr_date)

        k += 1

    return sorted(list(dict.fromkeys(results)))


# ---------------------------------------------------------------------------
# Calendar Aggregation Engine
# ---------------------------------------------------------------------------

def expand_calendar_events(
    cashflow_rules: Iterable[Any],
    obligations: Iterable[Any],
    goals: Iterable[Any] | None = None,
    from_date: date = date.today(),
    to_date: date = date.today() + timedelta(days=90),
    balance_as_of: date | None = None,
) -> CalendarScheduleResult:
    """
    Pure calendar expansion and aggregation engine.
    Merges recurring income, recurring expenses, explicit obligation payments,
    and protected goal contributions into an ordered ledger.
    """
    # 1. Map goal contributions to prevent double counting
    goal_rule_map: dict[uuid.UUID, Any] = {}
    if goals:
        for g in goals:
            if getattr(g, "contribution_rule_id", None) is not None:
                goal_rule_map[g.contribution_rule_id] = g

    raw_events: list[CalendarEventItem] = []

    # 2. Expand cashflow rules (Income & Expense)
    for rule in cashflow_rules:
        anchor = (
            getattr(rule, "due_date", None)
            or getattr(rule, "start_date", None)
            or from_date
        )
        freq = getattr(rule, "frequency", "monthly")
        start_d = getattr(rule, "start_date", None)
        end_d = getattr(rule, "end_date", None)
        direction = getattr(rule, "direction", "expense")

        expanded_dates = expand_rule_dates(
            anchor_date=anchor,
            frequency=freq,
            from_date=from_date,
            to_date=to_date,
            start_date=start_d,
            end_date=end_d,
        )

        rule_id = getattr(rule, "id", None) or uuid.uuid4()
        linked_goal = goal_rule_map.get(rule_id)

        for d in expanded_dates:
            raw_events.append(
                CalendarEventItem(
                    event_date=d,
                    amount_paise=getattr(rule, "amount_paise", 0),
                    direction=direction,
                    category=getattr(rule, "category", "general"),
                    source_type="cashflow_rule",
                    source_id=str(rule_id),
                    timing=getattr(rule, "timing", "known"),
                    payment_status="scheduled",
                    goal_id=str(linked_goal.id) if linked_goal else None,
                    is_protected_goal=bool(linked_goal and getattr(linked_goal, "protected", False)),
                )
            )

    # 3. Expand obligations with explicit repayment schedules
    for ob in obligations:
        ob_id = getattr(ob, "id", None) or uuid.uuid4()
        provider = getattr(ob, "provider_alias", "Unknown")
        kind = getattr(ob, "kind", "other")
        payments = getattr(ob, "payments", []) or []

        for p in payments:
            due_d = getattr(p, "due_date", None)
            if not due_d:
                continue

            if from_date <= due_d <= to_date:
                payment_id = getattr(p, "id", None) or uuid.uuid4()
                status = getattr(p, "payment_status", "scheduled")
                paid_d = getattr(p, "actual_paid_date", None)

                # Determine if already reflected in opening cash balance
                is_reflected = False
                if status == "paid" and balance_as_of is not None:
                    effective_paid = paid_d or due_d
                    if effective_paid <= balance_as_of:
                        is_reflected = True

                raw_events.append(
                    CalendarEventItem(
                        event_date=due_d,
                        amount_paise=getattr(p, "amount_paise", 0),
                        direction="outflow",
                        category=f"{kind.upper()}: {provider}",
                        source_type="obligation_payment",
                        source_id=str(payment_id),
                        timing="known",
                        payment_status=status,
                        provider_alias=provider,
                        obligation_kind=kind,
                        is_already_reflected=is_reflected,
                        actual_paid_date=paid_d,
                    )
                )

    # 4. Deduplicate identical events by (source_type, source_id, event_date)
    seen_keys: set[tuple[str, str, date]] = set()
    deduped_events: list[CalendarEventItem] = []
    for ev in raw_events:
        key = (ev.source_type, ev.source_id, ev.event_date)
        if key not in seen_keys:
            seen_keys.add(key)
            deduped_events.append(ev)

    # 5. Sort events according to debit-before-credit convention:
    # On the same date, all debits (outflow=0) come before credits (income=1).
    deduped_events.sort(
        key=lambda e: (
            e.event_date,
            0 if e.is_outflow else 1,
            e.source_id,
        )
    )

    # 6. Group by date and compute daily summaries
    by_date: dict[date, list[CalendarEventItem]] = {}
    for ev in deduped_events:
        by_date.setdefault(ev.event_date, []).append(ev)

    daily_summaries: list[CalendarDailySummary] = []
    total_scheduled_income = 0
    total_scheduled_outflow = 0

    for d in sorted(by_date.keys()):
        day_events = tuple(by_date[d])
        day_inc = sum(e.amount_paise for e in day_events if e.is_income and not e.is_already_reflected)
        day_out = sum(e.amount_paise for e in day_events if e.is_outflow and not e.is_already_reflected)
        daily_summaries.append(
            CalendarDailySummary(
                event_date=d,
                events=day_events,
                scheduled_income_paise=day_inc,
                scheduled_outflow_paise=day_out,
                net_paise=day_inc - day_out,
            )
        )
        total_scheduled_income += day_inc
        total_scheduled_outflow += day_out

    # 7. Compute seven-day rolling outflow summaries
    # Evaluates every 7-day rolling window [d, d + 6]
    rolling_7d: list[RollingSevenDayOutflow] = []
    curr = from_date
    while curr <= to_date:
        w_end = min(curr + timedelta(days=6), to_date)
        window_events = [
            e for e in deduped_events
            if curr <= e.event_date <= w_end and e.is_outflow and not e.is_already_reflected
        ]
        w_outflow = sum(e.amount_paise for e in window_events)
        rolling_7d.append(
            RollingSevenDayOutflow(
                window_start=curr,
                window_end=w_end,
                outflow_paise=w_outflow,
                event_count=len(window_events),
            )
        )
        curr += timedelta(days=1)

    # 8. Pure engine CashEvent stream (unreflected active events)
    engine_events = tuple(
        e.to_cash_event() for e in deduped_events if not e.is_already_reflected
    )

    return CalendarScheduleResult(
        from_date=from_date,
        to_date=to_date,
        events=tuple(deduped_events),
        daily_summaries=tuple(daily_summaries),
        rolling_7d_outflows=tuple(rolling_7d),
        total_scheduled_income_paise=total_scheduled_income,
        total_scheduled_outflow_paise=total_scheduled_outflow,
        net_scheduled_cashflow_paise=total_scheduled_income - total_scheduled_outflow,
        total_event_count=len(deduped_events),
        engine_cash_events=engine_events,
    )


# ---------------------------------------------------------------------------
# Calendar Service Class
# ---------------------------------------------------------------------------

class CalendarService:
    """
    Coordinates calendar operations, fetching owner-scoped records and
    delegating to the pure calendar expansion engine.
    """

    def __init__(self, session_or_repo: Any) -> None:
        if isinstance(session_or_repo, FinanceRepository):
            self.repo = session_or_repo
        else:
            self.repo = FinanceRepository(session_or_repo)

    async def get_calendar(
        self,
        owner_id: uuid.UUID,
        from_date: date,
        to_date: date,
    ) -> CalendarScheduleResult:
        """
        Fetch all financial truth records for owner_id and expand into a
        complete dated calendar schedule result.
        """
        profile = await self.repo.get_profile(owner_id)
        rules = await self.repo.list_cashflow_rules(owner_id)
        obligations = await self.repo.list_obligations(owner_id, status="active")
        goals = await self.repo.list_goals(owner_id)

        balance_as_of = profile.balance_as_of if profile else None

        return expand_calendar_events(
            cashflow_rules=rules,
            obligations=obligations,
            goals=goals,
            from_date=from_date,
            to_date=to_date,
            balance_as_of=balance_as_of,
        )

    # Alias build_calendar to get_calendar for flexible service usage
    build_calendar = get_calendar

    def expand_from_snapshot(
        self,
        snapshot: FinancialSnapshotSchema,
        from_date: date,
        to_date: date,
    ) -> CalendarScheduleResult:
        """
        Expand calendar events from an existing FinancialSnapshotSchema
        without querying the database.
        """
        return expand_calendar_events(
            cashflow_rules=list(snapshot.income_rules) + list(snapshot.expense_rules),
            obligations=snapshot.obligations,
            goals=snapshot.goals,
            from_date=from_date,
            to_date=to_date,
            balance_as_of=snapshot.balance_as_of,
        )
