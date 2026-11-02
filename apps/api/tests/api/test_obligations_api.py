import uuid
import pytest
from httpx import AsyncClient

from app.models.identity import User


@pytest.mark.asyncio
async def test_unauthenticated_obligations_rejected(unauth_client: AsyncClient):
    """Unauthenticated access to obligations endpoints returns 401."""
    res1 = await unauth_client.get("/obligations")
    assert res1.status_code == 401

    res2 = await unauth_client.post("/obligations", json={
        "provider_alias": "Bank",
        "kind": "term_loan",
        "principal_remaining_paise": 100000,
    })
    assert res2.status_code == 401


@pytest.mark.asyncio
async def test_obligation_lifecycle_and_payments(auth_client: tuple[AsyncClient, User, User]):
    """Test full obligation CRUD, child payments, status updates, and optimistic locking."""
    client, u1, _ = auth_client
    await client.post("/profile", json={"opening_cash_paise": 1000, "balance_as_of": "2026-11-01"})

    # 1. Create obligation with 2 child payments
    create_payload = {
        "provider_alias": "Amazon Pay Later",
        "kind": "bnpl",
        "principal_remaining_paise": 600000,  # ₹6,000.00
        "payments": [
            {
                "due_date": "2026-11-15",
                "amount_paise": 300000,
                "payment_status": "scheduled",
            },
            {
                "due_date": "2026-12-15",
                "amount_paise": 300000,
                "payment_status": "scheduled",
            },
        ],
    }
    res_ob = await client.post("/obligations", json=create_payload)
    assert res_ob.status_code == 201
    ob_data = res_ob.json()
    ob_id = ob_data["id"]
    assert len(ob_data["payments"]) == 2
    assert ob_data["version"] == 1

    # 2. List obligations (with filter)
    list_res = await client.get("/obligations?kind=bnpl")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # 3. Retrieve single obligation
    get_res = await client.get(f"/obligations/{ob_id}")
    assert get_res.status_code == 200
    assert get_res.json()["provider_alias"] == "Amazon Pay Later"

    # 4. List payments for obligation
    payments_res = await client.get(f"/obligations/{ob_id}/payments")
    assert payments_res.status_code == 200
    payments = payments_res.json()
    assert len(payments) == 2
    payment_1_id = payments[0]["id"]

    # 5. Add a third payment
    add_pay_res = await client.post(f"/obligations/{ob_id}/payments", json={
        "due_date": "2027-01-15",
        "amount_paise": 100000,
        "payment_status": "scheduled",
    })
    assert add_pay_res.status_code == 201
    assert add_pay_res.json()["amount_paise"] == 100000

    # 6. Update payment status to paid with actual_paid_date
    patch_pay_res = await client.patch(f"/obligations/{ob_id}/payments/{payment_1_id}", json={
        "payment_status": "paid",
        "actual_paid_date": "2026-11-14",
    })
    assert patch_pay_res.status_code == 200
    assert patch_pay_res.json()["payment_status"] == "paid"
    assert patch_pay_res.json()["actual_paid_date"] == "2026-11-14"

    # 7. Update obligation with stale expected_version -> 409
    stale_update = await client.patch(f"/obligations/{ob_id}", json={
        "provider_alias": "Amazon Pay Updated",
        "expected_version": 99,  # Stale! Current is 1
    })
    assert stale_update.status_code == 409

    # Valid version update -> 200
    ok_update = await client.patch(f"/obligations/{ob_id}", json={
        "provider_alias": "Amazon Pay Updated",
        "expected_version": 1,
    })
    assert ok_update.status_code == 200
    assert ok_update.json()["version"] == 2
    assert ok_update.json()["provider_alias"] == "Amazon Pay Updated"

    # 8. Delete obligation with stale expected_version -> 409
    stale_del = await client.delete(f"/obligations/{ob_id}?expected_version=1")
    assert stale_del.status_code == 409

    # Delete with matching version -> 204
    ok_del = await client.delete(f"/obligations/{ob_id}?expected_version=2")
    assert ok_del.status_code == 204

    # Verify deleted
    assert (await client.get(f"/obligations/{ob_id}")).status_code == 404
    assert (await client.get(f"/obligations/{ob_id}/payments")).status_code == 404


