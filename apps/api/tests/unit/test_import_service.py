"""
Unit tests for ImportService (Person B).
Verifies CSV preview persistence, internal and database duplicate detection,
unmatched obligation mapping, transactional commits, and idempotency replay.
"""

from datetime import date
import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.identity import User
from app.repositories.finance import (
    CrossOwnerReferenceError,
    FinanceRepository,
    RecordNotFoundError,
)
from app.schemas.finance import (
    ImportCommitRequest,
    ObligationIn,
    ObligationPaymentIn,
    ProfileIn,
)
from app.services.import_service import (
    ImportCommitConflictError,
    ImportService,
    ImportValidationError,
    UnmatchedObligationError,
)


@pytest.fixture
def repo_session():
    """Isolated SQLite database session with enforced foreign keys."""
    engine = create_engine("sqlite:///:memory:")
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys = ON")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    Base.metadata.drop_all(engine)


@pytest.fixture
def repo(repo_session: Session) -> FinanceRepository:
    return FinanceRepository(repo_session)


@pytest.fixture
def import_svc(repo: FinanceRepository) -> ImportService:
    return ImportService(repo)


@pytest.fixture
def two_users(repo_session: Session) -> tuple[User, User]:
    u1 = User(id=uuid.uuid4(), email_normalized="user1@bb.test", password_hash="dummy")
    u2 = User(id=uuid.uuid4(), email_normalized="user2@bb.test", password_hash="dummy")
    repo_session.add_all([u1, u2])
    repo_session.commit()
    return u1, u2


def run_async(coro):
    import asyncio
    return asyncio.run(coro)


def test_internal_and_database_duplicate_detection(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test 10 & 11:
    - Internal duplicates within the uploaded file are flagged as EXACT_DUPLICATE_FILE.
    - Matches against existing database payments are flagged as EXACT_DUPLICATE_DB.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    # Create existing obligation in DB with a payment on 2026-11-15
    ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(
            provider_alias="ZestMoney",
            kind="bnpl",
            principal_remaining_paise=2400000,
            source_ref="ZEST-101",
            payments=[ObligationPaymentIn(due_date=date(2026, 11, 15), amount_paise=600000)],
        ),
    ))

    # CSV with:
    # Row 1: matches existing DB payment (ZEST-101, 2026-11-15) -> EXACT_DUPLICATE_DB
    # Row 2: new payment (ZEST-101, 2026-11-25) -> MATCHED
    # Row 3: duplicate of Row 2 in same file -> EXACT_DUPLICATE_FILE
    csv_bytes = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
ZestMoney,ZEST-101,bnpl,2026-11-15,6000,scheduled
ZestMoney,ZEST-101,bnpl,2026-11-25,6000,scheduled
ZestMoney,ZEST-101,bnpl,2026-11-25,6000,scheduled
"""
    preview = run_async(import_svc.preview_import(u1.id, csv_bytes))

    assert preview.total_rows == 3
    assert preview.exact_duplicates_count == 2

    # Row 1 -> EXACT_DUPLICATE_DB
    assert preview.rows[0].match_status == "EXACT_DUPLICATE_DB"
    assert "Exact duplicate" in preview.rows[0].duplicate_reason

    # Row 2 -> MATCHED
    assert preview.rows[1].match_status == "MATCHED"
    assert preview.rows[1].matched_obligation_id == str(ob.id)

    # Row 3 -> EXACT_DUPLICATE_FILE
    assert preview.rows[2].match_status == "EXACT_DUPLICATE_FILE"
    assert "Duplicate of row row_2" in preview.rows[2].duplicate_reason


def test_fuzzy_match_requiring_review(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test 12: When external_ref is absent, payment matching on provider, kind,
    due_date and amount is labeled as POSSIBLE_DUPLICATE_DB requiring user review.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    # Existing obligation in DB with payment on 2026-11-18 for 3000.00
    run_async(repo.create_obligation(
        u1.id,
        ObligationIn(
            provider_alias="HDFC Card",
            kind="card",
            principal_remaining_paise=300000,
            payments=[ObligationPaymentIn(due_date=date(2026, 11, 18), amount_paise=300000)],
        ),
    ))

    # CSV has row with empty external_ref matching provider, kind, date, and amount
    csv_bytes = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
HDFC Card,,card,2026-11-18,3000,scheduled
"""
    preview = run_async(import_svc.preview_import(u1.id, csv_bytes))
    assert preview.total_rows == 1
    assert preview.possible_duplicates_count == 1
    assert preview.rows[0].match_status == "POSSIBLE_DUPLICATE_DB"
    assert "Review required" in preview.rows[0].duplicate_reason


