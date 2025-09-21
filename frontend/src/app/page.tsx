"use client";

import { useMemo, useState } from "react";

import { InterviewConsole, type ConversationEntry } from "@/components/InterviewConsole";
import { ResumeSummaryCard } from "@/components/ResumeSummaryCard";
import { ResumeUploader } from "@/components/ResumeUploader";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUser } from "@/contexts/UserContext";
import {
  endInterview,
  sendInterviewAnswer,
  sendInterviewAnswerStream,
  startInterview,
  startInterviewStream,
  type InterviewFeedback,
  type ResumeParseResponse,
} from "@/lib/api";

export default function HomePage() {
  const { t, language } = useLanguage();
  const { profile, userId } = useUser();

  const [resume, setResume] = useState<ResumeParseResponse | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string>("");
  const [jobDescription, setJobDescription] = useState<string>("");
  const [interviewerStyle, setInterviewerStyle] = useState<string>("technical");
  const [questionCount, setQuestionCount] = useState<number>(6);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [streamingQuestion, setStreamingQuestion] = useState<string>("");
  const [isStreamingQuestion, setIsStreamingQuestion] = useState<boolean>(false);
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const interviewerStyles = useMemo(
    () => [
      { value: "technical", label: t("styles.technical") },
      { value: "behavioral", label: t("styles.behavioral") },
      { value: "hr", label: t("styles.hr") },
      { value: "challenging", label: t("styles.challenging") },
    ],
    [t],
  );

  const canStart = Boolean(resume) && jobDescription.trim().length > 0 && !sessionId;

  const handleResumeUpload = ({ data, filename }: { data: ResumeParseResponse; filename: string }) => {
    setResume(data);
    setResumeFileName(filename);
    setHistory([]);
    setFeedback(null);
    setCurrentQuestion(null);
    setStreamingQuestion("");
    setIsStreamingQuestion(false);
    setSessionId(null);
    setErrorMessage(null);
  };

  const handleStartInterview = async () => {
    if (!resume) {
      setErrorMessage(t("home.errors.resumeMissing"));
      return;
    }
    if (!jobDescription.trim()) {
      setErrorMessage(t("home.errors.jobMissing"));
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    setHistory([]);
    setFeedback(null);
    setCurrentQuestion(null);
    setStreamingQuestion("");
    setIsStreamingQuestion(true);

    try {
      const streamIterator = await startInterviewStream({
        user_id: userId,
        resume_summary: resume.summary.summary,
        job_description: jobDescription,
        interviewer_style: interviewerStyle,
        question_count: questionCount,
        language,
      });

      let currentSessionId: string | null = null;
      let latestQuestion = "";

      for await (const event of streamIterator) {
        switch (event.type) {
          case "session_started": {
            const sessionIdFromEvent =
              event.data && typeof event.data === "object" && "session_id" in event.data
                ? String(event.data.session_id ?? "")
                : "";
            if (sessionIdFromEvent) {
              currentSessionId = sessionIdFromEvent;
              setSessionId(sessionIdFromEvent);
            }
            break;
          }
          case "question_chunk": {
            const chunk =
              event.data && typeof event.data === "object" && "content" in event.data
                ? String(event.data.content ?? "")
                : "";
            if (chunk) {
              latestQuestion += chunk;
              setStreamingQuestion((prev) => prev + chunk);
            }
            break;
          }
          case "question_complete": {
            const total =
              event.data && typeof event.data === "object" && "total_content" in event.data
                ? String(event.data.total_content ?? "")
                : latestQuestion;
            latestQuestion = total;
            setStreamingQuestion(total);
            setCurrentQuestion(total || null);
            setIsStreamingQuestion(false);
            break;
          }
          case "error": {
            const message =
              event.data && typeof event.data === "object" && "message" in event.data
                ? String(event.data.message ?? "")
                : t("home.errors.startFailed");
            throw new Error(message || t("home.errors.startFailed"));
          }
          default:
            break;
        }
      }

      if (currentSessionId && latestQuestion) {
        setSessionId(currentSessionId);
        setCurrentQuestion(latestQuestion);
        setStreamingQuestion(latestQuestion);
        setIsStreamingQuestion(false);
      }
    } catch (error) {
      try {
        const response = await startInterview({
          user_id: userId,
          resume_summary: resume.summary.summary,
          job_description: jobDescription,
          interviewer_style: interviewerStyle,
          question_count: questionCount,
          language,
        });
        setSessionId(response.session_id);
        setCurrentQuestion(response.prompt ?? null);
        setStreamingQuestion(response.prompt ?? "");
        setIsStreamingQuestion(false);
        setErrorMessage(null);
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : t("home.errors.startFailed");
        setErrorMessage(message || t("home.errors.startFailed"));
        setSessionId(null);
        setCurrentQuestion(null);
        setStreamingQuestion("");
      } finally {
        setIsStreamingQuestion(false);
        setIsProcessing(false);
      }
      return;
    }

    setIsProcessing(false);
  };

  const handleQuestionStreamComplete = () => {
    setIsProcessing(false);
  };

  const handleAnswerSubmit = async (answer: string) => {
    if (!sessionId) {
      return;
    }

    const askedQuestion = currentQuestion ?? streamingQuestion;
    if (!askedQuestion) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    setHistory((prev) => [
      ...prev,
      {
        role: "interviewer",
        content: askedQuestion,
        isStreaming: false,
      },
      { role: "candidate", content: answer, isStreaming: false },
    ]);

    setCurrentQuestion(null);
    setStreamingQuestion("");
    setIsStreamingQuestion(true);

    try {
      const streamIterator = await sendInterviewAnswerStream({
        session_id: sessionId,
        answer,
      });

      let latestQuestion = "";
      let interviewEnded = false;

      for await (const event of streamIterator) {
        switch (event.type) {
          case "question_chunk": {
            const chunk =
              event.data && typeof event.data === "object" && "content" in event.data
                ? String(event.data.content ?? "")
                : "";
            if (chunk) {
              latestQuestion += chunk;
              setStreamingQuestion((prev) => prev + chunk);
            }
            break;
          }
          case "question_complete": {
            const total =
              event.data && typeof event.data === "object" && "total_content" in event.data
                ? String(event.data.total_content ?? "")
                : latestQuestion;
            latestQuestion = total;
            setStreamingQuestion(total);
            setCurrentQuestion(total || null);
            setIsStreamingQuestion(false);
            break;
          }
          case "interview_complete": {
            interviewEnded = true;
            setIsStreamingQuestion(false);
            setStreamingQuestion("");
            setCurrentQuestion(null);
            setFeedback(
              event.data && typeof event.data === "object" && "feedback" in event.data
                ? ((event.data.feedback as InterviewFeedback) ?? null)
                : null,
            );
            setSessionId(null);
            break;
          }
          case "error": {
            const message =
              event.data && typeof event.data === "object" && "message" in event.data
                ? String(event.data.message ?? "")
                : t("home.errors.answerFailed");
            throw new Error(message || t("home.errors.answerFailed"));
          }
          default:
            break;
        }
      }

      if (interviewEnded) {
        setIsProcessing(false);
        return;
      }

      if (latestQuestion) {
        setCurrentQuestion((prev) => prev ?? latestQuestion);
        setStreamingQuestion((prev) => (prev ? prev : latestQuestion));
      }

      setIsStreamingQuestion(false);
    } catch (error) {
      try {
        const response = await sendInterviewAnswer({
          session_id: sessionId,
          answer,
        });

        if (response.completed) {
          setFeedback(response.feedback ?? null);
          setSessionId(null);
          setCurrentQuestion(null);
          setStreamingQuestion("");
        } else {
          const nextQuestion = response.prompt ?? "";
          setCurrentQuestion(nextQuestion || null);
          setStreamingQuestion(nextQuestion);
        }

        setErrorMessage(null);
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error ? fallbackError.message : t("home.errors.answerFailed");
        setErrorMessage(message || t("home.errors.answerFailed"));
        setCurrentQuestion(null);
        setStreamingQuestion("");
      } finally {
        setIsStreamingQuestion(false);
        setIsProcessing(false);
      }

      return;
    }
  };

  const handleFinishEarly = async () => {
    if (!sessionId) {
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const response = await endInterview(sessionId);
      setFeedback(response.feedback ?? null);
      setSessionId(null);
      setCurrentQuestion(null);
      setStreamingQuestion("");
      setIsStreamingQuestion(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("home.errors.endFailed");
      setErrorMessage(message || t("home.errors.endFailed"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setSessionId(null);
    setCurrentQuestion(null);
    setStreamingQuestion("");
    setIsStreamingQuestion(false);
    setHistory([]);
    setFeedback(null);
    setIsProcessing(false);
    setErrorMessage(null);
  };

  return (
    <main className="space-y-8">
      {feedback && (
        <div className="flex justify-end">
          <button
            onClick={handleReset}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            {t("home.callToAction")}
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <ResumeUploader onUploadComplete={handleResumeUpload} disabled={isProcessing} />
          <ResumeSummaryCard resume={resume} filename={resumeFileName} />
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">{t("home.steps.configure")}</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700" htmlFor="jobDescription">
                  {t("home.configure.jobDescriptionLabel")}
                </label>
                <textarea
                  id="jobDescription"
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  rows={4}
                  placeholder={t("home.configure.jobDescriptionPlaceholder")}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
                  disabled={Boolean(sessionId)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700" htmlFor="interviewerStyle">
                    {t("home.configure.interviewerStyleLabel")}
                  </label>
                  <select
                    id="interviewerStyle"
                    value={interviewerStyle}
                    onChange={(event) => setInterviewerStyle(event.target.value)}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
                    disabled={Boolean(sessionId)}
                  >
                    {interviewerStyles.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700" htmlFor="questionCount">
                    {t("home.configure.questionCountLabel")}
                  </label>
                  <input
                    id="questionCount"
                    type="number"
                    min={3}
                    max={10}
                    value={questionCount}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isNaN(value)) {
                        return;
                      }
                      setQuestionCount(Math.min(10, Math.max(3, value)));
                    }}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
                    disabled={Boolean(sessionId)}
                  />
                </div>
              </div>
              <button
                onClick={handleStartInterview}
                className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!canStart || isProcessing}
              >
                {sessionId ? t("home.configure.inProgress") : t("home.configure.startButton")}
              </button>
              {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
            </div>
          </div>
        </div>

        <InterviewConsole
          sessionId={sessionId}
          currentQuestion={currentQuestion}
          streamingQuestion={streamingQuestion}
          isStreamingQuestion={isStreamingQuestion}
          history={history}
          feedback={feedback}
          onSubmit={handleAnswerSubmit}
          onFinishEarly={handleFinishEarly}
          onStreamComplete={handleQuestionStreamComplete}
          processing={isProcessing}
        />
      </div>
    </main>
  );
}
