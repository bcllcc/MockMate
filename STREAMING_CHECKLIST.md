# MockMate 流式效果复现检查清单

## 快速验证清单

### ✅ 1. 环境准备
- [ ] Python 3.11+ 安装
- [ ] Node.js 18+ 安装
- [ ] DeepSeek API Key 配置
- [ ] 依赖包安装完成

### ✅ 2. 后端配置检查
- [ ] `backend/app/services/llm.py` 包含流式方法
  - [ ] `_chat_stream()` 方法存在
  - [ ] `generate_first_question_stream()` 方法存在
  - [ ] `generate_follow_up_question_stream()` 方法存在

- [ ] `backend/app/api/routes.py` 流式路由配置
  - [ ] `/interview/start` 返回 `StreamingResponse`
  - [ ] `/interview/respond-stream` 路由存在
  - [ ] `_serialize_event()` 函数正确实现
  - [ ] 所有路径都发送 `[DONE]` 标记

### ✅ 3. 前端配置检查
- [ ] `frontend/src/lib/api.ts` 流式客户端
  - [ ] `StreamEvent` 类型包含 `session_started`
  - [ ] `startInterviewStream()` 函数存在
  - [ ] `sendInterviewAnswerStream()` 函数存在
  - [ ] SSE解析逻辑正确

- [ ] `frontend/src/components/StreamingMessage.tsx` 组件
  - [ ] 打字机效果实现完整
  - [ ] 光标动画正常
  - [ ] 状态管理正确

- [ ] `frontend/src/app/page.tsx` 集成
  - [ ] `handleStartInterview` 使用流式API
  - [ ] `handleAnswerSubmit` 使用流式API
  - [ ] 错误回退机制完整

### ✅ 4. 功能测试
- [ ] 后端启动成功 (`python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload`)
- [ ] 前端启动成功 (`npm run dev`)
- [ ] curl测试通过
  ```bash
  curl -N -X POST "http://localhost:8000/api/interview/start" \
    -H "Content-Type: application/json" \
    -d '{"user_id":"test","resume_summary":"Developer","job_description":"Frontend","interviewer_style":"technical","question_count":3,"language":"en"}'
  ```

- [ ] E2E测试脚本通过
  ```bash
  node test_start_streaming.mjs
  node test_e2e_streaming.mjs
  ```

### ✅ 5. 用户体验验证
- [ ] 第一条AI消息具有打字机效果
- [ ] 后续AI消息具有打字机效果
- [ ] 用户答案立即显示
- [ ] 错误情况下自动回退
- [ ] 界面响应流畅

## 常见问题排查

### 问题1: 第一条消息没有流式效果
**原因**: 使用了非流式的 `startInterview` 而不是 `startInterviewStream`

**解决方案**:
```typescript
// 错误 ❌
const response = await startInterview(payload);

// 正确 ✅
const streamIterator = await startInterviewStream(payload);
for await (const event of streamIterator) {
  // 处理流式事件
}
```

### 问题2: SSE连接提前关闭
**原因**: 没有在所有代码路径发送 `[DONE]` 标记

**解决方案**:
```python
async def generate_stream():
    try:
        # 主要逻辑
        pass
    except Exception as e:
        yield _serialize_event("error", {"message": str(e)})

    # 🔥 关键: 始终发送结束标记
    yield "data: [DONE]\n\n"
```

### 问题3: 前端解析错误
**原因**: 换行符处理不当

**解决方案**:
```typescript
// 正确的换行符处理
buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
const delimiterIndex = buffer.indexOf("\n\n"); // 不是 "\\n\\n"
```

### 问题4: 打字机效果不显示
**原因**: `isStreaming` 状态管理错误

**解决方案**:
```typescript
// 开始流式时
setIsStreamingQuestion(true);
setStreamingQuestion("");

// 接收chunk时
setStreamingQuestion((prev) => prev + chunk);

// 完成时
setIsStreamingQuestion(false);
setCurrentQuestion(totalContent);
```

### 问题5: 内存泄漏
**原因**: 定时器和事件监听器没有清理

**解决方案**:
```typescript
useEffect(() => {
  const intervalId = setInterval(step, speed);
  return () => clearInterval(intervalId); // 🔥 重要: 清理
}, [isStreaming, speed]);
```

## 性能检查点

### 延迟指标
- [ ] 首字符显示 < 500ms
- [ ] 字符间隔 50ms
- [ ] 完整问题 < 10s

### 资源使用
- [ ] CPU使用率 < 80%
- [ ] 内存使用 < 100MB
- [ ] 网络连接稳定

### 错误率
- [ ] SSE连接成功率 > 95%
- [ ] 回退机制触发率 < 5%
- [ ] 用户体验评分 > 4.5/5

## 部署前最终检查

### ✅ 代码质量
- [ ] 所有TypeScript类型正确
- [ ] 没有console.log残留
- [ ] 错误处理完整
- [ ] 代码注释充分

### ✅ 安全检查
- [ ] API Key未硬编码
- [ ] CORS配置正确
- [ ] 输入验证完整
- [ ] 错误信息不泄露敏感信息

### ✅ 兼容性
- [ ] Chrome浏览器测试通过
- [ ] Firefox浏览器测试通过
- [ ] Safari浏览器测试通过
- [ ] 移动端响应式正常

### ✅ 监控准备
- [ ] 关键指标监控设置
- [ ] 错误日志记录完整
- [ ] 性能监控配置
- [ ] 用户反馈渠道准备

## 快速复现步骤

1. **克隆代码库**
   ```bash
   git clone <repository>
   cd MockMate
   ```

2. **环境配置**
   ```bash
   # 后端
   cd backend
   pip install -r requirements.txt
   cp .env.example .env
   # 配置 DEEPSEEK_API_KEY

   # 前端
   cd ../frontend
   npm install
   ```

3. **启动服务**
   ```bash
   # 终端1: 后端
   cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

   # 终端2: 前端
   cd frontend && npm run dev
   ```

4. **验证功能**
   ```bash
   # 终端3: 测试
   node test_start_streaming.mjs
   node test_e2e_streaming.mjs
   ```

5. **浏览器验证**
   - 访问 `http://localhost:3000`
   - 上传简历
   - 配置面试参数
   - 点击开始面试
   - 验证第一条消息的打字机效果

完成这个检查清单，即可确保流式效果完美复现！