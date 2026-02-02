"""
MedXrayChat Backend - Circuit Breaker Pattern

Implements the circuit breaker pattern to prevent cascading failures
when external services or AI models are experiencing issues.
"""
import time
import threading
from enum import Enum
from typing import TypeVar, Callable, Optional
from dataclasses import dataclass
from loguru import logger

from core.exceptions import CircuitBreakerOpenError

T = TypeVar('T')


class CircuitState(Enum):
    """States for the circuit breaker."""
    CLOSED = "closed"        # Normal operation, requests pass through
    OPEN = "open"            # Failing fast, requests are rejected
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker behavior.

    Attributes:
        failure_threshold: Number of failures before opening circuit
        recovery_timeout: Seconds to wait before attempting recovery
        success_threshold: Successes needed in half-open to close circuit
    """
    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    success_threshold: int = 2


class CircuitBreaker:
    """Circuit breaker for protecting service calls.

    The circuit breaker has three states:
    - CLOSED: Normal operation, all requests pass through
    - OPEN: Service is failing, requests are rejected immediately
    - HALF_OPEN: Testing recovery, limited requests allowed

    Example:
        breaker = CircuitBreaker("yolo")

        def detect(image):
            return breaker.call(yolo_model.predict, image)
    """

    def __init__(self, name: str, config: Optional[CircuitBreakerConfig] = None):
        """Initialize circuit breaker.

        Args:
            name: Name for logging and identification
            config: Configuration options
        """
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[float] = None
        self._lock = threading.Lock()

    @property
    def state(self) -> CircuitState:
        """Get current circuit state, checking for recovery timeout."""
        with self._lock:
            if self._state == CircuitState.OPEN:
                # Check if recovery timeout has passed
                if self._last_failure_time is not None:
                    elapsed = time.time() - self._last_failure_time
                    if elapsed >= self.config.recovery_timeout:
                        self._state = CircuitState.HALF_OPEN
                        self._success_count = 0
                        logger.info(
                            f"Circuit breaker '{self.name}' entering HALF_OPEN state "
                            f"after {elapsed:.1f}s"
                        )
            return self._state

    @property
    def is_closed(self) -> bool:
        """Check if circuit is closed (normal operation)."""
        return self.state == CircuitState.CLOSED

    @property
    def is_open(self) -> bool:
        """Check if circuit is open (rejecting requests)."""
        return self.state == CircuitState.OPEN

    def call(self, func: Callable[..., T], *args, **kwargs) -> T:
        """Execute function with circuit breaker protection.

        Args:
            func: Function to call
            *args: Positional arguments for func
            **kwargs: Keyword arguments for func

        Returns:
            Result from func

        Raises:
            CircuitBreakerOpenError: If circuit is open
            Exception: Any exception from func (also recorded as failure)
        """
        current_state = self.state

        if current_state == CircuitState.OPEN:
            logger.warning(f"Circuit breaker '{self.name}' is OPEN, rejecting request")
            raise CircuitBreakerOpenError(self.name)

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure(e)
            raise

    def _on_success(self) -> None:
        """Handle successful call."""
        with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                logger.debug(
                    f"Circuit breaker '{self.name}' success in HALF_OPEN: "
                    f"{self._success_count}/{self.config.success_threshold}"
                )
                if self._success_count >= self.config.success_threshold:
                    self._state = CircuitState.CLOSED
                    self._failure_count = 0
                    logger.info(
                        f"Circuit breaker '{self.name}' CLOSED after successful recovery"
                    )
            elif self._state == CircuitState.CLOSED:
                # Reset failure count on success
                self._failure_count = 0

    def _on_failure(self, exception: Exception) -> None:
        """Handle failed call.

        Args:
            exception: The exception that occurred
        """
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()

            if self._state == CircuitState.HALF_OPEN:
                # Any failure in half-open reopens the circuit
                self._state = CircuitState.OPEN
                logger.warning(
                    f"Circuit breaker '{self.name}' re-opened after failure in HALF_OPEN: "
                    f"{type(exception).__name__}: {exception}"
                )
            elif self._failure_count >= self.config.failure_threshold:
                self._state = CircuitState.OPEN
                logger.warning(
                    f"Circuit breaker '{self.name}' OPENED after {self._failure_count} "
                    f"consecutive failures. Last error: {type(exception).__name__}: {exception}"
                )
            else:
                logger.debug(
                    f"Circuit breaker '{self.name}' failure "
                    f"{self._failure_count}/{self.config.failure_threshold}: "
                    f"{type(exception).__name__}"
                )

    def reset(self) -> None:
        """Manually reset circuit breaker to closed state."""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._success_count = 0
            self._last_failure_time = None
            logger.info(f"Circuit breaker '{self.name}' manually reset to CLOSED")

    def get_status(self) -> dict:
        """Get current circuit breaker status.

        Returns:
            Dict with state, failure count, and timing info
        """
        with self._lock:
            return {
                "name": self.name,
                "state": self._state.value,
                "failure_count": self._failure_count,
                "success_count": self._success_count,
                "last_failure": self._last_failure_time,
                "config": {
                    "failure_threshold": self.config.failure_threshold,
                    "recovery_timeout": self.config.recovery_timeout,
                    "success_threshold": self.config.success_threshold,
                }
            }


# Global circuit breakers for AI services
yolo_circuit = CircuitBreaker(
    "yolo",
    CircuitBreakerConfig(
        failure_threshold=3,
        recovery_timeout=60.0,
        success_threshold=2,
    )
)

qwen_circuit = CircuitBreaker(
    "qwen",
    CircuitBreakerConfig(
        failure_threshold=3,
        recovery_timeout=120.0,  # Longer recovery for larger model
        success_threshold=2,
    )
)
