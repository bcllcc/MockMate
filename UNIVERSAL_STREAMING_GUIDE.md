# 通用流式输出实现指南

## 概述

本文档提供了在任何Web应用中实现LLM流式输出（打字机效果）的完整技术方案，支持多种后端框架、前端技术栈和LLM提供商。

## 核心概念

### 流式输出的本质
```
LLM Provider → 后端流式处理 → SSE/WebSocket → 前端渐进渲染 → 用户体验
```

### 关键技术要素
1. **流式协议**: Server-Sent Events (SSE) 或 WebSocket
2. **异步生成器**: 处理流式数据的编程模式
3. **前端渐进渲染**: 打字机效果的视觉实现
4. **错误处理**: 连接中断和回退机制

## 技术架构设计

### 1. 通用事件格式

```typescript
interface StreamEvent<T = any> {
  type: string;           // 事件类型
  data: T;               // 事件数据
  timestamp?: number;     // 时间戳（可选）
  id?: string;           // 事件ID（可选）
}

// 常用事件类型
type CommonEventTypes =
  | "stream_start"       // 流开始
  | "content_chunk"      // 内容片段
  | "content_complete"   // 内容完成
  | "stream_end"         // 流结束
  | "error"              // 错误
  | "metadata";          // 元数据
```

### 2. 通用SSE数据格式

```
data: {"type": "content_chunk", "data": {"content": "Hello", "index": 0}}

data: {"type": "content_complete", "data": {"total_content": "Hello World", "metadata": {}}}

data: [DONE]

```

## 后端实现方案

### FastAPI + Python

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio
import json
from typing import AsyncGenerator, Dict, Any

app = FastAPI()

class StreamEventSerializer:
    @staticmethod
    def serialize(event_type: str, data: Dict[str, Any]) -> str:
        event = {"type": event_type, "data": data}
        return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

class UniversalLLMStreamer:
    def __init__(self, provider: str = "openai"):
        self.provider = provider

    async def stream_completion(self, prompt: str, **kwargs) -> AsyncGenerator[str, None]:
        """通用LLM流式调用"""
        if self.provider == "openai":
            yield from self._stream_openai(prompt, **kwargs)
        elif self.provider == "anthropic":
            yield from self._stream_anthropic(prompt, **kwargs)
        elif self.provider == "deepseek":
            yield from self._stream_deepseek(prompt, **kwargs)
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    async def _stream_openai(self, prompt: str, **kwargs) -> AsyncGenerator[str, None]:
        # OpenAI实现示例
        import openai
        client = openai.AsyncOpenAI()
        response = await client.chat.completions.create(
            model=kwargs.get("model", "gpt-3.5-turbo"),
            messages=[{"role": "user", "content": prompt}],
            stream=True
        )
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _stream_anthropic(self, prompt: str, **kwargs) -> AsyncGenerator[str, None]:
        # Anthropic实现示例
        import anthropic
        client = anthropic.AsyncAnthropic()
        async with client.messages.stream(
            model=kwargs.get("model", "claude-3-sonnet-20240229"),
            max_tokens=kwargs.get("max_tokens", 1000),
            messages=[{"role": "user", "content": prompt}]
        ) as stream:
            async for text in stream.text_stream:
                yield text

@app.post("/api/stream")
async def stream_endpoint(request: dict) -> StreamingResponse:
    """通用流式端点"""

    async def generate_stream():
        serializer = StreamEventSerializer()
        streamer = UniversalLLMStreamer(request.get("provider", "openai"))

        try:
            # 1. 发送开始事件
            yield serializer.serialize("stream_start", {
                "session_id": request.get("session_id"),
                "timestamp": time.time()
            })

            # 2. 流式生成内容
            accumulated = ""
            async for chunk in streamer.stream_completion(
                request["prompt"],
                **request.get("llm_params", {})
            ):
                if chunk:
                    accumulated += chunk
                    yield serializer.serialize("content_chunk", {
                        "content": chunk,
                        "accumulated_length": len(accumulated)
                    })
                    await asyncio.sleep(request.get("chunk_delay", 0.05))

            # 3. 发送完成事件
            yield serializer.serialize("content_complete", {
                "total_content": accumulated,
                "total_length": len(accumulated)
            })

        except Exception as e:
            yield serializer.serialize("error", {"message": str(e)})

        # 4. 结束标记
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        }
    )
```

### Express.js + Node.js

```javascript
const express = require('express');
const { OpenAI } = require('openai');

const app = express();

