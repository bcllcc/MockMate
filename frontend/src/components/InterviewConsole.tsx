"use client";

import { useEffect, useRef, useState } from "react";

import { useLanguage } from "@/contexts/LanguageContext";
import type { InterviewFeedback, InterviewPrompt, InterviewResponse } from "@/lib/api";

export interface ConversationEntry {
  role: "interviewer" | "candidate";
  content: string;
  topic?: string;
  type?: "main" | "follow_up";
}

interface InterviewConsoleProps {
  sessionId: string | null;
  currentPrompt: InterviewPrompt | null;
  history: ConversationEntry[];
  feedback: InterviewFeedback | null;
  onSubmit: (answer: string) => Promise<void>;
  onSubmitStream?: (options: {
    answer: string;
    onChunk: (content: string) => void;
    onComplete: (response: InterviewResponse) => void;
    onError: (error: Error) => void;
  }) => Promise<(() => void) | void>;
  onFinishEarly: () => Promise<void>;
  processing: boolean;
}

export function InterviewConsole({
  sessionId,
  currentPrompt,
  history,
  feedback,
  onSubmit,
  onSubmitStream,
  onFinishEarly,
  processing,
}: InterviewConsoleProps) {
  const { t } = useLanguage();
  const [answer, setAnswer] = useState("");
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const streamCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [history, currentPrompt, streamingMessage]);

  useEffect(() => () => {
    if (streamCancelRef.current) {
      streamCancelRef.current();
      streamCancelRef.current = null;
    }
  }, []);

  const handleFinish = async () => {
    if (streamCancelRef.current) {
      streamCancelRef.current();
      streamCancelRef.current = null;
    }
    setIsStreaming(false);
    setStreamingMessage("");
    await onFinishEarly();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = answer.trim();
    if (!value) {
      return;
    }

    if (onSubmitStream && sessionId) {
      setIsStreaming(true);
      setStreamingMessage("");
      try {
        const cancel = await onSubmitStream({
          answer: value,
          onChunk: (chunk) => {
            setStreamingMessage((prev) => prev + chunk);
          },
          onComplete: () => {
            setIsStreaming(false);
            setStreamingMessage("");
            streamCancelRef.current = null;
          },
          onError: async (error) => {
            console.error(error);
            setIsStreaming(false);
            setStreamingMessage("");
            streamCancelRef.current = null;
            await onSubmit(value);
          },
        });
        streamCancelRef.current = typeof cancel === "function" ? cancel : null;
        setAnswer("");
      } catch (error) {
        console.error(error);
        setIsStreaming(false);
        setStreamingMessage("");
        streamCancelRef.current = null;
        await onSubmit(value);
      }
      return;
    }

    await onSubmit(value);
    setAnswer("");
  };

  const topicLabel = t("console.topicLabel");
  const followUpLabel = t("console.followUp");
  const streamingTopic = currentPrompt?.topic ?? "";

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{t("console.title")}</h2>
        <p className="text-sm text-slate-600">{t("console.subtitle")}</p>
      </div>
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {history.length === 0 && (
          <p className="text-sm text-slate-500">{t("console.emptyState")}</p>
        )}
        {history.map((item, index) => (
          <div key={index} className={`flex ${item.role === "interviewer" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-3 text-sm shadow ${
                item.role === "interviewer" ? "bg-slate-100 text-slate-800" : "bg-primary-500 text-white"
              }`}
            >
              <p>{item.content}</p>
              {item.topic && item.role === "interviewer" && (
                <p className="mt-1 text-xs opacity-70">
                  {topicLabel}: {item.topic}
                  {item.type === "follow_up" && ` - ${followUpLabel}`}
                </p>
              )}
            </div>
          </div>
        ))}
        {isStreaming && streamingMessage && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow">
              <p>
                {streamingMessage}<span className="animate-pulse">|</span>
              </p>
              <p className="mt-1 text-xs opacity-80">
                {topicLabel}: {streamingTopic}
                {currentPrompt?.type === "follow_up" && ` - ${followUpLabel}`}
              </p>
            </div>
          </div>
        )}

        {currentPrompt && sessionId && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow">
              <p>{currentPrompt.text}</p>
              <p className="mt-1 text-xs opacity-80">
                {topicLabel}: {currentPrompt.topic}
                {currentPrompt.type === "follow_up" && ` - ${followUpLabel}`}
              </p>
            </div>
          </div>
        )}
      </div>
      {feedback ? (
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-6">
          <h3 className="text-base font-semibold text-slate-900">{t("console.feedbackTitle")}</h3>
          <p className="mt-2 text-sm text-slate-600">{feedback.summary}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">{t("console.strengths")}</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {feedback.strengths.map((item, index) => (
                  <li key={index} className="rounded-md bg-white px-3 py-2 shadow-sm">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">{t("console.weaknesses")}</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {feedback.weaknesses.map((item, index) => (
                  <li key={index} className="rounded-md bg-white px-3 py-2 shadow-sm">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">{t("console.suggestions")}</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {feedback.suggestions.map((item, index) => (
                  <li key={index} className="rounded-md bg-white px-3 py-2 shadow-sm">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder={sessionId ? t("console.inputPlaceholder") : t("console.inputPlaceholderDisabled")}
            rows={3}
            className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            disabled={!sessionId || processing || isStreaming}
          />
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={handleFinish}
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
              disabled={!sessionId || processing || isStreaming}
            >
              {t("console.endButton")}
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!sessionId || processing || isStreaming || answer.trim().length === 0}
            >
              {processing ? t("console.submitting") : t("console.submitButton")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
