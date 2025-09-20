export type LanguageCode = "en" | "zh";

export type ResumeSummary = {
  headline?: string | null;
  summary: string;
  skills: string[];
  insights?: string[];
  skills_by_category?: Record<string, string[]>;
  confidence?: number | null;
};

export type ResumeParseResponse = {
  text: string;
  sections: Record<string, string>;
  highlights: string[];
  summary: ResumeSummary;
  analysis_origin?: string | null;
};

export type InterviewPrompt = {
  id: string;
  text: string;
  topic: string;
  type: "main" | "follow_up";
};

export type InterviewFeedback = {
  overall_score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
};

export type InterviewResponse = {
  completed: boolean;
  prompt?: InterviewPrompt | null;
  feedback?: InterviewFeedback | null;
};

export type InterviewTurnRecord = {
  question: string;
  question_type: "main" | "follow_up";
  answer: string;
  topic: string;
  asked_at: string;
  elapsed_seconds?: number | null;
};

export type InterviewHistoryItem = {
  session_id: string;
  interviewer_style: string;
  language: LanguageCode;
  started_at: string;
  completed_at?: string | null;
  question_count: number;
  overall_score?: number | null;
  summary?: string | null;
};

export type InterviewSessionDetail = {
  session_id: string;
  user_id: string;
  user_name?: string | null;
  interviewer_style: string;
  language: LanguageCode;
  resume_summary: string;
  job_description: string;
  turns: InterviewTurnRecord[];
  feedback?: InterviewFeedback | null;
  started_at: string;
  completed_at?: string | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return (await response.json()) as T;
}

export async function uploadResume(file: File): Promise<ResumeParseResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/resume/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<ResumeParseResponse>(response);
}

type StartInterviewPayload = {
  resume_summary: string;
  job_description: string;
  interviewer_style: string;
  question_count: number;
  user_id: string;
  user_name?: string;
  language: LanguageCode;
};

export async function startInterview(payload: StartInterviewPayload): Promise<{ session_id: string; prompt: InterviewPrompt }>
{
  const response = await fetch(`${API_BASE_URL}/interview/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export type SendAnswerPayload = {
  session_id: string;
  answer: string;
  elapsed_seconds?: number;
};

export async function sendInterviewAnswer(payload: SendAnswerPayload): Promise<InterviewResponse> {
  const response = await fetch(`${API_BASE_URL}/interview/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export function sendInterviewAnswerStream(
  payload: SendAnswerPayload,
  handlers: {
    onChunk: (content: string) => void;
    onComplete: (response: InterviewResponse) => void;
    onError: (error: Error) => void;
  },
): () => void {
  const { onChunk, onComplete, onError } = handlers;
  const controller = new AbortController();

  const safeOnError = (error: Error) => {
    if (typeof onError === 'function') {
      onError(error);
    } else {
      console.error('onError is not a function:', error);
    }
  };

  fetch(`${API_BASE_URL}/interview/respond-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok || !response.body) {
        throw new Error(response.statusText || "Stream request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      const process = (): void => {
        reader
          .read()
          .then(({ value, done }) => {
            if (done || finished) {
              return;
            }

            buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
            let separator = buffer.indexOf("\n\n");
            while (separator !== -1) {
              const rawEvent = buffer.slice(0, separator);
              buffer = buffer.slice(separator + 2);
              const payloadLines = rawEvent.split("\n").filter(Boolean);
              let dataPayload = "";
              for (const line of payloadLines) {
                if (line.startsWith("data:")) {
                  dataPayload += line.slice(5).trim();
                }
              }
              if (dataPayload) {
                try {
                  const parsed = JSON.parse(dataPayload);
                  if (parsed.content) {
                    onChunk(parsed.content as string);
                  }
                  if (parsed.completed) {
                    finished = true;
                    onComplete(parsed.response as InterviewResponse);
                    controller.abort();
                    return;
                  }
                } catch (error) {
                  finished = true;
                  controller.abort();
                  safeOnError(error instanceof Error ? error : new Error(String(error)));
                  return;
                }
              }
              separator = buffer.indexOf("\n\n");
            }

            if (!finished) {
              process();
            }
          })
          .catch((error) => {
            safeOnError(error instanceof Error ? error : new Error(String(error)));
          });
      };

      process();
    })
    .catch((error) => {
      safeOnError(error instanceof Error ? error : new Error(String(error)));
    });

  return () => controller.abort();
}

export async function endInterview(sessionId: string): Promise<InterviewResponse> {
  const response = await fetch(`${API_BASE_URL}/interview/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
  return handleResponse(response);
}

export async function fetchHistory(userId: string): Promise<InterviewHistoryItem[]> {
  const response = await fetch(`${API_BASE_URL}/interview/history?user_id=${encodeURIComponent(userId)}`);
  return handleResponse(response);
}

export async function fetchSessionDetail(sessionId: string): Promise<InterviewSessionDetail> {
  const response = await fetch(`${API_BASE_URL}/interview/session/${sessionId}`);
  return handleResponse(response);
}