class StreamEventSerializer {
    static serialize(eventType, data) {
        return `data: ${JSON.stringify({ type: eventType, data })}\n\n`;
    }
}

class UniversalLLMStreamer {
    constructor(provider = 'openai') {
        this.provider = provider;
        this.initializeClient();
    }

    initializeClient() {
        switch (this.provider) {
            case 'openai':
                this.client = new OpenAI();
                break;
            // 添加其他提供商
        }
    }

    async* streamCompletion(prompt, options = {}) {
        if (this.provider === 'openai') {
            yield* this.streamOpenAI(prompt, options);
        }
        // 添加其他提供商的实现
    }

    async* streamOpenAI(prompt, options) {
        const stream = await this.client.chat.completions.create({
            model: options.model || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            stream: true,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                yield content;
            }
        }
    }
}

app.post('/api/stream', async (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    });

    const streamer = new UniversalLLMStreamer(req.body.provider);

    try {
        // 开始事件
        res.write(StreamEventSerializer.serialize('stream_start', {
            session_id: req.body.session_id,
            timestamp: Date.now()
        }));

        // 流式内容
        let accumulated = '';
        for await (const chunk of streamer.streamCompletion(req.body.prompt, req.body.llm_params)) {
            accumulated += chunk;
            res.write(StreamEventSerializer.serialize('content_chunk', {
                content: chunk,
                accumulated_length: accumulated.length
            }));

            // 控制速度
            await new Promise(resolve => setTimeout(resolve, req.body.chunk_delay || 50));
        }

        // 完成事件
        res.write(StreamEventSerializer.serialize('content_complete', {
            total_content: accumulated,
            total_length: accumulated.length
        }));

    } catch (error) {
        res.write(StreamEventSerializer.serialize('error', { message: error.message }));
    } finally {
        res.write('data: [DONE]\n\n');
        res.end();
    }
});
```

### Django + Python

```python
from django.http import StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
import json
import asyncio

@csrf_exempt
async def stream_view(request):
    async def event_generator():
        try:
            data = json.loads(request.body)
            prompt = data['prompt']

            # 初始化流式器
            streamer = UniversalLLMStreamer(data.get('provider', 'openai'))

            yield f"data: {json.dumps({'type': 'stream_start', 'data': {}})}\n\n"

            accumulated = ""
            async for chunk in streamer.stream_completion(prompt):
                accumulated += chunk
                yield f"data: {json.dumps({'type': 'content_chunk', 'data': {'content': chunk}})}\n\n"
                await asyncio.sleep(0.05)

            yield f"data: {json.dumps({'type': 'content_complete', 'data': {'total_content': accumulated}})}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': {'message': str(e)}})}\n\n"

    return StreamingHttpResponse(
        event_generator(),
        content_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        }
    )
```

## 前端实现方案

### React + TypeScript

```typescript
// 通用流式事件类型
export interface StreamEvent<T = any> {
  type: string;
  data: T;
}

// 通用SSE客户端
export class UniversalStreamClient {
  private controller: AbortController;

  constructor() {
    this.controller = new AbortController();
  }

  async createStream<T = any>(
    endpoint: string,
    payload: any,
    allowedEvents: string[] = []
  ): Promise<AsyncGenerator<StreamEvent<T>, void, unknown>> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: this.controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Streaming not supported');
    }

    return this.parseEventStream<T>(reader, allowedEvents);
  }

  private async *parseEventStream<T>(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    allowedEvents: string[]
  ): AsyncGenerator<StreamEvent<T>, void, unknown> {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }

        const events = this.extractEvents(buffer, allowedEvents);
        for (const event of events.events) {
          yield event;
        }

        buffer = events.remaining;

        if (events.done || done) {
          break;
        }
      }
    } finally {
      await reader.cancel();
      this.controller.abort();
    }
  }

  private extractEvents(buffer: string, allowedEvents: string[]) {
    const events: StreamEvent[] = [];
    let remaining = buffer;
    let done = false;

    while (true) {
      const eventEnd = remaining.indexOf('\n\n');
      if (eventEnd === -1) break;

      const eventData = remaining.slice(0, eventEnd).trim();
      remaining = remaining.slice(eventEnd + 2);

      if (!eventData.startsWith('data: ')) continue;

      const dataStr = eventData.slice(6);
      if (dataStr === '[DONE]') {
        done = true;
        break;
      }

      try {
        const parsed = JSON.parse(dataStr);
        if (!allowedEvents.length || allowedEvents.includes(parsed.type)) {
          events.push(parsed);
        }
      } catch (error) {
        events.push({
          type: 'error',
          data: { message: 'Parse error', raw: dataStr }
        });
      }
    }

    return { events, remaining, done };
  }

  abort() {
    this.controller.abort();
  }
}

// 通用打字机组件
export interface TypewriterProps {
  content: string;
  isTyping: boolean;
  speed?: number;
  onComplete?: () => void;
  className?: string;
}

export const UniversalTypewriter: React.FC<TypewriterProps> = ({
  content,
  isTyping,
  speed = 50,
  onComplete,
  className = ''
}) => {
  const [displayedContent, setDisplayedContent] = useState('');
  const [showCursor, setShowCursor] = useState(false);

  const contentRef = useRef(content);
  const indexRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    contentRef.current = content;

    if (!isTyping) {
      setDisplayedContent(content);
      indexRef.current = content.length;
      return;
    }

    if (content.length < indexRef.current) {
      indexRef.current = 0;
      setDisplayedContent('');
    }
  }, [content, isTyping]);

  useEffect(() => {
    if (!isTyping) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const typeNextChar = () => {
      const currentContent = contentRef.current;
      if (indexRef.current >= currentContent.length) return;

      indexRef.current++;
      setDisplayedContent(currentContent.slice(0, indexRef.current));
    };

    intervalRef.current = setInterval(typeNextChar, speed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isTyping, speed]);

  useEffect(() => {
    if (isTyping) {
      setShowCursor(true);
    } else {
      onComplete?.();
      setShowCursor(true);
      const timer = setTimeout(() => setShowCursor(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isTyping, onComplete]);

  return (
    <div className={`typewriter ${className}`}>
      <span>{displayedContent}</span>
      {showCursor && (
        <span className="cursor animate-pulse">|</span>
      )}
    </div>
  );
};

// 使用示例
export const StreamingChat: React.FC = () => {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartStream = async (prompt: string) => {
    const client = new UniversalStreamClient();
    setIsStreaming(true);
    setContent('');
    setError(null);

    try {
      const stream = await client.createStream('/api/stream', {
        prompt,
        provider: 'openai',
        chunk_delay: 50
      }, ['content_chunk', 'content_complete', 'error']);

      for await (const event of stream) {
        switch (event.type) {
          case 'content_chunk':
            setContent(prev => prev + event.data.content);
            break;

          case 'content_complete':
            setContent(event.data.total_content);
            setIsStreaming(false);
            break;

          case 'error':
            setError(event.data.message);
            setIsStreaming(false);
            break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsStreaming(false);
    }
  };

  return (
    <div>
      <UniversalTypewriter
        content={content}
        isTyping={isStreaming}
        speed={50}
        onComplete={() => console.log('Typing complete')}
      />
      {error && <div className="error">{error}</div>}
    </div>
  );
};
```

### Vue 3 + TypeScript

```vue
<template>
  <div class="streaming-container">
    <UniversalTypewriter
      :content="content"
      :is-typing="isStreaming"
      :speed="50"
      @complete="onTypingComplete"
    />
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { UniversalStreamClient } from './StreamClient';
import UniversalTypewriter from './UniversalTypewriter.vue';

const content = ref('');
const isStreaming = ref(false);
const error = ref<string | null>(null);

const startStreaming = async (prompt: string) => {
  const client = new UniversalStreamClient();
  isStreaming.value = true;
  content.value = '';
  error.value = null;

  try {
    const stream = await client.createStream('/api/stream', {
      prompt,
      provider: 'openai'
    });

    for await (const event of stream) {
      switch (event.type) {
        case 'content_chunk':
          content.value += event.data.content;
          break;

        case 'content_complete':
          content.value = event.data.total_content;
          isStreaming.value = false;
          break;

        case 'error':
          error.value = event.data.message;
          isStreaming.value = false;
          break;
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error';
    isStreaming.value = false;
  }
};

const onTypingComplete = () => {
  console.log('Typing animation completed');
};
</script>
```

### Vanilla JavaScript

```javascript
class UniversalStreamClient {
  constructor() {
    this.controller = new AbortController();
  }

  async createStream(endpoint, payload, allowedEvents = []) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: this.controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return this.parseEventStream(response.body.getReader(), allowedEvents);
  }

  async *parseEventStream(reader, allowedEvents) {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }

        const { events, remaining, done: streamDone } = this.extractEvents(buffer, allowedEvents);

        for (const event of events) {
          yield event;
        }

        buffer = remaining;

        if (streamDone || done) break;
      }
    } finally {
      await reader.cancel();
      this.controller.abort();
    }
  }

  extractEvents(buffer, allowedEvents) {
    const events = [];
    let remaining = buffer;
    let done = false;

    while (true) {
      const eventEnd = remaining.indexOf('\n\n');
      if (eventEnd === -1) break;

      const eventData = remaining.slice(0, eventEnd).trim();
      remaining = remaining.slice(eventEnd + 2);

      if (!eventData.startsWith('data: ')) continue;

      const dataStr = eventData.slice(6);
      if (dataStr === '[DONE]') {
        done = true;
        break;
      }

      try {
        const parsed = JSON.parse(dataStr);
        if (!allowedEvents.length || allowedEvents.includes(parsed.type)) {
          events.push(parsed);
        }
      } catch (error) {
        events.push({
          type: 'error',
          data: { message: 'Parse error', raw: dataStr }
        });
      }
    }

    return { events, remaining, done };
  }
}

class UniversalTypewriter {
  constructor(element, options = {}) {
    this.element = element;
    this.speed = options.speed || 50;
    this.onComplete = options.onComplete || (() => {});

    this.content = '';
    this.displayedContent = '';
    this.isTyping = false;
    this.currentIndex = 0;
    this.interval = null;
  }

  setContent(content, isTyping = false) {
    this.content = content;
    this.isTyping = isTyping;

    if (!isTyping) {
      this.displayedContent = content;
      this.currentIndex = content.length;
      this.render();
      return;
    }

    if (content.length < this.currentIndex) {
      this.currentIndex = 0;
      this.displayedContent = '';
    }

    this.startTyping();
  }

  startTyping() {
    if (this.interval) {
      clearInterval(this.interval);
    }

    this.interval = setInterval(() => {
      if (this.currentIndex >= this.content.length) {
        this.stopTyping();
        return;
      }

      this.currentIndex++;
      this.displayedContent = this.content.slice(0, this.currentIndex);
      this.render();
    }, this.speed);
  }

  stopTyping() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isTyping = false;
    this.onComplete();
  }

  render() {
    const cursor = this.isTyping ? '<span class="cursor">|</span>' : '';
    this.element.innerHTML = `${this.displayedContent}${cursor}`;
  }
}

// 使用示例
async function startStreamingChat(prompt) {
  const client = new UniversalStreamClient();
  const typewriter = new UniversalTypewriter(
    document.getElementById('output'),
    {
      speed: 50,
      onComplete: () => console.log('Typing complete')
    }
  );

  let content = '';

  try {
    const stream = await client.createStream('/api/stream', {
      prompt,
      provider: 'openai'
    });

    for await (const event of stream) {
      switch (event.type) {
        case 'content_chunk':
          content += event.data.content;
          typewriter.setContent(content, true);
          break;

        case 'content_complete':
          typewriter.setContent(event.data.total_content, false);
          break;

        case 'error':
          console.error('Stream error:', event.data.message);
          break;
      }
    }
  } catch (error) {
    console.error('Failed to start stream:', error);
  }
}
```

## LLM提供商适配

### OpenAI

```python
class OpenAIAdapter:
    def __init__(self, api_key: str):
        import openai
        self.client = openai.AsyncOpenAI(api_key=api_key)

    async def stream_completion(self, prompt: str, **kwargs) -> AsyncGenerator[str, None]:
        response = await self.client.chat.completions.create(
            model=kwargs.get("model", "gpt-3.5-turbo"),
            messages=[{"role": "user", "content": prompt}],
            stream=True,
            **kwargs
        )

        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
```

### Anthropic Claude

```python
class AnthropicAdapter:
    def __init__(self, api_key: str):
        import anthropic
        self.client = anthropic.AsyncAnthropic(api_key=api_key)

    async def stream_completion(self, prompt: str, **kwargs) -> AsyncGenerator[str, None]:
        async with self.client.messages.stream(
            model=kwargs.get("model", "claude-3-sonnet-20240229"),
            max_tokens=kwargs.get("max_tokens", 1000),
            messages=[{"role": "user", "content": prompt}]
        ) as stream:
            async for text in stream.text_stream:
                yield text
```

### Google Gemini

```python
class GeminiAdapter:
    def __init__(self, api_key: str):
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-pro')

    async def stream_completion(self, prompt: str, **kwargs) -> AsyncGenerator[str, None]:
        response = await self.model.generate_content_async(
            prompt,
            stream=True,
            **kwargs
        )

        async for chunk in response:
            if chunk.text:
                yield chunk.text
```

### 本地模型 (Ollama)

```python
class OllamaAdapter:
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url

    async def stream_completion(self, prompt: str, **kwargs) -> AsyncGenerator[str, None]:
        import aiohttp

        payload = {
            "model": kwargs.get("model", "llama2"),
            "prompt": prompt,
            "stream": True
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/api/generate",
                json=payload
            ) as response:
                async for line in response.content:
                    if line:
                        data = json.loads(line.decode())
                        if "response" in data:
                            yield data["response"]
```

## 错误处理和重试机制

### 通用错误处理

```typescript
class StreamErrorHandler {
  private maxRetries: number;
  private retryDelay: number;

  constructor(maxRetries = 3, retryDelay = 1000) {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  async withRetry<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * attempt);
          continue;
        }

        // 最后一次重试失败，尝试fallback
        if (fallback) {
          try {
            return await fallback();
          } catch (fallbackError) {
            throw new Error(
              `All retries failed. Last error: ${lastError.message}. Fallback error: ${fallbackError}`
            );
          }
        }

        throw lastError;
      }
    }

    throw lastError!;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 使用示例
