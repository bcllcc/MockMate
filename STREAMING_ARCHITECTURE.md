# MockMate 流式架构设计

## 整体架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React前端     │    │   FastAPI后端   │    │   DeepSeek API  │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │StreamingMsg │ │    │ │LLM Service  │ │    │ │Stream Chat  │ │
│ │ Component   │ │    │ │             │◄────┤ │Completions  │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│        ▲        │    │        ▲        │    │                 │
│        │        │    │        │        │    └─────────────────┘
│ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │Interview    │ │    │ │SSE Routes   │ │
│ │ Console     │ │◄──►│ │/start       │ │
│ └─────────────┘ │SSE │ │/respond     │ │
│        ▲        │    │ └─────────────┘ │
│        │        │    │                 │
│ ┌─────────────┐ │    └─────────────────┘
│ │API Client   │ │
│ │AsyncGen     │ │
│ └─────────────┘ │
│                 │
└─────────────────┘
```

## 数据流时序图

### 启动面试流程
```
用户          React组件      API客户端      后端路由       LLM服务       DeepSeek
 │               │             │             │             │             │
 │ 点击开始       │             │             │             │             │
 ├──────────────►│             │             │             │             │
 │               │ 调用流式API  │             │             │             │
 │               ├────────────►│             │             │             │
 │               │             │ HTTP POST   │             │             │
 │               │             ├────────────►│             │             │
 │               │             │             │ 创建会话     │             │
 │               │             │             ├────────────►│             │
 │               │             │             │             │ 流式调用     │
 │               │             │             │             ├────────────►│
 │               │             │             │             │             │
 │               │             │ session_started          │ chunk1      │
 │               │             │◄────────────┤             │◄────────────┤
 │               │ session_started           │             │ chunk2      │
 │               │◄────────────┤             │             │◄────────────┤
 │ 设置sessionId  │             │ question_chunk           │ ...         │
 │◄──────────────┤             │◄────────────┤             │◄────────────┤
 │               │ question_chunk            │             │ [DONE]      │
 │               │◄────────────┤             │             │◄────────────┤
 │ 打字机效果     │             │ question_complete        │             │
 │◄──────────────┤             │◄────────────┤             │             │
 │               │             │ [DONE]      │             │             │
 │               │             │◄────────────┤             │             │
```

### 回答问题流程
```
用户          React组件      API客户端      后端路由       LLM服务       DeepSeek
 │               │             │             │             │             │
 │ 提交答案       │             │             │             │             │
 ├──────────────►│             │             │             │             │
 │               │ 添加到历史   │             │             │             │
 │               ├─────────────┤             │             │             │
 │               │ 调用流式API  │             │             │             │
 │               ├────────────►│             │             │             │
 │               │             │ HTTP POST   │             │             │
 │               │             ├────────────►│             │             │
 │               │             │             │ 记录回答     │             │
 │               │             │             ├────────────►│             │
 │               │             │             │             │ 流式调用     │
 │               │             │             │             ├────────────►│
 │               │             │             │             │             │
 │               │             │ question_chunk           │ chunk1      │
 │               │             │◄────────────┤             │◄────────────┤
 │               │ question_chunk            │             │ chunk2      │
 │               │◄────────────┤             │             │◄────────────┤
 │ 打字机效果     │             │ ...         │             │ ...         │
 │◄──────────────┤             │◄────────────┤             │◄────────────┤
 │               │             │ question_complete        │ [DONE]      │
 │               │             │◄────────────┤             │◄────────────┤
 │ 显示完整问题   │             │ [DONE]      │             │             │
 │◄──────────────┤             │◄────────────┤             │             │
```

## 关键组件详解

### 1. LLM服务层 (`backend/app/services/llm.py`)

**职责:**
- 与DeepSeek API建立流式连接
- 管理异步生成器
- 提供错误回退机制

**核心方法:**
```python
class LLMService:
    async def _chat_stream(self, messages: list) -> AsyncGenerator[str, None]:
        """基础流式聊天方法"""

    async def generate_first_question_stream(self, resume_text: str, target_role: str) -> AsyncGenerator[str, None]:
        """流式生成首个问题"""

    async def generate_follow_up_question_stream(self, history: list, resume_text: str, target_role: str) -> AsyncGenerator[str, None]:
        """流式生成后续问题"""
