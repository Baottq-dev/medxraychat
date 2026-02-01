"""
MedXrayChat Backend - Model Versioning API Endpoints

Manage model versions and A/B testing configuration.
"""
import uuid
from typing import List

from fastapi import APIRouter, HTTPException, status

from services.model_registry import (
    get_model_registry,
    ModelVersionSchema,
    ModelTrafficUpdate,
    ABTestConfig,
)
from api.deps import CurrentUser


router = APIRouter(prefix="/models", tags=["Model Versioning"])


@router.get("", response_model=List[ModelVersionSchema])
async def list_models(
    current_user: CurrentUser,
    model_type: str = None,
) -> List[ModelVersionSchema]:
    """List all registered model versions."""
    registry = get_model_registry()
    models = registry.list_models(model_type)
    
    return [
        ModelVersionSchema(
            id=m.id,
            name=m.name,
            model_type=m.model_type,
            version=m.version,
            is_active=m.is_active,
            is_default=m.is_default,
            traffic_weight=m.traffic_weight,
            metadata=m.metadata,
        )
        for m in models
    ]


@router.get("/stats")
async def get_registry_stats(
    current_user: CurrentUser,
) -> dict:
    """Get model registry statistics."""
    registry = get_model_registry()
    return registry.get_statistics()


@router.post("/{model_id}/default")
async def set_default_model(
    model_id: str,
    current_user: CurrentUser,
) -> dict:
    """Set a model as the default for its type."""
    # Check admin role
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    registry = get_model_registry()
    success = registry.set_default(model_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found"
        )
    
    return {"message": f"Model {model_id} set as default"}


@router.post("/{model_id}/traffic")
async def update_traffic_weight(
    model_id: str,
    update: ModelTrafficUpdate,
    current_user: CurrentUser,
) -> dict:
    """Update traffic weight for A/B testing."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    registry = get_model_registry()
    success = registry.set_traffic_weight(model_id, update.weight)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found"
        )
    
    return {"message": f"Traffic weight updated to {update.weight}"}


@router.post("/ab-testing")
async def configure_ab_testing(
    config: ABTestConfig,
    current_user: CurrentUser,
) -> dict:
    """Enable or disable A/B testing."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    registry = get_model_registry()
    registry.enable_ab_testing(config.enabled)
    
    return {
        "message": f"A/B testing {'enabled' if config.enabled else 'disabled'}",
        "enabled": config.enabled,
    }


@router.get("/select/{model_type}")
async def select_model_for_inference(
    model_type: str,
    current_user: CurrentUser,
    forced_model_id: str = None,
) -> ModelVersionSchema:
    """Select a model for inference (respects A/B testing if enabled)."""
    registry = get_model_registry()
    model = registry.select_model(model_type, forced_model_id)
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active {model_type} model found"
        )
    
    return ModelVersionSchema(
        id=model.id,
        name=model.name,
        model_type=model.model_type,
        version=model.version,
        is_active=model.is_active,
        is_default=model.is_default,
        traffic_weight=model.traffic_weight,
        metadata=model.metadata,
    )
