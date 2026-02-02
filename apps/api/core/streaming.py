"""
MedXrayChat Backend - Professional Streaming Module

Implements streaming patterns similar to OpenAI/Anthropic APIs:
- Structured event types (message_start, content_delta, message_stop)
- Heartbeat for proxy compatibility
- Client disconnect detection
- Async queue-based streaming
"""
import asyncio
import json
import time
import uuid
from typing import AsyncGenerator, Optional, Any, Callable
from dataclasses import dataclass, asdict
from enum import Enum
from loguru import logger


class StreamEventType(str, Enum):
    """Event types following OpenAI/Anthropic conventions."""
    MESSAGE_START = "message_start"
    CONTENT_BLOCK_START = "content_block_start"
    CONTENT_BLOCK_DELTA = "content_block_delta"
    CONTENT_BLOCK_STOP = "content_block_stop"
    MESSAGE_DELTA = "message_delta"
    MESSAGE_STOP = "message_stop"
    PING = "ping"
    ERROR = "error"


@dataclass
class StreamEvent:
    """Structured stream event."""
    type: StreamEventType
    data: dict

    def to_sse(self) -> str:
        """Convert to SSE format."""
        event_data = {
            "type": self.type.value,
            **self.data
        }
        return f"event: {self.type.value}\ndata: {json.dumps(event_data, ensure_ascii=False)}\n\n"


class StreamingSession:
    """Manages a streaming session with proper lifecycle."""

    def __init__(
        self,
        session_id: str,
        heartbeat_interval: float = 15.0,
        timeout: float = 300.0,
    ):
        self.session_id = session_id
        self.message_id = str(uuid.uuid4())
        self.heartbeat_interval = heartbeat_interval
        self.timeout = timeout
        self.queue: asyncio.Queue[Optional[StreamEvent]] = asyncio.Queue()
        self.is_active = True
        self.start_time = time.time()
        self.total_tokens = 0
        self._heartbeat_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start the streaming session."""
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        logger.debug(f"Streaming session {self.session_id} started")

    async def stop(self) -> None:
        """Stop the streaming session."""
        self.is_active = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
        # Signal end of stream
        await self.queue.put(None)
        logger.debug(f"Streaming session {self.session_id} stopped")

    async def _heartbeat_loop(self) -> None:
        """Send periodic heartbeat to keep connection alive."""
        while self.is_active:
            try:
                await asyncio.sleep(self.heartbeat_interval)
                if self.is_active:
                    await self.queue.put(StreamEvent(
                        type=StreamEventType.PING,
                        data={"timestamp": time.time()}
                    ))
            except asyncio.CancelledError:
                break

    async def emit_message_start(self, metadata: Optional[dict] = None) -> None:
        """Emit message_start event."""
        await self.queue.put(StreamEvent(
            type=StreamEventType.MESSAGE_START,
            data={
                "message_id": self.message_id,
                "session_id": self.session_id,
                "metadata": metadata or {},
            }
        ))

    async def emit_content_start(
        self,
        index: int,
        content_type: str = "text",
        metadata: Optional[dict] = None
    ) -> None:
        """Emit content_block_start event."""
        await self.queue.put(StreamEvent(
            type=StreamEventType.CONTENT_BLOCK_START,
            data={
                "index": index,
                "content_type": content_type,
                "metadata": metadata or {},
            }
        ))

    async def emit_content_delta(
        self,
        index: int,
        delta: str,
        delta_type: str = "text_delta"
    ) -> None:
        """Emit content_block_delta event."""
        await self.queue.put(StreamEvent(
            type=StreamEventType.CONTENT_BLOCK_DELTA,
            data={
                "index": index,
                "delta": {
                    "type": delta_type,
                    "text": delta,
                }
            }
        ))

    async def emit_content_stop(self, index: int) -> None:
        """Emit content_block_stop event."""
        await self.queue.put(StreamEvent(
            type=StreamEventType.CONTENT_BLOCK_STOP,
            data={"index": index}
        ))

    async def emit_message_delta(self, usage: dict) -> None:
        """Emit message_delta with usage info."""
        self.total_tokens = usage.get("total_tokens", 0)
        await self.queue.put(StreamEvent(
            type=StreamEventType.MESSAGE_DELTA,
            data={"usage": usage}
        ))

    async def emit_message_stop(self, final_data: Optional[dict] = None) -> None:
        """Emit message_stop event."""
        elapsed = time.time() - self.start_time
        await self.queue.put(StreamEvent(
            type=StreamEventType.MESSAGE_STOP,
            data={
                "message_id": self.message_id,
                "stop_reason": "end_turn",
                "usage": {
                    "total_tokens": self.total_tokens,
                    "processing_time_ms": int(elapsed * 1000),
                },
                **(final_data or {}),
            }
        ))

    async def emit_error(self, error: str, code: str = "stream_error") -> None:
        """Emit error event."""
        await self.queue.put(StreamEvent(
            type=StreamEventType.ERROR,
            data={
                "error": {
                    "type": code,
                    "message": error,
                }
            }
        ))

    async def iterate(self) -> AsyncGenerator[str, None]:
        """Iterate over events as SSE strings."""
        try:
            while self.is_active or not self.queue.empty():
                try:
                    event = await asyncio.wait_for(
                        self.queue.get(),
                        timeout=self.timeout
                    )
                    if event is None:
                        break
                    yield event.to_sse()
                except asyncio.TimeoutError:
                    logger.warning(f"Streaming session {self.session_id} timed out")
                    break
        finally:
            self.is_active = False


async def run_sync_generator_async(
    sync_gen_func: Callable,
    *args,
    **kwargs
) -> AsyncGenerator[str, None]:
    """Run a synchronous generator in a thread and yield results asynchronously.

    This is the recommended pattern for streaming from sync ML models.
    """
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_event_loop()

    def run_sync():
        """Run sync generator and put results in queue."""
        try:
            gen = sync_gen_func(*args, **kwargs)
            for item in gen:
                asyncio.run_coroutine_threadsafe(
                    queue.put(("data", item)),
                    loop
                )
            asyncio.run_coroutine_threadsafe(
                queue.put(("done", None)),
                loop
            )
        except Exception as e:
            asyncio.run_coroutine_threadsafe(
                queue.put(("error", str(e))),
                loop
            )

    # Start sync generator in thread
    import concurrent.futures
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = executor.submit(run_sync)

    try:
        while True:
            msg_type, data = await queue.get()
            if msg_type == "done":
                break
            elif msg_type == "error":
                raise Exception(data)
            else:
                yield data
    finally:
        executor.shutdown(wait=False)


def create_sse_response_headers() -> dict:
    """Create standard SSE response headers."""
    return {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # Disable nginx buffering
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }
