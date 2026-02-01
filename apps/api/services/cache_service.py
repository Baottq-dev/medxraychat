"""
MedXrayChat Backend - Redis Cache Service

Provides caching functionality for AI results and other expensive operations.
"""
import json
import hashlib
from typing import Optional, Any
from loguru import logger

from core.config import settings


class CacheService:
    """Service for caching expensive operations using Redis."""
    
    def __init__(self):
        """Initialize cache service."""
        self.redis = None
        self._connect()
    
    def _connect(self) -> None:
        """Connect to Redis."""
        try:
            import redis
            self.redis = redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
            )
            # Test connection
            self.redis.ping()
            logger.info(f"Connected to Redis at {settings.REDIS_URL}")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Caching disabled.")
            self.redis = None
    
    def _generate_key(self, prefix: str, *args) -> str:
        """Generate cache key from prefix and arguments."""
        key_data = json.dumps(args, sort_keys=True, default=str)
        key_hash = hashlib.md5(key_data.encode()).hexdigest()[:16]
        return f"medxray:{prefix}:{key_hash}"
    
    def get(self, prefix: str, *args) -> Optional[Any]:
        """Get cached value."""
        if self.redis is None:
            return None
        
        try:
            key = self._generate_key(prefix, *args)
            value = self.redis.get(key)
            if value:
                logger.debug(f"Cache hit: {key}")
                return json.loads(value)
            return None
        except Exception as e:
            logger.warning(f"Cache get error: {e}")
            return None
    
    def set(
        self,
        prefix: str,
        value: Any,
        *args,
        ttl_seconds: int = 86400,  # 24 hours default
    ) -> bool:
        """Set cached value with TTL."""
        if self.redis is None:
            return False
        
        try:
            key = self._generate_key(prefix, *args)
            serialized = json.dumps(value, default=str)
            self.redis.setex(key, ttl_seconds, serialized)
            logger.debug(f"Cache set: {key} (TTL: {ttl_seconds}s)")
            return True
        except Exception as e:
            logger.warning(f"Cache set error: {e}")
            return False
    
    def delete(self, prefix: str, *args) -> bool:
        """Delete cached value."""
        if self.redis is None:
            return False
        
        try:
            key = self._generate_key(prefix, *args)
            self.redis.delete(key)
            return True
        except Exception as e:
            logger.warning(f"Cache delete error: {e}")
            return False
    
    def get_ai_result(self, image_id: str) -> Optional[dict]:
        """Get cached AI analysis result for an image."""
        return self.get("ai_result", image_id)
    
    def set_ai_result(self, image_id: str, result: dict, ttl_hours: int = 24) -> bool:
        """Cache AI analysis result for an image."""
        return self.set("ai_result", result, image_id, ttl_seconds=ttl_hours * 3600)
    
    def invalidate_ai_result(self, image_id: str) -> bool:
        """Invalidate cached AI result for an image."""
        return self.delete("ai_result", image_id)


# Global singleton
_cache_service: Optional[CacheService] = None


def get_cache_service() -> CacheService:
    """Get or create cache service singleton."""
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
    return _cache_service