```

### 2. SSE路由层 (`backend/app/api/routes.py`)

**职责:**
- 处理HTTP请求转SSE响应
- 管理事件序列化
- 确保连接正确关闭

**事件格式:**
```python
def _serialize_event(event_type: str, data: dict) -> str:
    return f"data: {json.dumps({'type': event_type, 'data': data}, ensure_ascii=False)}\n\n"
```

**事件类型:**
- `session_started`: 会话创建成功
- `question_chunk`: 问题片段
- `question_complete`: 问题完成
- `interview_complete`: 面试结束
- `error`: 错误信息

### 3. 前端API客户端 (`frontend/src/lib/api.ts`)

**职责:**
- 建立SSE连接
- 解析事件流
- 提供异步生成器接口

**核心模式:**
```typescript
async function* streamIterator(): AsyncGenerator<StreamEvent, void, unknown> {
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (value) {
            buffer += decoder.decode(value, { stream: true });
        }

        // 解析事件
        const { events, done: shouldStop } = collectEvents();
        for (const event of events) {
            yield event;
        }

        if (shouldStop || done) return;
    }
}
```

### 4. 流式消息组件 (`frontend/src/components/StreamingMessage.tsx`)

**职责:**
- 实现打字机视觉效果
- 管理光标动画
- 处理流式状态变化

**核心逻辑:**
```typescript
// 字符逐个显示
const step = () => {
    if (charIndexRef.current < contentRef.current.length) {
        charIndexRef.current += 1;
        setDisplayed(contentRef.current.slice(0, charIndexRef.current));
    }
};

const intervalId = setInterval(step, speed);
```

### 5. 面试控制台集成 (`frontend/src/app/page.tsx`)

**职责:**
- 协调各组件状态
- 处理用户交互
- 管理错误回退

**状态管理:**
```typescript
const [sessionId, setSessionId] = useState<string | null>(null);
const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
const [streamingQuestion, setStreamingQuestion] = useState<string>("");
const [isStreamingQuestion, setIsStreamingQuestion] = useState<boolean>(false);
```

## 性能优化策略

### 1. 流式速度控制
- 后端: `await asyncio.sleep(0.05)` 控制chunk发送频率
- 前端: `speed = 50ms` 控制打字机速度

### 2. 内存管理
- 及时清理定时器和事件监听器
- 使用 `AbortController` 管理连接
- 合理的缓冲区大小

### 3. 错误恢复
- 双重API支持（流式 + 普通）
- 自动回退机制
- 用户友好的错误提示

## 扩展性设计

### 1. 支持更多事件类型
```typescript
type StreamEvent = {
  type: "session_started" | "question_chunk" | "question_complete" |
        "interview_complete" | "typing_indicator" | "confidence_score" | "error";
  data: any;
}
```

### 2. 可配置的流式参数
```typescript
interface StreamingConfig {
  chunkDelay: number;      // 后端chunk发送间隔
  typingSpeed: number;     // 前端打字速度
  cursorBlinkRate: number; // 光标闪烁频率
  bufferSize: number;      // 缓冲区大小
}
```

### 3. 多模态支持
- 文本流式输出
- 图片渐进加载
- 音频流式播放
- 代码语法高亮

## 监控和调试

### 1. 关键指标
- SSE连接成功率
- 平均延迟时间
- 错误率和类型
- 用户体验评分

### 2. 调试工具
- 浏览器开发者工具 Network 面板
- 后端日志记录
- 前端控制台事件追踪
- E2E测试脚本

### 3. 性能基准
- 首字符显示时间 < 500ms
- 完整问题加载时间 < 5s
- 错误恢复时间 < 2s
- 内存使用量 < 50MB

这个架构设计确保了流式功能的可靠性、性能和可维护性，为未来的功能扩展提供了坚实的基础。