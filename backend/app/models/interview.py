from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    session_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128))
    user_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    interviewer_style: Mapped[str] = mapped_column(String(32))
    language: Mapped[str] = mapped_column(String(8), default="en")
    resume_summary: Mapped[str] = mapped_column(Text)
    job_description: Mapped[str] = mapped_column(Text)
    questions: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    current_prompt: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    feedback: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    next_index: Mapped[int] = mapped_column(Integer, default=0)
    turn_count: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    turns: Mapped[list["InterviewTurn"]] = relationship(
        "InterviewTurn",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="InterviewTurn.sequence",
    )


class InterviewTurn(Base):
    __tablename__ = "interview_turns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(64), ForeignKey("interview_sessions.session_id", ondelete="CASCADE"))
    sequence: Mapped[int] = mapped_column(Integer)
    question: Mapped[str] = mapped_column(Text)
    question_type: Mapped[str] = mapped_column(String(16))
    topic: Mapped[str] = mapped_column(String(64))
    answer: Mapped[str] = mapped_column(Text)
    asked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    elapsed_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    session: Mapped[InterviewSession] = relationship("InterviewSession", back_populates="turns")
