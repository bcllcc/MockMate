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

export type InterviewFeedback = {
  overall_score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
};

export type InterviewResponse = {
  completed: boolean;
  prompt?: string | null;
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

type PromptPayload = string | { text?: unknown } | null | undefined;

type StartInterviewPayload = {
  user_id: string;
  resume_summary: string;
  job_description: string;
  interviewer_style: string;
  question_count: number;
  language: LanguageCode;
};

type StartInterviewResponse = {
  session_id: string;
  prompt: PromptPayload;
};

type RawInterviewResponse = {
  completed: boolean;
  prompt?: PromptPayload;
  feedback?: InterviewFeedback | null;
};

function extractPromptText(prompt: PromptPayload): string {
  if (typeof prompt === "string") {
    return prompt;
  }
  if (prompt && typeof prompt === "object" && "text" in prompt) {
    const value = (prompt as { text?: unknown }).text;
    if (typeof value === "string") {
      return value;
    }
  }
  return "";
}

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

export async function startInterview(payload: StartInterviewPayload): Promise<{ session_id: string; prompt: string }> {
  const response = await fetch(`${API_BASE_URL}/interview/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<StartInterviewResponse>(response);
  return {
    session_id: data.session_id,
    prompt: extractPromptText(data.prompt),
  };
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
  const data = await handleResponse<RawInterviewResponse>(response);
  const prompt = extractPromptText(data.prompt);
  return {
    completed: data.completed,
    prompt: prompt || null,
    feedback: data.feedback ?? null,
  };
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
