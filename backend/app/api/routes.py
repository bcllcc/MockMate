from __future__ import annotations

import json

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.core.database import SessionLocal
from app.schemas import (
    InterviewEndRequest,
    InterviewHistoryItem,
    InterviewResponse,
    InterviewResponseRequest,
    InterviewSessionDetail,
    InterviewStartRequest,
    InterviewStartResponse,
    QuestionGenerationRequest,
    QuestionGenerationResponse,
    ResumeParseResponse,
)
from app.services.interview_manager import InterviewManager
from app.services.llm import LLMService
from app.services.resume_analyzer import ResumeInsightAnalyzer
from app.services.resume_parser import ResumeParser

router = APIRouter()

_llm_service = LLMService()
_resume_analyzer = ResumeInsightAnalyzer(_llm_service)
_resume_parser = ResumeParser(_resume_analyzer)
_interview_manager = InterviewManager(_llm_service, SessionLocal)


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/resume/upload", response_model=ResumeParseResponse)
async def upload_resume(file: UploadFile = File(...)) -> ResumeParseResponse:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    return _resume_parser.parse(data, file.filename)


@router.post("/questions/generate", response_model=QuestionGenerationResponse)
def generate_questions(payload: QuestionGenerationRequest) -> QuestionGenerationResponse:
    questions = _llm_service.generate_questions(
        payload.resume_summary,
        payload.job_description,
        payload.language
    )
    return QuestionGenerationResponse(questions=questions)


@router.post("/interview/start", response_model=InterviewStartResponse)
def start_interview(payload: InterviewStartRequest) -> InterviewStartResponse:
    result = _interview_manager.start(
        user_id=payload.user_id,
        resume_summary=payload.resume_summary,
        job_description=payload.job_description,
        language=payload.language,
        interviewer_style=payload.interviewer_style,
        question_count=payload.question_count,
    )
    return InterviewStartResponse(
        session_id=result["session_id"],
        prompt=result["prompt"]
    )


@router.post("/interview/respond", response_model=InterviewResponse)
def respond_interview(payload: InterviewResponseRequest) -> InterviewResponse:
    result = _interview_manager.answer(
        session_id=payload.session_id,
        answer_text=payload.answer,
        elapsed_seconds=payload.elapsed_seconds,
    )
    return InterviewResponse(
        completed=result["completed"],
        prompt=result.get("prompt"),
        feedback=result.get("feedback"),
    )




@router.post("/interview/end", response_model=InterviewResponse)
def end_interview(payload: InterviewEndRequest) -> InterviewResponse:
    result = _interview_manager.end(payload.session_id)
    return InterviewResponse(
        completed=True,
        feedback=result["final_feedback"]
    )


@router.get("/interview/history", response_model=list[InterviewHistoryItem])
def interview_history(user_id: str = Query(..., min_length=1)) -> list[InterviewHistoryItem]:
    return _interview_manager.list_history(user_id)


@router.get("/interview/session/{session_id}", response_model=InterviewSessionDetail)
def interview_detail(session_id: str) -> InterviewSessionDetail:
    return _interview_manager.get_session_detail(session_id)
