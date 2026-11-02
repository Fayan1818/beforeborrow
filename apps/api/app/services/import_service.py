"""
BeforeBorrow - Import Service (Person B)
Coordinates CSV preview, data validation, duplicate detection, unmatched obligation
resolution, and idempotent transactional commit.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
import hashlib
import json
from typing import Any, Sequence
import uuid

from sqlalchemy.exc import IntegrityError

from app.adapters.csv_import import (
    CSVEncodingError,
    CSVImportError,
    EmptyFileError,
    FileSizeLimitExceededError,
    MissingHeaderError,
    RowCountLimitExceededError,
    parse_csv_content,
    sanitize_formula_text,
)
from app.models.finance import ImportBatch, Obligation
from app.repositories.finance import (
    CrossOwnerReferenceError,
    FinanceRepository,
    RecordNotFoundError,
)
from app.schemas.finance import (
    CSVRowPreview,
    ImportCommitRequest,
    ImportCommitResult,
    ImportPreviewResult,
)


# ---------------------------------------------------------------------------
# Service Exceptions
# ---------------------------------------------------------------------------

class ImportServiceError(Exception):
    """Base exception for import service operations."""
    pass


class ImportCommitConflictError(ImportServiceError):
    """Import batch commit concurrency or idempotency conflict."""
    pass


class UnmatchedObligationError(ImportServiceError):
    """Import row lacks an obligation mapping and cannot be committed."""
    pass


class ImportValidationError(ImportServiceError):
    """Row or batch level validation error during commit."""
    pass


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def compute_commit_fingerprint(
    batch_id: uuid.UUID,
    selected_row_ids: Sequence[str],
    obligation_mappings: dict[str, uuid.UUID],
) -> str:
    """
    Compute a deterministic SHA-256 fingerprint of the commit request payload.
    Ensures that replaying an idempotency key with different rows or mappings
    is rejected rather than silently returning the previous batch result.
    """
    payload = {
        "batch_id": str(batch_id),
        "selected_row_ids": sorted(list(selected_row_ids)),
        "obligation_mappings": sorted(
            [(str(k), str(v)) for k, v in obligation_mappings.items()]
        ),
    }
    encoded = json.dumps(payload, sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


# ---------------------------------------------------------------------------
# Import Service Class
# ---------------------------------------------------------------------------

class ImportService:
    """
    Service managing financial CSV imports:
    1. preview_import(): Parses CSV, validates rows, detects duplicates, persists pending batch.
    2. commit_import(): Transactionally creates payments, enforces idempotency, increments version.
    """

    def __init__(self, session_or_repo: Any) -> None:
        if isinstance(session_or_repo, FinanceRepository):
            self.repo = session_or_repo
        else:
            self.repo = FinanceRepository(session_or_repo)

    # -----------------------------------------------------------------------
    # Preview Import Pipeline
    # -----------------------------------------------------------------------

    async def preview_import(
        self,
        owner_id: uuid.UUID,
        file_bytes: bytes,
        filename: str = "upload.csv",
        source_metadata: dict | None = None,
    ) -> ImportPreviewResult:
        """
        Preview and validate an uploaded CSV file without creating financial records.
        Detects internal duplicates and matches against existing database obligations/payments.
        Persists a pending ImportBatch.
        """
        # 1. Parse and validate file via pure adapter
        parsed_result = parse_csv_content(file_bytes)

        # 2. Query existing owner obligations and payments for database matching
        existing_obligations = await self.repo.list_obligations(owner_id)

        # Build index of existing obligations by (provider_alias.lower(), source_ref.lower())
        ob_by_ref: dict[tuple[str, str], Obligation] = {}
        # Also index existing obligations by provider_alias.lower()
        ob_by_provider: dict[str, list[Obligation]] = {}
        # Index existing payments by (obligation_id, due_date)
        existing_payment_keys: set[tuple[uuid.UUID, date]] = set()
        # Index existing payments for fuzzy matching: (provider_alias.lower(), kind.lower(), due_date, amount_paise)
        existing_fuzzy_payments: dict[tuple[str, str, date, int], uuid.UUID] = {}

        for ob in existing_obligations:
            provider_norm = ob.provider_alias.strip().lower()
            ref_norm = (ob.source_ref or "").strip().lower()
            if ref_norm:
                ob_by_ref[(provider_norm, ref_norm)] = ob
            ob_by_provider.setdefault(provider_norm, []).append(ob)

            for p in getattr(ob, "payments", []):
                existing_payment_keys.add((ob.id, p.due_date))
                existing_fuzzy_payments[(provider_norm, ob.kind.strip().lower(), p.due_date, p.amount_paise)] = p.id

        # 3. Track internal file duplicates:
        # A. Exact duplicates with external_ref: (provider_alias.lower(), external_ref.lower(), due_date)
        seen_internal_exact: dict[tuple[str, str, str], str] = {}
        # B. Possible duplicate rows with blank external_ref: (provider_alias.lower(), kind.lower(), due_date, amount_paise)
        seen_internal_blank: dict[tuple[str, str, str, int], str] = {}

        row_previews: list[CSVRowPreview] = []
        exact_dupe_count = 0
        possible_dupe_count = 0
        unmatched_count = 0
        valid_rows_count = 0
        invalid_rows_count = 0

        for r in parsed_result.rows:
            warnings: list[str] = []
            match_status: str = "MATCHED"
            matched_ob_id: str | None = None
            duplicate_reason: str | None = None

            if not r.is_valid:
                invalid_rows_count += 1
                match_status = "INVALID"
            else:
                valid_rows_count += 1
                due_d_str = r.due_date.isoformat() if r.due_date else ""
                prov_key = r.provider_alias.strip().lower()
                ref_key = r.external_ref.strip().lower()
                kind_key = r.kind.strip().lower()
                amt_key = r.amount_paise or 0

                # Check internal duplicate within uploaded file
                if ref_key:
                    internal_exact_key = (prov_key, ref_key, due_d_str)
                    if internal_exact_key in seen_internal_exact:
                        exact_dupe_count += 1
                        match_status = "EXACT_DUPLICATE_FILE"
                        duplicate_reason = (
                            f"Duplicate of row {seen_internal_exact[internal_exact_key]} in uploaded file"
                        )
                        warnings.append(duplicate_reason)
                    else:
                        seen_internal_exact[internal_exact_key] = r.row_id
                else:
                    # Blank external_ref: check if same provider, kind, date AND amount already appeared in this file
                    internal_blank_key = (prov_key, kind_key, due_d_str, amt_key)
                    if internal_blank_key in seen_internal_blank:
                        possible_dupe_count += 1
                        match_status = "POSSIBLE_DUPLICATE_FILE"
                        duplicate_reason = (
                            f"Possible duplicate of row {seen_internal_blank[internal_blank_key]} in uploaded file "
                            f"(matching provider '{r.provider_alias}', kind '{r.kind}', date {due_d_str}, amount ₹{amt_key/100:.2f} with blank ref). "
                            "Review required."
                        )
                        warnings.append(duplicate_reason)
                    else:
                        seen_internal_blank[internal_blank_key] = r.row_id

                # If not internal duplicate, match against database records
                if match_status not in ("EXACT_DUPLICATE_FILE", "POSSIBLE_DUPLICATE_FILE"):
                    # Exact obligation match by (provider_alias, external_ref)
                    matched_ob = ob_by_ref.get((prov_key, ref_key)) if ref_key else None

                    if matched_ob:
                        matched_ob_id = str(matched_ob.id)
                        # Check if exact payment already exists in database
                        if r.due_date and (matched_ob.id, r.due_date) in existing_payment_keys:
                            exact_dupe_count += 1
                            match_status = "EXACT_DUPLICATE_DB"
                            duplicate_reason = (
                                f"Exact duplicate: Payment due {r.due_date} already exists for "
                                f"obligation '{matched_ob.provider_alias}'"
                            )
                            warnings.append(duplicate_reason)
                        else:
                            match_status = "MATCHED"
                    else:
                        # No exact obligation match
                        # Check for fuzzy duplicate when external_ref is absent
                        fuzzy_key = (prov_key, kind_key, r.due_date, amt_key)
                        if not ref_key and fuzzy_key in existing_fuzzy_payments:
                            possible_dupe_count += 1
                            match_status = "POSSIBLE_DUPLICATE_DB"
                            conflicting_id = existing_fuzzy_payments[fuzzy_key]
                            duplicate_reason = (
                                f"Possible match with existing payment {conflicting_id} "
                                f"({r.provider_alias}, {r.due_date}, ₹{amt_key/100:.2f}). "
                                "Review required before importing."
                            )
                            warnings.append(duplicate_reason)
                        else:
                            unmatched_count += 1
                            match_status = "UNMATCHED_OBLIGATION"
                            warnings.append(
                                f"Unmatched obligation: No existing obligation found for '{r.provider_alias}'"
                                + (f" (ref: '{r.external_ref}')" if ref_key else "")
                                + ". Manual mapping required before commit."
                            )

            row_previews.append(
                CSVRowPreview(
                    row_id=r.row_id,
                    row_index=r.row_index,
                    provider_alias=r.provider_alias,
                    external_ref=r.external_ref,
                    kind=r.kind,
                    due_date=r.due_date,
                    amount_paise=r.amount_paise,
                    amount_inr_raw=r.amount_inr_raw,
                    status=r.status,
                    is_valid=r.is_valid,
                    match_status=match_status,
                    matched_obligation_id=matched_ob_id,
                    duplicate_reason=duplicate_reason,
                    display_provider_alias=r.display_provider_alias,
                    display_external_ref=r.display_external_ref,
                    errors=r.errors,
                    warnings=warnings,
                )
            )

        # 4. Serialize preview and error details for pending batch persistence
        preview_payload = {
            "total_rows": parsed_result.total_rows,
            "valid_rows_count": valid_rows_count,
            "invalid_rows_count": invalid_rows_count,
            "exact_duplicates_count": exact_dupe_count,
            "possible_duplicates_count": possible_dupe_count,
            "unmatched_count": unmatched_count,
            "rows": [p.model_dump(mode="json") for p in row_previews],
        }

        errors_payload = {
            "file_errors": parsed_result.file_errors,
            "row_errors": [
                {"row_id": p.row_id, "row_index": p.row_index, "errors": p.errors}
                for p in row_previews
                if not p.is_valid
            ],
        }

        # 5. Persist pending ImportBatch in database
        batch = await self.repo.create_import_batch(
            owner_id=owner_id,
            file_hash=parsed_result.file_hash,
            preview_json=preview_payload,
            errors_json=errors_payload,
        )

        return ImportPreviewResult(
            import_batch_id=batch.id,
            file_hash=parsed_result.file_hash,
            total_rows=parsed_result.total_rows,
            valid_rows_count=valid_rows_count,
            invalid_rows_count=invalid_rows_count,
            exact_duplicates_count=exact_dupe_count,
            possible_duplicates_count=possible_dupe_count,
            unmatched_count=unmatched_count,
            rows=row_previews,
            file_errors=parsed_result.file_errors,
        )

    # -----------------------------------------------------------------------
    # Commit Import Pipeline
    # -----------------------------------------------------------------------

    async def commit_import(
        self,
        owner_id: uuid.UUID,
        request: ImportCommitRequest,
    ) -> ImportCommitResult:
        """
        Transactionally commit selected rows from an import batch.
        Enforces:
        - Idempotent replay: Repeated commit with same idempotency key returns original IDs.
        - Request fingerprinting: Reject key reuse if rows or mappings changed.
        - Concurrency protection: Row-locking and atomic conditional status transition.
        - Unmatched obligation resolution: Explicit obligation mapping required.
        - Obligation compatibility: Validates owner, provider, and obligation kind compatibility.
        - Single transaction: Creates obligation payments and increments profile data_version.
        """
        current_fingerprint = compute_commit_fingerprint(
            request.batch_id, request.selected_row_ids, request.obligation_mappings
        )

        # 1. Check idempotency: If this key was already used by this owner, return original result
        idempotent_batch = await self.repo.get_import_batch_by_idempotency(
            owner_id, request.idempotency_key
        )
        if idempotent_batch is not None:
            if idempotent_batch.id != request.batch_id:
                raise ImportCommitConflictError(
                    f"Idempotency key '{request.idempotency_key}' was already used for a different batch"
                )
            res_json = idempotent_batch.result_json or {}
            stored_fingerprint = res_json.get("request_fingerprint")
            if stored_fingerprint and stored_fingerprint != current_fingerprint:
                raise ImportCommitConflictError(
                    f"Idempotency key '{request.idempotency_key}' was previously used with different "
                    "commit parameters (selected rows or obligation mappings)"
                )
            # Idempotent replay
            payment_ids = [uuid.UUID(pid) for pid in res_json.get("committed_payment_ids", [])]
            return ImportCommitResult(
                batch_id=idempotent_batch.id,
                status=idempotent_batch.status,
                idempotent_replay=True,
                committed_count=res_json.get("committed_count", len(payment_ids)),
                committed_payment_ids=payment_ids,
                data_version=res_json.get("data_version", 1),
            )

        # 2. Fetch target batch with row locking (FOR UPDATE)
        batch = await self.repo.get_import_batch(owner_id, request.batch_id, for_update=True)
        if batch is None:
            raise RecordNotFoundError(f"Import batch {request.batch_id} not found")

        # 3. Concurrency check: Batch must be pending
        if batch.status == "committed":
            raise ImportCommitConflictError(
                f"Import batch {request.batch_id} has already been committed"
            )
        if batch.status != "pending":
            raise ImportCommitConflictError(
                f"Import batch {request.batch_id} has status '{batch.status}', cannot commit"
            )

        # 4. Extract rows from stored preview
        preview_data = batch.preview_json or {}
        raw_rows: list[dict] = preview_data.get("rows", [])
        rows_by_id = {r["row_id"]: r for r in raw_rows}

        if not request.selected_row_ids:
            raise ImportValidationError("No rows selected for commit")

        # 5. Validate every selected row before writing to database
        selected_rows: list[dict] = []
        row_obligation_targets: dict[str, uuid.UUID] = {}

        for row_id in request.selected_row_ids:
            row = rows_by_id.get(row_id)
            if not row:
                raise ImportValidationError(f"Selected row '{row_id}' not found in import batch")

            if not row.get("is_valid", False):
                raise ImportValidationError(
                    f"Row '{row_id}' has validation errors and cannot be committed"
                )

            match_status = row.get("match_status", "")
            if match_status in ("EXACT_DUPLICATE_FILE", "EXACT_DUPLICATE_DB"):
                raise ImportValidationError(
                    f"Row '{row_id}' is a duplicate and cannot be committed"
                )

            # Determine target obligation
            matched_ob_id = row.get("matched_obligation_id")
            if matched_ob_id:
                target_ob_id = uuid.UUID(matched_ob_id)
            else:
                # Unmatched obligation or possible duplicate requires explicit mapping
                mapped_id = request.obligation_mappings.get(row_id)
                if not mapped_id:
                    raise UnmatchedObligationError(
                        f"Row '{row_id}' ({row['provider_alias']}) has no matched obligation. "
                        "An explicit obligation mapping is required."
                    )
                # Verify mapped obligation belongs to authenticated user
                mapped_ob = await self.repo.get_obligation(owner_id, mapped_id)
                if mapped_ob is None:
                    raise CrossOwnerReferenceError(
                        f"Mapped obligation {mapped_id} does not exist or does not belong to owner"
                    )

                # Validate provider and obligation type compatibility
                row_kind = row.get("kind", "").strip().lower()
                ob_kind = mapped_ob.kind.strip().lower()
                if row_kind != ob_kind and row_kind != "other" and ob_kind != "other":
                    raise ImportValidationError(
                        f"Incompatible obligation type: Row '{row_id}' has kind '{row.get('kind')}', "
                        f"but mapped obligation {mapped_id} has kind '{mapped_ob.kind}'"
                    )

                row_prov = row.get("provider_alias", "").strip().lower()
                ob_prov = mapped_ob.provider_alias.strip().lower()
                generic_provider_terms = {"generic", "manual", "unknown", "other", "loan", "card", "debt", "personal"}
                is_row_generic = any(term in row_prov for term in generic_provider_terms)
                is_ob_generic = any(term in ob_prov for term in generic_provider_terms)

                if (
                    row_prov != ob_prov
                    and row_prov not in ob_prov
                    and ob_prov not in row_prov
                    and not (is_row_generic or is_ob_generic)
                ):
                    raise ImportValidationError(
                        f"Incompatible provider: Row '{row_id}' has provider '{row.get('provider_alias')}', "
                        f"which does not match mapped obligation provider '{mapped_ob.provider_alias}'"
                    )

                target_ob_id = mapped_id

            row_obligation_targets[row_id] = target_ob_id
            selected_rows.append(row)

        # 6. Execute atomic commit: Insert payments, increment data_version, update batch status
        created_payment_ids: list[uuid.UUID] = []

        for row in selected_rows:
            row_id = row["row_id"]
            target_ob_id = row_obligation_targets[row_id]
            due_d = date.fromisoformat(row["due_date"])
            amount_paise = row["amount_paise"]
            p_status = row["status"]
            # Payment status semantics: planned and scheduled payments are not paid yet
            paid_d = due_d if p_status == "paid" else None

            payment = await self.repo.create_obligation_payment(
                owner_id=owner_id,
                obligation_id=target_ob_id,
                due_date=due_d,
                amount_paise=amount_paise,
                payment_status=p_status,
                actual_paid_date=paid_d,
            )
            created_payment_ids.append(payment.id)

        # Increment profile data_version
        new_version = await self.repo.increment_data_version(owner_id)

        # Mark batch committed with idempotency key, fingerprint, and stored payment IDs
        committed_at = datetime.now(timezone.utc)
        result_payload = {
            "request_fingerprint": current_fingerprint,
            "committed_count": len(created_payment_ids),
            "committed_payment_ids": [str(pid) for pid in created_payment_ids],
            "data_version": new_version,
            "committed_at": committed_at.isoformat(),
        }

        try:
            updated_batch = await self.repo.update_import_batch_status(
                owner_id=owner_id,
                batch_id=batch.id,
                status="committed",
                committed_at=committed_at,
                idempotency_key=request.idempotency_key,
                result_json=result_payload,
                expected_status="pending",
            )
            if updated_batch is None:
                raise ImportCommitConflictError(
                    f"Import batch {batch.id} was already committed or modified by a concurrent transaction"
                )
        except IntegrityError as exc:
            raise ImportCommitConflictError(
                f"Concurrent commit conflict on idempotency key '{request.idempotency_key}': {exc}"
            ) from exc

        return ImportCommitResult(
            batch_id=batch.id,
            status="committed",
            idempotent_replay=False,
            committed_count=len(created_payment_ids),
            committed_payment_ids=created_payment_ids,
            data_version=new_version,
        )