const errorHandler = new StreamErrorHandler(3, 1000);

const streamWithFallback = await errorHandler.withRetry(
  // 主要操作：流式API
  () => client.createStream('/api/stream', { prompt }),

  // 回退操作：普通API
  () => fetch('/api/completion', {
    method: 'POST',
    body: JSON.stringify({ prompt })
  }).then(r => r.json())
);
```

## 性能优化

### 1. 连接池管理

```typescript
class StreamConnectionPool {
  private connections: Map<string, UniversalStreamClient>;
  private maxConnections: number;

  constructor(maxConnections = 10) {
    this.connections = new Map();
    this.maxConnections = maxConnections;
  }

  getConnection(endpoint: string): UniversalStreamClient {
    if (this.connections.has(endpoint)) {
      return this.connections.get(endpoint)!;
    }

    if (this.connections.size >= this.maxConnections) {
      // 清理最老的连接
      const [oldestKey] = this.connections.keys();
      this.connections.get(oldestKey)?.abort();
      this.connections.delete(oldestKey);
    }

    const client = new UniversalStreamClient();
    this.connections.set(endpoint, client);
    return client;
  }

  cleanup() {
    for (const client of this.connections.values()) {
      client.abort();
    }
    this.connections.clear();
  }
}
```

### 2. 内容缓存

```typescript
class StreamContentCache {
  private cache: Map<string, string>;
  private maxSize: number;

  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: string): string | undefined {
    const value = this.cache.get(key);
    if (value) {
      // LRU: 移到最后
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: string): void {
    if (this.cache.size >= this.maxSize) {
      // 删除最老的条目
      const [oldestKey] = this.cache.keys();
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }
}
```

### 3. 批量处理

```typescript
class StreamBatchProcessor {
  private batchSize: number;
  private batchDelay: number;
  private pendingChunks: string[];
  private timeoutId: NodeJS.Timeout | null;

  constructor(batchSize = 5, batchDelay = 100) {
    this.batchSize = batchSize;
    this.batchDelay = batchDelay;
    this.pendingChunks = [];
    this.timeoutId = null;
  }

  addChunk(chunk: string, onBatch: (batch: string) => void): void {
    this.pendingChunks.push(chunk);

    if (this.pendingChunks.length >= this.batchSize) {
      this.flushBatch(onBatch);
    } else if (!this.timeoutId) {
      this.timeoutId = setTimeout(() => {
        this.flushBatch(onBatch);
      }, this.batchDelay);
    }
  }

  private flushBatch(onBatch: (batch: string) => void): void {
    if (this.pendingChunks.length > 0) {
      const batch = this.pendingChunks.join('');
      this.pendingChunks = [];
      onBatch(batch);
    }

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
```

## 监控和调试

### 流式监控系统

```typescript
interface StreamMetrics {
  connectionTime: number;
  firstChunkTime: number;
  totalChunks: number;
  totalBytes: number;
  errors: number;
  completionTime: number;
}

class StreamMonitor {
  private metrics: Map<string, StreamMetrics>;

  constructor() {
    this.metrics = new Map();
  }

  startSession(sessionId: string): void {
    this.metrics.set(sessionId, {
      connectionTime: Date.now(),
      firstChunkTime: 0,
      totalChunks: 0,
      totalBytes: 0,
      errors: 0,
      completionTime: 0
    });
  }

  recordChunk(sessionId: string, chunkSize: number): void {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) return;

    if (metrics.firstChunkTime === 0) {
      metrics.firstChunkTime = Date.now() - metrics.connectionTime;
    }

    metrics.totalChunks++;
    metrics.totalBytes += chunkSize;
  }

  recordError(sessionId: string): void {
    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      metrics.errors++;
    }
  }

  endSession(sessionId: string): StreamMetrics | null {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) return null;

    metrics.completionTime = Date.now() - metrics.connectionTime;
    this.metrics.delete(sessionId);

    // 发送到监控系统
    this.sendToMonitoring(sessionId, metrics);

    return metrics;
  }

  private sendToMonitoring(sessionId: string, metrics: StreamMetrics): void {
    // 发送到你的监控服务
    console.log(`Stream ${sessionId} completed:`, {
      firstChunkLatency: metrics.firstChunkTime,
      totalDuration: metrics.completionTime,
      throughput: metrics.totalBytes / (metrics.completionTime / 1000),
      errorRate: metrics.errors / metrics.totalChunks
    });
  }
}
```

## 部署配置

### Nginx配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # SSE特定配置
    location /api/stream {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # SSE关键配置
        proxy_cache off;
        proxy_buffering off;
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;

        # CORS
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type";
    }
}
```

