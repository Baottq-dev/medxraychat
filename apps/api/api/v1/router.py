"""
MedXrayChat Backend - API v1 Router
"""
from fastapi import APIRouter

from api.v1.endpoints import auth, studies, ai, chat, reports, streaming, models, annotations, dashboard


router = APIRouter(prefix="/api/v1")

# Include all endpoint routers
router.include_router(auth.router)
router.include_router(studies.router)
router.include_router(ai.router)
router.include_router(chat.router)
router.include_router(reports.router)
router.include_router(streaming.router)
router.include_router(models.router)
router.include_router(annotations.router)
router.include_router(dashboard.router)



