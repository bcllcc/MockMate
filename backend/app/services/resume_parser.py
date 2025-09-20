from __future__ import annotations

import io
import logging
import re
from typing import Dict, Iterable

import pdfplumber
from docx import Document

from app.schemas import ResumeParseResponse, ResumeSummary
from app.services.resume_analyzer import ResumeInsightAnalyzer


class ResumeParser:
    """Utility responsible for turning resume bytes into structured text."""

    SECTION_HINTS = {
        "summary": ["summary", "profile", "about"],
        "experience": ["experience", "employment", "work history", "professional experience"],
        "education": ["education", "academic"],
        "projects": ["project", "projects", "case"],
        "skills": ["skill", "skills", "technologies", "tech stack"],
        "certifications": ["certification", "certificate"],
        "awards": ["award", "honor"],
    }

    def __init__(self, analyzer: ResumeInsightAnalyzer | None = None) -> None:
        self._analyzer = analyzer
        self._logger = logging.getLogger("app.services.resume_parser")

    def parse(self, data: bytes, filename: str | None) -> ResumeParseResponse:
        raw_text = self._extract_text(data, filename)
        normalized = self._normalise_text(raw_text)
        sections = self._segment_sections(normalized)
        highlights = self._collect_highlights(sections.values())
        summary = self.build_summary_from_sections(normalized, sections)

        response = ResumeParseResponse(text=normalized, sections=sections, highlights=highlights, summary=summary)
        response.analysis_origin = "rules"

        if not self._analyzer:
            return response

        enriched = self._analyzer.enrich(text=normalized, fallback=response)
        # ensure text is preserved even if analyzer unexpectedly changes it
        enriched.text = normalized
        return enriched

    def build_summary_from_sections(self, text: str, sections: Dict[str, str]) -> ResumeSummary:
        headline = None
        summary_section = sections.get("summary")
        if summary_section:
            headline = summary_section.split(". ")[0][:120]

        skills = []
        skills_text = sections.get("skills")
        if skills_text:
            tokens = re.split(r"[,;\n]", skills_text)
            skills = [token.strip() for token in tokens if token.strip()]

        narrative_parts: list[str] = []
        for key in ("summary", "experience", "projects", "education"):
            value = sections.get(key)
            if not value:
                continue
            snippet = " ".join(value.split()[:60])
            if snippet:
                narrative_parts.append(f"{key.title()}: {snippet}")
        narrative = " \n".join(narrative_parts) if narrative_parts else text[:500]

        return ResumeSummary(headline=headline, summary=narrative.strip(), skills=skills[:20])

    def _extract_text(self, data: bytes, filename: str | None) -> str:
        suffix = (filename or "").lower()
        if suffix.endswith(".pdf"):
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                pages = [page.extract_text() or "" for page in pdf.pages]
            return "\n".join(pages)
        if suffix.endswith(".docx"):
            document = Document(io.BytesIO(data))
            return "\n".join(paragraph.text for paragraph in document.paragraphs)
        if suffix.endswith(".txt"):
            return data.decode("utf-8", errors="ignore")
        # fallback: try to decode as utf-8
        return data.decode("utf-8", errors="ignore")

    def _normalise_text(self, text: str) -> str:
        cleaned = text.replace("\r", "\n")
        cleaned = re.sub(r"\n{2,}", "\n\n", cleaned)
        cleaned = re.sub(r"\s{2,}", " ", cleaned)
        return cleaned.strip()

    def _segment_sections(self, text: str) -> Dict[str, str]:
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        sections: Dict[str, list[str]] = {key: [] for key in self.SECTION_HINTS}
        current_key = "summary"
        for line in lines:
            lowered = line.lower()
            matched_section = None
            for key, hints in self.SECTION_HINTS.items():
                if any(lowered.startswith(hint) or f" {hint}" in lowered for hint in hints):
                    matched_section = key
                    break
            if matched_section:
                current_key = matched_section
                continue
            sections.setdefault(current_key, []).append(line)
        return {key: "\n".join(values).strip() for key, values in sections.items() if values}

    def _collect_highlights(self, sections: Iterable[str]) -> list[str]:
        bullets: list[str] = []
        bullet_prefixes = ("- ", "* ", "\u2022", "\u2022 ")
        for section in sections:
            for line in section.splitlines():
                stripped = line.strip()
                if any(stripped.startswith(prefix) for prefix in bullet_prefixes):
                    cleaned = stripped.lstrip("-* ").lstrip("\u2022").strip()
                    bullets.append(cleaned)
        if not bullets:
            for section in sections:
                sentences = re.split(r"(?<=[.!?])\s+", section)
                bullets.extend(sentences[:2])
        return bullets[:5]
