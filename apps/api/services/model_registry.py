"""
MedXrayChat Backend - Model Versioning Service

Supports multiple model versions with A/B testing capability.
"""
import random
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime
from loguru import logger

from core.config import settings


@dataclass
class ModelVersion:
    """Model version metadata."""
    id: str
    name: str
    model_type: str  # 'yolo' or 'qwen'
    model_path: str
    version: str
    is_active: bool = True
    is_default: bool = False
    traffic_weight: float = 0.0  # For A/B testing (0.0 - 1.0)
    created_at: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)


class ModelRegistry:
    """Registry for managing multiple model versions."""
    
    def __init__(self):
        self.models: Dict[str, ModelVersion] = {}
        self._ab_test_enabled: bool = False
        self._load_default_models()
    
    def _load_default_models(self) -> None:
        """Load default model configurations."""
        # Default YOLO model
        self.register(ModelVersion(
            id="yolo-vindr-v1",
            name="YOLO VinDR v1",
            model_type="yolo",
            model_path=settings.YOLO_MODEL_PATH,
            version="1.0.0",
            is_default=True,
            traffic_weight=1.0,
            metadata={
                "dataset": "VinDR-CXR",
                "classes": 22,
                "mAP": 0.72,
            }
        ))
        
        # Default Qwen model
        self.register(ModelVersion(
            id="qwen-vl-7b-v1",
            name="Qwen3-VL-7B",
            model_type="qwen",
            model_path=settings.QWEN_MODEL_NAME,
            version="1.0.0",
            is_default=True,
            traffic_weight=1.0,
            metadata={
                "parameters": "7B",
                "context_window": 4096,
            }
        ))
    
    def register(self, model: ModelVersion) -> None:
        """Register a new model version."""
        self.models[model.id] = model
        logger.info(f"Registered model: {model.id} ({model.name})")
    
    def unregister(self, model_id: str) -> bool:
        """Unregister a model version."""
        if model_id in self.models:
            del self.models[model_id]
            logger.info(f"Unregistered model: {model_id}")
            return True
        return False
    
    def get(self, model_id: str) -> Optional[ModelVersion]:
        """Get a specific model version."""
        return self.models.get(model_id)
    
    def list_models(self, model_type: Optional[str] = None) -> List[ModelVersion]:
        """List all registered models, optionally filtered by type."""
        models = list(self.models.values())
        if model_type:
            models = [m for m in models if m.model_type == model_type]
        return models
    
    def get_default(self, model_type: str) -> Optional[ModelVersion]:
        """Get the default model for a given type."""
        for model in self.models.values():
            if model.model_type == model_type and model.is_default:
                return model
        return None
    
    def select_model(self, model_type: str, forced_model_id: Optional[str] = None) -> Optional[ModelVersion]:
        """Select a model for inference, supporting A/B testing.
        
        Args:
            model_type: Type of model ('yolo' or 'qwen')
            forced_model_id: Optional specific model to use
            
        Returns:
            Selected model version
        """
        # If specific model requested
        if forced_model_id:
            model = self.get(forced_model_id)
            if model and model.model_type == model_type and model.is_active:
                return model
        
        # Get active models of this type
        candidates = [
            m for m in self.models.values()
            if m.model_type == model_type and m.is_active
        ]
        
        if not candidates:
            return None
        
        # A/B testing logic
        if self._ab_test_enabled and len(candidates) > 1:
            # Weighted random selection
            total_weight = sum(m.traffic_weight for m in candidates)
            if total_weight > 0:
                rand = random.random() * total_weight
                cumulative = 0
                for model in candidates:
                    cumulative += model.traffic_weight
                    if rand <= cumulative:
                        return model
        
        # Return default or first available
        default = next((m for m in candidates if m.is_default), None)
        return default or candidates[0]
    
    def set_traffic_weight(self, model_id: str, weight: float) -> bool:
        """Set traffic weight for A/B testing."""
        model = self.get(model_id)
        if model:
            model.traffic_weight = max(0.0, min(1.0, weight))
            return True
        return False
    
    def enable_ab_testing(self, enabled: bool = True) -> None:
        """Enable or disable A/B testing."""
        self._ab_test_enabled = enabled
        logger.info(f"A/B testing {'enabled' if enabled else 'disabled'}")
    
    def set_default(self, model_id: str) -> bool:
        """Set a model as the default for its type."""
        model = self.get(model_id)
        if not model:
            return False
        
        # Unset previous default
        for m in self.models.values():
            if m.model_type == model.model_type:
                m.is_default = False
        
        model.is_default = True
        return True
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get registry statistics."""
        yolo_models = [m for m in self.models.values() if m.model_type == "yolo"]
        qwen_models = [m for m in self.models.values() if m.model_type == "qwen"]
        
        return {
            "total_models": len(self.models),
            "yolo_models": len(yolo_models),
            "qwen_models": len(qwen_models),
            "ab_testing_enabled": self._ab_test_enabled,
            "active_models": sum(1 for m in self.models.values() if m.is_active),
        }


# Global registry instance
_model_registry: Optional[ModelRegistry] = None


def get_model_registry() -> ModelRegistry:
    """Get or create model registry singleton."""
    global _model_registry
    if _model_registry is None:
        _model_registry = ModelRegistry()
    return _model_registry


# API Schema classes
from pydantic import BaseModel, Field
from typing import Optional as Opt


class ModelVersionSchema(BaseModel):
    """Schema for model version."""
    id: str
    name: str
    model_type: str
    version: str
    is_active: bool
    is_default: bool
    traffic_weight: float
    metadata: dict = {}
    
    class Config:
        from_attributes = True


class ModelTrafficUpdate(BaseModel):
    """Schema for updating traffic weight."""
    weight: float = Field(..., ge=0.0, le=1.0)


class ABTestConfig(BaseModel):
    """Schema for A/B test configuration."""
    enabled: bool
