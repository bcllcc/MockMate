"use client";

import { useEffect, useRef, useState } from "react";

import { StreamingMessage } from "./StreamingMessage";
import { useLanguage } from "@/contexts/LanguageContext";
import type { InterviewFeedback } from "@/lib/api";

export interface ConversationEntry {
  role: "interviewer" | "candidate";
  content: string;
  isStreaming?: boolean;
}

interface InterviewConsoleProps {
  sessionId: string | null;
  currentQuestion: string | null;
  streamingQuestion: string;
  isStreamingQuestion: boolean;
  history: ConversationEntry[];
  feedback: InterviewFeedback | null;
  onSubmit: (answer: string) => Promise<void>;
  onFinishEarly: () => Promise<void>;
  onStreamComplete?: () => void;
  processing: boolean;
}

export function InterviewConsole({
  sessionId,
  currentQuestion,
  streamingQuestion,
  isStreamingQuestion,
  history,
  feedback,
  onSubmit,
  onFinishEarly,
  onStreamComplete,
  processing,
}: InterviewConsoleProps) {
  const { t } = useLanguage();
  const [answer, setAnswer] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const displayQuestion = isStreamingQuestion ? streamingQuestion : currentQuestion ?? streamingQuestion;
  const showQuestionBubble = Boolean(sessionId && (isStreamingQuestion || displayQuestion.length > 0));
  const inputDisabled = !sessionId || processing || isStreamingQuestion;

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [history, currentQuestion, streamingQuestion, isStreamingQuestion]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = answer.trim();
    if (!value) {
      return;
    }

    setAnswer("");
    await onSubmit(value);
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{t("console.title")}</h2>
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">{t("console.subtitle")}</p>
          {sessionId && (
            <button
              type="button"
              onClick={onFinishEarly}
              className="text-sm font-medium text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed"
              disabled={inputDisabled}
            >
              {t("console.endButton")}
            </button>
          )}
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {history.length === 0 && !currentQuestion && !isStreamingQuestion && (
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
            </div>
          </div>
        ))}

        {showQuestionBubble && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow">
              <StreamingMessage
                content={displayQuestion}
                isStreaming={isStreamingQuestion}
                onStreamComplete={onStreamComplete}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      {feedback ? (
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-6 max-h-96 overflow-y-auto">
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
        <form onSubmit={handleSubmit} className="border-t border-slate-100 bg-white px-6 py-5">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <input
                type="text"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={sessionId ? t("console.inputPlaceholder") : t("console.inputPlaceholderDisabled")}
                className="w-full rounded-full border border-slate-300 bg-white px-4 py-5 pr-20 text-sm text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:bg-slate-100"
                disabled={inputDisabled}
              />
              <button
                type="submit"
                className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 -mt-1/2 items-center justify-center rounded-full bg-primary-600 shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={inputDisabled || answer.trim().length === 0}
                title={processing ? t("console.submitting") : t("console.submitButton")}
              >
                {processing ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}



