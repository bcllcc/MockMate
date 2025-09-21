#!/usr/bin/env node
/**
 * 端到端流式面试功能测试
 */

import { TextDecoder } from 'util';
global.TextDecoder = TextDecoder;

const API_BASE_URL = "http://localhost:8000/api";

// 完整的面试流程测试
async function testFullInterviewFlow() {
  console.log("🧪 Testing Complete Streaming Interview Flow");
  console.log("=" * 50);

  let sessionId = null;

  try {
    // 1. 启动面试
    console.log("\n📝 Step 1: Starting Interview...");
    const startResponse = await fetch(`${API_BASE_URL}/interview/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: "test-user-123",
        resume_summary: "Experienced frontend developer with React and TypeScript skills",
        job_description: "Senior Frontend Developer position requiring React expertise",
        interviewer_style: "technical",
        question_count: 3,
        language: "en"
      })
    });

    if (!startResponse.ok) {
      throw new Error(`Start interview failed: ${startResponse.statusText}`);
    }

    const startData = await startResponse.json();
    sessionId = startData.session_id;
    console.log(`✅ Interview started, session: ${sessionId}`);
    console.log(`📋 First question: ${startData.prompt?.text || startData.prompt || 'No prompt'}`);

    // 2. 测试流式回答第一个问题
    console.log("\n💬 Step 2: Testing Streaming Response...");
    const streamIterator = await sendInterviewAnswerStream({
      session_id: sessionId,
      answer: "I am a passionate frontend developer with 5 years of experience in React and TypeScript. I enjoy building user-friendly interfaces and solving complex problems.",
      elapsed_seconds: 30.0
    });

    let questionChunks = [];
    let questionComplete = false;
    let interviewComplete = false;
    let totalEvents = 0;

    for await (const event of streamIterator) {
      totalEvents++;
      console.log(`📨 Event ${totalEvents}: ${event.type}`);

      switch (event.type) {
        case "question_chunk":
          const chunk = event.data?.content || "";
          questionChunks.push(chunk);
          process.stdout.write(chunk); // 实时显示打字机效果
          break;

        case "question_complete":
          questionComplete = true;
          const totalContent = event.data?.total_content || "";
          console.log(`\n✅ Question complete: "${totalContent}"`);
          break;

        case "interview_complete":
          interviewComplete = true;
          console.log("\n🎉 Interview completed!");
          if (event.data?.feedback) {
            console.log(`📊 Overall score: ${event.data.feedback.overall_score || 'N/A'}`);
            console.log(`📝 Summary: ${event.data.feedback.summary || 'No summary'}`);
          }
          break;

        case "error":
          console.log(`❌ Error: ${event.data?.message || 'Unknown error'}`);
          break;

        default:
          console.log(`⚠️  Unknown event type: ${event.type}`);
      }
    }

    // 3. 验证结果
    console.log("\n📊 Test Results:");
    console.log(`- Total events received: ${totalEvents}`);
    console.log(`- Question chunks received: ${questionChunks.length}`);
    console.log(`- Question completed: ${questionComplete ? 'Yes' : 'No'}`);
    console.log(`- Interview completed: ${interviewComplete ? 'Yes' : 'No'}`);

    const success = totalEvents > 0 && (questionComplete || interviewComplete);
    console.log(`\n🎯 Test Result: ${success ? 'PASS' : 'FAIL'}`);

    return success;

  } catch (error) {
    console.log(`\n❌ Test failed: ${error.message}`);
    return false;
  }
}

// SSE客户端实现（复用之前的代码）
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

// 运行测试
testFullInterviewFlow()
  .then(success => {
    console.log(`\n${"=".repeat(50)}`);
    if (success) {
      console.log("🎉 E2E STREAMING TEST PASSED!");
      console.log("✅ All streaming functionality works correctly");
    } else {
      console.log("💥 E2E STREAMING TEST FAILED!");
      console.log("❌ Streaming functionality needs attention");
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error(`💥 Test execution failed: ${error.message}`);
    process.exit(1);
  });