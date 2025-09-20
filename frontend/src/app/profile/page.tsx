"use client";

import { useEffect, useState } from "react";

import { useLanguage } from "@/contexts/LanguageContext";
import { useUser, type UserProfile } from "@/contexts/UserContext";

export default function ProfilePage() {
  const { t } = useLanguage();
  const { profile, updateProfile } = useUser();
  const [form, setForm] = useState<UserProfile>(profile);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(profile);
  }, [profile]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateProfile(form);
    setSaved(true);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{t("profile.title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("profile.subtitle")}</p>
      </div>
      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-lg border border-slate-200 bg-white px-6 py-6 shadow-sm"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="identifier">
              {t("profile.identifierLabel")}
            </label>
            <input
              id="identifier"
              name="identifier"
              value={form.identifier}
              onChange={handleChange}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
            <p className="mt-2 text-xs text-slate-500">{t("profile.help")}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="name">
              {t("profile.nameLabel")}
            </label>
            <input
              id="name"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="email">
              {t("profile.emailLabel")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="role">
              {t("profile.roleLabel")}
            </label>
            <input
              id="role"
              name="role"
              value={form.role}
              onChange={handleChange}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
          >
            {t("profile.saveButton")}
          </button>
          {saved && <span className="text-sm text-green-600">{t("profile.savedMessage")}</span>}
        </div>
      </form>
    </div>
  );
}
