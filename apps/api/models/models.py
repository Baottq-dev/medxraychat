"""
MedXrayChat Backend - SQLAlchemy Models
"""
import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Integer, Boolean, Float, ForeignKey, JSON, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from core.database import Base


class User(Base):
    """User model."""
    __tablename__ = "users"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="doctor")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    # Relationships
    studies: Mapped[List["Study"]] = relationship(back_populates="user")
    chat_sessions: Mapped[List["ChatSession"]] = relationship(back_populates="user")


class Study(Base):
    """Medical imaging study."""
    __tablename__ = "studies"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    patient_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    patient_age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    patient_sex: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    study_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    modality: Mapped[str] = mapped_column(String(16), default="CR")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user: Mapped[Optional["User"]] = relationship(back_populates="studies")
    images: Mapped[List["Image"]] = relationship(back_populates="study", cascade="all, delete-orphan")
    chat_sessions: Mapped[List["ChatSession"]] = relationship(back_populates="study")
    reports: Mapped[List["DiagnosisReport"]] = relationship(back_populates="study")


class Image(Base):
    """X-ray image within a study."""
    __tablename__ = "images"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    study_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("studies.id", ondelete="CASCADE"), index=True
    )
    file_path: Mapped[str] = mapped_column(String(512))
    original_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bits_stored: Mapped[int] = mapped_column(Integer, default=8)
    window_center: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    window_width: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    study: Mapped["Study"] = relationship(back_populates="images")
    ai_results: Mapped[List["AIResult"]] = relationship(back_populates="image", cascade="all, delete-orphan")


class AIResult(Base):
    """AI analysis results for an image."""
    __tablename__ = "ai_results"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    image_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("images.id", ondelete="CASCADE"), index=True
    )
    # Detection results as JSON
    yolo_detections: Mapped[dict] = mapped_column(JSON, default=list)
    qwen_detections: Mapped[dict] = mapped_column(JSON, default=list)
    fused_detections: Mapped[dict] = mapped_column(JSON, default=list)
    # Analysis text from Qwen-VL
    analysis_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Model versions
    yolo_model_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    qwen_model_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    processing_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    image: Mapped["Image"] = relationship(back_populates="ai_results")


class ChatSession(Base):
    """Chat session for AI-assisted diagnosis."""
    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    study_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("studies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    # Relationships
    study: Mapped["Study"] = relationship(back_populates="chat_sessions")
    user: Mapped[Optional["User"]] = relationship(back_populates="chat_sessions")
    messages: Mapped[List["ChatMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class ChatMessage(Base):
    """Individual message in a chat session."""
    __tablename__ = "chat_messages"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))  # 'user', 'assistant', 'system'
    content: Mapped[str] = mapped_column(Text)
    image_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("images.id", ondelete="SET NULL"), nullable=True, index=True
    )
    bbox_references: Mapped[dict] = mapped_column(JSON, default=list)
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    session: Mapped["ChatSession"] = relationship(back_populates="messages")


class DiagnosisReport(Base):
    """Diagnosis report generated from AI analysis."""
    __tablename__ = "diagnosis_reports"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    study_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("studies.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    findings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    impression: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recommendations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=True)
    is_finalized: Mapped[bool] = mapped_column(Boolean, default=False)
    finalized_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    # Relationships
    study: Mapped["Study"] = relationship(back_populates="reports")
