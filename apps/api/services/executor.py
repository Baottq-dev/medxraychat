"""
MedXrayChat Backend - Shared Thread Pool Executor

Provides a shared ThreadPoolExecutor for AI inference operations
to avoid creating multiple independent pools.
"""
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from loguru import logger

from core.config import settings


_executor: Optional[ThreadPoolExecutor] = None


def get_executor() -> ThreadPoolExecutor:
    """Get the shared ThreadPoolExecutor instance.

    Creates the executor on first call (lazy initialization).
    Worker count is configurable via AI_THREAD_WORKERS setting.
    """
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(
            max_workers=settings.AI_THREAD_WORKERS,
            thread_name_prefix="ai_worker_"
        )
        logger.info(f"Created ThreadPoolExecutor with {settings.AI_THREAD_WORKERS} workers")
    return _executor


def shutdown_executor(wait: bool = True) -> None:
    """Shutdown the shared executor.

    Should be called during application shutdown.

    Args:
        wait: If True, wait for all pending tasks to complete.
    """
    global _executor
    if _executor is not None:
        logger.info("Shutting down ThreadPoolExecutor...")
        _executor.shutdown(wait=wait)
        _executor = None
        logger.info("ThreadPoolExecutor shutdown complete")
