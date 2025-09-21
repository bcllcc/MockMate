# MockMate 流式效果实现完整指南

## 概述

本文档记录了在 MockMate AI面试模拟器中实现完整流式打字机效果的全流程，包括AI面试官问题的实时流式输出和用户交互体验。

## 技术架构

### 核心技术栈
- **后端**: FastAPI + Server-Sent Events (SSE)
- **LLM**: DeepSeek API 流式响应
- **前端**: React + TypeScript + AsyncGenerator
- **流式协议**: SSE (text/event-stream)

### 流式事件类型
```typescript
type StreamEvent = {
  type: "session_started" | "question_chunk" | "question_complete" | "interview_complete" | "error";
  data: any;
}
```

## 实现步骤

### 1. 后端LLM服务流式支持

#### 文件: `backend/app/services/llm.py`

**关键方法:**
```python
async def _chat_stream(self, messages: list, **kwargs) -> AsyncGenerator[str, None]:
    """流式调用LLM，返回异步生成器"""
    response = await self._client.chat.completions.create(
        model=self._model,
        messages=messages,
        stream=True,  # 关键: 启用流式响应
        **kwargs
    )
    async for chunk in response:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content

async def generate_first_question_stream(self, resume_text: str, target_role: str, language: str = "en") -> AsyncGenerator[str, None]:
    """流式生成第一个面试问题"""
    # 构建提示词
    prompt = f"""基于简历和目标职位，生成一个开场面试问题。
    简历：{resume_text}
    目标职位：{target_role}
    请生成一个简洁、专业的开场问题。"""

    try:
        async for chunk in self._chat_stream([{"role": "user", "content": prompt}]):
            yield chunk
    except Exception as e:
        # 错误回退机制
        fallback = "Could you please introduce yourself and tell me about your relevant work experience?"
        for char in fallback:
            yield char

async def generate_follow_up_question_stream(self, history: list, resume_text: str, target_role: str, language: str = "en") -> AsyncGenerator[str, None]:
    """流式生成后续面试问题"""
    conversation = "\n".join([f"{turn['role']}: {turn['content']}" for turn in history])
    prompt = f"""基于对话历史生成下一个合适的面试问题。
    对话历史：{conversation}
    简历：{resume_text}
    目标职位：{target_role}"""

    async for chunk in self._chat_stream([{"role": "user", "content": prompt}]):
        yield chunk
```

### 2. 后端API路由实现

#### 文件: `backend/app/api/routes.py`

**流式启动面试:**
```python
@router.post("/interview/start")
async def start_interview(payload: InterviewStartRequest) -> StreamingResponse:
    """Start an interview session and stream the first question."""

    def _serialize_event(event_type: str, data: dict) -> str:
        return f"data: {json.dumps({'type': event_type, 'data': data}, ensure_ascii=False)}\n\n"

    async def generate_stream():
        session_id: str | None = None
        try:
            # 1. 创建面试会话
            result = _interview_manager.start(
                user_id=payload.user_id,
                resume_summary=payload.resume_summary,
                job_description=payload.job_description,
                language=payload.language,
                interviewer_style=payload.interviewer_style,
                question_count=payload.question_count,
            )

            session_id = result["session_id"]
            # 2. 发送会话启动事件
            yield _serialize_event("session_started", {"session_id": session_id})

            # 3. 流式生成第一个问题
            accumulated = ""
            async for chunk in _llm_service.generate_first_question_stream(
                payload.resume_summary,
                payload.job_description,
                payload.language,
            ):
                if chunk:
                    accumulated += chunk
                    yield _serialize_event("question_chunk", {"content": chunk, "finished": False})
                    await asyncio.sleep(0.05)  # 控制流式速度

            # 4. 发送问题完成事件
            yield _serialize_event("question_complete", {
                "session_id": session_id,
                "completed": False,
                "total_content": accumulated.strip(),
            })

        except Exception as exc:
            yield _serialize_event("error", {"message": str(exc)})

        # 5. 关键: 始终发送结束标记
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
        },
    )
```

