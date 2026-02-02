"""
MedXrayChat Backend - Retry Utilities

Provides retry decorators and utilities using tenacity library
for handling transient failures in AI service calls.
"""
from typing import TypeVar, Callable, Set, Type, Optional
from functools import wraps
from loguru import logger

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
    RetryError,
)

T = TypeVar('T')

# Import exceptions (avoid circular import by importing inside functions if needed)
from core.exceptions import InferenceError, GPUMemoryError


# Default retry configuration
DEFAULT_RETRY_EXCEPTIONS: Set[Type[Exception]] = {
    InferenceError,
    GPUMemoryError,
    RuntimeError,
    TimeoutError,
}


def with_retry(
    max_attempts: int = 3,
    min_wait: float = 1.0,
    max_wait: float = 10.0,
    retry_exceptions: Optional[Set[Type[Exception]]] = None,
    reraise: bool = True,
):
    """Decorator for adding retry logic to functions.

    Uses exponential backoff between retry attempts.

    Args:
        max_attempts: Maximum number of retry attempts
        min_wait: Minimum wait time between retries (seconds)
        max_wait: Maximum wait time between retries (seconds)
        retry_exceptions: Set of exception types to retry on
        reraise: Whether to reraise the last exception after all retries fail

    Returns:
        Decorated function with retry logic

    Example:
        @with_retry(max_attempts=3)
        def detect_objects(image):
            # This will retry up to 3 times on InferenceError
            return model.predict(image)
    """
    if retry_exceptions is None:
        retry_exceptions = DEFAULT_RETRY_EXCEPTIONS

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @retry(
            stop=stop_after_attempt(max_attempts),
            wait=wait_exponential(multiplier=1, min=min_wait, max=max_wait),
            retry=retry_if_exception_type(tuple(retry_exceptions)),
            before_sleep=before_sleep_log(logger, log_level="WARNING"),
            reraise=reraise,
        )
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            return func(*args, **kwargs)
        return wrapper
    return decorator


def retry_on_gpu_error(func: Callable[..., T]) -> Callable[..., T]:
    """Specialized retry decorator for GPU-related errors.

    Retries on GPU memory errors with longer wait times
    to allow memory to be freed.

    Args:
        func: Function to wrap

    Returns:
        Wrapped function with GPU-specific retry logic
    """
    return with_retry(
        max_attempts=2,
        min_wait=2.0,
        max_wait=15.0,
        retry_exceptions={GPUMemoryError, RuntimeError},
    )(func)


def retry_on_inference_error(func: Callable[..., T]) -> Callable[..., T]:
    """Specialized retry decorator for inference errors.

    Args:
        func: Function to wrap

    Returns:
        Wrapped function with inference-specific retry logic
    """
    return with_retry(
        max_attempts=3,
        min_wait=1.0,
        max_wait=10.0,
        retry_exceptions={InferenceError, TimeoutError},
    )(func)


class RetryContext:
    """Context manager for retry logic with custom handling.

    Useful when you need more control over retry behavior.

    Example:
        with RetryContext(max_attempts=3) as ctx:
            while ctx.should_retry():
                try:
                    result = risky_operation()
                    break
                except Exception as e:
                    ctx.record_failure(e)
    """

    def __init__(
        self,
        max_attempts: int = 3,
        retry_exceptions: Optional[Set[Type[Exception]]] = None
    ):
        self.max_attempts = max_attempts
        self.retry_exceptions = retry_exceptions or DEFAULT_RETRY_EXCEPTIONS
        self.attempt = 0
        self.last_exception: Optional[Exception] = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False  # Don't suppress exceptions

    def should_retry(self) -> bool:
        """Check if another retry attempt should be made."""
        return self.attempt < self.max_attempts

    def record_failure(self, exception: Exception) -> None:
        """Record a failed attempt.

        Args:
            exception: The exception that caused the failure
        """
        self.attempt += 1
        self.last_exception = exception

        if self.attempt < self.max_attempts:
            logger.warning(
                f"Attempt {self.attempt}/{self.max_attempts} failed: {exception}. "
                f"Retrying..."
            )
        else:
            logger.error(
                f"All {self.max_attempts} attempts failed. Last error: {exception}"
            )

    def should_retry_exception(self, exception: Exception) -> bool:
        """Check if the exception type should trigger a retry.

        Args:
            exception: The exception to check

        Returns:
            True if the exception should trigger a retry
        """
        return isinstance(exception, tuple(self.retry_exceptions))
