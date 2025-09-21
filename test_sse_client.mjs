#!/usr/bin/env node
/**
 * 测试前端SSE客户端功能的Node.js脚本
 */

// 使用内置的fetch (Node.js 18+)
import { TextDecoder } from 'util';
global.TextDecoder = TextDecoder;

const API_BASE_URL = "http://localhost:8000/api";

// 复制前端的StreamEvent类型和sendInterviewAnswerStream函数逻辑
async function sendInterviewAnswerStream(payload) {
  const controller = new AbortController();

  const response = await fetch(`${API_BASE_URL}/interview/respond-stream`, {
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

  if (!response.body) {
    controller.abort();
    throw new Error("Streaming not supported in this environment.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  const allowedTypes = new Set([
    "question_chunk",
    "question_complete",
    "interview_complete",
    "error",
  ]);

  const collectEvents = () => {
    const events = [];
    let done = false;

    while (true) {
      const delimiterIndex = buffer.indexOf("\n\n");
      if (delimiterIndex === -1) {
        break;
      }

      const rawEvent = buffer.slice(0, delimiterIndex).trim();
      buffer = buffer.slice(delimiterIndex + 2);

      if (!rawEvent || !rawEvent.startsWith("data:")) {
        continue;
      }

      const dataStr = rawEvent.slice(5).trim();
      if (!dataStr) {
        continue;
      }

      if (dataStr === "[DONE]") {
        done = true;
        break;
      }

      try {
        const parsed = JSON.parse(dataStr);
        const eventType = parsed?.type;
        if (eventType && allowedTypes.has(eventType)) {
          events.push({
            type: eventType,
            data: parsed.data,
          });
        } else {
          events.push({
            type: "error",
            data: {
              message: "Unknown stream event type",
              raw: parsed,
            },
          });
        }
      } catch (err) {
        events.push({
          type: "error",
          data: {
            message: "Failed to parse stream event",
            raw: dataStr,
            error: err.message,
          },
        });
      }
    }

    return { events, done };
  };

  const iterator = (async function* () {
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
        if (shouldStop) {
          return;
        }

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
        data: {
          message: error.message,
        },
      };
      return;
    } finally {
      try {
        await reader.cancel();
      } catch {
        // ignore cancellation errors
      }
      controller.abort();
    }
  })();

  return iterator;
}

// 测试函数
async function testSSEClient() {
  console.log("Testing SSE Client Implementation");
  console.log("=".repeat(40));

  const testPayload = {
    session_id: "non-existent-session-test",
    answer: "This is a test answer",
    elapsed_seconds: 5.0
  };

  try {
    console.log("Connecting to SSE stream...");
    const streamIterator = await sendInterviewAnswerStream(testPayload);

    let eventCount = 0;
    let hasError = false;
    let hasDone = false;

    for await (const event of streamIterator) {
      eventCount++;
      console.log(`Event ${eventCount}:`, JSON.stringify(event, null, 2));

      if (event.type === "error") {
        hasError = true;
      }
    }

    console.log("\n" + "=".repeat(40));
    console.log("Test Results:");
    console.log(`- Total events received: ${eventCount}`);
    console.log(`- Error events received: ${hasError ? "Yes" : "No"}`);
    console.log(`- Stream completed normally: ${eventCount > 0 ? "Yes" : "No"}`);

    if (hasError && eventCount > 0) {
      console.log("✓ PASS: SSE client correctly handled error case");
      return true;
    } else {
      console.log("✗ FAIL: SSE client did not work as expected");
      return false;
    }

  } catch (error) {
    console.log("✗ FAIL: SSE client threw error:", error.message);
    return false;
  }
}

// 运行测试
testSSEClient()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error("Test failed with error:", error);
    process.exit(1);
  });

export { sendInterviewAnswerStream, testSSEClient };