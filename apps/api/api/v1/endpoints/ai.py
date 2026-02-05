"""
MedXrayChat Backend - AI Analysis Endpoints
"""
import uuid
import asyncio
import base64
from functools import partial
from pathlib import Path
from fastapi import APIRouter, HTTPException, status, Request
from fastapi.responses import Response
from sqlalchemy import select
from loguru import logger

from models import Image, AIResult, Study
from schemas import (
    AIAnalyzeRequest,
    AIAnalyzeResponse,
    AIChatRequest,
    AIChatResponse,
    Detection,
)
from api.deps import CurrentUser, DbSession
from services import get_ai_service
from services.yolo_service import get_yolo_service
from services.executor import get_executor
from core.rate_limit import limiter
from core.image_utils import load_image_from_file


router = APIRouter(prefix="/ai", tags=["AI Analysis"])


@router.get("/test-image")
async def test_image():
    """Test endpoint that returns a simple PNG image."""
    from PIL import Image
    from io import BytesIO
    import numpy as np
    
    # Create a simple red gradient image
    arr = np.zeros((100, 100, 4), dtype=np.uint8)
    arr[:, :, 0] = 255  # Red
    arr[:, :, 3] = 128  # Alpha
    
    img = Image.fromarray(arr, 'RGBA')
    buf = BytesIO()
    img.save(buf, format='PNG')
    png_bytes = buf.getvalue()
    
    logger.info(f"Test image: {len(png_bytes)} bytes")
    
    return Response(
        content=png_bytes,
        media_type="image/png",
    )


@router.post("/analyze", response_model=AIAnalyzeResponse)
@limiter.limit("10/minute")
async def analyze_image(
    request: Request,
    analyze_request: AIAnalyzeRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> AIAnalyzeResponse:
    """Run full AI analysis pipeline on an image.
    
    Pipeline:
    1. YOLO detection for bounding boxes
    2. Qwen-VL for detailed analysis
    3. WBF fusion of results
    """
    # Get image and verify ownership
    image_query = (
        select(Image)
        .join(Study)
        .where(Image.id == analyze_request.image_id, Study.user_id == current_user.id)
    )
    result = await db.execute(image_query)
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )

    # Check if file exists
    if not Path(image.file_path).exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image file not found on disk"
        )

    # Run AI analysis
    ai_service = get_ai_service()

    try:
        pil_image = load_image_from_file(image.file_path)

        # Run sync AI inference in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            get_executor(),
            partial(
                ai_service.analyze_image,
                image=pil_image,
                run_yolo=analyze_request.run_yolo,
                run_qwen=analyze_request.run_qwen,
                question=analyze_request.question,
            )
        )

        # Set image_id on response
        response.image_id = analyze_request.image_id

        # Save results to database
        ai_result = AIResult(
            image_id=analyze_request.image_id,
            yolo_detections=[d.model_dump() for d in response.yolo_detections],
            qwen_detections=[d.model_dump() for d in response.qwen_detections],
            fused_detections=[d.model_dump() for d in response.fused_detections],
            analysis_text=response.analysis_text,
            yolo_model_version="yolo11l-vindr",
            qwen_model_version="Qwen3-VL-7B",
            processing_time_ms=response.processing_time_ms,
        )

        db.add(ai_result)
        await db.commit()

        return response

    except Exception as e:
        # Generate unique error ID for correlation
        error_id = str(uuid.uuid4())[:8]
        logger.error(f"AI analysis failed [{error_id}]: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI analysis failed. Please try again. Error ID: {error_id}"
        )


