"""
MedXrayChat Backend - Thread-Safe Singleton Pattern

Provides a thread-safe singleton implementation using double-checked locking
to ensure only one instance is created even under concurrent access.
"""
import threading
from typing import TypeVar, Callable, Dict, Any

T = TypeVar('T')


class ThreadSafeSingleton:
    """Thread-safe singleton container with double-checked locking.

    Usage:
        def get_my_service() -> MyService:
            return ThreadSafeSingleton.get_or_create("my_service", MyService)
    """

    _instances: Dict[str, Any] = {}
    _locks: Dict[str, threading.Lock] = {}
    _global_lock = threading.Lock()

    @classmethod
    def get_or_create(cls, key: str, factory: Callable[[], T]) -> T:
        """Get existing instance or create new one thread-safely.

        Uses double-checked locking pattern:
        1. Fast path: Check without lock (most common case)
        2. Slow path: Acquire lock and check again before creating

        Args:
            key: Unique identifier for this singleton
            factory: Callable that creates the instance (no arguments)

        Returns:
            The singleton instance
        """
        # Fast path without lock (already created)
        if key in cls._instances:
            return cls._instances[key]

        # Ensure lock exists for this key
        with cls._global_lock:
            if key not in cls._locks:
                cls._locks[key] = threading.Lock()

        # Double-checked locking for thread safety
        with cls._locks[key]:
            # Check again after acquiring lock
            if key not in cls._instances:
                cls._instances[key] = factory()
            return cls._instances[key]

    @classmethod
    def reset(cls, key: str = None) -> None:
        """Reset singleton instance(s). Useful for testing.

        Args:
            key: Specific key to reset, or None to reset all
        """
        with cls._global_lock:
            if key is None:
                cls._instances.clear()
                cls._locks.clear()
            elif key in cls._instances:
                del cls._instances[key]
                if key in cls._locks:
                    del cls._locks[key]

    @classmethod
    def has_instance(cls, key: str) -> bool:
        """Check if an instance exists for the given key.

        Args:
            key: The singleton key to check

        Returns:
            True if instance exists
        """
        return key in cls._instances
