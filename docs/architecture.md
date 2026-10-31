# Architecture

## Overview
BeforeBorrow is a monorepo with a React SPA frontend, a FastAPI backend, and a pure Python deterministic calculation engine.

## Three meanings of "model"
- Database models: SQLAlchemy ORM classes describing stored records.
- Pydantic schemas: Request/response validation shapes.
- Affordability engine: Deterministic pure Python calculation logic (`apps/api/app/engine/`).

## Technology Choices
- Frontend: React + TypeScript + Vite + TanStack Query + React Hook Form + Zod + Recharts
- Backend: Python 3.12 + FastAPI + Pydantic 2 + SQLAlchemy 2 + Alembic
- Storage: PostgreSQL
- Units: Integer paise, YYYY-MM-DD dates, Asia/Kolkata timezone