### Docker配置

```dockerfile
# 多阶段构建示例
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim AS backend
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./static

# 流式服务器配置
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

## 测试方案

### 端到端测试

```javascript
// test/streaming.test.js
const { test, expect } = require('@playwright/test');

test('streaming typewriter effect', async ({ page }) => {
  await page.goto('/chat');

  // 启动流式输出
  await page.fill('#prompt', 'Hello world');
  await page.click('#send');

  // 验证打字机效果
  const output = page.locator('#output');

  // 等待第一个字符
  await expect(output).toContainText('H', { timeout: 1000 });

  // 验证逐步显示
  await page.waitForFunction(() => {
    const element = document.querySelector('#output');
    return element && element.textContent.length > 5;
  });

  // 验证完整内容
  await expect(output).toContainText('Hello world', { timeout: 10000 });

  // 验证光标消失
  await expect(page.locator('.cursor')).toBeHidden({ timeout: 1000 });
});

test('streaming error handling', async ({ page }) => {
  // 模拟网络错误
  await page.route('/api/stream', route => {
    route.abort('failed');
  });

  await page.goto('/chat');
  await page.fill('#prompt', 'Test error');
  await page.click('#send');

  // 验证错误处理
  await expect(page.locator('.error')).toBeVisible();
});
```

### 性能测试

```javascript
// test/performance.test.js
const { performance } = require('perf_hooks');

