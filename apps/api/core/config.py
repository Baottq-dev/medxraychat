"""
MedXrayChat Backend - Application Settings
"""
import secrets
from functools import lru_cache
from typing import Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Default key for development only - NEVER use in production
_DEFAULT_SECRET_KEY = "your-super-secret-key-change-in-production"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # Application
    APP_NAME: str = "MedXrayChat"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Security
    SECRET_KEY: str = _DEFAULT_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str, info) -> str:
        """Validate SECRET_KEY is secure in production."""
        # Get DEBUG from values if available (during validation)
        values = info.data if hasattr(info, 'data') else {}
        is_debug = values.get("DEBUG", False)

        if v == _DEFAULT_SECRET_KEY and not is_debug:
            raise ValueError(
                "SECRET_KEY must be changed from default in production! "
                "Set SECRET_KEY environment variable to a secure random value. "
                f"Example: SECRET_KEY={secrets.token_urlsafe(32)}"
            )

        if len(v) < 32 and not is_debug:
            raise ValueError(
                "SECRET_KEY must be at least 32 characters in production"
            )

        return v
    
    # Database
    POSTGRES_USER: str = "medxray"
    POSTGRES_PASSWORD: str = "medxray_secret"
    POSTGRES_DB: str = "medxraychat"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    
    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )
    
    @property
    def DATABASE_URL_SYNC(self) -> str:
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # AI Server (separate GPU server)
    AI_SERVER_URL: str = "http://localhost:8001"
    AI_REQUEST_TIMEOUT: int = 120  # seconds
    
    # Local AI (if running on same machine)
    YOLO_MODEL_PATH: str = "weights/yolo/best.pt"
    QWEN_MODEL_NAME: str = "Qwen/Qwen3-VL-7B"
    
    # Storage
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 100
    ALLOWED_EXTENSIONS: set = {"png", "jpg", "jpeg", "dicom", "dcm"}
    
    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:3000"]

    # AI Processing
    AI_THREAD_WORKERS: int = 4
    AI_DEVICE: str = "cuda"  # 'auto', 'cuda', 'cpu', 'cuda:0', etc.
    PRELOAD_AI_MODELS: bool = True
    QWEN_MAX_CONTEXT_TOKENS: int = 4096
    
    # Mock mode for testing without Qwen model
    MOCK_QWEN_SERVICE: bool = True  # Set to False when you have the real model

    # Logging Configuration
    LOG_JSON_FORMAT: bool = False  # True for production (JSON logs)
    LOG_LEVEL: str = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL
    LOG_FILE: Optional[str] = None  # Optional log file path

    # Retry Configuration
    RETRY_MAX_ATTEMPTS: int = 3
    RETRY_MIN_WAIT: float = 1.0  # seconds
    RETRY_MAX_WAIT: float = 10.0  # seconds

    # Circuit Breaker Configuration
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 3
    CIRCUIT_BREAKER_RECOVERY_TIMEOUT: float = 60.0  # seconds
    CIRCUIT_BREAKER_SUCCESS_THRESHOLD: int = 2

    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(cls, v: list[str], info) -> list[str]:
        """Validate CORS origins are not wildcarded in production."""
        values = info.data if hasattr(info, 'data') else {}
        is_debug = values.get("DEBUG", False)

        if "*" in v and not is_debug:
            raise ValueError(
                "CORS_ORIGINS cannot contain '*' in production. "
                "Specify allowed origins explicitly."
            )

        return v


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
