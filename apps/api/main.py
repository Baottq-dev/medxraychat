"""
MedXrayChat Backend - FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from loguru import logger

from core.config import settings
from core.database import close_db
from core.rate_limit import limiter
from api.v1 import router as api_v1_router
from services.executor import shutdown_executor


class CORSPreflightMiddleware(BaseHTTPMiddleware):
    """Handle CORS preflight requests before other middlewares."""
    
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            response = Response(status_code=200)
            response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Max-Age"] = "86400"
            return response
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    # Create upload directory
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    logger.info(f"Upload directory: {settings.UPLOAD_DIR}")

    # Initialize database
    # Note: Using init.sql for schema, so we don't need to create tables here
    # await init_db()
    logger.info("Database connected")

    # Preload AI models if configured
    if settings.PRELOAD_AI_MODELS:
        import asyncio
        asyncio.create_task(_preload_ai_models())
    else:
        logger.info("AI services will be loaded on first request")

    yield

    # Shutdown
    logger.info("Shutting down...")
    shutdown_executor()
    await close_db()


async def _preload_ai_models():
    """Preload AI models in background task."""
    from services import get_ai_service
    import asyncio
    
    # Small delay to let server start accepting requests first
    await asyncio.sleep(2)
    
    logger.info("Preloading AI models...")
    try:
        # This triggers lazy initialization of both YOLO and Qwen services
        ai_service = get_ai_service()
        logger.info("AI models preloaded successfully")
    except Exception as e:
        logger.error(f"Failed to preload AI models: {e}")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API Backend cho ứng dụng hỗ trợ bác sĩ chẩn đoán X-ray phổi với AI",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# Add CORS preflight middleware FIRST (will be outermost)
app.add_middleware(CORSPreflightMiddleware)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all in dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Include API routers
app.include_router(api_v1_router)

# Mount static files for uploads (optional, for development)
if settings.DEBUG:
    uploads_path = Path(settings.UPLOAD_DIR)
    if uploads_path.exists():
        app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs" if settings.DEBUG else "disabled",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "database": "connected",
        "ai_server": settings.AI_SERVER_URL,
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )
