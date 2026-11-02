import pytest
from httpx import AsyncClient

from app.models.identity import User


@pytest.mark.asyncio
async def test_unauthenticated_calendar_rejected(unauth_client: AsyncClient):
    """Unauthenticated request to calendar returns 401."""
    res = await unauth_client.get("/calendar?from=2026-11-01&to=2026-11-30")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_calendar_invalid_range_rejected(auth_client: tuple[AsyncClient, User, User]):
    """Requests where 'to' date precedes 'from' date return 400 Bad Request."""
    client, _, _ = auth_client
    res = await client.get("/calendar?from=2026-11-30&to=2026-11-01")
    assert res.status_code == 400
    assert "must be on or after" in res.json()["error"]["message"]


@pytest.mark.asyncio
async def test_calendar_schedule_generation(auth_client: tuple[AsyncClient, User, User]):
    """Test generating a full financial calendar schedule with rules and payments."""
    client, u1, _ = auth_client

    # 1. Profile
    await client.post("/profile", json={
        "opening_cash_paise": 5000000,
        "balance_as_of": "2026-11-01",
    })

    # 2. Income rule
    await client.post("/cashflow-rules", json={
        "direction": "income",
        "category": "Salary",
        "amount_paise": 6000000,
        "due_date": "2026-11-01",
        "start_date": "2026-11-01",
        "frequency": "monthly",
    })

    # 3. Obligation with a scheduled payment
    await client.post("/obligations", json={
        "provider_alias": "Loan Provider",
        "kind": "term_loan",
        "principal_remaining_paise": 500000,
        "payments": [
            {
                "due_date": "2026-11-10",
                "amount_paise": 2000000,
                "payment_status": "scheduled",
            }
        ],
    })

    # 4. Query calendar for November 2026
    res = await client.get("/calendar?from=2026-11-01&to=2026-11-30")
    assert res.status_code == 200
    data = res.json()

    assert data["from_date"] == "2026-11-01"
    assert data["to_date"] == "2026-11-30"
    assert data["total_event_count"] >= 2
    assert data["total_scheduled_income_paise"] == 6000000
    assert data["total_scheduled_outflow_paise"] == 2000000
    assert data["net_scheduled_cashflow_paise"] == 4000000
    assert len(data["daily_summaries"]) >= 2
    assert len(data["rolling_7d_outflows"]) > 0
    assert "disclaimer" in data


@pytest.mark.asyncio
async def test_calendar_cross_owner_isolation(auth_client: tuple[AsyncClient, User, User]):
    """User 2 calendar queries must not return User 1's financial events."""
    client1, u1, u2 = auth_client

    # User 1 sets up financial events
    await client1.post("/profile", json={"opening_cash_paise": 5000000, "balance_as_of": "2026-11-01"})
    await client1.post("/cashflow-rules", json={
        "direction": "income",
        "category": "Salary",
        "amount_paise": 6000000,
        "due_date": "2026-11-01",
        "start_date": "2026-11-01",
        "frequency": "monthly",
    })

    from app.main import app
    from app.core.dependencies import get_current_user
    from httpx import ASGITransport

    app.dependency_overrides[get_current_user] = lambda: u2
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client2:
            res = await client2.get("/calendar?from=2026-11-01&to=2026-11-30")
            assert res.status_code == 200
            data = res.json()
            assert data["total_event_count"] == 0
            assert data["total_scheduled_income_paise"] == 0
            assert data["total_scheduled_outflow_paise"] == 0
    finally:
        app.dependency_overrides[get_current_user] = lambda: u1