@pytest.mark.asyncio
async def test_obligations_owner_isolation(auth_client: tuple[AsyncClient, User, User]):
    """Users cannot view, add payments to, or delete another user's obligations."""
    client, u1, u2 = auth_client

    # User 1 creates an obligation with a payment
    res = await client.post("/obligations", json={
        "provider_alias": "Secret Debt",
        "kind": "term_loan",
        "principal_remaining_paise": 500000,
        "payments": [
            {
                "due_date": "2026-11-20",
                "amount_paise": 200000,
                "payment_status": "scheduled",
            }
        ],
    })
    ob_data = res.json()
    ob_id = ob_data["id"]
    payment_id = ob_data["payments"][0]["id"]

    # In a clean client without u1's session, accessing u1's ob should 404
    from app.main import app
    from app.core.dependencies import get_current_user
    from httpx import ASGITransport

    app.dependency_overrides[get_current_user] = lambda: u2
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client2:
            # User 2 cannot get User 1's obligation
            assert (await client2.get(f"/obligations/{ob_id}")).status_code == 404
            # User 2 cannot list User 1's obligation payments
            assert (await client2.get(f"/obligations/{ob_id}/payments")).status_code == 404
            # User 2 cannot add a payment to User 1's obligation
            assert (await client2.post(f"/obligations/{ob_id}/payments", json={
                "due_date": "2026-12-20",
                "amount_paise": 100000,
                "payment_status": "scheduled",
            })).status_code == 404
            # User 2 cannot update User 1's payment via /obligations/{id}/payments/{id}
            assert (await client2.patch(f"/obligations/{ob_id}/payments/{payment_id}", json={
                "payment_status": "paid",
            })).status_code == 404
            # User 2 cannot update User 1's payment via direct /payments/{id} route
            assert (await client2.patch(f"/payments/{payment_id}", json={
                "payment_status": "paid",
            })).status_code == 404
            # User 2 cannot delete User 1's obligation
            assert (await client2.delete(f"/obligations/{ob_id}?expected_version=1")).status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: u1


@pytest.mark.asyncio
async def test_payment_route_obligation_mismatch_returns_404(auth_client: tuple[AsyncClient, User, User]):
    """
    PATCH /obligations/{obligation_id}/payments/{payment_id} must return 404
    if payment_id does not belong to obligation_id, even if both belong to the user.
    """
    client, u1, _ = auth_client

    # Create obligation 1
    ob1_res = await client.post("/obligations", json={
        "provider_alias": "Loan One",
        "kind": "term_loan",
        "principal_remaining_paise": 100000,
        "payments": [{"due_date": "2026-11-20", "amount_paise": 50000}],
    })
    ob1_id = ob1_res.json()["id"]

    # Create obligation 2
    ob2_res = await client.post("/obligations", json={
        "provider_alias": "Loan Two",
        "kind": "card",
        "principal_remaining_paise": 200000,
        "payments": [{"due_date": "2026-11-25", "amount_paise": 75000}],
    })
    ob2_id = ob2_res.json()["id"]
    pay2_id = ob2_res.json()["payments"][0]["id"]

    # Attempting to update payment 2 using obligation 1 path returns 404
    mismatch_res = await client.patch(
        f"/obligations/{ob1_id}/payments/{pay2_id}",
        json={"payment_status": "paid"},
    )
    assert mismatch_res.status_code == 404

    # Using matching path returns 200
    ok_res = await client.patch(
        f"/obligations/{ob2_id}/payments/{pay2_id}",
        json={"payment_status": "paid"},
    )
    assert ok_res.status_code == 200
    assert ok_res.json()["payment_status"] == "paid"


