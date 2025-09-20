from __future__ import annotations

import hashlib
import logging
from collections import OrderedDict
from typing import Any, Dict, List

from fastapi import HTTPException

from app.schemas import LanguageCode, ResumeParseResponse, ResumeSummary
from app.services.llm import LLMService


class ResumeInsightAnalyzer:
    """Uses the LLM service to build structured resume insights."""

    def __init__(self, llm_service: LLMService, *, cache_size: int = 64, max_chars: int = 12000) -> None:
        self._llm = llm_service
        self._cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._cache_size = cache_size
        self._max_chars = max_chars
        self._logger = logging.getLogger("app.services.resume_analyzer")

    def enrich(
        self,
        *,
        text: str,
        fallback: ResumeParseResponse,
        language_hint: LanguageCode | None = None,
    ) -> ResumeParseResponse:
        language = language_hint or self._detect_language(text)
        try:
            analysis = self._get_analysis(text, language)
        except HTTPException:
            # propagate HTTPExceptions raised by the LLM service as a graceful fallback
            self._logger.warning("resume_analysis_http_error", exc_info=True)
            result = fallback.copy(deep=True)
            result.analysis_origin = result.analysis_origin or "rules"
            return result
        except Exception:
            self._logger.exception("resume_analysis_unexpected_error")
            result = fallback.copy(deep=True)
            result.analysis_origin = result.analysis_origin or "rules"
            return result

        return self._merge_results(fallback, analysis)

    # Internal helpers -----------------------------------------------------
    def _get_analysis(self, text: str, language: LanguageCode) -> Dict[str, Any]:
        cache_key = hashlib.sha256(text.encode("utf-8")).hexdigest()
        cached = self._cache.get(cache_key)
        if cached is not None:
            self._cache.move_to_end(cache_key)
            return cached

        truncated = text[: self._max_chars]
        analysis = self._llm.analyze_resume(truncated, language)
        if not isinstance(analysis, dict):
            raise HTTPException(status_code=502, detail="LLM analysis payload malformed.")

        self._cache[cache_key] = analysis
        if len(self._cache) > self._cache_size:
            self._cache.popitem(last=False)
        return analysis

    def _merge_results(self, fallback: ResumeParseResponse, analysis: Dict[str, Any]) -> ResumeParseResponse:
        result = fallback.copy(deep=True)
        summary_payload = self._coerce_dict(analysis.get("summary"))

        headline = self._coerce_str(summary_payload.get("headline") if summary_payload else None) or \
            self._coerce_str(analysis.get("headline"))
        overview = self._coerce_str(
            summary_payload.get("overview") if summary_payload else None
        ) or self._coerce_str(summary_payload.get("summary") if summary_payload else None)

        insights = self._coerce_str_list(summary_payload.get("insights") if summary_payload else None, limit=10)
        confidence = summary_payload.get("confidence") if summary_payload else None
        skills_by_category = self._normalise_mapping(
            summary_payload.get("skills_by_category") if summary_payload else None
        )

        skills = self._coerce_str_list(analysis.get("skills"), limit=40)
        if not skills:
            skills = self._coerce_str_list(summary_payload.get("skills") if summary_payload else None, limit=40)
        if not skills:
            skills = list(dict.fromkeys(result.summary.skills))

        highlights = self._coerce_str_list(analysis.get("highlights"), limit=10)
        if not highlights:
            highlights = list(dict.fromkeys(result.highlights))

        sections_payload = analysis.get("sections")
        sections = self._extract_sections(sections_payload)
        if sections:
            result.sections = sections

        result.highlights = highlights

        summary_data = result.summary.dict()
        if headline:
            summary_data["headline"] = headline
        if overview:
            summary_data["summary"] = overview
        summary_data["skills"] = skills
        if insights:
            summary_data["insights"] = insights
        if skills_by_category:
            summary_data["skills_by_category"] = skills_by_category
        if isinstance(confidence, (int, float)):
            summary_data["confidence"] = float(confidence)

        result.summary = ResumeSummary(**summary_data)
        result.analysis_origin = "llm"
        return result

    def _extract_sections(self, payload: Any) -> Dict[str, str]:
        if isinstance(payload, dict):
            return {
                key.strip(): self._coerce_str(value) or ""
                for key, value in payload.items()
                if isinstance(key, str) and self._coerce_str(value)
            }
        if isinstance(payload, list):
            sections: Dict[str, str] = {}
            for item in payload:
                data = self._coerce_dict(item)
                if not data:
                    continue
                title = self._coerce_str(data.get("title") or data.get("name"))
                if not title:
                    continue
                summary = self._coerce_str(data.get("summary") or data.get("content"))
                bullets = self._coerce_str_list(data.get("highlights"), limit=6)
                combined_parts = [part for part in [summary] if part]
                if bullets:
                    combined_parts.append("\n".join(f"- {bullet}" for bullet in bullets))
                if not combined_parts:
                    continue
                sections[title.upper()] = "\n\n".join(combined_parts)
            return sections
        return {}

    def _coerce_dict(self, value: Any) -> Dict[str, Any] | None:
        if isinstance(value, dict):
            return value
        return None

    def _coerce_str(self, value: Any) -> str | None:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return None

    def _coerce_str_list(self, value: Any, *, limit: int | None = None) -> List[str]:
        items: List[str] = []
        if isinstance(value, list):
            for raw in value:
                text = self._coerce_str(raw)
                if text and text not in items:
                    items.append(text)
        elif isinstance(value, str):
            items = [value.strip()] if value.strip() else []
        if limit is not None:
            return items[:limit]
        return items

    def _normalise_mapping(self, value: Any) -> Dict[str, List[str]] | None:
        if not isinstance(value, dict):
            return None
        normalised: Dict[str, List[str]] = {}
        for key, raw_values in value.items():
            if not isinstance(key, str):
                continue
            key_clean = key.strip()
            if not key_clean:
                continue
            values = self._coerce_str_list(raw_values, limit=20)
            if values:
                normalised[key_clean] = values
        return normalised or None

    def _detect_language(self, text: str) -> LanguageCode:
        han = sum(1 for char in text if "\u4e00" <= char <= "\u9fff")
        ratio = han / max(len(text), 1)
        return "zh" if ratio > 0.05 else "en"


__all__ = ["ResumeInsightAnalyzer"]
