from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.identity import User
from app.services.calendar_service import CalendarScheduleResult, CalendarService

router = APIRouter()


@router.get("/calendar")
async def get_calendar(
    from_date: date = Query(..., alias="from", description="Calendar window start date (YYYY-MM-DD)"),
    to_date: date = Query(..., alias="to", description="Calendar window end date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CalendarScheduleResult:
    """
    Generate the rich financial calendar schedule for the authenticated user
    over the requested date range [from, to] (inclusive).

    Features:
    - Recurring income and expense rule expansion.
    - Explicit loan and BNPL repayment schedules.
    - Intra-day debit-before-credit ordering.
    - Paid vs. planned payment tracking.
    - 7-day rolling scheduled outflow window metrics.
    """
    if to_date < from_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'to' date must be on or after 'from' date",
        )

    service = CalendarService(db)
    return await service.build_calendar(current_user.id, from_date, to_date)
