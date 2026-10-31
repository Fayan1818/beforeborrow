# BeforeBorrow

> Decision-support website for urgent expenses: bring commitments together, rehearse borrowing, and make the future consequences visible before choosing.

**"A credit limit tells you what is available. We show what each choice does to your cash, commitments and goals — on actual dates."**

## Monorepo structure

```
beforeborrow/
  apps/web/          React + TypeScript + Vite frontend
  apps/api/          Python FastAPI backend + calculation engine
  packages/contracts/ OpenAPI spec + JSON test fixtures
  docs/              Architecture decisions, demo script
  infra/             Docker Compose, proxy config
  .github/workflows/ CI checks
```

## Quick start

### Prerequisites
- Node 22.12+
- Python 3.12+
- PostgreSQL 16+

### Backend
```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.lock
cp .env.example .env               # edit DATABASE_URL etc.
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd apps/web
cp .env.example .env
npm ci
npm run dev -- --host 127.0.0.1
```

### PostgreSQL via Docker
```bash
docker compose -f infra/compose.yaml up -d
```

## Team ownership

| Person | Feature areas |
|--------|---------------|
| A | auth, dashboard, AppShell, CI, infra |
| B | profile, obligations, calendar, imports |
| C | calculation engine, analysis, counterfactuals |
| D | decision, reports, alerts, receipts |

## Contract rules (non-negotiable)
- Money: **integer paise** (600000 = ₹6,000)
- Dates: **YYYY-MM-DD**
- Amounts cannot be NaN or infinite
- Unknown data → `insufficient_data`, never a comfortable estimate