@pytest.mark.asyncio
async def test_payment_status_transitions_and_actual_paid_date(auth_client: tuple[AsyncClient, User, User]):
    """
    Test transitions: planned -> scheduled -> paid -> disputed -> cancelled.
    Verify actual_paid_date is automatically handled and principal is untouched.
    """
    client, u1, _ = auth_client

    ob_res = await client.post("/obligations", json={
        "provider_alias": "Test Loan",
        "kind": "term_loan",
        "principal_remaining_paise": 500000,
        "payments": [{"due_date": "2026-11-30", "amount_paise": 100000, "payment_status": "planned"}],
    })
    ob_id = ob_res.json()["id"]
    pay_id = ob_res.json()["payments"][0]["id"]

    # 1. planned -> scheduled (actual_paid_date is None)
    res1 = await client.patch(f"/payments/{pay_id}", json={"payment_status": "scheduled"})
    assert res1.status_code == 200
    assert res1.json()["payment_status"] == "scheduled"
    assert res1.json()["actual_paid_date"] is None

    # 2. scheduled -> paid (without date -> defaults to today in Asia/Kolkata)
    from app.repositories.finance import get_kolkata_today
    kolkata_today = get_kolkata_today().isoformat()

    res2 = await client.patch(f"/payments/{pay_id}", json={"payment_status": "paid"})
    assert res2.status_code == 200
    assert res2.json()["payment_status"] == "paid"
    assert res2.json()["actual_paid_date"] == kolkata_today

    # 3. paid -> planned (clears actual_paid_date)
    res3 = await client.patch(f"/payments/{pay_id}", json={"payment_status": "planned"})
    assert res3.status_code == 200
    assert res3.json()["payment_status"] == "planned"
    assert res3.json()["actual_paid_date"] is None

    # planned -> paid with explicit date
    res3b = await client.patch(f"/payments/{pay_id}", json={"payment_status": "paid", "actual_paid_date": "2026-11-05"})
    assert res3b.status_code == 200
    assert res3b.json()["actual_paid_date"] == "2026-11-05"

    # 4. paid -> scheduled (clears actual_paid_date)
    res4 = await client.patch(f"/payments/{pay_id}", json={"payment_status": "scheduled"})
    assert res4.status_code == 200
    assert res4.json()["actual_paid_date"] is None

    # scheduled -> paid
    await client.patch(f"/payments/{pay_id}", json={"payment_status": "paid"})

    # 5. paid -> missed (clears actual_paid_date)
    res5 = await client.patch(f"/payments/{pay_id}", json={"payment_status": "missed"})
    assert res5.status_code == 200
    assert res5.json()["payment_status"] == "missed"
    assert res5.json()["actual_paid_date"] is None

    # missed -> paid
    await client.patch(f"/payments/{pay_id}", json={"payment_status": "paid"})

    # 6. paid -> disputed (clears actual_paid_date)
    res6 = await client.patch(f"/payments/{pay_id}", json={"payment_status": "disputed"})
    assert res6.status_code == 200
    assert res6.json()["payment_status"] == "disputed"
    assert res6.json()["actual_paid_date"] is None

    # disputed -> paid
    await client.patch(f"/payments/{pay_id}", json={"payment_status": "paid"})

    # 7. paid -> cancelled (clears actual_paid_date)
    res7 = await client.patch(f"/payments/{pay_id}", json={"payment_status": "cancelled"})
    assert res7.status_code == 200
    assert res7.json()["payment_status"] == "cancelled"
    assert res7.json()["actual_paid_date"] is None

    # 8. Reject non-paid payment update with supplied actual_paid_date (returns 422)
    for bad_status in ("planned", "scheduled", "missed", "cancelled", "disputed"):
        bad_res = await client.patch(f"/payments/{pay_id}", json={
            "payment_status": bad_status,
            "actual_paid_date": "2026-11-10",
        })
        assert bad_res.status_code == 422

    # 9. Reject creating non-paid payment with supplied actual_paid_date (returns 422)
    bad_create = await client.post(f"/obligations/{ob_id}/payments", json={
        "due_date": "2026-12-15",
        "amount_paise": 50000,
        "payment_status": "scheduled",
        "actual_paid_date": "2026-12-15",
    })
    assert bad_create.status_code == 422

    # Verify obligation principal remained intact (500000 paise) throughout
    ob_check = (await client.get(f"/obligations/{ob_id}")).json()
    assert ob_check["principal_remaining_paise"] == 500000


@pytest.mark.asyncio
async def test_obligation_filters_and_status_coverage(auth_client: tuple[AsyncClient, User, User]):
    """Verify all obligation statuses (active, paused, paid, closed, defaulted) and kinds work with filters."""
    client, u1, _ = auth_client

    # Create obligations with different statuses and kinds
    statuses = ["active", "paused", "paid", "closed", "defaulted"]
    for idx, st in enumerate(statuses):
        await client.post("/obligations", json={
            "provider_alias": f"Lender {st}",
            "kind": "term_loan" if idx % 2 == 0 else "bnpl",
            "principal_remaining_paise": 100000 * (idx + 1),
            "status": st,
            "payments": [{"due_date": "2026-11-20", "amount_paise": 50000}],
        })

    # Test filtering by each status
    for st in statuses:
        res = await client.get(f"/obligations?status={st}")
        assert res.status_code == 200
        assert all(o["status"] == st for o in res.json())
        assert len(res.json()) == 1

    # Test filtering by kind term_loan and alias loan
    res_term_loan = await client.get("/obligations?kind=term_loan")
    assert res_term_loan.status_code == 200
    assert len(res_term_loan.json()) == 3

    res_loan = await client.get("/obligations?kind=loan")
    assert res_loan.status_code == 200
    assert len(res_loan.json()) == 3

