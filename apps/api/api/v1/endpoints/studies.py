"""
MedXrayChat Backend - Study Endpoints
"""
import uuid
import shutil
import tempfile
import io
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, UploadFile, File, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select, func
from PIL import Image as PILImage
from loguru import logger

from core.config import settings
from models import Study, Image
from schemas import (
    StudyCreate,
    StudyResponse,
    StudyListResponse,
    ImageResponse,
    ImageUploadResponse,
)
from api.deps import CurrentUser, DbSession


def get_cached_png_path(dicom_path: Path) -> Path:
    """Get the path for cached PNG version of a DICOM file."""
    return dicom_path.with_suffix('.png')


def convert_dicom_to_png(file_path: Path, use_cache: bool = True) -> tuple[bytes, Path | None]:
    """Convert DICOM file to PNG bytes.

    Returns:
        Tuple of (png_bytes, cached_file_path or None)
    """
    # Check for cached version first
    cached_path = get_cached_png_path(file_path)
    if use_cache and cached_path.exists():
        logger.info(f"Using cached PNG: {cached_path}")
        return cached_path.read_bytes(), cached_path

    try:
        import pydicom
        import numpy as np

        logger.info(f"Converting DICOM to PNG: {file_path}")

        # Read DICOM file
        ds = pydicom.dcmread(str(file_path))

        # Get pixel array
        pixel_array = ds.pixel_array

        # Apply window/level if present
        if hasattr(ds, 'WindowCenter') and hasattr(ds, 'WindowWidth'):
            window_center = float(ds.WindowCenter) if not isinstance(ds.WindowCenter, pydicom.multival.MultiValue) else float(ds.WindowCenter[0])
            window_width = float(ds.WindowWidth) if not isinstance(ds.WindowWidth, pydicom.multival.MultiValue) else float(ds.WindowWidth[0])

            # Apply window/level
            min_val = window_center - window_width / 2
            max_val = window_center + window_width / 2
            pixel_array = np.clip(pixel_array, min_val, max_val)
            pixel_array = ((pixel_array - min_val) / (max_val - min_val) * 255).astype(np.uint8)
        else:
            # Normalize to 0-255
            pixel_array = pixel_array.astype(float)
            pixel_array = (pixel_array - pixel_array.min()) / (pixel_array.max() - pixel_array.min() + 1e-8) * 255
            pixel_array = pixel_array.astype(np.uint8)

        # Handle PhotometricInterpretation
        if hasattr(ds, 'PhotometricInterpretation') and ds.PhotometricInterpretation == 'MONOCHROME1':
            pixel_array = 255 - pixel_array

        # Create PIL Image
        img = PILImage.fromarray(pixel_array)

        # Convert to RGB if needed (for consistency)
        if img.mode != 'RGB':
            img = img.convert('RGB')

        # Save to bytes
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        png_data = img_bytes.getvalue()

        # Cache to disk for faster subsequent access
        if use_cache:
            try:
                cached_path.write_bytes(png_data)
                logger.info(f"Cached PNG to: {cached_path}")
            except Exception as e:
                logger.warning(f"Failed to cache PNG: {e}")

        return png_data, cached_path if use_cache else None
    except Exception as e:
        logger.error(f"Failed to convert DICOM to PNG: {e}")
        raise


