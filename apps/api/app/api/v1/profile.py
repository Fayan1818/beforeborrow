import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.identity import User
from app.repositories.finance import RecordNotFoundError, StaleVersionError
from app.schemas.finance import (
    CashflowRuleIn,
    CashflowRuleOut,
    CashflowRuleUpdate,
    ProfileIn,
    ProfileOut,
    SnapshotDataQualityOut,
    SnapshotOut,
)
from app.services.finance_service import FinanceService
from app.services.snapshot_service import SnapshotService

router = APIRouter()


# ---------------------------------------------------------------------------
# Profile Endpoints
# ---------------------------------------------------------------------------

@router.get("/profile", response_model=ProfileOut)
async def get_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileOut:
    """Retrieve the authenticated user's financial profile."""
    service = FinanceService(db)
    profile = await service.get_profile(current_user.id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial profile not found",
        )
    return profile


@router.post("/profile", response_model=ProfileOut, status_code=status.HTTP_201_CREATED)
async def create_profile(
    body: ProfileIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileOut:
    """
    Create or initialize the authenticated user's financial profile.
    Supports optimistic concurrency through body.expected_version.
    """
    service = FinanceService(db)
    try:
        profile = await service.upsert_profile(current_user.id, body)
        await db.commit()
        return profile
    except StaleVersionError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.put("/profile", response_model=ProfileOut, status_code=status.HTTP_200_OK)
async def update_profile(
    body: ProfileIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileOut:
    """
    Update the authenticated user's financial profile.
    Supports optimistic concurrency through body.expected_version.
    """
    service = FinanceService(db)
    try:
        profile = await service.upsert_profile(current_user.id, body)
        await db.commit()
        return profile
    except StaleVersionError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


# ---------------------------------------------------------------------------
# Financial Snapshot Endpoint
# ---------------------------------------------------------------------------

@router.get("/snapshot", response_model=SnapshotOut)
@router.get("/profile/financial-snapshot", response_model=SnapshotOut)
async def get_financial_snapshot(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SnapshotOut:
    """
    Retrieve an immutable, normalized financial snapshot and completeness assessment
    for the authenticated user.
    Quality score is strictly omitted from the public API schema and response.
    """
    service = FinanceService(db)
    profile = await service.get_profile(current_user.id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial profile not found",
        )

    snapshot_service = SnapshotService(db)
    result = await snapshot_service.build_snapshot(current_user.id)

    quality_out = SnapshotDataQualityOut(
        is_valid=result.data_quality.is_valid,
        data_version=result.data_quality.data_version,
        blocking_gaps=list(result.data_quality.blocking_gaps),
        warnings=list(result.data_quality.warnings),
        summary=result.data_quality.summary,
    )

    return SnapshotOut(
        snapshot=result.snapshot_schema,
        data_quality=quality_out,
    )


# ---------------------------------------------------------------------------
# Cashflow Rules Endpoints
# ---------------------------------------------------------------------------

@router.get("/cashflow-rules", response_model=list[CashflowRuleOut])
@router.get("/profile/cashflow-rules", response_model=list[CashflowRuleOut], include_in_schema=False)
async def list_cashflow_rules(
    direction: str | None = Query(None, pattern="^(income|expense)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CashflowRuleOut]:
    """List cashflow rules for the authenticated user, optionally filtered by direction."""
    service = FinanceService(db)
    return await service.list_cashflow_rules(current_user.id, direction=direction)


@router.post("/cashflow-rules", response_model=CashflowRuleOut, status_code=status.HTTP_201_CREATED)
@router.post("/profile/cashflow-rules", response_model=CashflowRuleOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_cashflow_rule(
    body: CashflowRuleIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CashflowRuleOut:
    """Create a new recurring income or expense cashflow rule."""
    service = FinanceService(db)
    try:
        rule = await service.create_cashflow_rule(current_user.id, body)
        await db.commit()
        return rule
    except Exception as exc:
        await db.rollback()
        raise exc


@router.get("/cashflow-rules/{rule_id}", response_model=CashflowRuleOut)
@router.get("/profile/cashflow-rules/{rule_id}", response_model=CashflowRuleOut, include_in_schema=False)
async def get_cashflow_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CashflowRuleOut:
    """Retrieve a specific cashflow rule belonging to the authenticated user."""
    service = FinanceService(db)
    rule = await service.get_cashflow_rule(current_user.id, rule_id)
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cashflow rule {rule_id} not found",
        )
    return rule


@router.patch("/cashflow-rules/{rule_id}", response_model=CashflowRuleOut)
@router.put("/cashflow-rules/{rule_id}", response_model=CashflowRuleOut)
@router.patch("/profile/cashflow-rules/{rule_id}", response_model=CashflowRuleOut, include_in_schema=False)
@router.put("/profile/cashflow-rules/{rule_id}", response_model=CashflowRuleOut, include_in_schema=False)
async def update_cashflow_rule(
    rule_id: uuid.UUID,
    body: CashflowRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CashflowRuleOut:
    """
    Update a cashflow rule.
    Validates expected_data_version against the user's current profile data_version.
    """
    service = FinanceService(db)
    try:
        rule = await service.update_cashflow_rule(current_user.id, rule_id, body)
        if rule is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Cashflow rule {rule_id} not found",
            )
        await db.commit()
        return rule
    except StaleVersionError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.delete("/cashflow-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/profile/cashflow-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
async def delete_cashflow_rule(
    rule_id: uuid.UUID,
    expected_data_version: int = Query(..., ge=1, description="Current profile data_version required for concurrency"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:

    """
    Delete a cashflow rule.
    Requires expected_data_version matching the owner's profile data_version.
    """
    service = FinanceService(db)
    try:
        success = await service.delete_cashflow_rule(
            current_user.id, rule_id, expected_data_version=expected_data_version
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Cashflow rule {rule_id} not found",
            )
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except StaleVersionError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
