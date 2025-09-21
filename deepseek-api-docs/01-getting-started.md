# DeepSeek API - Your First API Call

The DeepSeek API uses an API format compatible with OpenAI. By modifying the configuration, you can use the OpenAI SDK or softwares compatible with the OpenAI API to access the DeepSeek API.

## Configuration

| PARAM | VALUE |
| --- | --- |
| base_url * | `https://api.deepseek.com` |
| api_key | apply for an [API key](https://platform.deepseek.com/api_keys) |

\* To be compatible with OpenAI, you can also use `https://api.deepseek.com/v1` as the `base_url`. But note that the `v1` here has NO relationship with the model's version.

\* **`deepseek-chat` and `deepseek-reasoner` are upgraded to DeepSeek-V3.1 now.** `deepseek-chat` is the **non-thinking mode** of DeepSeek-V3.1 and `deepseek-reasoner` is the **thinking mode** of DeepSeek-V3.1.

## Invoke The Chat API

Once you have obtained an API key, you can access the DeepSeek API using the following example scripts. This is a non-stream example, you can set the `stream` parameter to `true` to get stream response.

### cURL Example

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