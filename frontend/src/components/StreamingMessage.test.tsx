"use client";

import React, { useState, useEffect } from "react";
import { StreamingMessage } from "./StreamingMessage";

// 模拟面试流式消息的测试组件
export function StreamingMessageTest() {
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [testStage, setTestStage] = useState(0);

  const testMessages = [
    "请介绍一下你自己。",
    "Could you tell me about your experience with React?",
    "描述一下你在项目中遇到的最大挑战。",
    "What are your thoughts on TypeScript versus JavaScript?"
  ];

  // 模拟流式输入
  const simulateStreaming = (message: string) => {
    setContent("");
    setIsStreaming(true);

    let index = 0;
    const interval = setInterval(() => {
      if (index < message.length) {
        setContent(message.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
      }
    }, 100); // 每100ms添加一个字符
  };

  const handleNext = () => {
    const nextStage = (testStage + 1) % testMessages.length;
    setTestStage(nextStage);
    simulateStreaming(testMessages[nextStage]);
  };

  const handleStreamComplete = () => {
    console.log("Stream completed!");
  };

  useEffect(() => {
    // 初始化第一个消息
    simulateStreaming(testMessages[0]);
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">StreamingMessage 组件测试</h1>

      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-700 mb-3">面试官问题：</h2>
        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 min-h-[100px]">
          <StreamingMessage
            content={content}
            isStreaming={isStreaming}
            onStreamComplete={handleStreamComplete}
            speed={50}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleNext}
            disabled={isStreaming}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            下一个问题 ({testStage + 1}/{testMessages.length})
          </button>
          <span className="text-sm text-slate-600">
            状态: {isStreaming ? "流式输入中..." : "完成"}
          </span>
        </div>

        <div className="text-sm text-slate-500">
          <p>测试功能：</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>打字机效果显示</li>
            <li>中英文字符支持</li>
            <li>流式状态管理</li>
            <li>光标闪烁效果</li>
            <li>完成回调触发</li>
          </ul>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <h3 className="font-semibold text-yellow-800 mb-2">测试指标：</h3>
        <div className="text-sm text-yellow-700 space-y-1">
          <p>• 文字是否逐字符显示？</p>
          <p>• 光标是否在流式时显示并闪烁？</p>
          <p>• 完成后光标是否消失？</p>
          <p>• 中英文混合是否正常显示？</p>
          <p>• 按钮在流式时是否正确禁用？</p>
        </div>
      </div>
    </div>
  );
}