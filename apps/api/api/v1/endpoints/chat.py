"""
MedXrayChat Backend - Chat Endpoints with WebSocket
"""
import uuid
import asyncio
import json
from functools import partial
from typing import List, Optional, AsyncGenerator
from fastapi import APIRouter, HTTPException, status, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from pathlib import Path
from loguru import logger

from models import ChatSession, ChatMessage, Image, Study
from schemas import (
    ChatSessionCreate,
    ChatSessionResponse,
    ChatMessageCreate,
    ChatMessageResponse,
    WSMessage,
)
from api.deps import CurrentUser, DbSession
from services import get_ai_service
from services.executor import get_executor
from core.database import async_session_maker
from core.security import decode_access_token
from core.image_utils import load_image_from_file
from core.streaming import (
    StreamingSession,
    create_sse_response_headers,
    run_sync_generator_async,
)


router = APIRouter(prefix="/chat", tags=["Chat"])


async def get_session_detections(session_id: uuid.UUID, db) -> List:
    """Get most recent detections from a chat session.

    Args:
        session_id: Chat session ID
        db: Database session

    Returns:
        List of Detection objects from most recent AI message with detections
    """
    from schemas import Detection

    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.session_id == session_id,
            ChatMessage.role == "assistant",
            ChatMessage.bbox_references != None,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
    )
    message = result.scalar_one_or_none()

    if message and message.bbox_references:
        try:
            return [Detection(**d) for d in message.bbox_references]
        except Exception as e:
            logger.warning(f"Failed to parse existing detections: {e}")
            return []
    return []


# Connection manager for WebSocket
class ConnectionManager:
    """Manages WebSocket connections for chat sessions."""
    
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)
        logger.info(f"WebSocket connected to session {session_id}")
    
    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.active_connections:
            self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        logger.info(f"WebSocket disconnected from session {session_id}")
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)
    
    async def broadcast(self, message: dict, session_id: str):
        if session_id in self.active_connections:
            for connection in self.active_connections[session_id]:
                await connection.send_json(message)


manager = ConnectionManager()


def get_session_response(session: ChatSession, message_count: int = 0) -> ChatSessionResponse:
    """Convert ChatSession model to response."""
    return ChatSessionResponse(
        id=session.id,
        study_id=session.study_id,
        title=session.title,
        is_active=session.is_active,
        message_count=message_count,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.get("/sessions", response_model=List[ChatSessionResponse])
async def list_chat_sessions(
    current_user: CurrentUser,
    db: DbSession,
    study_id: uuid.UUID = None,
) -> List[ChatSessionResponse]:
    """List chat sessions for current user."""
    query = (
        select(ChatSession, func.count(ChatMessage.id).label("message_count"))
        .outerjoin(ChatMessage)
        .where(ChatSession.user_id == current_user.id)
        .group_by(ChatSession.id)
        .order_by(ChatSession.updated_at.desc())
    )
    
    if study_id:
        query = query.where(ChatSession.study_id == study_id)
    
    result = await db.execute(query)
    rows = result.all()
    
    return [get_session_response(session, count) for session, count in rows]


@router.post("/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_chat_session(
    session_in: ChatSessionCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> ChatSessionResponse:
    """Create a new chat session for a study."""
    # Verify study ownership
    study_result = await db.execute(
        select(Study).where(Study.id == session_in.study_id, Study.user_id == current_user.id)
    )
    if not study_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found"
        )
    
    session = ChatSession(
        study_id=session_in.study_id,
        user_id=current_user.id,
        title=session_in.title or "New Chat",
    )
    
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    return get_session_response(session, 0)


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_chat_session(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> ChatSessionResponse:
    """Get a specific chat session."""
    query = (
        select(ChatSession, func.count(ChatMessage.id).label("message_count"))
        .outerjoin(ChatMessage)
        .where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
        .group_by(ChatSession.id)
    )
    
    result = await db.execute(query)
    row = result.first()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found"
        )
    
    session, count = row
    return get_session_response(session, count)


@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageResponse])
async def get_chat_messages(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> List[ChatMessage]:
    """Get all messages in a chat session."""
    # Verify session ownership
    session_result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found"
        )
    
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    
    return result.scalars().all()


