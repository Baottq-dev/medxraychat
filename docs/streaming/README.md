# MedXrayChat - Streaming Architecture

## Overview

MedXrayChat implements a professional Server-Sent Events (SSE) streaming architecture inspired by OpenAI and Anthropic APIs. This enables real-time, token-by-token AI response delivery for better user experience.

## Table of Contents

- [Architecture](#architecture)
- [Event Types](#event-types)
- [Backend Implementation](#backend-implementation)
- [Frontend Implementation](#frontend-implementation)
- [Configuration](#configuration)
- [References](#references)

---

## Architecture

```
┌─────────────────┐     POST /messages/stream      ┌─────────────────┐
│                 │ ─────────────────────────────► │                 │
│    Frontend     │                                │     Backend     │
│   (Next.js)     │ ◄───────────────────────────── │    (FastAPI)    │
│                 │     SSE: event + data          │                 │
└─────────────────┘                                └─────────────────┘
        │                                                   │
        │                                                   │
        ▼                                                   ▼
┌─────────────────┐                                ┌─────────────────┐
│   Zustand       │                                │  StreamingSession│
│   Chat Store    │                                │   + Qwen-VL     │
│   (State Mgmt)  │                                │   + YOLO        │
└─────────────────┘                                └─────────────────┘
```

### Flow Sequence

```
1. User sends message
2. Frontend creates placeholder message
3. POST request to /messages/stream
4. Backend:
   a. Saves user message to DB
   b. Runs YOLO detection (if image provided)
   c. Starts Qwen-VL streaming in background thread
   d. Emits SSE events as tokens are generated
5. Frontend:
   a. Parses SSE events
   b. Updates UI in real-time
   c. Shows typing effect
6. Backend saves complete response to DB
7. Frontend updates message with final ID
```

---

## Event Types

Following OpenAI/Anthropic conventions with custom status events:

| Event Type | Description | Payload |
|------------|-------------|---------|
| `message_start` | Stream initialized | `{message_id, session_id, metadata}` |
| `status` | **Processing status update** | `{status, message, details}` |
| `content_block_start` | New content block | `{index, content_type, metadata}` |
| `content_block_delta` | Content chunk | `{index, delta: {type, text}}` |
| `content_block_stop` | Block completed | `{index}` |
| `message_delta` | Usage statistics | `{usage: {input_tokens, output_tokens}}` |
| `message_stop` | Stream completed | `{message_id, stop_reason, usage}` |
| `ping` | Heartbeat (15s) | `{timestamp}` |
| `error` | Error occurred | `{error: {type, message}}` |

### Status Event Types

The `status` event provides real-time feedback about processing stages:

| Status | Description | When Emitted |
|--------|-------------|--------------|
| `started` | Request received | Immediately on request |
| `thinking` | AI is processing | Before tool decision |
| `analyzing` | Running YOLO detection | When image analysis starts |
| `analyzed` | Detection complete | After YOLO finishes (includes detections) |
| `generating` | Creating text response | Before text streaming |
| `complete` | Processing finished | After all processing done |

### Event Flow Example

```
event: message_start
data: {"type":"message_start","message_id":"abc-123","metadata":{}}

event: status
data: {"type":"status","status":"started","message":"Đã nhận yêu cầu, đang bắt đầu xử lý...","details":{}}

event: status
data: {"type":"status","status":"thinking","message":"Đang xử lý...","details":{}}

event: status
data: {"type":"status","status":"analyzing","message":"Đang phân tích ảnh X-quang...","details":{}}

event: status
data: {"type":"status","status":"analyzed","message":"Phát hiện 3 vùng bất thường","details":{"detections_count":3,"detections":[...]}}

event: status
data: {"type":"status","status":"generating","message":"Đang tạo nội dung phản hồi...","details":{}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_type":"text"}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Phân tích"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" ảnh X-quang"}}

event: ping
data: {"type":"ping","timestamp":1706860800}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" cho thấy..."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","usage":{"input_tokens":50,"output_tokens":512}}

event: status
data: {"type":"status","status":"complete","message":"Hoàn tất xử lý","details":{"message_id":"abc-123","tokens_used":512}}

event: message_stop
data: {"type":"message_stop","message_id":"abc-123","stop_reason":"end_turn"}
```

---

## Backend Implementation

### Key Files

| File | Purpose |
|------|---------|
| `core/streaming.py` | StreamingSession class, event types |
| `api/v1/endpoints/chat.py` | SSE endpoint `/messages/stream` |
| `services/qwen_service.py` | `chat_stream()` with TextIteratorStreamer |
| `services/ai_service.py` | Orchestrates YOLO + Qwen streaming |

### StreamingSession Class

```python
from core.streaming import StreamingSession

# Create session with heartbeat
stream_session = StreamingSession(
    session_id="abc-123",
    heartbeat_interval=15.0,  # Ping every 15s
    timeout=300.0,            # 5 min timeout
)

# Start session (begins heartbeat loop)
await stream_session.start()

# Emit events
await stream_session.emit_message_start({"model": "qwen-vl"})

# Emit status events for user feedback
await stream_session.emit_status("started", "Đã nhận yêu cầu...")
await stream_session.emit_status("thinking", "Đang xử lý...")
await stream_session.emit_status("analyzing", "Đang phân tích ảnh...")
await stream_session.emit_status("analyzed", "Phát hiện 3 vùng bất thường", {
    "detections_count": 3,
    "detections": [...]
})
await stream_session.emit_status("generating", "Đang tạo nội dung...")

# Stream text content
await stream_session.emit_content_start(0, "text")
await stream_session.emit_content_delta(0, "Hello", "text_delta")
await stream_session.emit_content_stop(0)

# Complete
await stream_session.emit_status("complete", "Hoàn tất xử lý", {"tokens_used": 512})
await stream_session.emit_message_stop({"message_id": "..."})

# Stop session
await stream_session.stop()
```

### Qwen-VL Streaming with TextIteratorStreamer

```python
from transformers import TextIteratorStreamer
import threading

def chat_stream(self, messages, image):
    # Setup streamer
    streamer = TextIteratorStreamer(
        self.processor.tokenizer,
        skip_prompt=True,
        skip_special_tokens=True
    )

    # Generation in background thread
    generation_kwargs = dict(
        **inputs,
        max_new_tokens=512,
        streamer=streamer,
    )
    thread = threading.Thread(
        target=self.model.generate,
        kwargs=generation_kwargs
    )
    thread.start()

    # Yield tokens as they come
    for text_chunk in streamer:
        yield text_chunk

    thread.join()
```

---

## Frontend Implementation

### Key Files

| File | Purpose |
|------|---------|
| `stores/chat-store.ts` | `sendMessageStream()` function |
| `components/viewer/AIAnalysisPanel.tsx` | UI with streaming state |

### Parsing SSE Events

```typescript
const reader = response.body?.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const events = buffer.split('\n\n');
  buffer = events.pop() || '';

  for (const eventBlock of events) {
    const lines = eventBlock.split('\n');
    let eventType = '';
    let eventData = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) eventType = line.slice(7);
      else if (line.startsWith('data: ')) eventData = line.slice(6);
    }

    const data = JSON.parse(eventData);

    switch (data.type) {
      case 'content_block_delta':
        if (data.delta?.type === 'text_delta') {
          accumulatedContent += data.delta.text;
          // Update UI
        }
        break;
      case 'message_stop':
        // Finalize message
        break;
    }
  }
}
```

---

## Configuration

### Backend Settings

```python
# core/streaming.py
HEARTBEAT_INTERVAL = 15.0  # seconds
STREAM_TIMEOUT = 300.0     # seconds (5 min)
```

### Frontend Settings

```typescript
// api-client.ts
timeout: 120000  // 2 minutes for AI processing
```

### SSE Headers

```python
{
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  # Disable nginx buffering
}
```

---

## Advantages

| Feature | Without Streaming | With Streaming |
|---------|-------------------|----------------|
| Time to first token | ~50s | ~2s |
| User experience | Wait → Full response | Real-time typing |
| Timeout handling | Frequent timeouts | No timeouts |
| Resource efficiency | Wasted if user leaves | Stop on disconnect |
| Proxy compatibility | May timeout | Heartbeat keeps alive |

---

## References

See [REFERENCES.md](./REFERENCES.md) for academic papers, industry documentation, and conference talks.
