import uuid
import pytest
from httpx import AsyncClient

from app.models.identity import User


@pytest.mark.asyncio
async def test_unauthenticated_import_rejected(unauth_client: AsyncClient):
    """Unauthenticated requests to import endpoints return 401."""
    res1 = await unauth_client.get("/imports")
    assert res1.status_code == 401

    res2 = await unauth_client.post("/imports/preview")
    assert res2.status_code == 401

    res3 = await unauth_client.post("/imports/commit", json={
        "batch_id": str(uuid.uuid4()),
        "idempotency_key": "key1",
    })
    assert res3.status_code == 401


@pytest.mark.asyncio
async def test_preview_import_multipart_and_no_payments_created(auth_client: tuple[AsyncClient, User, User]):
    """Multipart CSV upload returns parsed rows and preview batch without creating payments."""
    client, u1, _ = auth_client
    await client.post("/profile", json={"opening_cash_paise": 1000, "balance_as_of": "2026-11-01"})

    csv_content = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Provider-A,REF-001,bnpl,2026-11-15,6000,scheduled
Provider-B,REF-002,card,2026-11-18,3000,scheduled
"""
    files = {"file": ("statement.csv", csv_content, "text/csv")}
    res = await client.post("/imports/preview", files=files)
    assert res.status_code == 200
    data = res.json()
    assert data["total_rows"] == 2
    assert data["valid_rows_count"] == 2
    assert len(data["rows"]) == 2
    assert "import_batch_id" in data

    # Verify no obligations or payments were created during preview
    obs = (await client.get("/obligations")).json()
    assert len(obs) == 0


@pytest.mark.asyncio
async def test_preview_file_size_limit_exceeded(auth_client: tuple[AsyncClient, User, User]):
    """Files exceeding 1 MiB return 413 Payload Too Large."""
    client, _, _ = auth_client
    large_bytes = b"provider_alias,external_ref,kind,due_date,amount_inr,status\n" + (b"A,B,bnpl,2026-11-15,100,scheduled\n" * 40000)
    assert len(large_bytes) > 1024 * 1024

    files = {"file": ("huge.csv", large_bytes, "text/csv")}
    res = await client.post("/imports/preview", files=files)
    assert res.status_code == 413


@pytest.mark.asyncio
async def test_preview_malformed_csv_returns_400(auth_client: tuple[AsyncClient, User, User]):
    """Missing headers or invalid CSV content returns 400 Bad Request."""
    client, _, _ = auth_client
    bad_csv = b"col1,col2\nval1,val2\n"
    files = {"file": ("bad.csv", bad_csv, "text/csv")}
    res = await client.post("/imports/preview", files=files)
    assert res.status_code == 400
    assert "Missing required CSV header" in res.json()["error"]["message"]


@pytest.mark.asyncio
async def test_commit_import_pipeline_and_idempotency(auth_client: tuple[AsyncClient, User, User]):
    """Commit valid rows from staged preview and verify idempotency and fingerprint validation."""
    client, u1, _ = auth_client
    await client.post("/profile", json={"opening_cash_paise": 1000, "balance_as_of": "2026-11-01"})

    # 1. Create target obligation
    ob_res = await client.post("/obligations", json={
        "provider_alias": "Bajaj Finserv",
        "kind": "bnpl",
        "principal_remaining_paise": 1000000,
        "source_ref": "EMICARD-101",
    })
    ob_id = ob_res.json()["id"]

    # 2. Upload CSV that matches Bajaj Finserv
    csv_data = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Bajaj Finserv,EMICARD-101,bnpl,2026-11-20,2500,scheduled
"""
    files = {"file": ("bajaj.csv", csv_data, "text/csv")}
    preview_res = await client.post("/imports/preview", files=files)
    assert preview_res.status_code == 200
    preview_data = preview_res.json()
    batch_id = preview_data["import_batch_id"]
    row_1_id = preview_data["rows"][0]["row_id"]

    # 3. Commit selected row
    commit_payload = {
        "batch_id": batch_id,
        "idempotency_key": "import_key_alpha",
        "selected_row_ids": [row_1_id],
        "obligation_mappings": {},
    }
    commit_res = await client.post(f"/imports/{batch_id}/commit", json=commit_payload)
    assert commit_res.status_code == 200
    commit_data = commit_res.json()
    assert commit_data["status"] == "committed"
    assert commit_data["idempotent_replay"] is False
    assert commit_data["committed_count"] == 1
    assert len(commit_data["committed_payment_ids"]) == 1

    # Verify payment exists attached to obligation
    ob_payments = (await client.get(f"/obligations/{ob_id}/payments")).json()
    assert len(ob_payments) == 1
    assert ob_payments[0]["amount_paise"] == 250000

    # 4. Replay same request with same idempotency key -> idempotent_replay is True, no duplicate
    replay_res = await client.post(f"/imports/{batch_id}/commit", json=commit_payload)
    assert replay_res.status_code == 200
    replay_data = replay_res.json()
    assert replay_data["idempotent_replay"] is True
    assert replay_data["committed_payment_ids"] == commit_data["committed_payment_ids"]

    # Check total payments still 1
    assert len((await client.get(f"/obligations/{ob_id}/payments")).json()) == 1

    # 5. Replay with same key but different payload -> 409 Conflict
    conflict_payload = dict(commit_payload)
    conflict_payload["selected_row_ids"] = []
    conflict_res = await client.post(f"/imports/{batch_id}/commit", json=conflict_payload)
    assert conflict_res.status_code in (409, 422)


