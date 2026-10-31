MOCK_AA_LABEL = "[DEMO - simulated account data, not real]"

def fetch_mock_statement() -> dict:
    return {
        "_label": MOCK_AA_LABEL,
        "accounts": [
            {
                "masked_account": "XXXX1234",
                "opening_balance_paise": 3_500_000,
                "transactions": []
            }
        ]
    }
