from fastapi import APIRouter
from app.api.v1 import auth, profile, obligations, imports, calendar, scenarios, analysis, reports, alerts

router = APIRouter()

@router.get("/health", tags=["ops"])
async def health():
    return {"status": "ok"}

@router.get("/ready", tags=["ops"])
async def ready():
    return {"status": "ok"}

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(profile.router, prefix="", tags=["profile"])
router.include_router(obligations.router, prefix="", tags=["obligations"])
router.include_router(imports.router, prefix="/imports", tags=["imports"])
router.include_router(calendar.router, prefix="", tags=["calendar"])
router.include_router(scenarios.router, prefix="", tags=["scenarios"])
router.include_router(analysis.router, prefix="", tags=["analysis"])
router.include_router(reports.router, prefix="", tags=["reports"])
router.include_router(alerts.router, prefix="", tags=["alerts"])
