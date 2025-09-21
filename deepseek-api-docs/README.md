# DeepSeek API Documentation

本目录包含从官方 DeepSeek API 文档网站抓取的完整 API 开发文档。

## 文件结构

### 快速开始
- [01-getting-started.md](./01-getting-started.md) - 快速开始使用 DeepSeek API
- [02-authentication.md](./02-authentication.md) - API 认证方式
- [03-models-pricing.md](./03-models-pricing.md) - 模型和价格信息

### API 参考
- [04-chat-completion-api.md](./04-chat-completion-api.md) - 聊天对话完成 API
- [05-list-models.md](./05-list-models.md) - 列出可用模型 API
- [06-user-balance.md](./06-user-balance.md) - 查询用户余额 API
- [07-fim-completion.md](./07-fim-completion.md) - FIM 补全 API (Beta)

### 高级功能指南
- [08-function-calling.md](./08-function-calling.md) - 函数调用功能
- [09-json-output.md](./09-json-output.md) - JSON 格式输出
- [10-reasoning-model.md](./10-reasoning-model.md) - 推理模型 (deepseek-reasoner)
- [11-multi-round-chat.md](./11-multi-round-chat.md) - 多轮对话

### 实用信息
- [12-error-codes.md](./12-error-codes.md) - 错误代码说明
- [13-token-usage.md](./13-token-usage.md) - Token 使用和计费

## 主要特性

### 模型
- **deepseek-chat**: DeepSeek-V3.1 非思考模式
- **deepseek-reasoner**: DeepSeek-V3.1 思考模式 (带推理链)

### 核心功能
- 聊天对话完成
- 流式和非流式响应
- JSON 格式输出
- 函数调用 (Function Calling)
- 多轮对话支持
- FIM 补全 (Beta)
- 上下文缓存

### 定价 (每百万 tokens)
- 输入 tokens (缓存命中): $0.07
- 输入 tokens (缓存未命中): $0.56
- 输出 tokens: $1.68

## 快速开始

### 配置信息
```
base_url: https://api.deepseek.com
api_key: 在 https://platform.deepseek.com/api_keys 申请
```

### 基本调用示例
```bash
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <DeepSeek API Key>" \
  -d '{
        "model": "deepseek-chat",
        "messages": [
          {"role": "system", "content": "You are a helpful assistant."},
          {"role": "user", "content": "Hello!"}
        ],
        "stream": false
      }'
```

### Python SDK 示例
```python
from openai import OpenAI

client = OpenAI(
    api_key="<your api key>",
    base_url="https://api.deepseek.com",
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)
```

## 支持和资源

- 官方文档: https://api-docs.deepseek.com/
- API 密钥申请: https://platform.deepseek.com/api_keys
- 余额充值: https://platform.deepseek.com/top_up
- 技术支持: api-service@deepseek.com

## 注意事项

1. DeepSeek API 与 OpenAI API 格式兼容
2. 支持使用 OpenAI SDK 或兼容 OpenAI API 的软件
3. API 是无状态的，多轮对话需要手动拼接历史消息
4. 推理模型 (deepseek-reasoner) 会输出思考过程和最终答案
5. 使用 JSON 输出时，需要在提示中包含 "json" 关键字

## 更新日期

文档更新时间: 2025-09-20