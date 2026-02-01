"""
MedXrayChat Backend - Authentication Endpoints
"""
from datetime import timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from loguru import logger

from core.database import get_db
from core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
)
from core.config import settings
from core.rate_limit import limiter
from models import User
from schemas import Token, LoginResponse, UserCreate, UserResponse, UserLogin
from api.deps import CurrentUser, DbSession


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    credentials: UserLogin,
    db: DbSession,
) -> LoginResponse:
    """Authenticate user and return JWT token with user info."""
    # Find user by email
    result = await db.execute(
        select(User).where(User.email == credentials.email)
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(credentials.password, user.hashed_password):
        # Log failed login attempt for security audit
        logger.warning(f"Failed login attempt for email: {credentials.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )

    # Create access token
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
        },
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def register(
    request: Request,
    user_in: UserCreate,
    db: DbSession,
) -> User:
    """Register a new user."""
    # Check if email exists
    result = await db.execute(
        select(User).where(User.email == user_in.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create user
    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role="doctor",
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    return user


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: CurrentUser,
) -> User:
    """Get current authenticated user information."""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    current_user: CurrentUser,
    db: DbSession,
    full_name: str = None,
) -> User:
    """Update current user information."""
    if full_name:
        current_user.full_name = full_name
    
    await db.commit()
    await db.refresh(current_user)
    
    return current_user
