from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime

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
    questions = _llm_service.generate_questions(
        payload.resume_summary,
        payload.job_description,
        payload.language
    )
    return QuestionGenerationResponse(questions=questions)


@router.post("/interview/start")
async def start_interview(payload: InterviewStartRequest) -> StreamingResponse:
    """Start an interview session and stream the first question."""

    def _serialize_event(event_type: str, data: dict) -> str:
        return f"data: {json.dumps({'type': event_type, 'data': data}, ensure_ascii=False)}\n\n"

    async def generate_stream():
        session_id: str | None = None
        fallback_prompt = ""
        try:
            result = _interview_manager.start(
                user_id=payload.user_id,
                resume_summary=payload.resume_summary,
                job_description=payload.job_description,
                language=payload.language,
                interviewer_style=payload.interviewer_style,
                question_count=payload.question_count,
            )

            session_id = result["session_id"]
            fallback_prompt = result.get("prompt") or ""

            yield _serialize_event("session_started", {"session_id": session_id})

            accumulated = ""
            stream_failed = False

            try:
                async for chunk in _llm_service.generate_first_question_stream(
                    payload.resume_summary,
                    payload.job_description,
                    payload.language,
                ):
                    if chunk:
                        accumulated += chunk
                        yield _serialize_event("question_chunk", {"content": chunk, "finished": False})
                        await asyncio.sleep(0.05)
            except Exception as stream_error:  # pragma: no cover - fallback handled
                stream_failed = True
                _llm_service._logger.error(f"First question stream failed: {stream_error}")

            total_content = (accumulated.strip() or fallback_prompt).strip()

            if session_id and total_content:
                try:
                    with SessionLocal() as db:
                        session = _interview_manager._get_session(db, session_id)
                        if session:
                            prompt_payload = dict(session.current_prompt or {})
                            prompt_payload["text"] = total_content
                            prompt_payload.setdefault("id", prompt_payload.get("id") or uuid.uuid4().hex)
                            prompt_payload.setdefault("topic", prompt_payload.get("topic", "general"))
                            prompt_payload.setdefault("type", prompt_payload.get("type", "main"))
                            prompt_payload.setdefault("style", prompt_payload.get("style", session.interviewer_style))
                            session.current_prompt = prompt_payload
                            db.commit()
                except Exception as update_error:  # pragma: no cover - logging only
                    _llm_service._logger.error(f"Failed to persist first question: {update_error}")

            yield _serialize_event("question_complete", {
                "session_id": session_id,
                "completed": False,
                "total_content": total_content,
            })

            if stream_failed and not total_content:
                yield _serialize_event("error", {"message": "Failed to stream first question."})

        except Exception as exc:
            _llm_service._logger.error(f"Start interview stream error: {exc}")
            yield _serialize_event("error", {"message": str(exc)})

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
        },
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




@router.post("/interview/respond-stream")
async def respond_interview_stream(payload: InterviewResponseRequest) -> StreamingResponse:
    """流式响应面试回答，返回Server-Sent Events格式数据"""

    def _serialize_event(event_type: str, data: dict) -> str:
        return f"data: {json.dumps({'type': event_type, 'data': data}, ensure_ascii=False)}\n\n"

    async def generate_stream():
        has_error = False

        # Check for session errors first
        try:
            with SessionLocal() as db:
                session = _interview_manager._get_session(db, payload.session_id)
                if session is None:
                    yield _serialize_event('error', {'message': 'Session not found'})
                    has_error = True
                elif session.completed:
                    yield _serialize_event('error', {'message': 'Interview already completed'})
                    has_error = True
                else:
                    current_prompt = session.current_prompt or {}
                    if not current_prompt:
                        yield _serialize_event('error', {'message': 'No active interview question'})
                        has_error = True
        except Exception as e:
            _llm_service._logger.error(f"Database session error: {e}")
            yield _serialize_event('error', {'message': 'Database error occurred'})
            has_error = True

        # Only proceed with main logic if no errors
        if not has_error:
            try:
                with SessionLocal() as db:
                    session = _interview_manager._get_session(db, payload.session_id)
                    current_prompt = session.current_prompt or {}
                    sequence = session.turn_count + 1

                    _interview_manager._record_turn(
                        db=db,
                        session_id=session.session_id,
                        sequence=sequence,
                        question=current_prompt.get('text', ''),
                        question_type=current_prompt.get('type', 'main'),
                        topic=current_prompt.get('topic', 'general'),
                        answer=payload.answer,
                        elapsed_seconds=payload.elapsed_seconds,
                    )

                    session.turn_count = sequence
                    questions = list(session.questions or [])
                    questions.append({
                        'id': current_prompt.get('id'),
                        'text': current_prompt.get('text'),
                        'topic': current_prompt.get('topic', 'general'),
                        'type': current_prompt.get('type', 'main'),
                        'sequence': sequence,
                    })
                    session.questions = questions

                    target_count = session.next_index or 0
                    if target_count and session.turn_count >= target_count:
                        turns = _interview_manager._fetch_turns(db, session.session_id)
                        history = _interview_manager._build_llm_history(turns)
                        final_feedback = _llm_service.generate_final_feedback(
                            history,
                            session.resume_summary,
                            session.job_description,
                            session.language,
                        )
                        session.completed = True
                        session.completed_at = datetime.utcnow()
                        session.feedback = final_feedback
                        session.current_prompt = None
                        db.commit()

                        yield _serialize_event('interview_complete', {
                            'completed': True,
                            'feedback': final_feedback,
                        })
                    else:
                        turns = _interview_manager._fetch_turns(db, session.session_id)
                        history = _interview_manager._build_llm_history(turns)

                        accumulated_question = ''
                        async for chunk in _llm_service.generate_follow_up_question_stream(
                            history,
                            session.resume_summary,
                            session.job_description,
                            session.language,
                        ):
                            accumulated_question += chunk
                            yield _serialize_event('question_chunk', {
                                'content': chunk,
                                'finished': False,
                            })
                            await asyncio.sleep(0.05)

                        next_prompt = {
                            'id': uuid.uuid4().hex,
                            'text': accumulated_question.strip(),
                            'topic': 'general',
                            'type': 'follow_up',
                            'style': session.interviewer_style,
                        }
                        session.current_prompt = next_prompt
                        db.commit()

                        yield _serialize_event('question_complete', {
                            'session_id': payload.session_id,
                            'completed': False,
                            'total_content': accumulated_question.strip(),
                        })
            except Exception as e:
                _llm_service._logger.error(f"Stream processing error: {e}")
                yield _serialize_event('error', {'message': str(e)})

        # Always send the DONE marker - this is the critical fix
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
        },
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

