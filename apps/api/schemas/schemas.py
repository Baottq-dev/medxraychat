"""
MedXrayChat Backend - Pydantic Schemas
"""
import re
import uuid
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field, field_validator


# ============== Auth Schemas ==============

class Token(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"


class LoginResponse(BaseModel):
    """Login response with user info and tokens."""
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: "UserResponse"


class TokenPayload(BaseModel):
    """JWT token payload."""
    sub: str
    email: str
    role: str


class UserCreate(BaseModel):
    """Schema for creating a new user."""
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, max_length=255)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Validate password has required complexity."""
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """Schema for user response."""
    id: uuid.UUID
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============== Study Schemas ==============

class StudyCreate(BaseModel):
    """Schema for creating a study."""
    patient_id: Optional[str] = Field(None, max_length=64)
    patient_name: Optional[str] = Field(None, max_length=255)
    patient_age: Optional[int] = Field(None, ge=0, le=150)
    patient_sex: Optional[str] = Field(None, max_length=10)
    study_date: Optional[datetime] = None
    modality: str = Field("CR", max_length=20)
    description: Optional[str] = Field(None, max_length=5000)


class StudyResponse(BaseModel):
    """Schema for study response."""
    id: uuid.UUID
    patient_id: Optional[str]
    patient_name: Optional[str]
    patient_age: Optional[int]
    patient_sex: Optional[str]
    study_date: Optional[datetime]
    modality: str
    description: Optional[str]
    image_count: int = 0
    created_at: datetime
    
    class Config:
        from_attributes = True


class StudyListResponse(BaseModel):
    """Schema for paginated study list."""
    items: List[StudyResponse]
    total: int
    page: int
    size: int


# ============== Image Schemas ==============

class ImageResponse(BaseModel):
    """Schema for image response."""
    id: uuid.UUID
    study_id: uuid.UUID
    file_path: str
    original_filename: Optional[str]
    width: Optional[int]
    height: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True


class ImageUploadResponse(BaseModel):
    """Schema for image upload response."""
    id: uuid.UUID
    filename: str
    size_bytes: int
    message: str = "Image uploaded successfully"


# ============== AI Schemas ==============

class BoundingBox(BaseModel):
    """Bounding box schema."""
    x1: float
    y1: float
    x2: float
    y2: float


class Detection(BaseModel):
    """Single detection result."""
    class_id: int
    class_name: str
    confidence: float
    bbox: BoundingBox
    source: str = "yolo"  # 'yolo', 'qwen', 'fused'


class AIAnalyzeRequest(BaseModel):
    """Request for AI analysis."""
    image_id: uuid.UUID
    run_yolo: bool = True
    run_qwen: bool = True
    question: Optional[str] = Field(None, max_length=2000)  # Optional question for Qwen-VL


class AIAnalyzeResponse(BaseModel):
    """Response from AI analysis."""
    image_id: uuid.UUID
    yolo_detections: List[Detection]
    qwen_detections: List[Detection]
    fused_detections: List[Detection]
    analysis_text: Optional[str]
    processing_time_ms: int

    class Config:
        from_attributes = True


class AIChatRequest(BaseModel):
    """Request for AI chat."""
    message: str = Field(..., min_length=1, max_length=10000)
    image_id: Optional[uuid.UUID] = None
    include_detections: bool = True


class AIChatResponse(BaseModel):
    """Response from AI chat."""
    response: str
    bbox_references: List[Detection] = []
    tokens_used: Optional[int] = None


# ============== Chat Schemas ==============

class ChatSessionCreate(BaseModel):
    """Schema for creating a chat session."""
    study_id: uuid.UUID
    title: Optional[str] = Field(None, max_length=255)


class ChatSessionResponse(BaseModel):
    """Schema for chat session response."""
    id: uuid.UUID
    study_id: uuid.UUID
    title: Optional[str]
    is_active: bool
    message_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatMessageCreate(BaseModel):
    """Schema for creating a chat message."""
    content: str = Field(..., min_length=1, max_length=10000)
    image_id: Optional[uuid.UUID] = None


class ChatMessageResponse(BaseModel):
    """Schema for chat message response."""
    id: uuid.UUID
    role: str
    content: str
    image_id: Optional[uuid.UUID]
    bbox_references: List[Any] = []
    tokens_used: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============== Report Schemas ==============

class ReportCreate(BaseModel):
    """Schema for creating a diagnosis report."""
    study_id: uuid.UUID
    findings: Optional[str] = Field(None, max_length=20000)
    impression: Optional[str] = Field(None, max_length=5000)
    recommendations: Optional[str] = Field(None, max_length=5000)


class ReportResponse(BaseModel):
    """Schema for report response."""
    id: uuid.UUID
    study_id: uuid.UUID
    findings: Optional[str]
    impression: Optional[str]
    recommendations: Optional[str]
    is_ai_generated: bool
    is_finalized: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============== WebSocket Schemas ==============

class WSMessage(BaseModel):
    """WebSocket message format."""
    type: str  # 'chat', 'detection', 'status'
    payload: dict


class WSChatMessage(BaseModel):
    """WebSocket chat message."""
    content: str = Field(..., min_length=1, max_length=10000)
    image_id: Optional[uuid.UUID] = None


# ============== Dashboard Schemas ==============

class DashboardStatsResponse(BaseModel):
    """Schema for dashboard statistics response."""
    total_studies: int
    analyses_today: int
    chat_sessions: int
    reports: int


# ============== Tool Calling Schemas ==============

class ToolCallSchema(BaseModel):
    """Schema for a tool call from LLM."""
    name: str
    args: dict = {}


class ToolCallResponse(BaseModel):
    """Schema for tool call in chat response."""
    tool_name: str
    tool_args: dict = {}
    executed: bool = False
    result_summary: Optional[str] = None


class ChatMessageCreateWithTools(BaseModel):
    """Schema for creating a chat message with tool support."""
    content: str = Field(..., min_length=1, max_length=10000)
    image_id: Optional[uuid.UUID] = None
    force_tool: Optional[str] = None  # Force specific tool (for testing)