@router.post("/sessions/{session_id}/messages", response_model=ChatMessageResponse)
async def send_chat_message(
    session_id: uuid.UUID,
    message_in: ChatMessageCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> ChatMessageResponse:
    """Send a message and get AI response with tool calling support."""
    # Verify session ownership
    session_result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found"
        )

    # Save user message
    user_message = ChatMessage(
        session_id=session_id,
        role="user",
        content=message_in.content,
        image_id=message_in.image_id,
    )
    db.add(user_message)
    await db.commit()

    # Load image if provided
    image = None
    if message_in.image_id:
        image_result = await db.execute(
            select(Image).where(Image.id == message_in.image_id)
        )
        image_record = image_result.scalar_one_or_none()
        if image_record and Path(image_record.file_path).exists():
            image = load_image_from_file(image_record.file_path)

    # Get chat history
    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    history = [
        {"role": msg.role, "content": msg.content}
        for msg in history_result.scalars().all()
    ]

    # Get existing detections from session (for context)
    existing_detections = await get_session_detections(session_id, db)

    # Get AI response with tool calling support
    ai_service = get_ai_service()
    loop = asyncio.get_event_loop()
    response_text, detections, tokens, tool_call = await loop.run_in_executor(
        get_executor(),
        partial(
            ai_service.chat_with_tools,
            message=message_in.content,
            image=image,
            chat_history=history[:-1],  # Exclude current message
            available_detections=existing_detections,
        )
    )

    # Log results for debugging
    if tool_call:
        logger.info(f"AI Chat - Tool called: {tool_call.name}")
    logger.info(f"AI Chat - Detections: {len(detections)}")
    for det in detections:
        logger.info(f"  - {det.class_name}: {det.confidence:.2%}")

    # Save AI response
    ai_message = ChatMessage(
        session_id=session_id,
        role="assistant",
        content=response_text,
        bbox_references=[d.model_dump() for d in detections],
        tokens_used=tokens,
    )
    db.add(ai_message)
    await db.commit()
    await db.refresh(ai_message)

    return ai_message


