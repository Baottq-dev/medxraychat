# Streaming Implementation - Quick Start Guide

## 5-Minute Setup

### Backend (FastAPI)

#### 1. Install Dependencies

```bash
pip install sse-starlette fastapi uvicorn
```

#### 2. Create Streaming Endpoint

```python
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import asyncio
import json

app = FastAPI()

@app.post("/chat/stream")
async def stream_chat(request: Request):
    async def generate():
        # Emit start event
        yield f"event: message_start\ndata: {json.dumps({'type': 'message_start'})}\n\n"

        # Stream content
        response = "Hello, this is a streaming response!"
        for word in response.split():
            # Check if client disconnected
            if await request.is_disconnected():
                break

            yield f"event: content_block_delta\ndata: {json.dumps({
                'type': 'content_block_delta',
                'delta': {'type': 'text_delta', 'text': word + ' '}
            })}\n\n"
            await asyncio.sleep(0.1)  # Simulate processing

        # Emit stop event
        yield f"event: message_stop\ndata: {json.dumps({'type': 'message_stop'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
```

### Frontend (TypeScript/React)

```typescript
async function streamChat(message: string) {
  const response = await fetch('/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      if (!event.trim()) continue;

      const dataLine = event.split('\n').find(l => l.startsWith('data: '));
      if (dataLine) {
        const data = JSON.parse(dataLine.slice(6));

        if (data.type === 'content_block_delta') {
          console.log('Received:', data.delta.text);
          // Update UI here
        }
      }
    }
  }
}
```

---

## With Qwen/LLM Streaming

### Using TextIteratorStreamer

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer
import threading

model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen-VL")
tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen-VL")

def stream_llm(prompt: str):
    inputs = tokenizer(prompt, return_tensors="pt")

    streamer = TextIteratorStreamer(
        tokenizer,
        skip_prompt=True,
        skip_special_tokens=True
    )

    generation_kwargs = dict(
        **inputs,
        max_new_tokens=512,
        streamer=streamer,
    )

    # Run in background thread
    thread = threading.Thread(
        target=model.generate,
        kwargs=generation_kwargs
    )
    thread.start()

    # Yield tokens as they come
    for text in streamer:
        yield text

    thread.join()
```

---

## Adding Heartbeat

```python
import asyncio

class StreamingSession:
    def __init__(self, heartbeat_interval=15.0):
        self.queue = asyncio.Queue()
        self.is_active = True
        self.heartbeat_interval = heartbeat_interval

    async def start(self):
        asyncio.create_task(self._heartbeat_loop())

    async def _heartbeat_loop(self):
        while self.is_active:
            await asyncio.sleep(self.heartbeat_interval)
            if self.is_active:
                await self.queue.put({
                    "type": "ping",
                    "timestamp": time.time()
                })

    async def emit(self, event):
        await self.queue.put(event)

    async def stop(self):
        self.is_active = False
```

---

## React Hook Example

```typescript
import { useState, useCallback } from 'react';

type StatusCode = 'started' | 'thinking' | 'analyzing' | 'analyzed' | 'generating' | 'complete';

interface Detection {
  class_name: string;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
}

export function useStreamingChat() {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<StatusCode | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (message: string) => {
    setIsStreaming(true);
    setContent('');
    setStatus(null);
    setDetections([]);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const dataLine = event.split('\n').find(l => l.startsWith('data: '));
          if (dataLine) {
            const data = JSON.parse(dataLine.slice(6));

            // Handle status events
            if (data.type === 'status') {
              setStatus(data.status);
              setStatusMessage(data.message);

              // Extract detections if available
              if (data.status === 'analyzed' && data.details?.detections) {
                setDetections(data.details.detections);
              }
            }

            // Handle text deltas
            if (data.delta?.text) {
              accumulated += data.delta.text;
              setContent(accumulated);
            }
          }
        }
      }
    } finally {
      setIsStreaming(false);
      setStatus(null);
    }
  }, []);

  return {
    content,
    status,
    statusMessage,
    detections,
    isStreaming,
    sendMessage
  };
}
```

### Using the Hook with Status Display

```tsx
function ChatComponent() {
  const { content, status, statusMessage, detections, isStreaming, sendMessage } = useStreamingChat();

  return (
    <div>
      {/* Status indicator */}
      {status && (
        <div className="status-banner">
          {status === 'thinking' && '🤔 '}
          {status === 'analyzing' && '🔍 '}
          {status === 'generating' && '✍️ '}
          {status === 'complete' && '✅ '}
          {statusMessage}
        </div>
      )}

      {/* Detection results */}
      {detections.length > 0 && (
        <div className="detections">
          <h4>Phát hiện {detections.length} vùng bất thường:</h4>
          <ul>
            {detections.map((det, i) => (
              <li key={i}>{det.class_name}: {(det.confidence * 100).toFixed(1)}%</li>
            ))}
          </ul>
        </div>
      )}

      {/* Streamed content */}
      <div className="content">
        {content}
        {isStreaming && <span className="cursor">▌</span>}
      </div>
    </div>
  );
}
```

---

## Testing with curl

```bash
curl -N -X POST http://localhost:8000/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}' \
  --no-buffer
```

Expected output:
```
event: message_start
data: {"type":"message_start"}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there!"}}

event: message_stop
data: {"type":"message_stop"}
```

---

## Common Issues

### 1. Nginx Buffering

Add to nginx config:
```nginx
proxy_buffering off;
proxy_cache off;
```

Or use header:
```python
headers={"X-Accel-Buffering": "no"}
```

### 2. CORS Issues

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 3. Timeout on Long Streams

Increase timeouts:
```python
# uvicorn
uvicorn.run(app, timeout_keep_alive=300)
```

```typescript
// Frontend
fetch(url, { signal: AbortSignal.timeout(300000) })
```

---

## Next Steps

1. Read [EVENT_FORMAT.md](./EVENT_FORMAT.md) for detailed event specification
2. Check [REFERENCES.md](./REFERENCES.md) for research papers
3. See [README.md](./README.md) for full architecture
