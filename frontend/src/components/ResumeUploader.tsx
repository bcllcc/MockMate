"use client";

import { useState, type ChangeEvent } from "react";

import { useLanguage } from "@/contexts/LanguageContext";
import { uploadResume, type ResumeParseResponse } from "@/lib/api";

interface ResumeUploaderProps {
  onUploadComplete: (payload: { data: ResumeParseResponse; filename: string }) => void;
  disabled?: boolean;
}

export function ResumeUploader({ onUploadComplete, disabled }: ResumeUploaderProps) {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      const data = await uploadResume(file);
      onUploadComplete({ data, filename: file.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{t("resumeStepTitles.upload")}</h2>
      <p className="mt-2 text-sm text-slate-600">{t("uploader.description")}</p>
      <label className="mt-4 flex w-full cursor-pointer items-center justify-center rounded-md border border-dashed border-primary-300 bg-primary-50 px-4 py-6 text-center text-sm font-medium text-primary-700 hover:border-primary-500 hover:text-primary-800">
        <input
          type="file"
          accept=".pdf,.docx,.txt,.doc"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled || isUploading}
        />
        {isUploading ? t("uploader.buttonUploading") : t("uploader.buttonIdle")}
      </label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
