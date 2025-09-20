from __future__ import annotations

import json

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

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
    questions = _llm_service.generate_questions(payload)
    return QuestionGenerationResponse(questions=questions)


@router.post("/interview/start", response_model=InterviewStartResponse)
def start_interview(payload: InterviewStartRequest) -> InterviewStartResponse:
    return _interview_manager.start(payload)


@router.post("/interview/respond", response_model=InterviewResponse)
def respond_interview(payload: InterviewResponseRequest) -> InterviewResponse:
    return _interview_manager.answer(payload)


@router.post("/interview/respond-stream")
def respond_interview_stream(payload: InterviewResponseRequest) -> StreamingResponse:
    """Stream version of interview response for real-time output."""

    stream = _interview_manager.answer_stream(payload)

    def generate():
        try:
            while True:
                chunk = next(stream)
                data = json.dumps({"content": chunk})
                yield "data: " + data + "\n\n"
        except StopIteration as stop:
            response = stop.value
            payload = {
                "completed": response.completed,
                "response": response.model_dump(),
            }
            yield "data: " + json.dumps(payload) + "\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/interview/end", response_model=InterviewResponse)
def end_interview(payload: InterviewEndRequest) -> InterviewResponse:
    feedback = _interview_manager.end(payload.session_id)
    return InterviewResponse(completed=True, feedback=feedback)


@router.get("/interview/history", response_model=list[InterviewHistoryItem])
def interview_history(user_id: str = Query(..., min_length=1)) -> list[InterviewHistoryItem]:
    return _interview_manager.list_history(user_id)


@router.get("/interview/session/{session_id}", response_model=InterviewSessionDetail)
def interview_detail(session_id: str) -> InterviewSessionDetail:
    return _interview_manager.get_session_detail(session_id)
