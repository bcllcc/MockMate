# Create FIM Completion (Beta)

```
POST https://api.deepseek.com/beta/completions
```

The FIM (Fill-In-the-Middle) Completion API.
User must set `base_url="https://api.deepseek.com/beta"` to use this feature.

## Request

### Body (required)

**model** string (required)
- Possible values: [ `deepseek-chat`]
- ID of the model to use.

**prompt** string (required)
- Default value: `Once upon a time, `
- The prompt to generate completions for.

**echo** boolean nullable
- Echo back the prompt in addition to the completion

**frequency_penalty** number nullable
- Possible values: >= -2 and <= 2
- Default value: 0
- Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.

**logprobs** integer nullable
- Possible values: <= 20
- Include the log probabilities on the `logprobs` most likely output tokens, as well the chosen tokens. For example, if `logprobs` is 20, the API will return a list of the 20 most likely tokens. The API will always return the `logprob` of the sampled token, so there may be up to `logprobs+1` elements in the response.
- The maximum value for `logprobs` is 20.

**max_tokens** integer nullable
- The maximum number of tokens that can be generated in the completion.

**presence_penalty** number nullable
- Possible values: >= -2 and <= 2
- Default value: 0
- Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.

**stop** object nullable
- Up to 16 sequences where the API will stop generating further tokens. The returned text will not contain the stop sequence.

**stream** boolean nullable
- Whether to stream back partial progress. If set, tokens will be sent as data-only [server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#Event_stream_format) as they become available, with the stream terminated by a `data: [DONE]` message.

**stream_options** object nullable
- Options for streaming response. Only set this when you set `stream: true`.

**include_usage** boolean
- If set, an additional chunk will be streamed before the `data: [DONE]` message. The `usage` field on this chunk shows the token usage statistics for the entire request, and the `choices` field will always be an empty array. All other chunks will also include a `usage` field, but with a null value.

**suffix** string nullable
- The suffix that comes after a completion of inserted text.

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

## Response

### 200 OK

**id** string (required)
- A unique identifier for the completion.

**choices** object[] (required)
- The list of completion choices the model generated for the input prompt.

**finish_reason** string (required)
- Possible values: [ `stop`, `length`, `content_filter`, `insufficient_system_resource`]
- The reason the model stopped generating tokens. This will be `stop` if the model hit a natural stop point or a provided stop sequence, `length` if the maximum number of tokens specified in the request was reached, `content_filter` if content was omitted due to a flag from our content filters, or `insufficient_system_resource` if the request is interrupted due to insufficient resource of the inference system.

**index** integer (required)

**logprobs** object nullable (required)

**text_offset** integer[]
**token_logprobs** number[]
**tokens** string[]
**top_logprobs** object[]

**text** string (required)

**created** integer (required)
- The Unix timestamp (in seconds) of when the completion was created.

**model** string (required)
- The model used for completion.

**system_fingerprint** string
- This fingerprint represents the backend configuration that the model runs with.

**object** string (required)
- Possible values: [ `text_completion`]
- The object type, which is always "text_completion"

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

## Example Request

```bash
curl -L -X POST 'https://api.deepseek.com/beta/completions' \
-H 'Content-Type: application/json' \
-H 'Accept: application/json' \
-H 'Authorization: Bearer <TOKEN>' \
--data-raw '{
  "model": "deepseek-chat",
  "prompt": "Once upon a time, ",
  "echo": false,
  "frequency_penalty": 0,
  "logprobs": 0,
  "max_tokens": 1024,
  "presence_penalty": 0,
  "stop": null,
  "stream": false,
  "stream_options": null,
  "suffix": null,
  "temperature": 1,
  "top_p": 1
}'
```