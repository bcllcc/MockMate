from __future__ import annotations

from datetime import datetime
import uuid
from typing import Any, Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InterviewSession as InterviewSessionModel, InterviewTurn as InterviewTurnModel
from app.schemas import (
    InterviewHistoryItem,
    InterviewSessionDetail,
    InterviewTurn as InterviewTurnSchema,
)
from app.services.llm import LLMService


class InterviewManager:
    def __init__(self, llm_service: LLMService, session_factory):
        self._llm = llm_service
        self._session_factory = session_factory

    def start(
        self,
        user_id: str,
        resume_summary: str,
        job_description: str,
        language: str = "en",
        interviewer_style: str = "general",
        question_count: int = 6,
    ) -> dict[str, str]:
        session_id = uuid.uuid4().hex
        first_question = self._llm.generate_first_question(resume_summary, job_description, language)
        prompt = {
            "id": uuid.uuid4().hex,
            "text": first_question,
            "topic": "general",
            "type": "main",
            "style": interviewer_style,
        }

        with self._session_factory() as db:
            session = InterviewSessionModel(
                session_id=session_id,
                user_id=user_id,
                user_name=None,
                interviewer_style=interviewer_style,
                language=language,
                resume_summary=resume_summary,
                job_description=job_description,
                questions=[],
                current_prompt=prompt,
                feedback=None,
                next_index=question_count,
                turn_count=0,
                completed=False,
            )
            db.add(session)
            db.commit()

        return {"session_id": session_id, "prompt": first_question}

    def answer(
        self,
        session_id: str,
        answer_text: str,
        elapsed_seconds: float | None = None,
    ) -> dict[str, Any]:
        with self._session_factory() as db:
            session = self._get_session(db, session_id)
            if session is None:
                raise HTTPException(status_code=404, detail="Session not found")
            if session.completed:
                raise HTTPException(status_code=400, detail="Interview already completed")

            prompt = session.current_prompt
            if not prompt:
                raise HTTPException(status_code=400, detail="No active interview question")

            sequence = session.turn_count + 1
            self._record_turn(
                db=db,
                session_id=session.session_id,
                sequence=sequence,
                question=prompt.get("text", ""),
                question_type=prompt.get("type", "main"),
                topic=prompt.get("topic", "general"),
                answer=answer_text,
                elapsed_seconds=elapsed_seconds,
            )

            session.turn_count = sequence
            questions = list(session.questions or [])
            questions.append(
                {
                    "id": prompt.get("id"),
                    "text": prompt.get("text"),
                    "topic": prompt.get("topic", "general"),
                    "type": prompt.get("type", "main"),
                    "sequence": sequence,
                }
            )
            session.questions = questions

            turns = self._fetch_turns(db, session.session_id)
            history = self._build_llm_history(turns)

            feedback = self._llm.generate_feedback(
                answer_text,
                session.resume_summary,
                session.job_description,
                session.language,
            )

            target_count = session.next_index or 0
            if target_count and session.turn_count >= target_count:
                final_feedback = self._llm.generate_final_feedback(
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
                return {"completed": True, "feedback": final_feedback}

            next_question = self._llm.generate_follow_up_question(
                history,
                session.resume_summary,
                session.job_description,
                session.language,
            )
            next_prompt = {
                "id": uuid.uuid4().hex,
                "text": next_question,
                "topic": "general",
                "type": "follow_up",
                "style": session.interviewer_style,
            }
            session.current_prompt = next_prompt
            db.commit()
            return {"completed": False, "prompt": next_question, "feedback": feedback}

    def end(self, session_id: str) -> dict[str, Any]:
        with self._session_factory() as db:
            session = self._get_session(db, session_id)
            if session is None:
                raise HTTPException(status_code=404, detail="Session not found")

            if session.completed and isinstance(session.feedback, dict):
                return {"final_feedback": session.feedback}

            turns = self._fetch_turns(db, session.session_id)
            history = self._build_llm_history(turns)
            final_feedback = self._llm.generate_final_feedback(
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

            return {"final_feedback": final_feedback}

    def list_history(self, user_id: str) -> list[InterviewHistoryItem]:
        with self._session_factory() as db:
            sessions = (
                db.execute(
                    select(InterviewSessionModel)
                    .where(InterviewSessionModel.user_id == user_id)
                    .order_by(InterviewSessionModel.created_at.desc())
                )
                .scalars()
                .all()
            )

            history: list[InterviewHistoryItem] = []
            for session in sessions:
                feedback = session.feedback if isinstance(session.feedback, dict) else {}
                history.append(
                    InterviewHistoryItem(
                        session_id=session.session_id,
                        interviewer_style=session.interviewer_style,
                        language=session.language,
                        started_at=session.created_at,
                        completed_at=session.completed_at,
                        question_count=session.turn_count,
                        overall_score=feedback.get("overall_score"),
                        summary=feedback.get("summary"),
                    )
                )
            return history

    def get_session_detail(self, session_id: str) -> InterviewSessionDetail:
        with self._session_factory() as db:
            session = self._get_session(db, session_id)
            if session is None:
                raise HTTPException(status_code=404, detail="Session not found")

            turns = self._fetch_turns(db, session.session_id)
            turn_payload = [
                InterviewTurnSchema(
                    question=turn.question,
                    question_type=turn.question_type,
                    answer=turn.answer,
                    topic=turn.topic,
                    asked_at=turn.asked_at,
                    elapsed_seconds=turn.elapsed_seconds,
                )
                for turn in turns
            ]

            feedback = session.feedback if isinstance(session.feedback, dict) else None

            return InterviewSessionDetail(
                session_id=session.session_id,
                user_id=session.user_id,
                user_name=session.user_name,
                interviewer_style=session.interviewer_style,
                language=session.language,
                resume_summary=session.resume_summary,
                job_description=session.job_description,
                turns=turn_payload,
                feedback=feedback,
                started_at=session.created_at,
                completed_at=session.completed_at,
            )

    def _get_session(self, db: Session, session_id: str) -> InterviewSessionModel | None:
        return db.execute(
            select(InterviewSessionModel).where(InterviewSessionModel.session_id == session_id)
        ).scalar_one_or_none()

    def _record_turn(
        self,
        db: Session,
        session_id: str,
        sequence: int,
        question: str,
        question_type: str,
        topic: str,
        answer: str,
        elapsed_seconds: float | None,
    ) -> None:
        turn = InterviewTurnModel(
            session_id=session_id,
            sequence=sequence,
            question=question,
            question_type=question_type,
            topic=topic,
            answer=answer,
            elapsed_seconds=elapsed_seconds,
        )
        db.add(turn)
        db.flush()

    def _fetch_turns(self, db: Session, session_id: str) -> list[InterviewTurnModel]:
        return (
            db.execute(
                select(InterviewTurnModel)
                .where(InterviewTurnModel.session_id == session_id)
                .order_by(InterviewTurnModel.sequence)
            )
            .scalars()
            .all()
        )

    def _build_llm_history(self, turns: Iterable[InterviewTurnModel]) -> list[dict[str, str]]:
        history: list[dict[str, str]] = []
        for turn in turns:
            history.append({"role": "interviewer", "content": turn.question})
            history.append({"role": "candidate", "content": turn.answer})
        return history
