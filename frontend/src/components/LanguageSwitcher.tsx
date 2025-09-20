"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div className="flex items-center gap-1" aria-label={t("nav.language.toggle")}>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={`rounded-md px-3 py-2 text-base font-medium transition-colors ${
          language === "en" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        {t("nav.language.en")}
      </button>
      <button
        type="button"
        onClick={() => setLanguage("zh")}
        className={`rounded-md px-3 py-2 text-base font-medium transition-colors ${
          language === "zh" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        {t("nav.language.zh")}
      </button>
    </div>
  );
}