def test_unmatched_obligation_and_explicit_mapping(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test 13 & 14:
    - An unmatched obligation row blocks commit without an explicit mapping.
    - Supplying a valid obligation mapping allows successful commit.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    # Create target obligation in DB
    ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(
            provider_alias="Manual Loan",
            kind="term_loan",
            principal_remaining_paise=1000000,
            payments=[],
        ),
    ))

    # CSV has an unmatched row (provider alias not in DB)
    csv_bytes = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Unknown Lender,UNK-99,term_loan,2026-11-20,5000,scheduled
"""
    preview = run_async(import_svc.preview_import(u1.id, csv_bytes))
    assert preview.rows[0].match_status == "UNMATCHED_OBLIGATION"
    batch_id = preview.import_batch_id

    # Attempt commit without mapping -> rejected with UnmatchedObligationError
    with pytest.raises(UnmatchedObligationError):
        run_async(import_svc.commit_import(
            u1.id,
            ImportCommitRequest(
                batch_id=batch_id,
                idempotency_key="commit_attempt_1",
                selected_row_ids=["row_1"],
                obligation_mappings={},  # Missing mapping!
            ),
        ))

    # Commit with valid explicit obligation mapping -> succeeds
    res = run_async(import_svc.commit_import(
        u1.id,
        ImportCommitRequest(
            batch_id=batch_id,
            idempotency_key="commit_attempt_2",
            selected_row_ids=["row_1"],
            obligation_mappings={"row_1": ob.id},
        ),
    ))
    assert res.status == "committed"
    assert res.committed_count == 1
    assert len(res.committed_payment_ids) == 1

    # Verify payment attached to obligation
    updated_ob = run_async(repo.get_obligation(u1.id, ob.id))
    assert len(updated_ob.payments) == 1
    assert updated_ob.payments[0].amount_paise == 500000


def test_owner_isolation_in_import(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test 15:
    - User 1 cannot view or commit User 2's import batch.
    - User 1 cannot map an unmatched row to User 2's obligation.
    """
    u1, u2 = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))
    run_async(repo.upsert_profile(u2.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    # u2 creates an obligation
    ob_u2 = run_async(repo.create_obligation(
        u2.id,
        ObligationIn(provider_alias="U2 Debt", kind="term_loan", principal_remaining_paise=100000),
    ))

    # u1 uploads CSV
    csv_bytes = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Lender,REF-1,term_loan,2026-11-20,5000,scheduled
"""
    preview = run_async(import_svc.preview_import(u1.id, csv_bytes))
    batch_id = preview.import_batch_id

    # u2 attempts to commit u1's batch -> RecordNotFoundError
    with pytest.raises(RecordNotFoundError):
        run_async(import_svc.commit_import(
            u2.id,
            ImportCommitRequest(batch_id=batch_id, idempotency_key="steal_batch", selected_row_ids=["row_1"]),
        ))

    # u1 attempts to map row to u2's obligation -> CrossOwnerReferenceError
    with pytest.raises(CrossOwnerReferenceError):
        run_async(import_svc.commit_import(
            u1.id,
            ImportCommitRequest(
                batch_id=batch_id,
                idempotency_key="steal_ob",
                selected_row_ids=["row_1"],
                obligation_mappings={"row_1": ob_u2.id},
            ),
        ))


def test_selected_row_commit_and_invalid_row_exclusion(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test 16, 17, 18:
    - Preview persists pending batch in DB.
    - Only selected valid rows are committed.
    - Invalid rows cannot be committed.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))
    ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(provider_alias="Bank", kind="bnpl", principal_remaining_paise=1000000, source_ref="REF-OK"),
    ))

    # CSV has 1 valid row and 1 invalid row (bad date)
    csv_bytes = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Bank,REF-OK,bnpl,2026-11-20,1000,scheduled
Bank,REF-OK,bnpl,invalid_date,1000,scheduled
"""
    preview = run_async(import_svc.preview_import(u1.id, csv_bytes))
    batch_id = preview.import_batch_id

    # Verify batch is pending in DB
    batch_in_db = run_async(repo.get_import_batch(u1.id, batch_id))
    assert batch_in_db is not None
    assert batch_in_db.status == "pending"

    # Attempting to commit the invalid row -> ImportValidationError
    with pytest.raises(ImportValidationError):
        run_async(import_svc.commit_import(
            u1.id,
            ImportCommitRequest(batch_id=batch_id, idempotency_key="try_invalid", selected_row_ids=["row_2"]),
        ))

    # Committing valid row succeeds
    res = run_async(import_svc.commit_import(
        u1.id,
        ImportCommitRequest(batch_id=batch_id, idempotency_key="commit_row_1", selected_row_ids=["row_1"]),
    ))
    assert res.status == "committed"
    assert res.committed_count == 1


def test_idempotent_replay_and_concurrent_conflict(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test 19, 20, 21, 23:
    - Repeated commit with same key returns original IDs without duplicating payments.
    - Different key or commit on non-pending batch raises conflict.
    - Profile data_version increments exactly once.
    - Status transitions from pending to committed.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))
    ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(provider_alias="Zest", kind="bnpl", principal_remaining_paise=1000000, source_ref="Z-1"),
    ))

    p = run_async(repo.get_profile(u1.id))
    v_start = p.data_version

    csv_bytes = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Zest,Z-1,bnpl,2026-11-20,1000,scheduled
