"""
MedXrayChat Backend - Custom Exceptions and Error Handlers

Provides structured exception hierarchy and FastAPI exception handlers
for consistent error responses across the application.
"""
import uuid
from typing import Optional, Any
from fastapi import Request
from fastapi.responses import JSONResponse
from loguru import logger


class MedXrayChatError(Exception):
    """Base exception for all application errors.

    Attributes:
        message: Human-readable error message
        code: Machine-readable error code
        details: Additional context about the error
    """

    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        details: Any = None
    ):
        self.message = message
        self.code = code
        self.details = details
        super().__init__(message)


class AIServiceError(MedXrayChatError):
    """Base exception for AI service related errors."""
    pass


class ModelNotLoadedError(AIServiceError):
    """Raised when an AI model is not loaded or unavailable."""

    def __init__(self, model_name: str):
        super().__init__(
            message=f"Model '{model_name}' is not loaded or unavailable",
            code="MODEL_NOT_LOADED",
            details={"model": model_name}
        )


class InferenceError(AIServiceError):
    """Raised when AI inference fails."""

    def __init__(self, message: str, model: Optional[str] = None):
        super().__init__(
            message=message,
            code="INFERENCE_FAILED",
            details={"model": model} if model else None
        )


class GPUMemoryError(AIServiceError):
    """Raised when GPU memory is exhausted."""

    def __init__(self, message: str = None):
        super().__init__(
            message=message or "GPU memory exhausted. Please try again shortly.",
            code="GPU_OOM"
        )


class CircuitBreakerOpenError(MedXrayChatError):
    """Raised when circuit breaker is open and rejecting requests."""

    def __init__(self, service_name: str):
        super().__init__(
            message=f"Service '{service_name}' is temporarily unavailable. Please try again later.",
            code="SERVICE_UNAVAILABLE",
            details={"service": service_name}
        )


class ToolCallError(MedXrayChatError):
    """Raised when tool call parsing or execution fails."""

    def __init__(self, message: str, tool_name: Optional[str] = None):
        super().__init__(
            message=message,
            code="TOOL_CALL_ERROR",
            details={"tool": tool_name} if tool_name else None
        )


class ValidationError(MedXrayChatError):
    """Raised when input validation fails."""

    def __init__(self, message: str, field: Optional[str] = None):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            details={"field": field} if field else None
        )


# Exception Handlers for FastAPI

async def medxraychat_exception_handler(
    request: Request,
    exc: MedXrayChatError
) -> JSONResponse:
    """Handle MedXrayChatError exceptions with structured response.

    Args:
        request: The incoming request
        exc: The exception that was raised

    Returns:
        JSONResponse with error details
    """
    error_id = str(uuid.uuid4())[:8]

    # Determine status code based on error type
    status_code = 500
    if isinstance(exc, CircuitBreakerOpenError):
        status_code = 503  # Service Unavailable
    elif isinstance(exc, ValidationError):
        status_code = 400  # Bad Request
    elif isinstance(exc, ModelNotLoadedError):
        status_code = 503  # Service Unavailable

    logger.error(
        f"Application error [{error_id}]: {exc.code} - {exc.message}",
        extra={
            "error_id": error_id,
            "error_code": exc.code,
            "details": exc.details,
            "path": request.url.path,
        }
    )

    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "error_id": error_id,
                "details": exc.details,
            }
        }
    )


async def generic_exception_handler(
    request: Request,
    exc: Exception
) -> JSONResponse:
    """Catch-all handler for unhandled exceptions.

    Args:
        request: The incoming request
        exc: The exception that was raised

    Returns:
        JSONResponse with generic error message
    """
    error_id = str(uuid.uuid4())[:8]

    logger.error(
        f"Unhandled exception [{error_id}]: {type(exc).__name__}: {str(exc)}",
        extra={
            "error_id": error_id,
            "error_type": type(exc).__name__,
            "path": request.url.path,
        },
        exc_info=True,
    )

    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An internal error occurred. Please try again.",
                "error_id": error_id,
            }
        }
    )