**流式回答处理:**
```python
@router.post("/interview/respond-stream")
async def respond_interview_stream(payload: InterviewResponseRequest) -> StreamingResponse:
    """流式响应面试回答，返回Server-Sent Events格式数据"""

    async def generate_stream():
        has_error = False

        # 错误检查和会话验证
        try:
            with SessionLocal() as db:
                session = _interview_manager._get_session(db, payload.session_id)
                if session is None:
                    yield _serialize_event('error', {'message': 'Session not found'})
                    has_error = True
        except Exception as e:
            yield _serialize_event('error', {'message': 'Database error occurred'})
            has_error = True

        # 主要处理逻辑
        if not has_error:
            try:
                # 记录用户回答
                # 判断是否完成面试
                # 流式生成下一个问题
                accumulated_question = ''
                async for chunk in _llm_service.generate_follow_up_question_stream(...):
                    accumulated_question += chunk
                    yield _serialize_event('question_chunk', {'content': chunk, 'finished': False})
                    await asyncio.sleep(0.05)

                yield _serialize_event('question_complete', {
                    'session_id': payload.session_id,
                    'completed': False,
                    'total_content': accumulated_question.strip(),
                })
            except Exception as e:
                yield _serialize_event('error', {'message': str(e)})

        # 关键: 始终发送结束标记
        yield "data: [DONE]\n\n"
```

### 3. 前端API客户端

#### 文件: `frontend/src/lib/api.ts`

**流式事件类型定义:**
```typescript
export type StreamEvent = {
  type: "session_started" | "question_chunk" | "question_complete" | "interview_complete" | "error";
  data: any;
};
```

**通用流式迭代器创建函数:**
```typescript
async function createStreamIterator(
  endpoint: string,
  payload: unknown,
  allowedTypes: StreamEvent["type"][],
): Promise<AsyncGenerator<StreamEvent, void, unknown>> {
  const controller = new AbortController();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  if (!response.ok) {
    controller.abort();
    const text = await response.text();
    throw new Error(text || response.statusText);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  const allowed = new Set<StreamEvent["type"]>(allowedTypes);
  allowed.add("error");

  const collectEvents = (): { events: StreamEvent[]; done: boolean } => {
    const events: StreamEvent[] = [];
    let done = false;

    while (true) {
      const delimiterIndex = buffer.indexOf("\n\n");
      if (delimiterIndex === -1) break;

      const rawEvent = buffer.slice(0, delimiterIndex).trim();
      buffer = buffer.slice(delimiterIndex + 2);

      if (!rawEvent || !rawEvent.startsWith("data:")) continue;

      const dataStr = rawEvent.slice(5).trim();
      if (!dataStr) continue;

      if (dataStr === "[DONE]") {
        done = true;
        break;
      }

      try {
        const parsed = JSON.parse(dataStr) as { type?: string; data?: any };
        const eventType = parsed?.type;
        if (eventType && allowed.has(eventType as StreamEvent["type"])) {
          events.push({
            type: eventType as StreamEvent["type"],
            data: parsed.data,
          });
        }
      } catch (err) {
        events.push({
          type: "error",
          data: { message: "Failed to parse stream event", raw: dataStr },
        });
      }
    }

    return { events, done };
  };

  const iterator = (async function* (): AsyncGenerator<StreamEvent, void, unknown> {
    try {
      while (true) {
        const { value, done } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        }

        const { events, done: shouldStop } = collectEvents();
        for (const event of events) {
          yield event;
        }
        if (shouldStop) return;

        if (done) {
          buffer += decoder.decode().replace(/\r\n/g, "\n");
          const final = collectEvents();
          for (const event of final.events) {
            yield event;
          }
          return;
        }
      }
    } catch (error) {
      yield {
        type: "error",
        data: { message: error instanceof Error ? error.message : String(error) },
      };
    } finally {
      try {
        await reader.cancel();
      } catch {}
      controller.abort();
    }
  })();

  return iterator;
}
```