"""
    preview = run_async(import_svc.preview_import(u1.id, csv_bytes))
    batch_id = preview.import_batch_id

    # First commit
    res1 = run_async(import_svc.commit_import(
        u1.id,
        ImportCommitRequest(batch_id=batch_id, idempotency_key="idempotent_key_100", selected_row_ids=["row_1"]),
    ))
    assert res1.status == "committed"
    assert res1.idempotent_replay is False
    assert len(res1.committed_payment_ids) == 1
    assert res1.data_version == v_start + 1

    # Status in DB is committed
    batch_db = run_async(repo.get_import_batch(u1.id, batch_id))
    assert batch_db.status == "committed"
    assert batch_db.committed_at is not None

    # Repeated commit with SAME key -> returns original result without creating duplicates
    res2 = run_async(import_svc.commit_import(
        u1.id,
        ImportCommitRequest(batch_id=batch_id, idempotency_key="idempotent_key_100", selected_row_ids=["row_1"]),
    ))
    assert res2.idempotent_replay is True
    assert res2.committed_payment_ids == res1.committed_payment_ids
    assert res2.data_version == res1.data_version

    # Check total payments in DB (must be exactly 1, no duplicates created)
    payments = run_async(repo.list_payments(u1.id))
    assert len(payments) == 1

    # Different key on already-committed batch -> raises ImportCommitConflictError
    with pytest.raises(ImportCommitConflictError):
        run_async(import_svc.commit_import(
            u1.id,
            ImportCommitRequest(batch_id=batch_id, idempotency_key="different_key_200", selected_row_ids=["row_1"]),
        ))


def test_failed_commit_rolls_back_data(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test 22: If an error occurs during commit validation, transaction is aborted,
    no payment records are persisted, batch remains pending, and data_version is not incremented.
    """
    u1, u2 = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))
    p_before = run_async(repo.get_profile(u1.id))
    v_before = p_before.data_version

    csv_bytes = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Unmatched,NO-REF,bnpl,2026-11-20,1000,scheduled
