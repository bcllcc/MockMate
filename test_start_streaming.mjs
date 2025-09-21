#!/usr/bin/env node
/**
 * 测试流式启动面试功能
 */

import { TextDecoder } from 'util';
global.TextDecoder = TextDecoder;

const API_BASE_URL = "http://localhost:8000/api";

// 测试流式启动面试
async function testStreamingStartInterview() {
  console.log("🧪 Testing Streaming Start Interview");
  console.log("=" * 50);

  try {
    // 流式启动面试
    console.log("\n📝 Step 1: Starting Interview with Streaming...");
    const streamIterator = await startInterviewStream({
      user_id: "test-user-123",
      resume_summary: "Experienced frontend developer with React and TypeScript skills",
      job_description: "Senior Frontend Developer position requiring React expertise",
      interviewer_style: "technical",
      question_count: 3,
      language: "en"
    });

    let sessionId = null;
    let questionChunks = [];
    let questionComplete = false;
    let totalEvents = 0;

    for await (const event of streamIterator) {
      totalEvents++;
      console.log(`📨 Event ${totalEvents}: ${event.type}`);

      switch (event.type) {
        case "session_started":
          sessionId = event.data?.session_id;
          console.log(`✅ Session started: ${sessionId}`);
          break;

        case "question_chunk":
          const chunk = event.data?.content || "";
          questionChunks.push(chunk);
          process.stdout.write(chunk); // 实时显示打字机效果
          break;

        case "question_complete":
          questionComplete = true;
          const totalContent = event.data?.total_content || "";
          console.log(`\n✅ First question complete: "${totalContent}"`);
          break;

        case "error":
          console.log(`❌ Error: ${event.data?.message || 'Unknown error'}`);
          break;

        default:
          console.log(`⚠️ Unknown event type: ${event.type}`);
      }
    }

    // 验证结果
    console.log("\n📊 Test Results:");
    console.log(`- Total events received: ${totalEvents}`);
    console.log(`- Session ID: ${sessionId || 'Not received'}`);
    console.log(`- Question chunks received: ${questionChunks.length}`);
    console.log(`- Question completed: ${questionComplete ? 'Yes' : 'No'}`);

    const success = sessionId && totalEvents > 0 && questionComplete;
    console.log(`\n🎯 Test Result: ${success ? 'PASS' : 'FAIL'}`);

    return success;

  } catch (error) {
    console.log(`\n❌ Test failed: ${error.message}`);
    return false;
  }
}

// SSE客户端实现（复用并修改）
async function startInterviewStream(payload) {
  const controller = new AbortController();

  const response = await fetch(`${API_BASE_URL}/interview/start`, {
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
    "session_started",
    "question_chunk",
    "question_complete",
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

// 运行测试
testStreamingStartInterview()
  .then(success => {
    console.log(`\n${"=".repeat(50)}`);
    if (success) {
      console.log("🎉 STREAMING START TEST PASSED!");
      console.log("✅ First question now streams with typewriter effect");
    } else {
      console.log("💥 STREAMING START TEST FAILED!");
      console.log("❌ First question streaming needs attention");
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error(`💥 Test execution failed: ${error.message}`);
    process.exit(1);
  });