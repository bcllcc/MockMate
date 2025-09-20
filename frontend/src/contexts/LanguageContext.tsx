"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { translations } from "@/lib/translations";

type Language = keyof typeof translations;

type TranslationVariables = Record<string, string | number>;

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, vars?: TranslationVariables) => string;
};

const STORAGE_KEY = "mockmate.language";

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? (localStorage.getItem(STORAGE_KEY) as Language | null) : null;
    if (stored && stored in translations) {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = useCallback((value: Language) => {
    setLanguageState(value);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, value);
    }
  }, []);

  const translate = useCallback(
    (key: string, vars?: TranslationVariables) => {
      const parts = key.split(".");
      let current: unknown = translations[language];
      for (const part of parts) {
        if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof current !== "string") {
        return key;
      }
      let phrase = current;
      if (vars) {
        for (const [placeholder, value] of Object.entries(vars)) {
          phrase = phrase.replace(new RegExp(`{{${placeholder}}}`, "g"), String(value));
        }
      }
      return phrase;
    },
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: translate,
    }),
    [language, setLanguage, translate],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