# File magic bytes for validation
FILE_MAGIC_BYTES = {
    "png": [b"\x89PNG\r\n\x1a\n"],
    "jpg": [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "dcm": [b"DICM"],  # DICOM files have DICM at offset 128
    "dicom": [b"DICM"],
}


def _validate_file_magic(file_path: Path, expected_ext: str) -> bool:
    """Validate file content matches expected type using magic bytes."""
    try:
        with open(file_path, "rb") as f:
            # For DICOM, magic bytes are at offset 128
            if expected_ext in ("dcm", "dicom"):
                f.seek(128)
                header = f.read(4)
                return header == b"DICM"

            # For other formats, check beginning of file
            header = f.read(8)
            expected_magics = FILE_MAGIC_BYTES.get(expected_ext, [])
            return any(header.startswith(magic) for magic in expected_magics)
    except Exception as e:
        logger.warning(f"Failed to validate file magic: {e}")
        return False


router = APIRouter(prefix="/studies", tags=["Studies"])


def get_study_response(study: Study, image_count: int = 0) -> StudyResponse:
    """Convert Study model to response with image count."""
    return StudyResponse(
        id=study.id,
        patient_id=study.patient_id,
        patient_name=study.patient_name,
        patient_age=study.patient_age,
        patient_sex=study.patient_sex,
        study_date=study.study_date,
        modality=study.modality,
        description=study.description,
        image_count=image_count,
        created_at=study.created_at,
    )


@router.get("", response_model=StudyListResponse)
async def list_studies(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
) -> StudyListResponse:
    """List all studies for current user."""
    # Count total
    count_query = select(func.count()).select_from(Study).where(
        Study.user_id == current_user.id
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Get paginated studies with image counts
    offset = (page - 1) * size
    query = (
        select(Study, func.count(Image.id).label("image_count"))
        .outerjoin(Image)
        .where(Study.user_id == current_user.id)
        .group_by(Study.id)
        .order_by(Study.created_at.desc())
        .offset(offset)
        .limit(size)
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    items = [get_study_response(study, img_count) for study, img_count in rows]
    
    return StudyListResponse(
        items=items,
        total=total,
        page=page,
        size=size,
    )


@router.post("", response_model=StudyResponse, status_code=status.HTTP_201_CREATED)
async def create_study(
    current_user: CurrentUser,
    db: DbSession,
    study_in: StudyCreate,
) -> StudyResponse:
    """Create a new study."""
    study = Study(
        **study_in.model_dump(),
        user_id=current_user.id,
    )
    
    db.add(study)
    await db.commit()
    await db.refresh(study)
    
    return get_study_response(study, 0)


@router.get("/{study_id}", response_model=StudyResponse)
async def get_study(
    study_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> StudyResponse:
    """Get a specific study."""
    query = (
        select(Study, func.count(Image.id).label("image_count"))
        .outerjoin(Image)
        .where(Study.id == study_id, Study.user_id == current_user.id)
        .group_by(Study.id)
    )
    
    result = await db.execute(query)
    row = result.first()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found"
        )
    
    study, image_count = row
    return get_study_response(study, image_count)


@router.delete("/{study_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_study(
    study_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete a study and all associated images."""
    result = await db.execute(
        select(Study).where(Study.id == study_id, Study.user_id == current_user.id)
    )
    study = result.scalar_one_or_none()
    
    if not study:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found"
        )
    
    # Delete study directory
    study_dir = Path(settings.UPLOAD_DIR) / str(study_id)
    if study_dir.exists():
        shutil.rmtree(study_dir)
    
    await db.delete(study)
    await db.commit()


@router.get("/{study_id}/images", response_model=List[ImageResponse])
async def list_study_images(
    study_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> List[Image]:
    """List all images in a study."""
    # Verify study belongs to user
    study_result = await db.execute(
        select(Study).where(Study.id == study_id, Study.user_id == current_user.id)
    )
    if not study_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found"
        )
    
    result = await db.execute(
        select(Image).where(Image.study_id == study_id).order_by(Image.created_at)
    )
    return result.scalars().all()


@router.get("/images/{image_id}/file", response_model=None)
async def get_image_file(
    image_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    format: Optional[str] = Query(None, description="Output format: 'png' to convert DICOM to PNG"),
):
    """Get the actual image file by image ID.

    For DICOM files, pass format=png to convert to PNG for browser display.
    """
    # Get image and verify ownership through study
    result = await db.execute(
        select(Image)
        .join(Study, Image.study_id == Study.id)
        .where(Image.id == image_id, Study.user_id == current_user.id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )

    # Check file exists - handle both absolute and relative paths
    file_path = Path(image.file_path)
    if not file_path.is_absolute():
        # If relative, resolve from current working directory
        file_path = Path.cwd() / image.file_path

    logger.info(f"Serving image file: {file_path} (exists: {file_path.exists()})")

    if not file_path.exists():
        logger.error(f"Image file not found: {file_path}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Image file not found on disk: {image.file_path}"
        )

    # Determine media type based on extension
    ext = file_path.suffix.lower()

    # Check if this is a DICOM file and needs conversion
    is_dicom = ext in ('.dcm', '.dicom')

    # Auto-convert DICOM to PNG for browser compatibility (or if explicitly requested)
    if is_dicom and (format == 'png' or format is None):
        try:
            png_bytes, cached_path = convert_dicom_to_png(file_path)

            # If we have a cached file, serve it directly (faster)
            if cached_path and cached_path.exists():
                return FileResponse(
                    path=str(cached_path),
                    media_type="image/png",
                    filename=f"{image_id}.png",
                )

            # Otherwise stream the bytes
            return StreamingResponse(
                io.BytesIO(png_bytes),
                media_type="image/png",
                headers={
                    "Content-Disposition": f'inline; filename="{image_id}.png"'
                }
            )
        except Exception as e:
            logger.error(f"DICOM conversion failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to convert DICOM file: {str(e)}"
            )

    # Return original file for non-DICOM or if raw DICOM is requested
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".dcm": "application/dicom",
        ".dicom": "application/dicom",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    logger.info(f"Returning file: {file_path}, media_type: {media_type}")

    return FileResponse(
        path=str(file_path.resolve()),
        media_type=media_type,
        filename=image.original_filename or f"{image_id}{ext}",
    )

@router.post("/{study_id}/images", response_model=ImageUploadResponse)
async def upload_image(
    study_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
) -> ImageUploadResponse:
    """Upload an image to a study.

    Uses temp file for atomic upload with proper validation.
    """
    # Verify study belongs to user
    study_result = await db.execute(
        select(Study).where(Study.id == study_id, Study.user_id == current_user.id)
    )
    if not study_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found"
        )

    # Validate file extension using pathlib for safety
    ext = Path(file.filename).suffix.lower().lstrip(".") if file.filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}"
        )

    image_id = uuid.uuid4()
    temp_path: Optional[Path] = None
    final_path: Optional[Path] = None
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    try:
        # Write to temp file with streaming size check
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as temp_file:
            temp_path = Path(temp_file.name)
            total_size = 0

            # Stream chunks to avoid loading entire file into memory
            while chunk := await file.read(8192):
                total_size += len(chunk)
                if total_size > max_size:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB"
                    )
                temp_file.write(chunk)

        file_size = total_size

        # Validate file magic bytes (content type)
        if not _validate_file_magic(temp_path, ext):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File content does not match declared type"
            )

        # Create study directory using absolute path
        upload_base = Path(settings.UPLOAD_DIR)
        if not upload_base.is_absolute():
            upload_base = Path.cwd() / upload_base
        study_dir = upload_base / str(study_id)
        study_dir.mkdir(parents=True, exist_ok=True)

        # Move to final location (atomic on same filesystem)
        final_path = study_dir / f"{image_id}.{ext}"
        shutil.move(str(temp_path), str(final_path))
        temp_path = None  # File has been moved

        logger.info(f"Image saved to: {final_path}")

        # Get image dimensions
        width, height = None, None
        try:
            with PILImage.open(final_path) as img:
                width, height = img.size
        except Exception:
            pass  # Non-image files (DICOM) won't open with PIL

        # Create database record
        image = Image(
            id=image_id,
            study_id=study_id,
            file_path=str(final_path),
            original_filename=file.filename,
            file_size_bytes=file_size,
            width=width,
            height=height,
        )

        db.add(image)
        await db.commit()

        return ImageUploadResponse(
            id=image_id,
            filename=file.filename or "unknown",
            size_bytes=file_size,
            message="Image uploaded successfully"
        )

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Log and clean up on unexpected errors
        error_id = str(uuid.uuid4())[:8]
        logger.error(f"Upload failed [{error_id}]: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed. Error ID: {error_id}"
        )
    finally:
        # Clean up temp file if it still exists
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except Exception:
                pass
