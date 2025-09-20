"use client";

import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/contexts/LanguageContext";
import { useUser } from "@/contexts/UserContext";
import {
  fetchHistory,
  fetchSessionDetail,
  type InterviewHistoryItem,
  type InterviewSessionDetail,
} from "@/lib/api";

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

export default function HistoryPage() {
  const { t, language } = useLanguage();
  const { userId } = useUser();

  const [items, setItems] = useState<InterviewHistoryItem[]>([]);
  const [sessionDetail, setSessionDetail] = useState<InterviewSessionDetail | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    async function loadHistory() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchHistory(userId);
        if (isActive) {
          setItems(data);
        }
      } catch (err) {
        if (isActive) {
          const message = err instanceof Error ? err.message : t("history.loadError");
          setError(message || t("history.loadError"));
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }
    loadHistory();
    return () => {
      isActive = false;
    };
  }, [userId, t]);

  const styleMap = useMemo(
    () => ({
      technical: t("styles.technical"),
      behavioral: t("styles.behavioral"),
      hr: t("styles.hr"),
      challenging: t("styles.challenging"),
    }),
    [t],
  );

  const handleViewDetails = async (sessionId: string) => {
    setLoadingDetail(true);
    setSelectedSession(sessionId);
    try {
      const detail = await fetchSessionDetail(sessionId);
      setSessionDetail(detail);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("history.loadError");
      setError(message || t("history.loadError"));
      setSessionDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCloseDetails = () => {
    setSelectedSession(null);
    setSessionDetail(null);
  };

  const locale = language === "zh" ? "zh-CN" : "en-US";
  const languageLabel = (code: string) => (code === "zh" ? t("nav.language.zh") : t("nav.language.en"));
  const styleLabel = (style: string) => styleMap[style as keyof typeof styleMap] ?? style;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{t("history.title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("history.subtitle")}</p>
      </div>

      {loading && <p className="text-sm text-slate-500">{t("history.loading")}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-slate-600">{t("history.empty")}</p>
      )}

      <div className="space-y-4">
        {items.map((item) => {
          const isSelected = selectedSession === item.session_id;
          const scoreLabel = item.overall_score != null ? `${t("history.scoreLabel")}: ${item.overall_score}` : undefined;
          return (
            <div key={item.session_id} className="rounded-lg border border-slate-200 bg-white px-6 py-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {t("history.startedAt")}: {formatDate(item.started_at, locale)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {t("history.completedAt")}: {formatDate(item.completed_at ?? null, locale)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {t("history.styleLabel")}: {styleLabel(item.interviewer_style)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {t("history.languageLabel")}: {languageLabel(item.language)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {t("home.configure.questionCountLabel")}: {item.question_count}
                  </p>
                  {scoreLabel && <p className="text-sm text-slate-500">{scoreLabel}</p>}
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  {item.summary && <p className="text-sm text-slate-600">{item.summary}</p>}
                  <button
                    type="button"
                    onClick={() => handleViewDetails(item.session_id)}
                    className="self-start rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 md:self-auto"
                  >
                    {loadingDetail && isSelected ? t("history.loading") : t("history.detailButton")}
                  </button>
                </div>
              </div>

              {isSelected && sessionDetail && sessionDetail.session_id === item.session_id && (
                <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                  <div className="flex flex-col gap-2 text-sm text-slate-600">
                    <p>
                      {t("history.startedAt")}: {formatDate(sessionDetail.started_at, locale)}
                    </p>
                    <p>
                      {t("history.completedAt")}: {formatDate(sessionDetail.completed_at ?? null, locale)}
                    </p>
                    <p>
                      {t("history.styleLabel")}: {styleLabel(sessionDetail.interviewer_style)}
                    </p>
                    <p>
                      {t("history.languageLabel")}: {languageLabel(sessionDetail.language)}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">{t("history.turnsTitle")}</h3>
                    {sessionDetail.turns.length === 0 ? (
                      <p className="text-sm text-slate-500">{t("history.noTurns")}</p>
                    ) : (
                      <ol className="mt-2 space-y-3 text-sm text-slate-600">
                        {sessionDetail.turns.map((turn, index) => (
                          <li key={index} className="rounded-md bg-slate-50 px-3 py-3">
                            <p className="font-medium text-slate-700">
                              Q{index + 1}: {turn.question}
                            </p>
                            <p className="mt-1">A: {turn.answer}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">{t("history.feedbackTitle")}</h3>
                    {sessionDetail.feedback ? (
                      <div className="mt-2 space-y-2 text-sm text-slate-600">
                        <p>
                          {t("history.scoreLabel")}: {sessionDetail.feedback.overall_score}
                        </p>
                        <p>
                          {t("history.summaryLabel")}: {sessionDetail.feedback.summary}
                        </p>
                        <div>
                          <p className="font-medium text-slate-700">{t("console.strengths")}</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            {sessionDetail.feedback.strengths.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-slate-700">{t("console.weaknesses")}</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            {sessionDetail.feedback.weaknesses.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-slate-700">{t("console.suggestions")}</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            {sessionDetail.feedback.suggestions.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">{t("history.noFeedback")}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseDetails}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {t("history.detailClose")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
