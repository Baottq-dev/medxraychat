"""
MedXrayChat Backend - Structured Logging Configuration

Provides structured logging setup with request correlation IDs,
JSON formatting for production, and human-readable format for development.
"""
import sys
import uuid
import json
from contextvars import ContextVar
from typing import Optional, Any
from loguru import logger


# Context variable for request ID - works across async boundaries
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)

# Context variable for additional context (user_id, session_id, etc.)
log_context_var: ContextVar[dict] = ContextVar("log_context", default={})


def get_request_id() -> Optional[str]:
    """Get current request ID from context.

    Returns:
        The current request ID or None if not set
    """
    return request_id_var.get()


def set_request_id(request_id: Optional[str] = None) -> str:
    """Set request ID in context.

    Args:
        request_id: Request ID to set, or None to generate new one

    Returns:
        The request ID that was set
    """
    if request_id is None:
        request_id = str(uuid.uuid4())[:8]
    request_id_var.set(request_id)
    return request_id


def clear_request_id() -> None:
    """Clear request ID from context."""
    request_id_var.set(None)


def set_log_context(**kwargs) -> None:
    """Set additional context for logging.

    Args:
        **kwargs: Key-value pairs to add to log context
    """
    current = log_context_var.get()
    log_context_var.set({**current, **kwargs})


def clear_log_context() -> None:
    """Clear additional log context."""
    log_context_var.set({})


def json_formatter(record: dict) -> str:
    """Format log record as JSON for production logging.

    Args:
        record: Loguru record dict

    Returns:
        JSON formatted string
    """
    log_entry = {
        "timestamp": record["time"].strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "level": record["level"].name,
        "message": record["message"],
        "module": record["module"],
        "function": record["function"],
        "line": record["line"],
    }

    # Add request ID if available
    request_id = request_id_var.get()
    if request_id:
        log_entry["request_id"] = request_id

    # Add extra context from log_context_var
    extra_context = log_context_var.get()
    if extra_context:
        log_entry.update(extra_context)

    # Add any extra fields from the log call
    if record["extra"]:
        # Filter out internal loguru fields
        for key, value in record["extra"].items():
            if not key.startswith("_"):
                log_entry[key] = value

    # Include exception info if present
    if record["exception"]:
        exc = record["exception"]
        log_entry["exception"] = {
            "type": exc.type.__name__ if exc.type else None,
            "value": str(exc.value) if exc.value else None,
            "traceback": "".join(exc.traceback.format()) if exc.traceback else None,
        }

    return json.dumps(log_entry, ensure_ascii=False, default=str) + "\n"


def human_formatter(record: dict) -> str:
    """Format log record for human-readable output.

    Args:
        record: Loguru record dict

    Returns:
        Formatted string
    """
    request_id = request_id_var.get() or "-"

    # Build extra context string
    extra_parts = []
    extra_context = log_context_var.get()
    if extra_context:
        for key, value in extra_context.items():
            extra_parts.append(f"{key}={value}")

    if record["extra"]:
        for key, value in record["extra"].items():
            if not key.startswith("_"):
                extra_parts.append(f"{key}={value}")

    extra_str = " | " + " ".join(extra_parts) if extra_parts else ""

    return (
        f"<green>{record['time']:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        f"<level>{record['level'].name: <8}</level> | "
        f"<cyan>[{request_id}]</cyan> | "
        f"<cyan>{record['module']}</cyan>:<cyan>{record['function']}</cyan>:"
        f"<cyan>{record['line']}</cyan> - "
        f"<level>{record['message']}</level>{extra_str}\n"
    )


def setup_logging(
    json_output: bool = False,
    log_level: str = "INFO",
    log_file: Optional[str] = None,
) -> None:
    """Configure application logging.

    Args:
        json_output: Use JSON format (for production/log aggregation)
        log_level: Minimum log level to output
        log_file: Optional file path for log output
    """
    # Remove default handler
    logger.remove()

    if json_output:
        # JSON format for production
        logger.add(
            sys.stderr,
            format=json_formatter,
            level=log_level,
            serialize=False,
        )
    else:
        # Human-readable format for development
        logger.add(
            sys.stderr,
            format=human_formatter,
            level=log_level,
            colorize=True,
        )

    # Add file handler if specified
    if log_file:
        logger.add(
            log_file,
            format=json_formatter,  # Always JSON for files
            level=log_level,
            rotation="100 MB",
            retention="7 days",
            compression="gz",
        )

    logger.info(
        f"Logging configured: level={log_level}, json={json_output}, file={log_file or 'None'}"
    )


def log_with_context(
    level: str,
    message: str,
    **extra: Any
) -> None:
    """Log a message with automatic context injection.

    Args:
        level: Log level (debug, info, warning, error, critical)
        message: Log message
        **extra: Additional fields to include in log
    """
    log_func = getattr(logger, level.lower(), logger.info)

    # Merge extra context
    merged_extra = {**log_context_var.get(), **extra}
    request_id = request_id_var.get()
    if request_id:
        merged_extra["request_id"] = request_id

    log_func(message, **merged_extra)
