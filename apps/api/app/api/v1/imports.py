import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.csv_import import (
    CSVEncodingError,
    CSVImportError,
    EmptyFileError,
    FileSizeLimitExceededError,
    MissingHeaderError,
    RowCountLimitExceededError,
)
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.identity import User
from app.repositories.finance import (
    CrossOwnerReferenceError,
    RecordNotFoundError,
)
from app.schemas.finance import (
    ImportBatchOut,
    ImportCommitRequest,
    ImportCommitResult,
    ImportPreviewResult,
)
from app.services.finance_service import FinanceService
from app.services.import_service import (
    ImportCommitConflictError,
    ImportService,
    ImportValidationError,
    UnmatchedObligationError,
)

router = APIRouter()

MAX_UPLOAD_BYTES = 1024 * 1024  # 1 MiB


@router.get("", response_model=list[ImportBatchOut])
async def list_import_batches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ImportBatchOut]:
    """List recent import batches for the authenticated user."""
    service = FinanceService(db)
    return await service.list_import_batches(current_user.id)


@router.post("/preview", response_model=ImportPreviewResult, status_code=status.HTTP_200_OK)
async def preview_import(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImportPreviewResult:
    """
    Upload and preview a financial CSV statement.
    Validates formatting, detects file-level and database duplicates,
    flags unmatched obligations, and persists a pending ImportBatch.
    Never persists financial payment records during preview.
    """
    # 1. Enforce file size limit up to 1 MiB
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Uploaded file ({len(content)} bytes) exceeds the maximum limit of 1 MiB",
        )

    service = ImportService(db)
    try:
        result = await service.preview_import(
            owner_id=current_user.id,
            file_bytes=content,
            filename=file.filename or "upload.csv",
        )
        await db.commit()
        return result
    except FileSizeLimitExceededError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=413,
            detail=str(exc),
        ) from exc
    except (CSVEncodingError, MissingHeaderError, RowCountLimitExceededError, EmptyFileError, CSVImportError) as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        await db.rollback()
        raise exc


@router.post("/{batch_id}/commit", response_model=ImportCommitResult)
@router.post("/commit", response_model=ImportCommitResult)
async def commit_import(
    body: ImportCommitRequest,
    batch_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImportCommitResult:
    """
    Transactionally commit selected valid rows from a staged ImportBatch.
    Enforces idempotency, fingerprint matching, concurrency locking,
    obligation mapping compatibility, and atomic version incrementing.
    """
    if batch_id is not None:
        body.batch_id = batch_id

    service = ImportService(db)
    try:
        result = await service.commit_import(current_user.id, body)
        await db.commit()
        return result
    except RecordNotFoundError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except CrossOwnerReferenceError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Obligation not found",
        ) from exc
    except ImportCommitConflictError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except UnmatchedObligationError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc
    except ImportValidationError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        await db.rollback()
        raise exc