"""
    preview = run_async(import_svc.preview_import(u1.id, csv_bytes))
    batch_id = preview.import_batch_id

    # Commit with invalid obligation mapping
    with pytest.raises(CrossOwnerReferenceError):
        run_async(import_svc.commit_import(
            u1.id,
            ImportCommitRequest(
                batch_id=batch_id,
                idempotency_key="fail_key",
                selected_row_ids=["row_1"],
                obligation_mappings={"row_1": uuid.uuid4()},  # Non-existent/unowned obligation!
            ),
        ))

    # Verify no payments were created
    assert len(run_async(repo.list_payments(u1.id))) == 0

    # Verify data_version was NOT incremented
    p_after = run_async(repo.get_profile(u1.id))
    assert p_after.data_version == v_before

    # Verify batch remains pending
    batch_db = run_async(repo.get_import_batch(u1.id, batch_id))
    assert batch_db.status == "pending"


def test_idempotency_fingerprint_mismatch_rejected(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Replaying an idempotency key with different commit parameters
    (different selected rows or different obligation mappings) must be rejected
    with ImportCommitConflictError.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(provider_alias="Alpha", kind="term_loan", principal_remaining_paise=500000),
    ))

    csv_bytes = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Alpha,REF-1,term_loan,2026-11-20,1000,scheduled
Alpha,REF-2,term_loan,2026-11-25,2000,scheduled
"""
    preview = run_async(import_svc.preview_import(u1.id, csv_bytes))
    batch_id = preview.import_batch_id

    # 1. Commit with selected_row_ids=["row_1"]
    res1 = run_async(import_svc.commit_import(
        u1.id,
        ImportCommitRequest(
            batch_id=batch_id,
            idempotency_key="fp_key_1",
            selected_row_ids=["row_1"],
            obligation_mappings={"row_1": ob.id},
        ),
    ))
    assert res1.idempotent_replay is False

    # 2. Replay with SAME key but DIFFERENT selected rows -> ImportCommitConflictError
    with pytest.raises(ImportCommitConflictError, match="different commit parameters"):
        run_async(import_svc.commit_import(
            u1.id,
            ImportCommitRequest(
                batch_id=batch_id,
                idempotency_key="fp_key_1",
                selected_row_ids=["row_1", "row_2"],
                obligation_mappings={"row_1": ob.id, "row_2": ob.id},
            ),
        ))