**具体API函数:**
```typescript
export async function startInterviewStream(payload: StartInterviewPayload): Promise<AsyncGenerator<StreamEvent, void, unknown>> {
  return createStreamIterator(
    `${API_BASE_URL}/interview/start`,
    payload,
    ["session_started", "question_chunk", "question_complete", "error"]
  );
}

export async function sendInterviewAnswerStream(payload: SendAnswerPayload): Promise<AsyncGenerator<StreamEvent, void, unknown>> {
  return createStreamIterator(
    `${API_BASE_URL}/interview/respond-stream`,
    payload,
    ["question_chunk", "question_complete", "interview_complete", "error"]
  );
}
```

### 4. 前端流式消息组件

#### 文件: `frontend/src/components/StreamingMessage.tsx`

**打字机效果组件:**
```typescript
export function StreamingMessage({
  content,
  isStreaming,
  onStreamComplete,
  speed = 50,
  className,
}: StreamingMessageProps) {
  const [displayed, setDisplayed] = useState("");
  const [showCursor, setShowCursor] = useState(false);

  const contentRef = useRef(content);
  const charIndexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 内容更新效果
  useEffect(() => {
    contentRef.current = content;
    if (isStreaming) {
      if (content.length < charIndexRef.current) {
        charIndexRef.current = 0;
        setDisplayed("");
      }
      return;
    }
    charIndexRef.current = content.length;
    setDisplayed(content);
  }, [content, isStreaming]);

  // 打字机动画效果
  useEffect(() => {
    if (!isStreaming) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const step = () => {
      const target = contentRef.current;
      if (charIndexRef.current >= target.length) return;

      charIndexRef.current += 1;
      setDisplayed(target.slice(0, charIndexRef.current));
    };

    step();
    const intervalId = setInterval(step, Math.max(10, speed));
    intervalRef.current = intervalId;

    return () => {
      clearInterval(intervalId);
      intervalRef.current = null;
    };
  }, [isStreaming, speed]);

  // 流式完成处理
  useEffect(() => {
    if (isStreaming) {
      setShowCursor(true);
    } else {
      charIndexRef.current = content.length;
      setDisplayed(content);
      onStreamComplete?.();

      // 显示光标片刻后隐藏
      setShowCursor(true);
      const timeout = setTimeout(() => setShowCursor(false), 600);
      return () => clearTimeout(timeout);
    }
  }, [isStreaming, content, onStreamComplete]);

  return (
    <div className={`${baseClasses} ${className || ""}`}>
      <span aria-live="polite">{displayed}</span>
      {showCursor && (
        <span
          aria-hidden="true"
          className="ml-1 inline-block h-5 w-[2px] bg-primary-400 align-middle animate-pulse"
        />
      )}
    </div>
  );
}
```

### 5. 前端界面集成

#### 文件: `frontend/src/app/page.tsx`

**流式启动面试:**
```typescript
const handleStartInterview = async () => {
  setIsProcessing(true);
  setIsStreamingQuestion(true);
  setStreamingQuestion("");

  try {
    const streamIterator = await startInterviewStream({
      user_id: userId,
      resume_summary: resume.summary.summary,
      job_description: jobDescription,
      interviewer_style: interviewerStyle,
      question_count: questionCount,
      language,
    });

    let currentSessionId: string | null = null;
    let latestQuestion = "";

    for await (const event of streamIterator) {
      switch (event.type) {
        case "session_started":
          currentSessionId = event.data?.session_id;
          setSessionId(currentSessionId);
          break;

        case "question_chunk":
          const chunk = event.data?.content || "";
          latestQuestion += chunk;
          setStreamingQuestion((prev) => prev + chunk);
          break;

        case "question_complete":
          const total = event.data?.total_content || latestQuestion;
          setCurrentQuestion(total);
          setStreamingQuestion(total);
          setIsStreamingQuestion(false);
          break;

        case "error":
          throw new Error(event.data?.message || "启动失败");
      }
    }
  } catch (error) {
    // 错误回退到非流式API
    const response = await startInterview(payload);
    setSessionId(response.session_id);
    setCurrentQuestion(response.prompt);
    setStreamingQuestion(response.prompt);
    setIsStreamingQuestion(false);
  } finally {
    setIsProcessing(false);
  }
};
```

