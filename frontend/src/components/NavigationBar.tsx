"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLanguage } from "@/contexts/LanguageContext";

import { LanguageSwitcher } from "./LanguageSwitcher";

const links = [
  { href: "/", key: "nav.practice" },
  { href: "/profile", key: "nav.profile" },
  { href: "/history", key: "nav.history" },
];

export function NavigationBar() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-full flex-col gap-6 px-6 py-6 xl:px-12 2xl:px-24 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-baseline gap-4">
            <Link href="/" className="text-5xl font-bold text-slate-900">
              {t("nav.brand")}
            </Link>
            <h1 className="text-2xl font-medium text-slate-700">{t("home.heroTitle")}</h1>
          </div>
        </div>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-8">
          <nav className="flex gap-6 text-lg font-medium">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`transition-colors ${
                    isActive ? "text-slate-900" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {t(link.key)}
                </Link>
              );
            })}
          </nav>
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}

