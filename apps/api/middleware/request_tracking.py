"""
MedXrayChat Backend - Request Tracking Middleware

Provides request tracking with correlation IDs for distributed tracing
and structured logging across the request lifecycle.
"""
import time
import uuid
from typing import Callable
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from loguru import logger

from core.logging import (
    set_request_id,
    clear_request_id,
    set_log_context,
    clear_log_context,
)


class RequestTrackingMiddleware(BaseHTTPMiddleware):
    """Middleware for request tracking and logging.

    Features:
    - Generates or extracts X-Request-ID for each request
    - Logs request start and completion with timing
    - Binds request context for all downstream logging
    - Adds X-Request-ID to response headers
    """

    REQUEST_ID_HEADER = "X-Request-ID"

    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """Process request with tracking.

        Args:
            request: The incoming request
            call_next: Next middleware/handler in chain

        Returns:
            Response with tracking headers added
        """
        # Generate or extract request ID
        request_id = request.headers.get(self.REQUEST_ID_HEADER)
        if not request_id:
            request_id = str(uuid.uuid4())[:8]

        # Set request ID in context for logging
        set_request_id(request_id)

        # Set additional context
        set_log_context(
            method=request.method,
            path=request.url.path,
            client_ip=self._get_client_ip(request),
        )

        start_time = time.perf_counter()

        # Log request start
        logger.info(
            f"Request started: {request.method} {request.url.path}",
            query_params=str(request.query_params) if request.query_params else None,
        )

        try:
            # Process request
            response = await call_next(request)

            # Calculate duration
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Add request ID to response headers
            response.headers[self.REQUEST_ID_HEADER] = request_id

            # Log request completion
            logger.info(
                f"Request completed: {response.status_code} in {duration_ms:.2f}ms",
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2),
            )

            return response

        except Exception as e:
            # Calculate duration for failed request
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Log error
            logger.error(
                f"Request failed: {type(e).__name__}: {str(e)}",
                error_type=type(e).__name__,
                duration_ms=round(duration_ms, 2),
                exc_info=True,
            )

            # Re-raise to let exception handlers deal with it
            raise

        finally:
            # Clean up context
            clear_request_id()
            clear_log_context()

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request.

        Handles X-Forwarded-For header for proxied requests.

        Args:
            request: The incoming request

        Returns:
            Client IP address
        """
        # Check for forwarded header (behind proxy/load balancer)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            # Take the first IP (original client)
            return forwarded.split(",")[0].strip()

        # Fall back to direct client
        if request.client:
            return request.client.host

        return "unknown"
