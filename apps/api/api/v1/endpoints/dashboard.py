"""
MedXrayChat Backend - Dashboard Endpoints
"""
from datetime import datetime
from fastapi import APIRouter
from sqlalchemy import select, func

from models import Study, ChatSession, DiagnosisReport, Image, AIResult
from schemas import DashboardStatsResponse
from api.deps import CurrentUser, DbSession


router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    current_user: CurrentUser,
    db: DbSession,
) -> DashboardStatsResponse:
    """Get dashboard statistics for the current user.

    Returns counts for:
    - Total studies owned by user
    - AI analyses completed today
    - Total chat sessions
    - Total diagnosis reports
    """
    # Count total studies for user
    total_studies = (
        await db.execute(
            select(func.count()).select_from(Study).where(
                Study.user_id == current_user.id
            )
        )
    ).scalar() or 0

    # Count AI analyses done today (AIResult -> Image -> Study)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    analyses_today = (
        await db.execute(
            select(func.count())
            .select_from(AIResult)
            .join(Image, AIResult.image_id == Image.id)
            .join(Study, Image.study_id == Study.id)
            .where(
                Study.user_id == current_user.id,
                AIResult.created_at >= today_start,
            )
        )
    ).scalar() or 0

    # Count chat sessions for user
    chat_sessions = (
        await db.execute(
            select(func.count()).select_from(ChatSession).where(
                ChatSession.user_id == current_user.id
            )
        )
    ).scalar() or 0

    # Count diagnosis reports for user
    reports = (
        await db.execute(
            select(func.count()).select_from(DiagnosisReport).where(
                DiagnosisReport.user_id == current_user.id
            )
        )
    ).scalar() or 0

    return DashboardStatsResponse(
        total_studies=total_studies,
        analyses_today=analyses_today,
        chat_sessions=chat_sessions,
        reports=reports,
    )
