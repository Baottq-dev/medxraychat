"""
MedXrayChat Backend - Rate Limiting Configuration

Provides rate limiting functionality using slowapi.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def is_options_request(request: Request) -> bool:
    """Check if request is OPTIONS (CORS preflight)."""
    return request.method == "OPTIONS"


# Rate limiter instance using client IP address as key
# Exempt OPTIONS requests from rate limiting (CORS preflight)
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
)
