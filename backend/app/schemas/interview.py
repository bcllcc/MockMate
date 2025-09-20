from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


LanguageCode = Literal["en", "zh"]


class Question(BaseModel):
    id: str
    text: str
    topic: str = "general"
    style: str | None = None


class QuestionGenerationRequest(BaseModel):
    resume_summary: str
    job_description: str
    interviewer_style: str = "general"
    count: int = Field(default=5, ge=1, le=15)
    language: LanguageCode = "en"


class QuestionGenerationResponse(BaseModel):
    questions: list[Question]


class InterviewStartRequest(BaseModel):
    resume_summary: str
    job_description: str
    interviewer_style: str = "general"
    question_count: int = Field(default=5, ge=1, le=15)
    user_id: str
    user_name: str | None = None
    language: LanguageCode = "en"


class InterviewPrompt(BaseModel):
    id: str
    text: str
    topic: str
    type: Literal["main", "follow_up"] = "main"


class InterviewStartResponse(BaseModel):
    session_id: str
    prompt: InterviewPrompt


class InterviewResponseRequest(BaseModel):
    session_id: str
    answer: str
    elapsed_seconds: float | None = None


class InterviewTurn(BaseModel):
    question: str
    question_type: Literal["main", "follow_up"]
    answer: str
    topic: str
    asked_at: datetime
    elapsed_seconds: float | None = None


class InterviewFeedback(BaseModel):
    overall_score: float
    summary: str
    strengths: list[str]
    weaknesses: list[str]
    suggestions: list[str]


class InterviewResponse(BaseModel):
    completed: bool
    prompt: InterviewPrompt | None = None
    feedback: InterviewFeedback | None = None


class InterviewEndRequest(BaseModel):
    session_id: str


class InterviewHistoryItem(BaseModel):
    session_id: str
    interviewer_style: str
    language: LanguageCode
    started_at: datetime
    completed_at: datetime | None = None
    question_count: int
    overall_score: float | None = None
    summary: str | None = None


class InterviewSessionDetail(BaseModel):
    session_id: str
    user_id: str
    user_name: str | None
    interviewer_style: str
    language: LanguageCode
    resume_summary: str
    job_description: str
    turns: list[InterviewTurn]
    feedback: InterviewFeedback | None
    started_at: datetime
    completed_at: datetime | None = None
