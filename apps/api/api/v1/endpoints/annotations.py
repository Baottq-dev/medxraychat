"""
MedXrayChat Backend - Annotation Endpoints

Provides CRUD operations for image annotations with database persistence.
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from pydantic import BaseModel, Field

from models import Image, Study
from api.deps import CurrentUser, DbSession
from core.database import Base
from sqlalchemy import Column, String, Text, ForeignKey, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime


# Annotation Model
class ImageAnnotation(Base):
    """Database model for image annotations."""
    __tablename__ = "image_annotations"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    image_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("images.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    annotation_type: Mapped[str] = mapped_column(String(50))  # freehand, arrow, text, ellipse
    annotation_data: Mapped[dict] = mapped_column(JSON)  # Full annotation JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# Schemas
class AnnotationCreate(BaseModel):
    """Schema for creating an annotation."""
    image_id: uuid.UUID
    annotation_type: str = Field(..., max_length=50)
    annotation_data: dict


class AnnotationResponse(BaseModel):
    """Schema for annotation response."""
    id: uuid.UUID
    image_id: uuid.UUID
    user_id: uuid.UUID
    annotation_type: str
    annotation_data: dict
    created_at: datetime
    
    class Config:
        from_attributes = True


class AnnotationBatchCreate(BaseModel):
    """Schema for batch annotation creation."""
    image_id: uuid.UUID
    annotations: List[dict]


router = APIRouter(prefix="/annotations", tags=["Annotations"])


@router.post("", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    annotation_in: AnnotationCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> AnnotationResponse:
    """Create a new annotation for an image."""
    # Verify image ownership
    img_result = await db.execute(
        select(Image)
        .join(Study)
        .where(Image.id == annotation_in.image_id, Study.user_id == current_user.id)
    )
    if not img_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    annotation = ImageAnnotation(
        image_id=annotation_in.image_id,
        user_id=current_user.id,
        annotation_type=annotation_in.annotation_type,
        annotation_data=annotation_in.annotation_data,
    )
    
    db.add(annotation)
    await db.commit()
    await db.refresh(annotation)
    
    return annotation


@router.get("/image/{image_id}", response_model=List[AnnotationResponse])
async def get_image_annotations(
    image_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> List[AnnotationResponse]:
    """Get all annotations for an image."""
    # Verify image ownership
    img_result = await db.execute(
        select(Image)
        .join(Study)
        .where(Image.id == image_id, Study.user_id == current_user.id)
    )
    if not img_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    result = await db.execute(
        select(ImageAnnotation)
        .where(ImageAnnotation.image_id == image_id)
        .order_by(ImageAnnotation.created_at)
    )
    return result.scalars().all()


@router.post("/batch", response_model=List[AnnotationResponse])
async def create_annotations_batch(
    batch: AnnotationBatchCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> List[AnnotationResponse]:
    """Create multiple annotations for an image in one request."""
    # Verify image ownership
    img_result = await db.execute(
        select(Image)
        .join(Study)
        .where(Image.id == batch.image_id, Study.user_id == current_user.id)
    )
    if not img_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    created = []
    for ann_data in batch.annotations:
        annotation = ImageAnnotation(
            image_id=batch.image_id,
            user_id=current_user.id,
            annotation_type=ann_data.get("type", "unknown"),
            annotation_data=ann_data,
        )
        db.add(annotation)
        created.append(annotation)
    
    await db.commit()
    
    for ann in created:
        await db.refresh(ann)
    
    return created


@router.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    annotation_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete an annotation."""
    result = await db.execute(
        select(ImageAnnotation).where(
            ImageAnnotation.id == annotation_id,
            ImageAnnotation.user_id == current_user.id
        )
    )
    annotation = result.scalar_one_or_none()
    
    if not annotation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Annotation not found"
        )
    
    await db.delete(annotation)
    await db.commit()


@router.delete("/image/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_image_annotations(
    image_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Delete all annotations for an image."""
    # Verify image ownership
    img_result = await db.execute(
        select(Image)
        .join(Study)
        .where(Image.id == image_id, Study.user_id == current_user.id)
    )
    if not img_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    result = await db.execute(
        select(ImageAnnotation).where(ImageAnnotation.image_id == image_id)
    )
    annotations = result.scalars().all()
    
    for ann in annotations:
        await db.delete(ann)
    
    await db.commit()
