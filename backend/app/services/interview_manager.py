from __future__ import annotations

from datetime import datetime
import uuid
from typing import Callable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InterviewSession as InterviewSessionModel, InterviewTurn as InterviewTurnModel
from app.schemas import (
    InterviewFeedback,
    InterviewHistoryItem,
    InterviewPrompt,
    InterviewResponse,
    InterviewResponseRequest,
    InterviewSessionDetail,
    InterviewStartRequest,
    InterviewStartResponse,
    InterviewTurn as InterviewTurnSchema,
    QuestionGenerationRequest,
)
from app.services.llm import LLMService


class InterviewManager:
    def __init__(self, llm_service: LLMService, session_factory: Callable[[], Session]) -> None:
        self._llm = llm_service
        self._session_factory = session_factory

    # Session lifecycle ---------------------------------------------------------
    def start(self, payload: InterviewStartRequest) -> InterviewStartResponse:
        question_request = QuestionGenerationRequest(
            resume_summary=payload.resume_summary,
            job_description=payload.job_description,
            interviewer_style=payload.interviewer_style,
            count=payload.question_count,
            language=payload.language,
        )
        questions = self._llm.generate_questions(question_request)
        prompts = [
            InterviewPrompt(id=question.id, text=question.text, topic=question.topic, type="main")
            for question in questions
        ]
        if not prompts:
            raise HTTPException(status_code=500, detail="Unable to generate interview questions.")

        session_id = str(uuid.uuid4())
        session_model = InterviewSessionModel(
            session_id=session_id,
            user_id=payload.user_id,
            user_name=payload.user_name,
            interviewer_style=payload.interviewer_style,
            language=payload.language,
            resume_summary=payload.resume_summary,
            job_description=payload.job_description,
            questions=[prompt.model_dump() for prompt in prompts],
            current_prompt=prompts[0].model_dump(),
            next_index=1,
            turn_count=0,
            completed=False,
        )

        with self._session_factory() as db:
            db.add(session_model)
            db.commit()

        return InterviewStartResponse(session_id=session_id, prompt=prompts[0])

    def answer(self, payload: InterviewResponseRequest) -> InterviewResponse:
        with self._session_factory() as db:
            session_model = self._get_session(db, payload.session_id)
            if session_model.completed or session_model.current_prompt is None:
                raise HTTPException(status_code=400, detail="Interview session has already finished.")

            prompt = InterviewPrompt(**session_model.current_prompt)
            sequence = session_model.turn_count + 1
            turn_model = InterviewTurnModel(
                session_id=session_model.session_id,
                sequence=sequence,
                question=prompt.text,
                question_type=prompt.type,
                topic=prompt.topic,
                answer=payload.answer,
                asked_at=datetime.utcnow(),
                elapsed_seconds=payload.elapsed_seconds,
            )
            db.add(turn_model)
            session_model.turn_count = sequence
            db.flush()

            follow_up = self._llm.generate_follow_up(prompt, payload.answer, session_model.language)
            if follow_up:
                session_model.current_prompt = follow_up.model_dump()
                db.commit()
                return InterviewResponse(completed=False, prompt=follow_up)

            questions = session_model.questions or []
            if session_model.next_index < len(questions):
                next_prompt = InterviewPrompt(**questions[session_model.next_index])
                session_model.current_prompt = next_prompt.model_dump()
                session_model.next_index += 1
                db.commit()
                return InterviewResponse(completed=False, prompt=next_prompt)

            turns = self._load_turns(db, session_model.session_id)
            feedback = self._llm.generate_feedback(turns, session_model.interviewer_style, session_model.language)
            session_model.feedback = feedback.model_dump()
            session_model.current_prompt = None
            session_model.completed = True
            session_model.completed_at = datetime.utcnow()
            db.commit()
            return InterviewResponse(completed=True, feedback=feedback)



    def answer_stream(self, payload: InterviewResponseRequest):
        def generator():
            with self._session_factory() as db:
                session_model = self._get_session(db, payload.session_id)
                if session_model.completed or session_model.current_prompt is None:
                    raise HTTPException(status_code=400, detail="Interview session has already finished.")

                prompt = InterviewPrompt(**session_model.current_prompt)
                sequence = session_model.turn_count + 1
                turn_model = InterviewTurnModel(
                    session_id=session_model.session_id,
                    sequence=sequence,
                    question=prompt.text,
                    question_type=prompt.type,
                    topic=prompt.topic,
                    answer=payload.answer,
                    asked_at=datetime.utcnow(),
                    elapsed_seconds=payload.elapsed_seconds,
                )
                db.add(turn_model)
                session_model.turn_count = sequence
                db.flush()

                follow_up_prompt = None
                follow_up_stream = self._llm.generate_follow_up_stream(prompt, payload.answer, session_model.language)
                if follow_up_stream is not None:
                    while True:
                        try:
                            chunk = next(follow_up_stream)
                        except StopIteration as stop:
                            follow_up_prompt = stop.value
                            break
                        if chunk:
                            yield chunk

                if follow_up_prompt:
                    session_model.current_prompt = follow_up_prompt.model_dump()
                    db.commit()
                    return InterviewResponse(completed=False, prompt=follow_up_prompt)

                questions = session_model.questions or []
                if session_model.next_index < len(questions):
                    next_prompt = InterviewPrompt(**questions[session_model.next_index])
                    session_model.current_prompt = next_prompt.model_dump()
                    session_model.next_index += 1
                    db.commit()
                    return InterviewResponse(completed=False, prompt=next_prompt)

                turns = self._load_turns(db, session_model.session_id)
                feedback = self._llm.generate_feedback(turns, session_model.interviewer_style, session_model.language)
                session_model.feedback = feedback.model_dump()
                session_model.current_prompt = None
                session_model.completed = True
                session_model.completed_at = datetime.utcnow()
                db.commit()
                if feedback.summary:
                    for chunk in self._stream_text(feedback.summary):
                        yield chunk
                return InterviewResponse(completed=True, feedback=feedback)

        return generator()

    def end(self, session_id: str) -> InterviewFeedback:
        with self._session_factory() as db:
            session_model = self._get_session(db, session_id)
            turns = self._load_turns(db, session_model.session_id)
            feedback = self._llm.generate_feedback(turns, session_model.interviewer_style, session_model.language)
            session_model.feedback = feedback.model_dump()
            session_model.current_prompt = None
            session_model.completed = True
            session_model.completed_at = datetime.utcnow()
            db.commit()
            return feedback

    # History -------------------------------------------------------------------
    def list_history(self, user_id: str) -> list[InterviewHistoryItem]:
        with self._session_factory() as db:
            stmt = (
                select(InterviewSessionModel)
                .where(InterviewSessionModel.user_id == user_id)
                .order_by(InterviewSessionModel.created_at.desc())
            )
            sessions = db.execute(stmt).scalars().all()
            history: list[InterviewHistoryItem] = []
            for session in sessions:
                feedback = session.feedback or {}
                score = feedback.get("overall_score") if isinstance(feedback, dict) else None
                summary = feedback.get("summary") if isinstance(feedback, dict) else None
                history.append(
                    InterviewHistoryItem(
                        session_id=session.session_id,
                        interviewer_style=session.interviewer_style,
                        language=session.language,
                        started_at=session.created_at,
                        completed_at=session.completed_at,
                        question_count=len(session.questions or []),
                        overall_score=float(score) if isinstance(score, (int, float)) else None,
                        summary=summary if isinstance(summary, str) else None,
                    )
                )
            return history

    def get_session_detail(self, session_id: str) -> InterviewSessionDetail:
        with self._session_factory() as db:
            session_model = self._get_session(db, session_id)
            turns = self._load_turns(db, session_model.session_id)
            feedback = None
            if session_model.feedback:
                feedback = InterviewFeedback(**session_model.feedback)
            return InterviewSessionDetail(
                session_id=session_model.session_id,
                user_id=session_model.user_id,
                user_name=session_model.user_name,
                interviewer_style=session_model.interviewer_style,
                language=session_model.language,
                resume_summary=session_model.resume_summary,
                job_description=session_model.job_description,
                turns=turns,
                feedback=feedback,
                started_at=session_model.created_at,
                completed_at=session_model.completed_at,
            )

    # Internal helpers ----------------------------------------------------------
    def _get_session(self, db: Session, session_id: str) -> InterviewSessionModel:
        session = db.get(InterviewSessionModel, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found.")
        return session

    def _load_turns(self, db: Session, session_id: str) -> list[InterviewTurnSchema]:
        stmt = (
            select(InterviewTurnModel)
            .where(InterviewTurnModel.session_id == session_id)
            .order_by(InterviewTurnModel.sequence.asc())
        )
        rows = db.execute(stmt).scalars().all()
        return [
            InterviewTurnSchema(
                question=row.question,
                question_type=row.question_type,
                answer=row.answer,
                topic=row.topic,
                asked_at=row.asked_at,
                elapsed_seconds=row.elapsed_seconds,
            )
            for row in rows
        ]

    @staticmethod
    def _stream_text(text: str):
        """Stream text word-by-word with a short delay."""
        import time
        words = text.split()
        for i, word in enumerate(words):
            if i < len(words) - 1:
                yield word + " "
            else:
                yield word
            time.sleep(0.05)



