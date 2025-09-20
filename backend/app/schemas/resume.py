from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel


class ResumeSummary(BaseModel):
    headline: Optional[str] = None
    summary: str
    skills: List[str]
    insights: Optional[List[str]] = None
    skills_by_category: Optional[Dict[str, List[str]]] = None
    confidence: Optional[float] = None


class ResumeParseResponse(BaseModel):
    text: str
    sections: Dict[str, str]
    highlights: List[str]
    summary: ResumeSummary
    analysis_origin: Optional[str] = None
