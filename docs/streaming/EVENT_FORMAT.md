# SSE Event Format Specification

## Overview

MedXrayChat uses Server-Sent Events (SSE) following the [WHATWG specification](https://html.spec.whatwg.org/multipage/server-sent-events.html) with event types inspired by Anthropic's Claude API.

---

## SSE Message Format

Each SSE message consists of:

```
event: <event_type>
data: <json_payload>

```

Note: Messages are separated by double newlines (`\n\n`).

---

## Event Types

### 1. message_start

Sent when the stream begins.

```json
event: message_start
data: {
  "type": "message_start",
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "metadata": {
    "model": "qwen-vl",
    "user_id": "user-123"
  }
}
```

### 2. content_block_start

Marks the beginning of a content block (text or detections).

```json
event: content_block_start
data: {
  "type": "content_block_start",
  "index": 0,
  "content_type": "detections",
  "metadata": {
    "count": 3
  }
}
```

```json
event: content_block_start
data: {
  "type": "content_block_start",
  "index": 1,
  "content_type": "text",
  "metadata": {}
}
```

### 3. content_block_delta

Incremental content updates.

#### Text Delta

```json
event: content_block_delta
data: {
  "type": "content_block_delta",
  "index": 1,
  "delta": {
    "type": "text_delta",
    "text": "Phân tích ảnh X-quang"
  }
}
```

#### Detections Delta

```json
event: content_block_delta
data: {
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "detections_delta",
    "text": "[{\"class_id\":0,\"class_name\":\"Cardiomegaly\",\"confidence\":0.85,\"bbox\":{\"x1\":100,\"y1\":200,\"x2\":400,\"y2\":500}}]"
  }
}
```

### 4. content_block_stop

Marks the end of a content block.

```json
event: content_block_stop
data: {
  "type": "content_block_stop",
  "index": 1
}
```

### 5. message_delta

Usage statistics (sent near end of stream).

```json
event: message_delta
data: {
  "type": "message_delta",
  "usage": {
    "input_tokens": 128,
    "output_tokens": 512,
    "total_tokens": 640
  }
}
```

### 6. message_stop

Final event indicating stream completion.

```json
event: message_stop
data: {
  "type": "message_stop",
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "stop_reason": "end_turn",
  "usage": {
    "total_tokens": 640,
    "processing_time_ms": 45000
  },
  "detections_count": 3
}
```

### 7. ping

Heartbeat to keep connection alive (every 15 seconds).

```json
event: ping
data: {
  "type": "ping",
  "timestamp": 1706860800.123
}
```

### 8. error

Error event if something goes wrong.

```json
event: error
data: {
  "type": "error",
  "error": {
    "type": "stream_error",
    "message": "Model inference failed: CUDA out of memory"
  }
}
```

---

## Complete Stream Example

```
event: message_start
data: {"type":"message_start","message_id":"msg-001","session_id":"sess-001","metadata":{"model":"qwen-vl"}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_type":"detections","metadata":{"count":2}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"detections_delta","text":"[{\"class_name\":\"Cardiomegaly\",\"confidence\":0.92},{\"class_name\":\"Pleural effusion\",\"confidence\":0.78}]"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_type":"text","metadata":{}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"**Kết quả"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":" phân tích"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":" ảnh X-quang:**\n\n"}}

event: ping
data: {"type":"ping","timestamp":1706860815.5}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Phát hiện tim to"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":" (Cardiomegaly)"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":" với độ tin cậy 92%."}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","usage":{"input_tokens":50,"output_tokens":128,"total_tokens":178}}

event: message_stop
data: {"type":"message_stop","message_id":"msg-001","stop_reason":"end_turn","usage":{"total_tokens":178,"processing_time_ms":12500},"detections_count":2}

```

---

## TypeScript Types

```typescript
type StreamEventType =
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop'
  | 'ping'
  | 'error';

interface MessageStartEvent {
  type: 'message_start';
  message_id: string;
  session_id: string;
  metadata: Record<string, any>;
}

interface ContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_type: 'text' | 'detections';
  metadata: Record<string, any>;
}

interface ContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'text_delta' | 'detections_delta';
    text: string;
  };
}

interface ContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

interface MessageDeltaEvent {
  type: 'message_delta';
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

interface MessageStopEvent {
  type: 'message_stop';
  message_id: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'error';
  usage: {
    total_tokens: number;
    processing_time_ms: number;
  };
  detections_count?: number;
}

interface PingEvent {
  type: 'ping';
  timestamp: number;
}

interface ErrorEvent {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

type StreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | PingEvent
  | ErrorEvent;
```

---

## Python Pydantic Models

```python
from enum import Enum
from pydantic import BaseModel
from typing import Optional, Dict, Any, Union

class StreamEventType(str, Enum):
    MESSAGE_START = "message_start"
    CONTENT_BLOCK_START = "content_block_start"
    CONTENT_BLOCK_DELTA = "content_block_delta"
    CONTENT_BLOCK_STOP = "content_block_stop"
    MESSAGE_DELTA = "message_delta"
    MESSAGE_STOP = "message_stop"
    PING = "ping"
    ERROR = "error"

class Delta(BaseModel):
    type: str  # "text_delta" or "detections_delta"
    text: str

class Usage(BaseModel):
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: int
    processing_time_ms: Optional[int] = None

class ErrorInfo(BaseModel):
    type: str
    message: str

class StreamEvent(BaseModel):
    type: StreamEventType
    message_id: Optional[str] = None
    session_id: Optional[str] = None
    index: Optional[int] = None
    content_type: Optional[str] = None
    delta: Optional[Delta] = None
    usage: Optional[Usage] = None
    metadata: Optional[Dict[str, Any]] = None
    stop_reason: Optional[str] = None
    error: Optional[ErrorInfo] = None
    timestamp: Optional[float] = None
```

---

## HTTP Headers

### Request Headers

```http
POST /api/v1/chat/sessions/{session_id}/messages/stream HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer <token>
Accept: text/event-stream
```

### Response Headers

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-store, must-revalidate
Connection: keep-alive
X-Accel-Buffering: no
Access-Control-Allow-Origin: *
```

---

## Error Handling

### Client Disconnect

When client disconnects, backend should:
1. Detect disconnect via `request.is_disconnected()`
2. Stop model generation
3. Clean up resources
4. Log the event

### Stream Errors

Errors are sent as `error` events, then stream is closed:

```json
event: error
data: {"type":"error","error":{"type":"model_error","message":"Inference failed"}}

```

### Reconnection

SSE standard supports reconnection with `Last-Event-ID` header:

```http
GET /stream HTTP/1.1
Last-Event-ID: 42
```

(Not currently implemented in MedXrayChat)
