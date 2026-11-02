"""
BeforeBorrow - CSV Import Adapter (Person B)
Pure data-processing adapter for financial CSV file parsing, normalization,
and strict validation.

Independent of SQLAlchemy and HTTP.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
import hashlib
import io
import re

# File and volume limits
MAX_FILE_BYTES = 1024 * 1024  # 1 MiB
MAX_ROW_COUNT = 1000

REQUIRED_HEADERS = {
    "provider_alias",
    "external_ref",
    "kind",
    "due_date",
    "amount_inr",
    "status",
}

VALID_KINDS = {"bnpl", "term_loan", "card", "other"}
VALID_STATUSES = {"planned", "scheduled", "paid", "missed", "cancelled", "disputed", "late"}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class CSVImportError(Exception):
    """Base exception for CSV import processing."""
    pass


class FileSizeLimitExceededError(CSVImportError):
    """Uploaded file exceeds maximum byte size."""
    pass


class RowCountLimitExceededError(CSVImportError):
    """File contains more than the maximum permitted rows."""
    pass


class EmptyFileError(CSVImportError):
    """Uploaded file is empty."""
    pass


class CSVEncodingError(CSVImportError):
    """Uploaded file is not valid UTF-8 / UTF-8 BOM text."""
    pass


class MissingHeaderError(CSVImportError):
    """Required CSV header columns are missing."""
    pass


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class RowValidationError:
    row_index: int
    field: str
    code: str
    message: str


@dataclass
class ParsedCSVRow:
    row_id: str
    row_index: int
    raw_data: dict[str, str]
    provider_alias: str
    external_ref: str
    kind: str
    due_date: date | None
    amount_paise: int | None
    amount_inr_raw: str
    status: str
    errors: list[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0

    @property
    def dedupe_key(self) -> tuple[str, str, str]:
        """provider_alias + external_ref + due_date identity for internal duplicate detection."""
        return (
            self.provider_alias.strip().lower(),
            self.external_ref.strip().lower(),
            self.due_date.isoformat() if self.due_date else "",
        )

    @property
    def display_provider_alias(self) -> str:
        """Sanitized string safe for UI display or spreadsheet export."""
        return sanitize_formula_text(self.provider_alias)

    @property
    def display_external_ref(self) -> str:
        """Sanitized string safe for UI display or spreadsheet export."""
        return sanitize_formula_text(self.external_ref)


@dataclass
class AdapterParseResult:
    file_hash: str
    rows: list[ParsedCSVRow]
    total_rows: int
    file_errors: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Compatibility classes for existing stubs
# ---------------------------------------------------------------------------

@dataclass
class PreviewRow:
    row_index: int
    data: dict
    errors: list[str] = field(default_factory=list)
    is_duplicate: bool = False


@dataclass
class PreviewResult:
    file_hash: str
    rows: list[PreviewRow]
    total_errors: int


# ---------------------------------------------------------------------------
# Security & Sanitization
# ---------------------------------------------------------------------------

FORMULA_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def sanitize_formula_text(val: str) -> str:
    """
    Guards against spreadsheet formula injection in untrusted CSV content.
    If a string starts with a formula trigger character, prepends a single quote
    for safe presentation while preserving the underlying text.
    """
    if val and val.startswith(FORMULA_INJECTION_PREFIXES):
        return f"'{val}"
    return val


# ---------------------------------------------------------------------------
# Parser & Validator Implementation
# ---------------------------------------------------------------------------

def parse_csv_content(content: bytes) -> AdapterParseResult:
    """
    Pure data-processing parser for BeforeBorrow obligation repayment CSVs.

    Validates:
    - File size <= 1 MiB
    - UTF-8 or UTF-8 BOM encoding
    - Required headers present
    - Row count <= 1,000
    - Row-level dates, decimal monetary amounts, kinds, and statuses
    """
    # 1. File size limit
    if len(content) > MAX_FILE_BYTES:
        raise FileSizeLimitExceededError(
            f"File size ({len(content)} bytes) exceeds the maximum allowed limit of 1 MiB ({MAX_FILE_BYTES} bytes)"
        )

    # 2. Empty check
    if not content or len(content.strip()) == 0:
        raise EmptyFileError("CSV file is empty")

    # 3. SHA-256 hash computation
    file_hash = hashlib.sha256(content).hexdigest()

    # 4. Encoding handling (UTF-8 or UTF-8 BOM)
    try:
        decoded_text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CSVEncodingError(f"CSV file must be valid UTF-8 text: {exc}") from exc

    # Check for empty decoded string
    if not decoded_text.strip():
        raise EmptyFileError("CSV file contains no text content")

    # 5. CSV Reader setup
    stream = io.StringIO(decoded_text)
    reader = csv.reader(stream)

    try:
        header_row = next(reader, None)
    except Exception as exc:
        raise CSVImportError(f"Failed to read CSV header: {exc}") from exc

    if not header_row:
        raise EmptyFileError("CSV file has no header row")

    # Normalize header names (lowercase, stripped)
    headers = [h.strip().lower() for h in header_row]
    missing = REQUIRED_HEADERS - set(headers)
    if missing:
        raise MissingHeaderError(
            f"Missing required CSV header columns: {sorted(list(missing))}"
        )

    header_index_map = {name: idx for idx, name in enumerate(headers)}

    # 6. Read and validate data rows
    parsed_rows: list[ParsedCSVRow] = []
    row_index = 0

    for raw_cells in reader:
        # Skip purely blank lines
        if not raw_cells or not any(cell.strip() for cell in raw_cells):
            continue

        row_index += 1
        if row_index > MAX_ROW_COUNT:
            raise RowCountLimitExceededError(
                f"CSV row count exceeds the maximum limit of {MAX_ROW_COUNT} data rows"
            )

        row_errors: list[str] = []

        def get_val(col_name: str) -> str:
            idx = header_index_map.get(col_name)
            if idx is not None and idx < len(raw_cells):
                return raw_cells[idx].strip()
            return ""

        raw_provider = get_val("provider_alias")
        raw_ref = get_val("external_ref")
        raw_kind = get_val("kind")
        raw_due_date = get_val("due_date")
        raw_amount = get_val("amount_inr")
        raw_status = get_val("status")

        raw_dict = {
            "provider_alias": raw_provider,
            "external_ref": raw_ref,
            "kind": raw_kind,
            "due_date": raw_due_date,
            "amount_inr": raw_amount,
            "status": raw_status,
        }

        # A. provider_alias validation
        if not raw_provider:
            row_errors.append("MISSING_FIELD: provider_alias is required")

        # B. kind validation
        normalized_kind = raw_kind.lower()
        if not normalized_kind:
            row_errors.append("MISSING_FIELD: kind is required")
        elif normalized_kind not in VALID_KINDS:
            row_errors.append(
                f"UNSUPPORTED_KIND: '{raw_kind}' is invalid. Allowed: {sorted(list(VALID_KINDS))}"
            )

        # C. status validation
        normalized_status = raw_status.lower()
        if not normalized_status:
            row_errors.append("MISSING_FIELD: status is required")
        elif normalized_status not in VALID_STATUSES:
            row_errors.append(
                f"INVALID_STATUS: '{raw_status}' is invalid. Allowed: {sorted(list(VALID_STATUSES))}"
            )
        elif normalized_status == "late":
            normalized_status = "missed"

        # D. due_date validation (YYYY-MM-DD)
        parsed_date: date | None = None
        if not raw_due_date:
            row_errors.append("MISSING_FIELD: due_date is required")
        else:
            try:
                # Require strictly YYYY-MM-DD format
                if len(raw_due_date) != 10 or raw_due_date[4] != "-" or raw_due_date[7] != "-":
                    raise ValueError("Date format must be YYYY-MM-DD")
                parsed_date = date.fromisoformat(raw_due_date)
            except Exception:
                row_errors.append(f"INVALID_DATE: '{raw_due_date}' is not a valid date in YYYY-MM-DD format")

        # E. amount_inr validation using Decimal (converted to integer paise)
        parsed_paise: int | None = None
        if not raw_amount:
            row_errors.append("MISSING_FIELD: amount_inr is required")
        else:
            try:
                dec = Decimal(raw_amount)
                if dec.is_nan() or dec.is_infinite():
                    row_errors.append(f"INVALID_AMOUNT: '{raw_amount}' is not a finite numeric amount")
                elif dec < 0:
                    row_errors.append(f"NEGATIVE_AMOUNT: Amount '{raw_amount}' cannot be negative")
                elif dec.as_tuple().exponent < -2:
                    row_errors.append(
                        f"EXCESS_PRECISION: Amount '{raw_amount}' exceeds 2 decimal places"
                    )
                else:
                    # Exact paise conversion
                    parsed_paise = int(dec * 100)
            except InvalidOperation:
                row_errors.append(f"INVALID_AMOUNT: '{raw_amount}' cannot be parsed as a decimal currency value")

        row_id = f"row_{row_index}"

        parsed_rows.append(
            ParsedCSVRow(
                row_id=row_id,
                row_index=row_index,
                raw_data=raw_dict,
                provider_alias=raw_provider,
                external_ref=raw_ref,
                kind=normalized_kind,
                due_date=parsed_date,
                amount_paise=parsed_paise,
                amount_inr_raw=raw_amount,
                status=normalized_status,
                errors=row_errors,
            )
        )

    return AdapterParseResult(
        file_hash=file_hash,
        rows=parsed_rows,
        total_rows=len(parsed_rows),
    )


# ---------------------------------------------------------------------------
# Backward Compatibility Wrappers
# ---------------------------------------------------------------------------

def parse_csv(content: bytes) -> PreviewResult:
    """Compatibility interface for legacy tests or stubs."""
    result = parse_csv_content(content)
    preview_rows = [
        PreviewRow(
            row_index=r.row_index,
            data=r.raw_data,
            errors=r.errors,
            is_duplicate=False,
        )
        for r in result.rows
    ]
    total_errors = sum(len(r.errors) for r in result.rows)
    return PreviewResult(
        file_hash=result.file_hash,
        rows=preview_rows,
        total_errors=total_errors,
    )


def commit_rows(selected_rows: list[PreviewRow]) -> list[str]:
    """Compatibility interface."""
    return [str(r.row_index) for r in selected_rows if not r.errors]
