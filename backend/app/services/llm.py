from __future__ import annotations

import logging
import json
import os
from pathlib import Path
import uuid
from textwrap import dedent
from typing import Iterable, Generator

from fastapi import HTTPException

try:  # pragma: no cover - runtime dependency
    from openai import OpenAI  # type: ignore
except ImportError as exc:  # pragma: no cover - handled at runtime
    raise RuntimeError("openai SDK is required: pip install openai") from exc

from app.core.config import settings
from app.schemas import (
    InterviewFeedback,
    InterviewPrompt,
    InterviewTurn,
    LanguageCode,
    Question,
    QuestionGenerationRequest,
)


class LLMService:
    """DeepSeek-powered helper for questions, follow-ups, and feedback."""

    _logger_configured = False

    def __init__(self) -> None:
        api_key = settings.deepseek_api_key or os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            raise RuntimeError("DeepSeek API key missing. Set settings.deepseek_api_key or DEEPSEEK_API_KEY.")
        self._client = OpenAI(api_key=api_key, base_url=settings.deepseek_base_url)
        self._model = "deepseek-chat"
        self._logger = logging.getLogger("app.services.llm")
        self._configure_logger()

    # Public API -----------------------------------------------------------------
    def generate_questions(self, payload: QuestionGenerationRequest) -> list[Question]:
        language = payload.language
        system_prompt = (
            "You are a senior interviewer preparing a structured mock interview. "
            "Return a JSON object with a `questions` array. Each item must contain `text` and `topic`."
        )
        if language == "zh":
            system_prompt += " Respond entirely in Simplified Chinese."
        user_prompt = (
            f"Resume summary:\n{payload.resume_summary}\n\n"
            f"Job description:\n{payload.job_description}\n\n"
            f"Interviewer style: {payload.interviewer_style}\n"
            f"Number of questions: {payload.count}\n"
            "The questions should be concise, with unique topics, and reference the resume or job needs when relevant."
        )
        raw = self._chat(system_prompt, user_prompt, temperature=0.6)
        data = self._parse_json(raw)
        items = data.get("questions") if isinstance(data, dict) else None
        if not isinstance(items, list):
            raise HTTPException(status_code=502, detail="LLM did not return a questions list.")

        questions: list[Question] = []
        for item in items[: payload.count]:
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            topic = item.get("topic") or "general"
            if not isinstance(text, str) or len(text.strip()) == 0:
                continue
            questions.append(
                Question(
                    id=str(uuid.uuid4()),
                    text=text.strip(),
                    topic=str(topic).strip() or "general",
                    style=payload.interviewer_style,
                )
            )

        if not questions:
            raise HTTPException(status_code=502, detail="LLM did not yield interview questions.")
        return questions

    def analyze_resume(self, resume_text: str, language: LanguageCode) -> dict:
        """Produce structured insights for a resume via the LLM."""
        cleaned_text = resume_text.strip()
        if not cleaned_text:
            raise HTTPException(status_code=400, detail="Resume text is empty.")

        system_prompt = (
            "You are an expert career coach and resume analyst. "
            "Generate structured insights that summarize experience, extract highlights, and group skills. "
            "Always respond with valid JSON that matches the schema instructions."
        )
        if language == "zh":
            system_prompt += " Respond entirely in Simplified Chinese."

        instructions = dedent("""
            Analyse the resume text and return JSON with the following shape:
            {
              "summary": {
                "headline": string or null,
                "overview": short paragraph,
                "insights": array of up to 5 bullet insights (strings),
                "skills_by_category": object mapping category -> array of up to 8 skills,
                "confidence": number between 0 and 1 (optional)
              },
              "sections": [
                {
                  "title": section title in sentence case,
                  "summary": 1-2 sentence summary,
                  "highlights": array of up to 5 concise bullet strings
                }
              ],
              "skills": array of up to 30 core skills ordered by relevance,
              "highlights": array of up to 8 standout accomplishments or metrics
            }
            Use concise wording. Do not include markdown or explanations outside of the JSON.
        """).strip()

        user_prompt = dedent(f"""
        {instructions}

        Resume text (may be truncated):
        ```
        {cleaned_text}
        ```
        """).strip()

        raw = self._chat(system_prompt, user_prompt, temperature=0.35)
        data = self._parse_json(raw)
        if not isinstance(data, dict):
            raise HTTPException(status_code=502, detail="LLM resume analysis failed.")
        return data



    def _chunk_text(self, text: str) -> Generator[str, None, None]:
        for token in text.split():
            yield token + " "

    def _chat_stream(self, system_prompt: str, user_prompt: str, temperature: float) -> Generator[str, None, None]:
        self._log_event(
            "request_stream",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                stream=True,
            )
        except Exception as exc:  # pragma: no cover - network errors
            self._log_event(
                "error_stream",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                error=str(exc),
            )
            raise HTTPException(status_code=502, detail="LLM stream request failed.") from exc

        try:
            for chunk in response:
                if not chunk.choices:
                    continue
                delta = getattr(chunk.choices[0], "delta", None)
                content = getattr(delta, "content", None) if delta else None
                if content:
                    yield content
        finally:
            self._log_event(
                "response_stream",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                raw_response="[stream]",
            )

    def generate_follow_up_stream(
        self,
        prompt: InterviewPrompt,
        answer: str,
        language: LanguageCode,
    ) -> Generator[str, None, InterviewPrompt | None]:
        system_prompt = (
            "You review candidate answers and decide whether a follow-up question is needed. "
            "Return JSON with `follow_up` (string or null) and optional `topic`."
        )
        if language == "zh":
            system_prompt += " Respond in Simplified Chinese."
        user_prompt = (
            f"Original question: {prompt.text}\n"
            f"Topic: {prompt.topic}\n"
            f"Candidate answer: {answer}\n"
            "If the answer is adequate, respond with {\"follow_up\": null}. If a follow-up is helpful, craft one targeted question."
        )

        buffer: list[str] = []
        stream = self._chat_stream(system_prompt, user_prompt, temperature=0.4)
        try:
            while True:
                chunk = next(stream)
                buffer.append(chunk)
        except StopIteration:
            pass

        raw = "".join(buffer)
        try:
            data = self._parse_json(raw)
        except HTTPException:
            return None

        follow_up = data.get("follow_up") if isinstance(data, dict) else None
        topic = data.get("topic") if isinstance(data, dict) else None
        if not follow_up or not isinstance(follow_up, str):
            return None

        prompt_text = follow_up.strip()
        topic_value = str(topic).strip() if isinstance(topic, str) and topic.strip() else prompt.topic
        follow_up_prompt = InterviewPrompt(
            id=str(uuid.uuid4()),
            text=prompt_text,
            topic=topic_value,
            type="follow_up",
        )

        for chunk in self._chunk_text(prompt_text):
            yield chunk

        return follow_up_prompt


    def generate_follow_up(self, prompt: InterviewPrompt, answer: str, language: LanguageCode) -> InterviewPrompt | None:
        system_prompt = (
            "You review candidate answers and decide whether a follow-up question is needed. "
            "Return JSON with `follow_up` (string or null) and optional `topic`."
        )
        if language == "zh":
            system_prompt += " Respond in Simplified Chinese."
        user_prompt = (
            f"Original question: {prompt.text}\n"
            f"Topic: {prompt.topic}\n"
            f"Candidate answer: {answer}\n"
            "If the answer is adequate, respond with {\"follow_up\": null}. If a follow-up is helpful, craft one targeted question."
        )
        raw = self._chat(system_prompt, user_prompt, temperature=0.4)
        data = self._parse_json(raw)
        follow_up = data.get("follow_up") if isinstance(data, dict) else None
        topic = data.get("topic") if isinstance(data, dict) else None
        if not follow_up:
            return None
        if not isinstance(follow_up, str):
            return None
        return InterviewPrompt(
            id=str(uuid.uuid4()),
            text=follow_up.strip(),
            topic=str(topic).strip() if isinstance(topic, str) and topic.strip() else prompt.topic,
            type="follow_up",
        )

    def generate_feedback(self, turns: Iterable[InterviewTurn], style: str, language: LanguageCode) -> InterviewFeedback:
        conversation_lines = []
        for idx, turn in enumerate(turns, start=1):
            conversation_lines.append(
                f"Q{idx}: {turn.question}\nA{idx}: {turn.answer}"
            )
        transcript = "\n\n".join(conversation_lines) if conversation_lines else ""
        system_prompt = (
            "You evaluate mock interviews and provide constructive feedback. "
            "Return JSON with `overall_score` (0-100 number), `summary`, `strengths`, `weaknesses`, `suggestions`."
        )
        if language == "zh":
            system_prompt += " Write the feedback in Simplified Chinese."
        user_prompt = (
            f"Interviewer style: {style}\n"
            f"Transcript:\n{transcript or 'No answers were provided.'}"
        )
        raw = self._chat(system_prompt, user_prompt, temperature=0.5)
        data = self._parse_json(raw)
        if not isinstance(data, dict):
            raise HTTPException(status_code=502, detail="LLM feedback malformed.")

        try:
            score = float(data.get("overall_score"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=502, detail="LLM feedback missing score.") from None

        summary = data.get("summary")
        strengths = data.get("strengths")
        weaknesses = data.get("weaknesses")
        suggestions = data.get("suggestions")
        if not isinstance(summary, str):
            raise HTTPException(status_code=502, detail="LLM feedback missing summary.")
        strengths_list = [item for item in strengths or [] if isinstance(item, str)]
        weaknesses_list = [item for item in weaknesses or [] if isinstance(item, str)]
        suggestions_list = [item for item in suggestions or [] if isinstance(item, str)]

        return InterviewFeedback(
            overall_score=score,
            summary=summary.strip(),
            strengths=strengths_list,
            weaknesses=weaknesses_list,
            suggestions=suggestions_list,
        )

    # Internal helpers ----------------------------------------------------------
    def _configure_logger(self) -> None:
        if LLMService._logger_configured:
            return
        log_path = Path(settings.llm_log_path).expanduser()
        if not log_path.is_absolute():
            base_dir = Path(__file__).resolve().parents[3]
            log_path = base_dir / log_path
        log_path.parent.mkdir(parents=True, exist_ok=True)
        handler = logging.FileHandler(log_path, encoding="utf-8")
        formatter = logging.Formatter("%(asctime)s	%(levelname)s	%(message)s")
        handler.setFormatter(formatter)
        self._logger.addHandler(handler)
        self._logger.setLevel(logging.INFO)
        self._logger.propagate = False
        LLMService._logger_configured = True

    def _log_event(
        self,
        event: str,
        *,
        system_prompt: str | None = None,
        user_prompt: str | None = None,
        raw_response: str | None = None,
        error: str | None = None,
    ) -> None:
        if not self._logger.handlers:
            return
        payload: dict[str, str] = {"event": event}
        if system_prompt is not None:
            payload["system_prompt"] = system_prompt
        if user_prompt is not None:
            payload["user_prompt"] = user_prompt
        if raw_response is not None:
            payload["raw_response"] = raw_response
        if error is not None:
            payload["error"] = error
        try:
            self._logger.info(json.dumps(payload, ensure_ascii=False))
        except Exception:  # pragma: no cover - logging failures should not interrupt flow
            self._logger.info(
                "event=%s system_prompt_length=%s user_prompt_length=%s raw_response_length=%s error=%s",
                event,
                len(system_prompt or ""),
                len(user_prompt or ""),
                len(raw_response or ""),
                error,
            )

    def _chat(self, system_prompt: str, user_prompt: str, temperature: float) -> str:
        self._log_event(
            "request",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                stream=False,
            )
        except Exception as exc:  # pragma: no cover - network errors
            self._log_event(
                "error",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                error=str(exc),
            )
            raise HTTPException(status_code=502, detail="LLM request failed.") from exc
        choices = getattr(response, "choices", None)
        if not choices:
            self._log_event(
                "error",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                error="no choices returned",
            )
            raise HTTPException(status_code=502, detail="LLM returned no choices.")
        message = choices[0].message
        content = getattr(message, "content", None)
        if not content:
            self._log_event(
                "error",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                error="empty content",
            )
            raise HTTPException(status_code=502, detail="LLM returned empty content.")
        self._log_event(
            "response",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            raw_response=content,
        )
        return content

    def _parse_json(self, raw: str) -> dict:
        text = raw.strip()
        if text.startswith("```") and text.endswith("```"):
            inner = text[3:-3].strip()
            if inner.lower().startswith("json"):
                inner = inner[4:].strip()
            text = inner
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start == -1 or end == -1:
                raise HTTPException(status_code=502, detail="LLM response was not valid JSON.")
            snippet = text[start : end + 1]
            try:
                return json.loads(snippet)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=502, detail="LLM response was not valid JSON.") from exc
