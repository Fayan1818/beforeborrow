import pytest
from httpx import AsyncClient

from app.models.identity import User


@pytest.mark.asyncio
async def test_unauthenticated_profile_rejected(unauth_client: AsyncClient):
    """Unauthenticated requests to /profile or /cashflow-rules must return 401."""
    res1 = await unauth_client.get("/profile")
    assert res1.status_code == 401

    res2 = await unauth_client.post("/profile", json={"opening_cash_paise": 1000, "balance_as_of": "2026-11-01"})
    assert res2.status_code == 401

    res3 = await unauth_client.get("/cashflow-rules")
    assert res3.status_code == 401


@pytest.mark.asyncio
async def test_get_profile_not_found(auth_client: tuple[AsyncClient, User, User]):
    """Retrieving a non-existent profile returns 404."""
    client, u1, _ = auth_client
    res = await client.get("/profile")
    assert res.status_code == 404
    assert "not found" in res.json()["error"]["message"].lower()


@pytest.mark.asyncio
async def test_upsert_and_get_profile(auth_client: tuple[AsyncClient, User, User]):
    """Create a profile and retrieve it with data_version."""
    client, u1, _ = auth_client

    payload = {
        "opening_cash_paise": 5000000,  # ₹50,000.00
        "balance_as_of": "2026-11-01",
        "reserve_floor_paise": 1000000,  # ₹10,000.00
    }
    # Create profile
    res = await client.post("/profile", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["opening_cash_paise"] == 5000000
    assert data["balance_as_of"] == "2026-11-01"
    assert data["reserve_floor_paise"] == 1000000
    assert data["data_version"] == 1

    # Fetch profile
    get_res = await client.get("/profile")
    assert get_res.status_code == 200
    assert get_res.json()["data_version"] == 1


@pytest.mark.asyncio
async def test_profile_optimistic_concurrency(auth_client: tuple[AsyncClient, User, User]):
    """Updating profile with mismatched expected_version returns 409 Conflict."""
    client, u1, _ = auth_client

    # Initial creation
    await client.post("/profile", json={"opening_cash_paise": 1000, "balance_as_of": "2026-11-01"})

    # Update with wrong expected_version -> 409
    res_stale = await client.put("/profile", json={
        "opening_cash_paise": 2000,
        "balance_as_of": "2026-11-02",
        "expected_version": 999,
    })
    assert res_stale.status_code == 409

    # Update with matching expected_version (1) -> 200
    res_ok = await client.put("/profile", json={
        "opening_cash_paise": 2000,
        "balance_as_of": "2026-11-02",
        "expected_version": 1,
    })
    assert res_ok.status_code == 200
    assert res_ok.json()["data_version"] == 2


@pytest.mark.asyncio
async def test_cashflow_rules_lifecycle_and_concurrency(auth_client: tuple[AsyncClient, User, User]):
    """Test full cashflow rule lifecycle with data_version optimistic concurrency."""
    client, u1, _ = auth_client
    await client.post("/profile", json={"opening_cash_paise": 1000, "balance_as_of": "2026-11-01"})

    # 1. Create income rule
    res_income = await client.post("/cashflow-rules", json={
        "direction": "income",
        "category": "Salary",
        "amount_paise": 8000000,
        "due_date": "2026-11-01",
        "start_date": "2026-11-01",
        "frequency": "monthly",
    })
    assert res_income.status_code == 201
    income_rule_id = res_income.json()["id"]

    # 2. Create expense rule
    res_expense = await client.post("/cashflow-rules", json={
        "direction": "expense",
        "category": "Rent",
        "amount_paise": 2000000,
        "due_date": "2026-11-05",
        "start_date": "2026-11-01",
        "frequency": "monthly",
    })
    assert res_expense.status_code == 201
    expense_rule_id = res_expense.json()["id"]

    # 3. List rules (all vs filtered)
    all_rules = (await client.get("/cashflow-rules")).json()
    assert len(all_rules) == 2

    income_only = (await client.get("/cashflow-rules?direction=income")).json()
    assert len(income_only) == 1
    assert income_only[0]["category"] == "Salary"

    # Profile data_version should have incremented twice (from 1 to 3)
    profile = (await client.get("/profile")).json()
    v_curr = profile["data_version"]
    assert v_curr == 3

    # 4. Update expense rule with stale expected_data_version -> 409
    res_stale = await client.patch(f"/cashflow-rules/{expense_rule_id}", json={
        "amount_paise": 2500000,
        "expected_data_version": 1,  # Stale! Current is 3
    })
    assert res_stale.status_code == 409

    # 5. Update expense rule with correct expected_data_version -> 200
    res_updated = await client.patch(f"/cashflow-rules/{expense_rule_id}", json={
        "amount_paise": 2500000,
        "expected_data_version": v_curr,
    })
    assert res_updated.status_code == 200
    assert res_updated.json()["amount_paise"] == 2500000

    # 6. Delete expense rule with stale expected_data_version -> 409
    res_del_stale = await client.delete(f"/cashflow-rules/{expense_rule_id}?expected_data_version=1")
    assert res_del_stale.status_code == 409

    # Delete with matching version -> 204
    v_new = (await client.get("/profile")).json()["data_version"]
    res_del = await client.delete(f"/cashflow-rules/{expense_rule_id}?expected_data_version={v_new}")
    assert res_del.status_code == 204

    # Verify rule is gone
    res_get_deleted = await client.get(f"/cashflow-rules/{expense_rule_id}")
    assert res_get_deleted.status_code == 404


@pytest.mark.asyncio
async def test_cashflow_rules_cross_owner_isolation(auth_client: tuple[AsyncClient, User, User]):
    """User 2 cannot view, update, or delete User 1's cashflow rules."""
    client1, u1, u2 = auth_client
    await client1.post("/profile", json={"opening_cash_paise": 1000, "balance_as_of": "2026-11-01"})

    # User 1 creates a rule
    rule_res = await client1.post("/cashflow-rules", json={
        "direction": "income",
        "category": "Salary",
        "amount_paise": 5000000,
        "due_date": "2026-11-01",
        "frequency": "monthly",
    })
    rule_id = rule_res.json()["id"]

    # Switch to User 2 client
    from app.main import app
    from app.core.dependencies import get_current_user
    from httpx import ASGITransport

    app.dependency_overrides[get_current_user] = lambda: u2
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client2:
            # User 2 cannot get User 1's rule
            assert (await client2.get(f"/cashflow-rules/{rule_id}")).status_code == 404
            # User 2 cannot patch User 1's rule
            assert (await client2.patch(f"/cashflow-rules/{rule_id}", json={
                "amount_paise": 100,
                "expected_data_version": 1,
            })).status_code == 404
            # User 2 cannot delete User 1's rule
            assert (await client2.delete(f"/cashflow-rules/{rule_id}?expected_data_version=1")).status_code == 404
            # User 2 profile is empty (404)
            assert (await client2.get("/profile")).status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: u1


@pytest.mark.asyncio
async def test_financial_snapshot_endpoint(auth_client: tuple[AsyncClient, User, User]):
    """
    Test GET /snapshot endpoint:
    - 404 when profile is not set up.
    - 200 with blocking_gaps when data is incomplete (is_valid=False).
    - 200 with complete snapshot when valid.
    - NEVER exposes internal quality_score.
    """
    client, u1, u2 = auth_client

    # 1. Profile not created yet -> 404 on both paths
    assert (await client.get("/snapshot")).status_code == 404
    assert (await client.get("/profile/financial-snapshot")).status_code == 404

    # 2. Create profile and active obligation WITHOUT payment schedule -> is_valid=False
    await client.post("/profile", json={"opening_cash_paise": 5000000, "balance_as_of": "2026-11-01"})
    ob_res = await client.post("/obligations", json={
        "provider_alias": "Personal Loan",
        "kind": "term_loan",
        "principal_remaining_paise": 5000000,
        "status": "active",
        "payments": [],
    })
    ob_id = ob_res.json()["id"]

    res_blocked = await client.get("/snapshot")
    assert res_blocked.status_code == 200
    res_blocked_alias = await client.get("/profile/financial-snapshot")
    assert res_blocked_alias.status_code == 200
    blocked_data = res_blocked.json()
    assert res_blocked_alias.json() == blocked_data
    assert blocked_data["snapshot"] is None
    assert blocked_data["data_quality"]["is_valid"] is False
    assert len(blocked_data["data_quality"]["blocking_gaps"]) >= 1
    # Verify quality_score is NOT exposed
    assert "quality_score" not in blocked_data["data_quality"]
    assert "quality_score" not in blocked_data

    # 3. Add scheduled payment to resolve blocking gap
    await client.post(f"/obligations/{ob_id}/payments", json={
        "due_date": "2026-12-01",
        "amount_paise": 1000000,
        "payment_status": "scheduled",
    })

    res_valid = await client.get("/snapshot")
    assert res_valid.status_code == 200
    res_valid_alias = await client.get("/profile/financial-snapshot")
    assert res_valid_alias.status_code == 200
    valid_data = res_valid.json()
    assert res_valid_alias.json() == valid_data
    assert valid_data["data_quality"]["is_valid"] is True
    assert valid_data["snapshot"] is not None
    assert valid_data["snapshot"]["opening_cash_paise"] == 5000000
    assert len(valid_data["snapshot"]["obligations"]) == 1
    # Verify quality_score is STILL strictly omitted
    assert "quality_score" not in valid_data["data_quality"]
    assert "quality_score" not in valid_data