@router.post("/detect", response_model=AIAnalyzeResponse)
@limiter.limit("15/minute")
async def detect_only(
    request: Request,
    detect_request: AIAnalyzeRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> AIAnalyzeResponse:
    """Run YOLO detection only (no Qwen-VL analysis)."""
    detect_request.run_qwen = False
    return await analyze_image(request, detect_request, current_user, db)


@router.post("/chat", response_model=AIChatResponse)
@limiter.limit("20/minute")
async def chat_with_ai(
    request: Request,
    chat_request: AIChatRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> AIChatResponse:
    """Chat with AI about an X-ray image."""
    image = None

    if chat_request.image_id:
        # Get image and verify ownership
        image_query = (
            select(Image)
            .join(Study)
            .where(Image.id == chat_request.image_id, Study.user_id == current_user.id)
        )
        result = await db.execute(image_query)
        image_record = result.scalar_one_or_none()

        if not image_record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image not found"
            )

        if Path(image_record.file_path).exists():
            image = load_image_from_file(image_record.file_path)

    # Get AI response
    ai_service = get_ai_service()

    try:
        # Run sync AI inference in thread pool
        loop = asyncio.get_event_loop()
        response_text, detections, tokens = await loop.run_in_executor(
            get_executor(),
            partial(
                ai_service.chat,
                message=chat_request.message,
                image=image,
                include_detections=chat_request.include_detections,
            )
        )

        return AIChatResponse(
            response=response_text,
            bbox_references=detections,
            tokens_used=tokens,
        )

    except Exception as e:
        # Generate unique error ID for correlation
        error_id = str(uuid.uuid4())[:8]
        logger.error(f"AI chat failed [{error_id}]: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI chat failed. Please try again. Error ID: {error_id}"
        )


@router.get("/results/{image_id}", response_model=AIAnalyzeResponse)
async def get_analysis_results(
    image_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> AIAnalyzeResponse:
    """Get cached AI analysis results for an image."""
    # Verify ownership
    image_query = (
        select(Image)
        .join(Study)
        .where(Image.id == image_id, Study.user_id == current_user.id)
    )
    result = await db.execute(image_query)
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    # Get latest AI result
    result_query = (
        select(AIResult)
        .where(AIResult.image_id == image_id)
        .order_by(AIResult.created_at.desc())
        .limit(1)
    )
    result = await db.execute(result_query)
    ai_result = result.scalar_one_or_none()
    
    if not ai_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No AI analysis results found for this image"
        )
    
    # Convert stored JSON back to Detection objects
    yolo_dets = [Detection(**d) for d in ai_result.yolo_detections]
    qwen_dets = [Detection(**d) for d in ai_result.qwen_detections]
    fused_dets = [Detection(**d) for d in ai_result.fused_detections]
    
    return AIAnalyzeResponse(
        image_id=image_id,
        yolo_detections=yolo_dets,
        qwen_detections=qwen_dets,
        fused_detections=fused_dets,
        analysis_text=ai_result.analysis_text,
        processing_time_ms=ai_result.processing_time_ms or 0,
    )


@router.get("/test-heatmap/{image_id}")
async def test_heatmap(image_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    """Test heatmap generation with auth."""
    logger.info(f"Test heatmap for user: {current_user.id}, image: {image_id}")
    
    # Find the actual image from database
    image_query = (
        select(Image)
        .join(Study)
        .where(Image.id == image_id, Study.user_id == current_user.id)
    )
    result = await db.execute(image_query)
    image = result.scalar_one_or_none()
    
    if not image:
        logger.error(f"Image not found: {image_id}")
        return Response(content=b"Image not found", status_code=404)
    
    logger.info(f"Found image: {image.file_path}")
    file_path = Path(image.file_path)
    
    if not file_path.exists():
        logger.error(f"File not found: {file_path}")
        return Response(content=b"File not found", status_code=404)
    
    image_bytes = file_path.read_bytes()
    logger.info(f"Image bytes: {len(image_bytes)}")

    heatmap_bytes = get_yolo_service().generate_heatmap(image_bytes)
    logger.info(f"Heatmap bytes: {len(heatmap_bytes)}")
    
    return Response(
        content=heatmap_bytes,
        media_type="image/png",
    )


@router.get("/heatmap/{image_id}")
@limiter.limit("30/minute")
async def get_heatmap(
    request: Request,
    image_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    """
    Generate and return a heatmap overlay for the image.
    The heatmap is based on YOLO detections - areas with higher confidence
    show higher activation (red), lower areas show cooler colors (blue/green).
    Returns a PNG image with alpha channel.
    """
    logger.info(f"Heatmap request for image_id: {image_id}, user: {current_user.id}")
    
    # Check image access
    image_query = (
        select(Image)
        .join(Study)
        .where(Image.id == image_id, Study.user_id == current_user.id)
    )
    result = await db.execute(image_query)
    image = result.scalar_one_or_none()
    
    if not image:
        logger.error(f"Image not found: {image_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    logger.info(f"Found image: {image.file_path}")
    
    # Load image bytes
    file_path = Path(image.file_path)
    if not file_path.exists():
        logger.error(f"File not found on disk: {file_path}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image file not found on disk"
        )
    
    image_bytes = file_path.read_bytes()
    logger.info(f"Loaded image bytes: {len(image_bytes)} bytes from {file_path}")
    
    # Generate heatmap using GradCAM
    try:
        logger.info("Generating GradCAM heatmap...")
        heatmap_bytes = get_yolo_service().generate_heatmap(image_bytes)
        logger.info(f"Heatmap generated: {len(heatmap_bytes)} bytes")
        
        if not heatmap_bytes or len(heatmap_bytes) == 0:
            logger.error("Heatmap generation returned empty bytes")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate heatmap: empty result"
            )
        
        return Response(
            content=heatmap_bytes,
            media_type="image/png",
            headers={
                "Cache-Control": "no-cache",
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Heatmap generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate heatmap: {str(e)}"
        )