**流式回答处理:**
```typescript
const handleAnswerSubmit = async (answer: string) => {
  setIsProcessing(true);
  setIsStreamingQuestion(true);
  setStreamingQuestion("");

  // 添加到历史记录
  setHistory(prev => [
    ...prev,
    { role: "interviewer", content: currentQuestion, isStreaming: false },
    { role: "candidate", content: answer, isStreaming: false },
  ]);

  try {
    const streamIterator = await sendInterviewAnswerStream({
      session_id: sessionId,
      answer,
    });

    let latestQuestion = "";
    let interviewEnded = false;

    for await (const event of streamIterator) {
      switch (event.type) {
        case "question_chunk":
          const chunk = event.data?.content || "";
          latestQuestion += chunk;
          setStreamingQuestion((prev) => prev + chunk);
          break;

        case "question_complete":
          const total = event.data?.total_content || latestQuestion;
          setCurrentQuestion(total);
          setStreamingQuestion(total);
          setIsStreamingQuestion(false);
          break;

        case "interview_complete":
          interviewEnded = true;
          setFeedback(event.data?.feedback);
          setSessionId(null);
          break;

        case "error":
          throw new Error(event.data?.message || "回答处理失败");
      }
    }
  } catch (error) {
    // 错误回退到非流式API
    const response = await sendInterviewAnswer({ session_id: sessionId, answer });
    if (response.completed) {
      setFeedback(response.feedback);
      setSessionId(null);
    } else {
      setCurrentQuestion(response.prompt);
      setStreamingQuestion(response.prompt);
    }
  } finally {
    setIsProcessing(false);
    setIsStreamingQuestion(false);
  }
};
```

## 关键技术要点

### 1. SSE连接管理
- **重要**: 始终在所有代码路径中发送 `[DONE]` 标记
- 使用 `AbortController` 管理连接取消
- 实现 `try/finally` 块确保资源清理

### 2. 错误处理机制
- 双重错误处理: 流式API失败时回退到普通API
- 前端和后端都要有完整的错误处理
- 错误消息通过SSE事件传递

### 3. 状态管理
- `isStreamingQuestion`: 控制打字机效果的开启/关闭
- `streamingQuestion`: 累积的流式内容
- `currentQuestion`: 完整的问题内容

### 4. 性能优化
- 使用 `asyncio.sleep(0.05)` 控制流式速度
- 避免过于频繁的DOM更新
- 合理的缓冲区管理

## 测试验证

### 端到端测试脚本
```bash
# 测试流式启动
node test_start_streaming.mjs

# 测试完整流程
node test_e2e_streaming.mjs

# 直接curl测试
curl -N -X POST "http://localhost:8000/api/interview/start" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","resume_summary":"Developer","job_description":"Frontend role","interviewer_style":"technical","question_count":3,"language":"en"}'
```

### 预期结果
- 接收 `session_started` 事件（包含session_id）
- 接收多个 `question_chunk` 事件（实现打字机效果）
- 接收 `question_complete` 事件（包含完整内容）
- 用户回答后接收新的问题流式输出
- 面试结束时接收 `interview_complete` 事件

## 部署注意事项

1. **CORS配置**: 确保SSE请求的CORS头正确设置
2. **超时设置**: 配置合适的连接超时时间
3. **负载均衡**: SSE连接可能需要会话粘性
4. **监控**: 添加SSE连接状态和错误监控

## 故障排除

### 常见问题
1. **连接提前关闭**: 检查是否所有代码路径都发送了 `[DONE]` 标记
2. **解析错误**: 检查SSE数据格式和换行符处理
3. **打字机效果不显示**: 检查 `isStreaming` 状态管理
4. **内存泄漏**: 确保所有定时器和事件监听器都被清理

### 调试技巧
- 使用浏览器开发者工具监控SSE连接
- 添加详细的控制台日志记录事件流
- 使用curl直接测试后端SSE输出
- 检查网络面板中的流式响应

## 总结

这个实现提供了完整的AI面试流式体验：
- ✅ 第一条AI问题流式输出（解决了用户反馈的问题）
- ✅ 后续问题流式输出
- ✅ 错误处理和回退机制
- ✅ 良好的用户体验和视觉反馈
- ✅ 可扩展的架构设计

通过这个指南，可以在任何类似项目中复现完整的流式对话体验。