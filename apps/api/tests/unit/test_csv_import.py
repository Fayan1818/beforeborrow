"""
Unit tests for CSV import adapter (Person B).
Verifies encoding, header checks, row limits, Decimal parsing,
date validation, and formula injection sanitization.
"""

from decimal import Decimal
import pytest

from app.adapters.csv_import import (
    CSVEncodingError,
    EmptyFileError,
    FileSizeLimitExceededError,
    MissingHeaderError,
    RowCountLimitExceededError,
    parse_csv_content,
    sanitize_formula_text,
)


VALID_CSV = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Provider-A,BNPL-01-2,bnpl,2026-11-15,6000,scheduled
Provider-B,CARD-NOV,card,2026-11-18,3000.50,scheduled
"""


def test_valid_utf8_csv():
    """Test 1: Valid UTF-8 CSV is parsed into normalized rows with exact integer paise."""
    result = parse_csv_content(VALID_CSV)
    assert result.total_rows == 2
    assert len(result.file_errors) == 0

    r1 = result.rows[0]
    assert r1.provider_alias == "Provider-A"
    assert r1.external_ref == "BNPL-01-2"
    assert r1.kind == "bnpl"
    assert r1.due_date.isoformat() == "2026-11-15"
    assert r1.amount_paise == 600000  # 6000 * 100
    assert r1.status == "scheduled"
    assert r1.is_valid is True

    r2 = result.rows[1]
    assert r2.amount_paise == 300050  # 3000.50 * 100
    assert r2.is_valid is True


def test_utf8_bom_handling():
    """Test 2: CSV with UTF-8 BOM is transparently decoded without header corruption."""
    bom_content = b"\xef\xbb\xbf" + VALID_CSV
    result = parse_csv_content(bom_content)
    assert result.total_rows == 2
    assert result.rows[0].provider_alias == "Provider-A"


def test_missing_headers():
    """Test 3: Missing mandatory header columns raises MissingHeaderError."""
    bad_csv = b"provider_alias,kind,due_date,amount_inr\nProvider-A,bnpl,2026-11-15,6000\n"
    with pytest.raises(MissingHeaderError) as exc_info:
        parse_csv_content(bad_csv)
    assert "Missing required CSV header columns" in str(exc_info.value)


def test_empty_files():
    """Test 4: Empty byte content raises EmptyFileError."""
    with pytest.raises(EmptyFileError):
        parse_csv_content(b"")

    with pytest.raises(EmptyFileError):
        parse_csv_content(b"   \n  \n")


def test_file_above_1_mib():
    """Test 5: File exceeding 1 MiB raises FileSizeLimitExceededError before parsing."""
    large_content = b"a" * (1024 * 1024 + 10)
    with pytest.raises(FileSizeLimitExceededError):
        parse_csv_content(large_content)


def test_more_than_1000_rows():
    """Test 6: More than 1,000 data rows raises RowCountLimitExceededError."""
    header = b"provider_alias,external_ref,kind,due_date,amount_inr,status\n"
    rows = b"".join(
        f"Provider-A,REF-{i},bnpl,2026-11-15,100,scheduled\n".encode("utf-8")
        for i in range(1001)
    )
    with pytest.raises(RowCountLimitExceededError):
        parse_csv_content(header + rows)


def test_invalid_date():
    """Test 7: Malformed dates are recorded as row-level errors without crashing."""
    csv_data = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Provider-A,REF-1,bnpl,2026-02-30,6000,scheduled
Provider-B,REF-2,bnpl,not-a-date,6000,scheduled
"""
    result = parse_csv_content(csv_data)
    assert result.total_rows == 2
    assert result.rows[0].is_valid is False
    assert any("INVALID_DATE" in err for err in result.rows[0].errors)
    assert result.rows[1].is_valid is False
    assert any("INVALID_DATE" in err for err in result.rows[1].errors)


def test_negative_and_malformed_amounts():
    """Test 8: Negative, NaN, Infinite, and malformed amounts are rejected."""
    csv_data = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
P1,R1,bnpl,2026-11-15,-500,scheduled
P2,R2,bnpl,2026-11-15,NaN,scheduled
P3,R3,bnpl,2026-11-15,Infinity,scheduled
P4,R4,bnpl,2026-11-15,not_a_number,scheduled
"""
    result = parse_csv_content(csv_data)
    assert result.total_rows == 4
    for r in result.rows:
        assert r.is_valid is False
        assert any("AMOUNT" in err for err in r.errors)


def test_excess_decimal_precision():
    """Test 9: Amounts with more than 2 decimal places are rejected."""
    csv_data = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Provider-A,REF-1,bnpl,2026-11-15,6000.555,scheduled
Provider-B,REF-2,bnpl,2026-11-15,6000.50,scheduled
"""
    result = parse_csv_content(csv_data)
    assert result.total_rows == 2
    assert result.rows[0].is_valid is False
    assert any("EXCESS_PRECISION" in err for err in result.rows[0].errors)
    assert result.rows[1].is_valid is True
    assert result.rows[1].amount_paise == 600050


def test_formula_injection_sanitization():
    """Test formula injection prefix characters are sanitized for presentation."""
    assert sanitize_formula_text("=SUM(A1:A10)") == "'=SUM(A1:A10)"
    assert sanitize_formula_text("+12345") == "'+12345"
    assert sanitize_formula_text("-100") == "'-100"
    assert sanitize_formula_text("@EVIL") == "'@EVIL"
    assert sanitize_formula_text("\tTABBED") == "'\tTABBED"
    assert sanitize_formula_text("\rRETURN") == "'\rRETURN"
    assert sanitize_formula_text("Normal Text") == "Normal Text"


def test_formula_injection_preserves_raw_identifiers_for_matching():
    """
    Formulas are escaped for presentation in display_provider_alias and display_external_ref,
    but raw identifiers in provider_alias and dedupe_key remain uncorrupted for matching.
    """
    csv_data = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
=cmd|'/C calc'!A0,+REF-101,bnpl,2026-11-15,1000,scheduled
"""
    result = parse_csv_content(csv_data)
    row = result.rows[0]
    assert row.is_valid is True
    # Raw values preserved for matching
    assert row.provider_alias == "=cmd|'/C calc'!A0"
    assert row.external_ref == "+REF-101"
    assert row.dedupe_key == ("=cmd|'/c calc'!a0", "+ref-101", "2026-11-15")
    # Sanitized presentation fields
    assert row.display_provider_alias == "'=cmd|'/C calc'!A0"
    assert row.display_external_ref == "'+REF-101"


def test_planned_and_disputed_statuses():
    """Verify planned, scheduled, paid, late, cancelled, and disputed statuses are valid."""
    csv_data = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
P1,R1,bnpl,2026-11-15,100,planned
P2,R2,card,2026-11-16,200,disputed
P3,R3,term_loan,2026-11-17,300,cancelled
P4,R4,other,2026-11-18,400,late
"""
    result = parse_csv_content(csv_data)
    assert result.total_rows == 4
    for r in result.rows:
        assert r.is_valid is True
