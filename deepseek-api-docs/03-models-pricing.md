# Models & Pricing

The prices listed below are in unites of per 1M tokens. A token, the smallest unit of text that the model recognizes, can be a word, a number, or even a punctuation mark. We will bill based on the total number of input and output tokens by the model.

## Model Details

| | | | |
| --- | --- | --- | --- |
| MODEL | deepseek-chat | deepseek-reasoner |
| MODEL VERSION | DeepSeek-V3.1 (Non-thinking Mode) | DeepSeek-V3.1 (Thinking Mode) |
| CONTEXT LENGTH | 128K |
| MAX OUTPUT | DEFAULT: 4K<br>MAXIMUM: 8K | DEFAULT: 32K<br>MAXIMUM: 64K |
| FEATURES | [Json Output](https://api-docs.deepseek.com/guides/json_mode) | ✓ | ✓ |
| [Function Calling](https://api-docs.deepseek.com/guides/function_calling) | ✓ | ✗(1) |
| [Chat Prefix Completion（Beta）](https://api-docs.deepseek.com/guides/chat_prefix_completion) | ✓ | ✓ |
| [FIM Completion（Beta）](https://api-docs.deepseek.com/guides/fim_completion) | ✓ | ✗ |
| PRICING | 1M INPUT TOKENS (CACHE HIT) | $0.07 |
| 1M INPUT TOKENS (CACHE MISS) | $0.56 |
| 1M OUTPUT TOKENS | $1.68 |

- (1) If the request to the `deepseek-reasoner` model includes the `tools` parameter, the request will actually be processed using the `deepseek-chat` model.

---

## Deduction Rules

The expense = number of tokens × price.
The corresponding fees will be directly deducted from your topped-up balance or granted balance, with a preference for using the granted balance first when both balances are available.

Product prices may vary and DeepSeek reserves the right to adjust them. We recommend topping up based on your actual usage and regularly checking this page for the most recent pricing information.