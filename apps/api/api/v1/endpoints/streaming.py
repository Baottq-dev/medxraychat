"""
MedXrayChat Backend - Streaming AI Response Endpoint

Provides real-time token-by-token streaming for AI responses via WebSocket.
"""
import uuid
import asyncio
from typing import Optional, AsyncGenerator
from pathlib import Path
from functools import partial

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from loguru import logger

from models import Image, ChatSession
from core.database import async_session_maker
from core.security import decode_access_token
from core.image_utils import load_image_from_file
from services import get_ai_service
from services.executor import get_executor
from PIL import Image as PILImage


router = APIRouter(prefix="/ai", tags=["AI Streaming"])


class StreamingAIService:
    """Service for streaming AI responses token by token."""
    
    def __init__(self):
        self.ai_service = get_ai_service()
    
    async def stream_chat_response(
        self,
        message: str,
        image: Optional[PILImage.Image] = None,
        chat_history: Optional[list] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream AI response token by token.
        
        Yields:
            Individual tokens or text chunks
        """
        try:
            # Get the full response first (for now, simulating streaming)
            # In production, you'd use a model that supports actual streaming
            loop = asyncio.get_event_loop()
            response_text, detections, tokens = await loop.run_in_executor(
                get_executor(),
                partial(
                    self.ai_service.chat,
                    message=message,
                    image=image,
                    chat_history=chat_history,
                )
            )
            
            # Simulate streaming by yielding chunks
            chunk_size = 20  # characters per chunk
            for i in range(0, len(response_text), chunk_size):
                chunk = response_text[i:i + chunk_size]
                yield chunk
                await asyncio.sleep(0.02)  # Small delay for streaming effect
            
            # Yield final metadata
            yield f"\n[STREAM_END:tokens={tokens}]"
            
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield f"\n[STREAM_ERROR:{str(e)[:50]}]"


_streaming_service: Optional[StreamingAIService] = None


def get_streaming_service() -> StreamingAIService:
    global _streaming_service
    if _streaming_service is None:
        _streaming_service = StreamingAIService()
    return _streaming_service


@router.websocket("/stream/{session_id}")
async def stream_ai_response(
    websocket: WebSocket,
    session_id: str,
    token: Optional[str] = Query(None),
):
    """WebSocket endpoint for streaming AI responses.
    
    Protocol:
    1. Client connects with JWT token
    2. Client sends: {"type": "chat", "content": "...", "image_id": "optional"}
    3. Server streams: {"type": "token", "content": "..."} for each token
    4. Server sends: {"type": "complete", "tokens_used": N} when done
    
    Example: ws://host/api/v1/ai/stream/{session_id}?token=<jwt>
    """
    # Auth
    if not token:
        await websocket.close(code=4001, reason="Token required")
        return
    
    token_data = decode_access_token(token)
    if not token_data or not token_data.user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return
    
    # Verify session ownership
    async with async_session_maker() as db:
        session_result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == uuid.UUID(session_id),
                ChatSession.user_id == uuid.UUID(token_data.user_id)
            )
        )
        if not session_result.scalar_one_or_none():
            await websocket.close(code=4003, reason="Unauthorized")
            return
    
    await websocket.accept()
    streaming_service = get_streaming_service()
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "chat":
                content = data.get("content", "")
                image_id = data.get("image_id")
                
                # Load image if provided
                image = None
                if image_id:
                    async with async_session_maker() as db:
                        result = await db.execute(
                            select(Image).where(Image.id == uuid.UUID(image_id))
                        )
                        img_record = result.scalar_one_or_none()
                        if img_record and Path(img_record.file_path).exists():
                            image = load_image_from_file(img_record.file_path)
                
                # Stream response
                tokens_used = 0
                async for chunk in streaming_service.stream_chat_response(
                    message=content,
                    image=image,
                ):
                    if chunk.startswith("\n[STREAM_END:"):
                        # Extract tokens from metadata
                        try:
                            tokens_used = int(chunk.split("=")[1].rstrip("]"))
                        except:
                            pass
                        await websocket.send_json({
                            "type": "complete",
                            "tokens_used": tokens_used,
                        })
                    elif chunk.startswith("\n[STREAM_ERROR:"):
                        await websocket.send_json({
                            "type": "error",
                            "message": chunk[15:-1],
                        })
                    else:
                        await websocket.send_json({
                            "type": "token",
                            "content": chunk,
                        })
            
            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                
    except WebSocketDisconnect:
        logger.info(f"Streaming client disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Streaming error: {e}")