@router.post("/sessions/{session_id}/messages/stream")
async def send_chat_message_stream(
    session_id: uuid.UUID,
    message_in: ChatMessageCreate,
    current_user: CurrentUser,
    db: DbSession,
    request: Request,
):
    """Send a message and get streaming AI response with tool calling (SSE).

    Implements 2-phase streaming with tool calling support:
    - Phase 1: AI decides if tool is needed (thinking)
    - Phase 2: Execute tool (if needed) then stream response

    Event types:
    - message_start: Initial message metadata
    - content_block_start: Start of content (thinking/tool_use/text)
    - content_block_delta: Incremental content updates
    - content_block_stop: End of content block
    - message_delta: Usage statistics
    - message_stop: Final message with metadata
    - ping: Heartbeat for proxy compatibility
    - error: Error information
    """
    # Verify session ownership
    session_result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found"
        )

    # Save user message
    user_message = ChatMessage(
        session_id=session_id,
        role="user",
        content=message_in.content,
        image_id=message_in.image_id,
    )
    db.add(user_message)
    await db.commit()

    # Load image if provided
    image = None
    if message_in.image_id:
        image_result = await db.execute(
            select(Image).where(Image.id == message_in.image_id)
        )
        image_record = image_result.scalar_one_or_none()
        if image_record and Path(image_record.file_path).exists():
            image = load_image_from_file(image_record.file_path)

    # Get chat history
    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    history = [
        {"role": msg.role, "content": msg.content}
        for msg in history_result.scalars().all()
    ]

    # Get existing detections from session
    existing_detections = await get_session_detections(session_id, db)

    # Create streaming session
    stream_session = StreamingSession(
        session_id=str(session_id),
        heartbeat_interval=15.0,
        timeout=300.0,
    )
    ai_service = get_ai_service()

    async def generate_tool_aware_stream() -> AsyncGenerator[str, None]:
        """Generate 2-phase SSE stream with tool calling support."""
        full_response = []
        final_detections = []
        token_count = 0
        content_block_idx = 0
        tool_was_used = False
        text_block_started = False

        try:
            await stream_session.start()

            # Emit message_start
            await stream_session.emit_message_start({
                "model": "qwen-vl-tools",
                "user_id": str(current_user.id),
            })

            # Yield message_start immediately
            while not stream_session.queue.empty():
                event = await stream_session.queue.get()
                if event:
                    yield event.to_sse()

            # Use run_sync_generator_async for real-time streaming from sync generator
            stream_queue: asyncio.Queue = asyncio.Queue()
            loop = asyncio.get_event_loop()

            def run_sync_stream():
                """Run sync generator and put results in queue."""
                try:
                    gen = ai_service.chat_with_tools_stream(
                        message=message_in.content,
                        image=image,
                        chat_history=history[:-1],
                        available_detections=existing_detections,
                    )
                    for item in gen:
                        asyncio.run_coroutine_threadsafe(
                            stream_queue.put(("data", item)),
                            loop
                        )
                    asyncio.run_coroutine_threadsafe(
                        stream_queue.put(("done", None)),
                        loop
                    )
                except Exception as e:
                    logger.error(f"Stream generator error: {e}")
                    asyncio.run_coroutine_threadsafe(
                        stream_queue.put(("error", str(e))),
                        loop
                    )

            # Start sync generator in thread
            import concurrent.futures
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            executor.submit(run_sync_stream)

            # Process stream events as they arrive
            while True:
                try:
                    msg_type, data = await asyncio.wait_for(stream_queue.get(), timeout=300.0)
                except asyncio.TimeoutError:
                    logger.warning("Stream timeout")
                    break

                if msg_type == "done":
                    break
                elif msg_type == "error":
                    raise Exception(data)

                event_type, content, detections = data
                # Check if client disconnected
                if await request.is_disconnected():
                    logger.info(f"Client disconnected, stopping stream for session {session_id}")
                    break

                if event_type == "thinking":
                    # Phase 1: Thinking indicator
                    await stream_session.emit_content_start(content_block_idx, "thinking")
                    await stream_session.emit_content_delta(content_block_idx, content, "thinking_delta")
                    await stream_session.emit_content_stop(content_block_idx)
                    content_block_idx += 1

                elif event_type == "tool_start":
                    # Tool execution starting
                    tool_was_used = True
                    await stream_session.emit_content_start(content_block_idx, "tool_use", {
                        "status": "running"
                    })
                    await stream_session.emit_content_delta(content_block_idx, content, "tool_status")

                elif event_type == "tool_result":
                    # Tool finished, send detections if any
                    if detections:
                        final_detections = detections
                        det_json = json.dumps([d.model_dump() for d in detections], ensure_ascii=False)
                        await stream_session.emit_content_delta(content_block_idx, det_json, "detections_delta")
                    await stream_session.emit_content_stop(content_block_idx)
                    content_block_idx += 1

                    # Start text content block for response after tool
                    await stream_session.emit_content_start(content_block_idx, "text")
                    text_block_started = True  # Mark as started to avoid duplicate

                elif event_type == "text":
                    # Stream text response
                    if not text_block_started:
                        # Start text block (either after tool or for direct response)
                        await stream_session.emit_content_start(content_block_idx, "text")
                        text_block_started = True

                    full_response.append(content)
                    token_count += len(content) // 4
                    await stream_session.emit_content_delta(content_block_idx, content, "text_delta")

                elif event_type == "done":
                    # Stream finished
                    if detections:
                        final_detections = detections

                # Yield events from queue immediately for real-time streaming
                while not stream_session.queue.empty():
                    event = await stream_session.queue.get()
                    if event:
                        yield event.to_sse()

            # Clean up executor
            executor.shutdown(wait=False)

            # Close text content block if started
            if text_block_started:
                await stream_session.emit_content_stop(content_block_idx)

            # Emit remaining events
            while not stream_session.queue.empty():
                event = await stream_session.queue.get()
                if event:
                    yield event.to_sse()

            # Save complete response to database
            response_text = "".join(full_response)
            async with async_session_maker() as save_db:
                ai_message = ChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=response_text,
                    bbox_references=[d.model_dump() for d in final_detections],
                    tokens_used=token_count,
                )
                save_db.add(ai_message)
                await save_db.commit()
                await save_db.refresh(ai_message)

                # Emit message_delta with usage
                await stream_session.emit_message_delta({
                    "input_tokens": len(message_in.content) // 4,
                    "output_tokens": token_count,
                    "total_tokens": token_count + len(message_in.content) // 4,
                })

                # Emit message_stop with final data
                await stream_session.emit_message_stop({
                    "message_id": str(ai_message.id),
                    "detections_count": len(final_detections),
                    "tool_used": tool_was_used,
                })

            # Yield final events
            while not stream_session.queue.empty():
                event = await stream_session.queue.get()
                if event:
                    yield event.to_sse()

        except Exception as e:
            logger.error(f"Tool streaming error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            await stream_session.emit_error(str(e), "stream_error")
            while not stream_session.queue.empty():
                event = await stream_session.queue.get()
                if event:
                    yield event.to_sse()

        finally:
            await stream_session.stop()

    return StreamingResponse(
        generate_tool_aware_stream(),
        media_type="text/event-stream",
        headers=create_sse_response_headers(),
    )


@router.websocket("/ws/{session_id}")
async def websocket_chat(
    websocket: WebSocket,
    session_id: str,
    token: Optional[str] = Query(None),
):
    """WebSocket endpoint for real-time chat.

    Requires JWT token for authentication via query parameter.
    Example: ws://host/api/v1/chat/ws/{session_id}?token=<jwt_token>
    """
    # Validate JWT token
    if not token:
        await websocket.close(code=4001, reason="Token required")
        return

    token_data = decode_access_token(token)
    if not token_data or not token_data.user_id:
        await websocket.close(code=4001, reason="Invalid or expired token")
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
            await websocket.close(code=4003, reason="Session not found or unauthorized")
            return

    # Connection authenticated - proceed
    await manager.connect(websocket, session_id)
    user_id = token_data.user_id

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()

            message_type = data.get("type", "chat")

            if message_type == "chat":
                content = data.get("content", "")
                image_id = data.get("image_id")

                # Process with AI
                async with async_session_maker() as db:
                    # Load image if provided
                    image = None
                    if image_id:
                        result = await db.execute(
                            select(Image).where(Image.id == uuid.UUID(image_id))
                        )
                        image_record = result.scalar_one_or_none()
                        if image_record and Path(image_record.file_path).exists():
                            image = load_image_from_file(image_record.file_path)

                    # Get AI response
                    ai_service = get_ai_service()
                    loop = asyncio.get_event_loop()
                    response_text, detections, tokens = await loop.run_in_executor(
                        get_executor(),
                        partial(
                            ai_service.chat,
                            message=content,
                            image=image,
                        )
                    )

                    # Send response back
                    await manager.send_personal_message({
                        "type": "chat_response",
                        "content": response_text,
                        "detections": [d.model_dump() for d in detections],
                        "tokens_used": tokens,
                    }, websocket)

            elif message_type == "ping":
                await manager.send_personal_message({"type": "pong"}, websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(websocket, session_id)