async function testStreamingPerformance() {
  const client = new UniversalStreamClient();
  const startTime = performance.now();

  let firstChunkTime = 0;
  let chunkCount = 0;

  const stream = await client.createStream('/api/stream', {
    prompt: 'Generate a long response with many details...'
  });

  for await (const event of stream) {
    if (event.type === 'content_chunk') {
      chunkCount++;
      if (firstChunkTime === 0) {
        firstChunkTime = performance.now() - startTime;
      }
    }
  }

  const totalTime = performance.now() - startTime;

  console.log({
    firstChunkLatency: firstChunkTime,
    totalTime,
    chunksPerSecond: chunkCount / (totalTime / 1000),
    averageChunkInterval: totalTime / chunkCount
  });
}
```

## 最佳实践

1. **连接管理**: 始终使用AbortController管理连接
2. **错误处理**: 实现多层错误处理和回退机制
3. **性能优化**: 合理设置chunk延迟和批量处理
4. **用户体验**: 提供加载状态和进度指示
5. **监控**: 实现完整的性能监控和错误追踪
6. **缓存**: 合理使用缓存减少重复请求
7. **安全**: 实现输入验证和速率限制

## 故障排除

### 常见问题

1. **连接提前关闭**: 检查`[DONE]`标记发送
2. **内存泄漏**: 清理定时器和事件监听器
3. **性能问题**: 调整chunk大小和延迟
4. **浏览器兼容性**: 使用polyfill支持旧浏览器
5. **CORS问题**: 配置正确的跨域头

这份通用指南可以应用于任何需要实现流式输出的项目，只需根据具体技术栈选择对应的实现方案即可。