def test_multiple_blank_reference_rows_handling(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Review handling of multiple rows with blank external_ref:
    - Different transactions occurring on the same date with different amounts or kinds
      must NOT be classified as exact duplicates.
    - Identical rows with blank ref are classified as POSSIBLE_DUPLICATE_FILE requiring review.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    csv_bytes = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
HDFC,,bnpl,2026-11-20,1000,scheduled
HDFC,,card,2026-11-20,1000,scheduled
HDFC,,bnpl,2026-11-20,2000,scheduled
HDFC,,bnpl,2026-11-20,1000,scheduled
"""
    preview = run_async(import_svc.preview_import(u1.id, csv_bytes))
    assert preview.total_rows == 4

    # Row 1: Valid unmatched obligation
    assert preview.rows[0].match_status == "UNMATCHED_OBLIGATION"

    # Row 2: Different kind (card vs bnpl) on same date -> Distinct transaction, NOT duplicate
    assert preview.rows[1].match_status == "UNMATCHED_OBLIGATION"

    # Row 3: Different amount (2000 vs 1000) on same date -> Distinct transaction, NOT duplicate
    assert preview.rows[2].match_status == "UNMATCHED_OBLIGATION"

    # Row 4: Exact match with Row 1 (same provider, kind, date, amount) but blank ref
    # Flagged as POSSIBLE_DUPLICATE_FILE, requiring review (never assumed exact without ref)
    assert preview.rows[3].match_status == "POSSIBLE_DUPLICATE_FILE"
    assert "Review required" in preview.rows[3].duplicate_reason


def test_obligation_mapping_compatibility_rejection(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Explicit obligation mappings are validated for provider and obligation kind compatibility.
    - Incompatible kind (e.g. bnpl mapped to card) is rejected.
    - Incompatible distinct providers (e.g. Axis mapped to HDFC) is rejected.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    card_ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(provider_alias="HDFC Bank", kind="card", principal_remaining_paise=50000),
    ))
    axis_ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(provider_alias="Axis Bank", kind="term_loan", principal_remaining_paise=500000),
    ))

    # 1. Incompatible kind: BNPL row mapped to card obligation
    csv_bytes1 = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Generic Lender,REF-BNPL,bnpl,2026-11-20,1500,scheduled
"""
    preview1 = run_async(import_svc.preview_import(u1.id, csv_bytes1))
    with pytest.raises(ImportValidationError, match="Incompatible obligation type"):
        run_async(import_svc.commit_import(
            u1.id,
            ImportCommitRequest(
                batch_id=preview1.import_batch_id,
                idempotency_key="incompat_kind",
                selected_row_ids=["row_1"],
                obligation_mappings={"row_1": card_ob.id},
            ),
        ))

    # 2. Incompatible provider: SBI Loan mapped to Axis Bank obligation
    csv_bytes2 = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
SBI Bank,REF-SBI,term_loan,2026-11-20,5000,scheduled
"""
    preview2 = run_async(import_svc.preview_import(u1.id, csv_bytes2))
    with pytest.raises(ImportValidationError, match="Incompatible provider"):
        run_async(import_svc.commit_import(
            u1.id,
            ImportCommitRequest(
                batch_id=preview2.import_batch_id,
                idempotency_key="incompat_prov",
                selected_row_ids=["row_1"],
                obligation_mappings={"row_1": axis_ob.id},
            ),
        ))


def test_payment_status_semantics_and_principal_isolation(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Payment status semantics:
    - Paid payments have actual_paid_date set to due_date.
    - Scheduled or planned payments have actual_paid_date = None (never treated as money already paid).
    - Imported payments never decrement or alter the parent obligation's principal_remaining_paise.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    initial_principal = 750000
    ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(provider_alias="Lender", kind="term_loan", principal_remaining_paise=initial_principal),
    ))

    csv_bytes = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Lender,REF-1,term_loan,2026-11-10,3000,paid
Lender,REF-2,term_loan,2026-11-20,3000,scheduled
Lender,REF-3,term_loan,2026-11-30,3000,planned
"""
    preview = run_async(import_svc.preview_import(u1.id, csv_bytes))
    batch_id = preview.import_batch_id

    res = run_async(import_svc.commit_import(
        u1.id,
        ImportCommitRequest(
            batch_id=batch_id,
            idempotency_key="status_semantics_key",
            selected_row_ids=["row_1", "row_2", "row_3"],
            obligation_mappings={"row_1": ob.id, "row_2": ob.id, "row_3": ob.id},
        ),
    ))
    assert res.committed_count == 3

    # Fetch created payments
    payments = run_async(repo.list_payments(u1.id))
    payments_by_status = {p.payment_status: p for p in payments}

    # Paid payment
    p_paid = payments_by_status["paid"]
    assert p_paid.actual_paid_date == date(2026, 11, 10)
    assert p_paid.amount_paise == 300000
    assert p_paid.interest_paise == 0
    assert p_paid.fee_paise == 0

    # Scheduled payment: not yet paid
    p_sched = payments_by_status["scheduled"]
    assert p_sched.actual_paid_date is None
    assert p_sched.amount_paise == 300000

    # Planned payment: not yet paid
    p_plan = payments_by_status["planned"]
    assert p_plan.actual_paid_date is None
    assert p_plan.amount_paise == 300000

    # Verify parent obligation principal was NOT altered or reduced
    ob_after = run_async(repo.get_obligation(u1.id, ob.id))
    assert ob_after.principal_remaining_paise == initial_principal


def test_concurrent_commit_simulation(
    import_svc: ImportService, repo: FinanceRepository, two_users: tuple[User, User]
):
    """
    Test concurrency protection:
    If two concurrent requests attempt to commit the same pending batch,
    the first transitions the batch from 'pending' to 'committed' and succeeds;
    the second is rejected with ImportCommitConflictError via atomic conditional state transition.

    Note: In SQLite test setup, row locking compiles safely, and the atomic conditional
    UPDATE (expected_status='pending') prevents duplicate commit.
    """
    u1, _ = two_users
    run_async(repo.upsert_profile(u1.id, ProfileIn(opening_cash_paise=1000, balance_as_of=date(2026, 11, 1))))

    ob = run_async(repo.create_obligation(
        u1.id,
        ObligationIn(provider_alias="Lender", kind="term_loan", principal_remaining_paise=100000),
    ))

    csv_bytes = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Lender,REF-1,term_loan,2026-11-20,1000,scheduled
"""
    preview = run_async(import_svc.preview_import(u1.id, csv_bytes))
    batch_id = preview.import_batch_id

    # Request 1 commits the batch
    res1 = run_async(import_svc.commit_import(
        u1.id,
        ImportCommitRequest(
            batch_id=batch_id,
            idempotency_key="concurrent_key_1",
            selected_row_ids=["row_1"],
            obligation_mappings={"row_1": ob.id},
        ),
    ))
    assert res1.status == "committed"

    # Request 2 attempting to commit the same batch concurrently is rejected
    with pytest.raises(ImportCommitConflictError, match="has already been committed|cannot commit"):
        run_async(import_svc.commit_import(
            u1.id,
            ImportCommitRequest(
                batch_id=batch_id,
                idempotency_key="concurrent_key_2",
                selected_row_ids=["row_1"],
                obligation_mappings={"row_1": ob.id},
            ),
        ))
