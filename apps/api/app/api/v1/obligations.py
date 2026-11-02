from datetime import date
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.identity import User
from app.repositories.finance import RecordNotFoundError, StaleVersionError
from app.schemas.finance import (
    ObligationIn,
    ObligationOut,
    ObligationPaymentIn,
    ObligationPaymentOut,
    ObligationUpdate,
    PaymentStatusUpdate,
)
from app.services.finance_service import FinanceService

router = APIRouter()


# ---------------------------------------------------------------------------
# Obligations Endpoints
# ---------------------------------------------------------------------------

@router.get("/obligations", response_model=list[ObligationOut])
async def list_obligations(
    status: str | None = Query(None, pattern="^(active|closed|defaulted|paused|paid)$"),
    kind: str | None = Query(None, pattern="^(term_loan|loan|card|bnpl|other)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ObligationOut]:
    """List obligations belonging to the authenticated user with optional status and kind filters."""
    normalized_kind = "term_loan" if kind == "loan" else kind
    service = FinanceService(db)
    return await service.list_obligations(current_user.id, status=status, kind=normalized_kind)


@router.post("/obligations", response_model=ObligationOut, status_code=status.HTTP_201_CREATED)
async def create_obligation(
    body: ObligationIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ObligationOut:
    """Create a new debt obligation with child scheduled payments."""
    service = FinanceService(db)
    try:
        obligation = await service.create_obligation(current_user.id, body)
        await db.commit()
        return obligation
    except Exception as exc:
        await db.rollback()
        raise exc


@router.get("/obligations/{obligation_id}", response_model=ObligationOut)
async def get_obligation(
    obligation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ObligationOut:
    """Retrieve a specific obligation and its repayment schedule."""
    service = FinanceService(db)
    obligation = await service.get_obligation(current_user.id, obligation_id)
    if obligation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Obligation {obligation_id} not found",
        )
    return obligation


@router.patch("/obligations/{obligation_id}", response_model=ObligationOut)
@router.put("/obligations/{obligation_id}", response_model=ObligationOut)
async def update_obligation(
    obligation_id: uuid.UUID,
    body: ObligationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ObligationOut:
    """
    Update an obligation with optimistic concurrency validation.
    Enforces body.expected_version check against current obligation version.
    """
    service = FinanceService(db)
    try:
        obligation = await service.update_obligation(current_user.id, obligation_id, body)
        if obligation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Obligation {obligation_id} not found",
            )
        await db.commit()
        return obligation
    except StaleVersionError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.delete("/obligations/{obligation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_obligation(
    obligation_id: uuid.UUID,
    expected_version: int = Query(..., ge=1, description="Mandatory expected obligation version for concurrency"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """
    Delete an obligation and cascade delete its payments.
    Mandatory expected_version check prevents concurrent data loss.
    """
    service = FinanceService(db)
    try:
        success = await service.delete_obligation(
            current_user.id, obligation_id, expected_version=expected_version
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Obligation {obligation_id} not found",
            )
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except StaleVersionError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


# ---------------------------------------------------------------------------
# Payments Endpoints
# ---------------------------------------------------------------------------

@router.get("/obligations/{obligation_id}/payments", response_model=list[ObligationPaymentOut])
async def list_obligation_payments(
    obligation_id: uuid.UUID,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    payment_status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ObligationPaymentOut]:
    """List payment records for a specific obligation belonging to the user."""
    service = FinanceService(db)
    # Verify obligation exists and belongs to authenticated user
    ob = await service.get_obligation(current_user.id, obligation_id)
    if ob is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Obligation {obligation_id} not found",
        )
    return await service.list_payments(
        current_user.id,
        obligation_id=obligation_id,
        from_date=from_date,
        to_date=to_date,
        payment_status=payment_status,
    )


@router.post(
    "/obligations/{obligation_id}/payments",
    response_model=ObligationPaymentOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_obligation_payment(
    obligation_id: uuid.UUID,
    body: ObligationPaymentIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ObligationPaymentOut:
    """Create a single scheduled or paid obligation payment."""
    service = FinanceService(db)
    try:
        payment = await service.create_payment(current_user.id, obligation_id, body)
        await db.commit()
        return payment
    except RecordNotFoundError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Obligation {obligation_id} not found",
        ) from exc
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc


@router.patch("/obligations/{obligation_id}/payments/{payment_id}", response_model=ObligationPaymentOut)
@router.patch("/payments/{payment_id}", response_model=ObligationPaymentOut)
async def update_payment_status(
    payment_id: uuid.UUID,
    body: PaymentStatusUpdate,
    obligation_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ObligationPaymentOut:
    """Update an obligation payment's status or paid date."""
    service = FinanceService(db)
    # Verify payment exists and belongs to authenticated owner
    existing_payment = await service.get_payment(current_user.id, payment_id)
    if existing_payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment {payment_id} not found",
        )

    # If route is under /obligations/{obligation_id}/payments/{payment_id}, verify obligation matches
    if obligation_id is not None and existing_payment.obligation_id != obligation_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment {payment_id} not found",
        )

    try:
        payment = await service.update_payment_status(
            current_user.id,
            payment_id,
            payment_status=body.payment_status,
            actual_paid_date=body.actual_paid_date,
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment {payment_id} not found",
        )
    await db.commit()
    return payment
