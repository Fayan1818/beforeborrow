import pytest
from app.engine.cost import calculate_emi

def test_zero_rate_emi():
    principal = 6_000_000
    installments = calculate_emi(principal, "0.00", 3)
    assert len(installments) == 3
    assert sum(installments) == principal

def test_nonzero_rate_residual_zero():
    principal = 10_000_000
    installments = calculate_emi(principal, "18.00", 12)
    assert len(installments) == 12
    assert sum(installments) > principal
    assert all(i > 0 for i in installments)

def test_single_installment():
    installments = calculate_emi(1_000_000, "12.00", 1)
    assert len(installments) == 1
    assert installments[0] > 1_000_000

def test_invalid_term():
    with pytest.raises(ValueError):
        calculate_emi(1_000_000, "12.00", 0)
