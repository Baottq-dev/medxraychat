"""
MedXrayChat Backend - Middleware Package

Contains custom middleware for request tracking, logging, and other
cross-cutting concerns.
"""
from middleware.request_tracking import RequestTrackingMiddleware

__all__ = ["RequestTrackingMiddleware"]