@pytest.mark.asyncio
async def test_commit_unmatched_obligation_requires_mapping(auth_client: tuple[AsyncClient, User, User]):
    """Unmatched row without explicit mapping returns 400 Bad Request."""
    client, _, _ = auth_client
    await client.post("/profile", json={"opening_cash_paise": 1000, "balance_as_of": "2026-11-01"})

    csv_data = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
Unknown Debt,UNK-999,term_loan,2026-11-20,1000,scheduled
"""
    files = {"file": ("unmatched.csv", csv_data, "text/csv")}
    preview = (await client.post("/imports/preview", files=files)).json()
    batch_id = preview["import_batch_id"]
    row_id = preview["rows"][0]["row_id"]

    # Attempt commit without obligation mapping -> 422
    res = await client.post(f"/imports/{batch_id}/commit", json={
        "batch_id": batch_id,
        "idempotency_key": "unmatched_key",
        "selected_row_ids": [row_id],
        "obligation_mappings": {},
    })
    assert res.status_code == 422
    assert "explicit obligation mapping is required" in res.json()["error"]["message"]


@pytest.mark.asyncio
async def test_imports_cross_owner_isolation(auth_client: tuple[AsyncClient, User, User]):
    """
    Test cross-owner isolation in imports:
    - User 2 cannot commit User 1's batch (returns 404).
    - User 2's /imports list does not contain User 1's batch.
    - User 1 cannot map an imported row to User 2's obligation (returns 404).
    """
    client1, u1, u2 = auth_client
    await client1.post("/profile", json={"opening_cash_paise": 1000, "balance_as_of": "2026-11-01"})

    csv_data = b"""provider_alias,external_ref,kind,due_date,amount_inr,status
HDFC Bank,HDFC-444,term_loan,2026-11-15,5000,scheduled
"""
    files = {"file": ("hdfc.csv", csv_data, "text/csv")}
    preview = (await client1.post("/imports/preview", files=files)).json()
    batch_id = preview["import_batch_id"]
    row_id = preview["rows"][0]["row_id"]

    from app.main import app
    from app.core.dependencies import get_current_user
    from httpx import ASGITransport

    app.dependency_overrides[get_current_user] = lambda: u2
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client2:
            # User 2 creates their own profile & obligation
            await client2.post("/profile", json={"opening_cash_paise": 1000, "balance_as_of": "2026-11-01"})
            u2_ob = (await client2.post("/obligations", json={
                "provider_alias": "U2 Loan",
                "kind": "term_loan",
                "principal_remaining_paise": 100000,
            })).json()
            u2_ob_id = u2_ob["id"]

            # User 2 cannot commit User 1's batch -> 404
            res_commit_cross = await client2.post(f"/imports/{batch_id}/commit", json={
                "batch_id": batch_id,
                "idempotency_key": "cross_key",
                "selected_row_ids": [row_id],
                "obligation_mappings": {row_id: u2_ob_id},
            })
            assert res_commit_cross.status_code == 404

            # User 2 list of import batches does not contain User 1's batch
            u2_batches = (await client2.get("/imports")).json()
            assert not any(b["id"] == batch_id for b in u2_batches)
    finally:
        app.dependency_overrides[get_current_user] = lambda: u1

    # User 1 cannot map their import row to User 2's obligation -> 404
    res_cross_map = await client1.post(f"/imports/{batch_id}/commit", json={
        "batch_id": batch_id,
        "idempotency_key": "u1_cross_map_key",
        "selected_row_ids": [row_id],
        "obligation_mappings": {row_id: u2_ob_id},
    })
    assert res_cross_map.status_code == 404
