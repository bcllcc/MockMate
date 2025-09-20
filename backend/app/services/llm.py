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
    _logger_configured: bool = False

    def __init__(self):
        if not LLMService._logger_configured:
            self._configure_logger()
            LLMService._logger_configured = True

        self._client = OpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url
        )
        self._model = "deepseek-chat"
        self._logger = logging.getLogger(__name__)

    def generate_questions(self, resume_text: str, target_role: str, language: str = "en") -> list:
        """生成面试问题列表"""
        prompt = f"""Based on the resume and target role, generate 5 interview questions.

Resume: {resume_text}
Target Role: {target_role}
Language: {language}

Return questions as JSON array of strings."""

        try:
            response = self._chat([{"role": "user", "content": prompt}])
            questions = self._parse_json(response)
            return questions if isinstance(questions, list) else [response]
        except Exception as e:
            self._logger.error(f"Failed to generate questions: {e}")
            return ["Tell me about yourself and your experience."]

    def generate_first_question(self, resume_text: str, target_role: str, language: str = "en") -> str:
        """生成第一个面试问题"""
        if language == "zh":
            prompt = f"""基于简历和目标职位，生成一个开场面试问题。

简历：{resume_text}
目标职位：{target_role}

请生成一个简洁、专业的开场问题，帮助面试官了解候选人的背景和经验。"""
        else:
            prompt = f"""Based on the resume and target role, generate an opening interview question.

Resume: {resume_text}
Target Role: {target_role}

Generate a concise, professional opening question that helps the interviewer understand the candidate's background and experience."""

        try:
            response = self._chat([{"role": "user", "content": prompt}])
            return response.strip()
        except Exception as e:
            self._logger.error(f"Failed to generate first question: {e}")
            if language == "zh":
                return "请简单介绍一下你自己以及你的相关工作经验。"
            else:
                return "Could you please introduce yourself and tell me about your relevant work experience?"

    def generate_follow_up_question(self, history: list, resume_text: str, target_role: str, language: str = "en") -> str:
        """基于对话历史生成后续问题"""
        conversation = "\n".join([f"{turn['role']}: {turn['content']}" for turn in history])
        
        if language == "zh":
            prompt = f"""基于以下面试对话历史、简历和目标职位，生成下一个合适的面试问题。

对话历史：
{conversation}

简历：{resume_text}
目标职位：{target_role}

请生成一个深入探讨的后续问题，基于候选人之前的回答。"""
        else:
            prompt = f"""Based on the interview conversation history, resume, and target role, generate the next appropriate interview question.

Conversation History:
{conversation}

Resume: {resume_text}
Target Role: {target_role}

Generate a follow-up question that digs deeper based on the candidate's previous answers."""

        try:
            response = self._chat([{"role": "user", "content": prompt}])
            return response.strip()
        except Exception as e:
            self._logger.error(f"Failed to generate follow-up question: {e}")
            if language == "zh":
                return "请详细说明一下您在这个项目中遇到的挑战以及如何解决的？"
            else:
                return "Can you elaborate on the challenges you faced in this project and how you overcame them?"

    def generate_feedback(self, answer_text: str, resume_text: str, target_role: str, language: str = "en") -> dict:
        """生成对单个回答的反馈"""
        if language == "zh":
            prompt = f"""基于候选人的回答、简历和目标职位，提供结构化的反馈。

候选人回答：{answer_text}
简历：{resume_text}
目标职位：{target_role}

请以JSON格式返回反馈，包含：
- summary: 总体评价
- strengths: 优点列表（数组）
- weaknesses: 需要改进的地方列表（数组）
- suggestions: 改进建议列表（数组）"""
        else:
            prompt = f"""Based on the candidate's answer, resume, and target role, provide structured feedback.

Candidate Answer: {answer_text}
Resume: {resume_text}
Target Role: {target_role}

Return feedback in JSON format with:
- summary: overall assessment
- strengths: list of strengths (array)
- weaknesses: list of areas for improvement (array)
- suggestions: list of improvement suggestions (array)"""

        try:
            response = self._chat([{"role": "user", "content": prompt}])
            feedback = self._parse_json(response)
            
            # 确保返回正确格式
            if isinstance(feedback, dict):
                return {
                    "summary": feedback.get("summary", ""),
                    "strengths": feedback.get("strengths", []),
                    "weaknesses": feedback.get("weaknesses", []),
                    "suggestions": feedback.get("suggestions", [])
                }
        except Exception as e:
            self._logger.error(f"Failed to generate feedback: {e}")

        # 默认反馈
        if language == "zh":
            return {
                "summary": "回答基本符合要求，展现了一定的专业能力。",
                "strengths": ["表达清晰", "逻辑结构合理"],
                "weaknesses": ["可以提供更多具体示例"],
                "suggestions": ["建议在回答中加入更多量化数据和具体成果"]
            }
        else:
            return {
                "summary": "The answer meets basic requirements and demonstrates professional competence.",
                "strengths": ["Clear expression", "Good logical structure"],
                "weaknesses": ["Could provide more specific examples"],
                "suggestions": ["Consider adding more quantified data and concrete achievements"]
            }

    def generate_final_feedback(self, history: list, resume_text: str, target_role: str, language: str = "en") -> dict:
        """生成最终面试评估"""
        conversation = "\n".join([f"{turn['role']}: {turn['content']}" for turn in history])
        
        if language == "zh":
            prompt = f"""基于完整的面试对话、简历和目标职位，提供最终的综合评估。

完整对话：
{conversation}

简历：{resume_text}
目标职位：{target_role}

请以JSON格式返回最终评估，包含：
- summary: 总体评价和建议
- strengths: 候选人优点列表（数组）
- weaknesses: 需要改进的地方列表（数组）
- suggestions: 后续发展建议列表（数组）
- overall_score: 整体评分（1-10）"""
        else:
            prompt = f"""Based on the complete interview conversation, resume, and target role, provide a final comprehensive assessment.

Complete Conversation:
{conversation}

Resume: {resume_text}
Target Role: {target_role}

Return final assessment in JSON format with:
- summary: overall evaluation and recommendation
- strengths: list of candidate strengths (array)
- weaknesses: list of areas for improvement (array)
- suggestions: list of development suggestions (array)
- overall_score: overall score (1-10)"""

        try:
            response = self._chat([{"role": "user", "content": prompt}])
            feedback = self._parse_json(response)
            
            if isinstance(feedback, dict):
                return {
                    "summary": feedback.get("summary", ""),
                    "strengths": feedback.get("strengths", []),
                    "weaknesses": feedback.get("weaknesses", []),
                    "suggestions": feedback.get("suggestions", []),
                    "overall_score": feedback.get("overall_score", 7)
                }
        except Exception as e:
            self._logger.error(f"Failed to generate final feedback: {e}")

        # 默认最终反馈
        if language == "zh":
            return {
                "summary": "候选人表现良好，基本符合职位要求，建议进入下一轮面试。",
                "strengths": ["专业技能扎实", "沟通表达清晰", "学习能力强"],
                "weaknesses": ["可以在某些技术细节上更深入", "实际项目经验可以更丰富"],
                "suggestions": ["继续加强技术深度", "多参与实际项目", "提高解决复杂问题的能力"],
                "overall_score": 7
            }
        else:
            return {
                "summary": "The candidate performed well and generally meets the position requirements. Recommend proceeding to the next round.",
                "strengths": ["Solid professional skills", "Clear communication", "Strong learning ability"],
                "weaknesses": ["Could be more in-depth on technical details", "Could have more hands-on project experience"],
                "suggestions": ["Continue strengthening technical depth", "Participate in more practical projects", "Improve complex problem-solving skills"],
                "overall_score": 7
            }

    def analyze_resume(self, resume_text: str, language: str = "en"):
        """分析简历内容"""
        if language == "zh":
            prompt = f"""分析以下简历内容，提取关键信息：

{resume_text}

请以JSON格式返回分析结果，包含：
- skills: 技能列表
- experience: 工作经验总结
- education: 教育背景
- summary: 简历总结"""
        else:
            prompt = f"""Analyze the following resume content and extract key information:

{resume_text}

Return analysis in JSON format with:
- skills: list of skills
- experience: work experience summary
- education: educational background
- summary: resume summary"""

        try:
            response = self._chat([{"role": "user", "content": prompt}])
            return self._parse_json(response)
        except Exception as e:
            self._logger.error(f"Failed to analyze resume: {e}")
            return {
                "skills": [],
                "experience": "Experience analysis not available",
                "education": "Education information not available", 
                "summary": "Resume analysis not available"
            }

    def _configure_logger(self):
        """配置日志记录器"""
        logger = logging.getLogger(__name__)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)

    def _log_event(self, event: str, details: dict = None):
        """记录事件日志"""
        log_data = {
            "event": event,
            "timestamp": datetime.now().isoformat(),
            "details": details or {}
        }
        self._logger.info(f"LLM Event: {json.dumps(log_data)}")

    def _chat(self, messages: list, **kwargs) -> str:
        """调用LLM进行对话"""
        try:
            self._log_event("chat_request", {
                "message_count": len(messages),
                "model": self._model
            })
            
            response = self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                temperature=0.7,
                max_tokens=2000,
                **kwargs
            )
            
            content = response.choices[0].message.content
            
            self._log_event("chat_response", {
                "response_length": len(content) if content else 0,
                "usage": response.usage.model_dump() if response.usage else None
            })
            
            return content or ""
            
        except Exception as e:
            self._log_event("chat_error", {"error": str(e)})
            raise

    def _parse_json(self, text: str):
        """解析JSON响应"""
        try:
            # 尝试直接解析
            return json.loads(text)
        except json.JSONDecodeError:
            # 尝试提取JSON部分
            import re
            json_match = re.search(r'\{.*\}', text, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except json.JSONDecodeError:
                    pass
            
            # 解析失败，返回原文本
            return text
