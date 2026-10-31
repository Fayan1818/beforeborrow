# Contracts

Shared API contract between backend and frontend.

## Files
- `openapi.json` - Generated from running FastAPI app.
- `fixtures/thin-buffer.json` - Tight cashflow scenario.
- `fixtures/timing-trap.json` - Salary arrives after EMI due date.
- `fixtures/missing-data.json` - Unknown income timing triggers insufficient_data.

## Regenerating
```bash
curl http://localhost:8000/openapi.json -o packages/contracts/openapi.json
cd apps/web && npx openapi-typescript ../../packages/contracts/openapi.json -o src/generated/api.d.ts
```
