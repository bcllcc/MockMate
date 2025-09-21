# Create Chat Completion

```
POST https://api.deepseek.com/chat/completions
```

Creates a model response for the given chat conversation.

## Request

### Body (required)

**messages** object[] (required)
- Possible values: >= 1
- A list of messages comprising the conversation so far.

Array:
- System message
- User message
- Assistant message
- Tool message

**content** string (required)
- The contents of the system message.

**role** string (required)
- Possible values: [ `system`]
- The role of the messages author, in this case `system`.

**name** string
- An optional name for the participant. Provides the model information to differentiate between participants of the same role.

**model** string (required)
- Possible values: [ `deepseek-chat`, `deepseek-reasoner`]
- ID of the model to use. You can use deepseek-chat.

**frequency_penalty** number nullable
- Possible values: >= -2 and <= 2
- Default value: 0
- Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.

**max_tokens** integer nullable
- The maximum number of tokens that can be generated in the chat completion.
- The total length of input tokens and generated tokens is limited by the model's context length.
- For the value range and default value, please refer to the [documentation](https://api-docs.deepseek.com/quick_start/pricing).

**presence_penalty** number nullable
- Possible values: >= -2 and <= 2
- Default value: 0
- Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.

**response_format** object nullable
- An object specifying the format that the model must output.
- Setting to { "type": "json_object" } enables JSON Output, which guarantees the message the model generates is valid JSON.

**Important:** When using JSON Output, you must also instruct the model to produce JSON yourself via a system or user message. Without this, the model may generate an unending stream of whitespace until the generation reaches the token limit, resulting in a long-running and seemingly "stuck" request. Also note that the message content may be partially cut off if finish_reason="length", which indicates the generation exceeded max_tokens or the conversation exceeded the max context length.

**type** string
- Possible values: [ `text`, `json_object`]
- Default value: `text`
- Must be one of `text` or `json_object`.

**stop** object nullable
- Up to 16 sequences where the API will stop generating further tokens.

**stream** boolean nullable
- If set, partial message deltas will be sent. Tokens will be sent as data-only server-sent events (SSE) as they become available, with the stream terminated by a `data: [DONE]` message.

**stream_options** object nullable
- Options for streaming response. Only set this when you set `stream: true`.

**include_usage** boolean
- If set, an additional chunk will be streamed before the `data: [DONE]` message. The `usage` field on this chunk shows the token usage statistics for the entire request, and the `choices` field will always be an empty array. All other chunks will also include a `usage` field, but with a null value.

**temperature** number nullable
- Possible values: <= 2
- Default value: 1
- What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.
- We generally recommend altering this or `top_p` but not both.

**top_p** number nullable
- Possible values: <= 1
- Default value: 1
- An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered.
- We generally recommend altering this or `temperature` but not both.

**tools** object[] nullable
- A list of tools the model may call. Currently, only functions are supported as a tool.
- Use this to provide a list of functions the model may generate JSON inputs for. A max of 128 functions are supported.

**type** string (required)
- Possible values: [ `function`]
- The type of the tool. Currently, only `function` is supported.

**function** object (required)

**description** string
- A description of what the function does, used by the model to choose when and how to call the function.

**name** string (required)
- The name of the function to be called. Must be a-z, A-Z, 0-9, or contain underscores and dashes, with a maximum length of 64.

**parameters** object
- The parameters the functions accepts, described as a JSON Schema object. See the [Function Calling Guide](https://api-docs.deepseek.com/guides/function_calling) for examples, and the [JSON Schema reference](https://json-schema.org/understanding-json-schema/) for documentation about the format.
- Omitting `parameters` defines a function with an empty parameter list.

**strict** boolean
- Default value: false
- If set to true, the API will use strict-mode for the function calling to ensure the output always complies with the function's JSON schema. This is a Beta feature, for more details please refer to [Function Calling Guide](https://api-docs.deepseek.com/guides/function_calling)

**tool_choice** object nullable
- Controls which (if any) tool is called by the model.
- `none` means the model will not call any tool and instead generates a message.
- `auto` means the model can pick between generating a message or calling one or more tools.
- `required` means the model must call one or more tools.
- Specifying a particular tool via `{"type": "function", "function": {"name": "my_function"}}` forces the model to call that tool.
- `none` is the default when no tools are present. `auto` is the default if tools are present.

**logprobs** boolean nullable
- Whether to return log probabilities of the output tokens or not. If true, returns the log probabilities of each output token returned in the `content` of `message`.

**top_logprobs** integer nullable
- Possible values: <= 20
- An integer between 0 and 20 specifying the number of most likely tokens to return at each token position, each with an associated log probability. `logprobs` must be set to `true` if this parameter is used.

## Example Request

```bash
curl -L -X POST 'https://api.deepseek.com/chat/completions' \
-H 'Content-Type: application/json' \
-H 'Accept: application/json' \
-H 'Authorization: Bearer <TOKEN>' \
--data-raw '{
  "messages": [
    {
      "content": "You are a helpful assistant",
      "role": "system"
    },
    {
      "content": "Hi",
      "role": "user"
    }
  ],
  "model": "deepseek-chat",
  "frequency_penalty": 0,
  "max_tokens": 4096,
  "presence_penalty": 0,
  "response_format": {
    "type": "text"
  },
  "stop": null,
  "stream": false,
  "stream_options": null,
  "temperature": 1,
  "top_p": 1,
  "tools": null,
  "tool_choice": "none",
  "logprobs": false,
  "top_logprobs": null
}'
```

## Response

### 200 OK (No streaming)

Returns a `chat completion object`

**id** string (required)
- A unique identifier for the chat completion.

**choices** object[] (required)
- A list of chat completion choices.

**finish_reason** string (required)
- Possible values: [ `stop`, `length`, `content_filter`, `tool_calls`, `insufficient_system_resource`]
- The reason the model stopped generating tokens. This will be `stop` if the model hit a natural stop point or a provided stop sequence, `length` if the maximum number of tokens specified in the request was reached, `content_filter` if content was omitted due to a flag from our content filters, `tool_calls` if the model called a tool, or `insufficient_system_resource` if the request is interrupted due to insufficient resource of the inference system.

**index** integer (required)
- The index of the choice in the list of choices.

**message** object (required)
- A chat completion message generated by the model.

**content** string nullable (required)
- The contents of the message.

**reasoning_content** string nullable
- For `deepseek-reasoner` model only. The reasoning contents of the assistant message, before the final answer.

**tool_calls** object[]
- The tool calls generated by the model, such as function calls.

**role** string (required)
- Possible values: [ `assistant`]
- The role of the author of this message.

**created** integer (required)
- The Unix timestamp (in seconds) of when the chat completion was created.

**model** string (required)
- The model used for the chat completion.

**system_fingerprint** string (required)
- This fingerprint represents the backend configuration that the model runs with.

**object** string (required)
- Possible values: [ `chat.completion`]
- The object type, which is always `chat.completion`.

**usage** object
- Usage statistics for the completion request.

**completion_tokens** integer (required)
- Number of tokens in the generated completion.

**prompt_tokens** integer (required)
- Number of tokens in the prompt. It equals prompt_cache_hit_tokens + prompt_cache_miss_tokens.

**prompt_cache_hit_tokens** integer (required)
- Number of tokens in the prompt that hits the context cache.

**prompt_cache_miss_tokens** integer (required)
- Number of tokens in the prompt that misses the context cache.

**total_tokens** integer (required)
- Total number of tokens used in the request (prompt + completion).

**completion_tokens_details** object
- Breakdown of tokens used in a completion.

**reasoning_tokens** integer
- Tokens generated by the model for reasoning.