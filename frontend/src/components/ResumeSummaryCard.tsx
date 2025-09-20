"use client";

import type { ReactNode } from "react";

import { useLanguage } from "@/contexts/LanguageContext";
import type { ResumeParseResponse } from "@/lib/api";

interface ResumeSummaryCardProps {
  resume: ResumeParseResponse | null;
  filename?: string;
}

type InsightVariant = "highlights" | "skills" | "sections";

type SkillBadge = {
  label: string;
  category?: string;
};

type FormatCount = (count: number) => string;

type InsightStyle = {
  border: string;
  background: string;
  icon: string;
};

const MAX_HIGHLIGHTS = 5;
const MAX_SKILLS = 18;
const BULLET = String.fromCharCode(0x2022);

const glyph = (codePoint: number) => String.fromCodePoint(codePoint);

const ICONS: Record<InsightVariant, ReactNode> = {
  highlights: <span className="text-xl leading-none">{glyph(0x2728)}</span>,
  skills: <span className="text-xl leading-none">{glyph(0x1F4BC)}</span>,
  sections: <span className="text-xl leading-none">{glyph(0x1F4DA)}</span>,
};

const VARIANT_STYLES: Record<InsightVariant, InsightStyle> = {
  highlights: {
    border: "border-amber-100",
    background: "from-amber-50/80 via-orange-50/40 to-white",
    icon: "bg-amber-100 text-amber-600",
  },
  skills: {
    border: "border-blue-100",
    background: "from-blue-50/80 via-indigo-50/40 to-white",
    icon: "bg-blue-100 text-blue-600",
  },
  sections: {
    border: "border-violet-100",
    background: "from-violet-50/80 via-purple-50/40 to-white",
    icon: "bg-violet-100 text-violet-600",
  },
};

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function InsightCard({
  icon,
  iconLabel,
  title,
  description,
  variant,
  children,
  className,
}: {
  icon: ReactNode;
  iconLabel: string;
  title: string;
  description: string;
  variant: InsightVariant;
  children: ReactNode;
  className?: string;
}) {
  const styles = VARIANT_STYLES[variant];

  return (
    <article
      className={classNames(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        styles.border,
        className,
      )}
    >
      <div
        className={classNames(
          "pointer-events-none absolute inset-0 bg-gradient-to-br",
          styles.background,
        )}
        aria-hidden="true"
      />
      <div className="relative flex items-start gap-3">
        <span className="sr-only">{iconLabel}</span>
        <div
          aria-hidden="true"
          className={classNames(
            "flex h-11 w-11 items-center justify-center rounded-full border border-white/60 text-lg",
            styles.icon,
          )}
        >
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500/80">
            {description}
          </p>
        </div>
      </div>
      <div className="relative mt-4 flex-1 min-h-0">{children}</div>
    </article>
  );
}

function HighlightsCard({
  highlights,
  title,
  description,
  emptyLabel,
  iconLabel,
  className,
  formatMoreLabel,
}: {
  highlights: string[];
  title: string;
  description: string;
  emptyLabel: string;
  iconLabel: string;
  className?: string;
  formatMoreLabel: FormatCount;
}) {
  const visibleHighlights = highlights.slice(0, MAX_HIGHLIGHTS);
  const hiddenCount = Math.max(highlights.length - visibleHighlights.length, 0);

  return (
    <InsightCard
      className={className}
      icon={ICONS.highlights}
      iconLabel={iconLabel}
      title={title}
      description={description}
      variant="highlights"
    >
      {visibleHighlights.length > 0 ? (
        <div className="flex h-full flex-col">
          <ul className="max-h-56 space-y-3 overflow-y-auto pr-1 text-sm leading-relaxed text-slate-700">
            {visibleHighlights.map((item, index) => (
              <li
                key={`${item}-${index}`}
                className="flex gap-2 rounded-lg bg-white/80 p-3 shadow-inner ring-1 ring-inset ring-amber-100/80"
              >
                <span aria-hidden="true" className="mt-1 text-base text-amber-500">
                  {BULLET}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-600">
              {formatMoreLabel(hiddenCount)}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-slate-500">{emptyLabel}</p>
      )}
    </InsightCard>
  );
}

function SkillsCard({
  skills,
  title,
  description,
  emptyLabel,
  iconLabel,
  tooltipLabel,
  className,
  formatMoreLabel,
}: {
  skills: SkillBadge[];
  title: string;
  description: string;
  emptyLabel: string;
  iconLabel: string;
  tooltipLabel: string;
  className?: string;
  formatMoreLabel: FormatCount;
}) {
  const visibleSkills = skills.slice(0, MAX_SKILLS);
  const hiddenCount = Math.max(skills.length - visibleSkills.length, 0);

  return (
    <InsightCard
      className={className}
      icon={ICONS.skills}
      iconLabel={iconLabel}
      title={title}
      description={description}
      variant="skills"
    >
      {visibleSkills.length > 0 ? (
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap gap-2">
            {visibleSkills.map((skill) => {
              const tooltipValue = tooltipLabel.replace(
                "{{skill}}",
                skill.category ? `${skill.label} (${skill.category})` : skill.label,
              );
              return (
                <span
                  key={`${skill.category ?? "general"}:${skill.label}`}
                  title={tooltipValue}
                  className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-blue-200 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-blue-700"
                >
                  <span>{skill.label}</span>
                  {skill.category && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-blue-500">
                      {skill.category}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-600">
              {formatMoreLabel(hiddenCount)}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-slate-500">{emptyLabel}</p>
      )}
    </InsightCard>
  );
}

function SectionsCard({
  sections,
  title,
  description,
  emptyLabel,
  iconLabel,
  className,
  formatMoreLabel,
}: {
  sections: Array<[string, string]>;
  title: string;
  description: string;
  emptyLabel: string;
  iconLabel: string;
  className?: string;
  formatMoreLabel: FormatCount;
}) {
  const visibleSections = sections.slice(0, 3);
  const hiddenCount = Math.max(sections.length - visibleSections.length, 0);

  return (
    <InsightCard
      className={className}
      icon={ICONS.sections}
      iconLabel={iconLabel}
      title={title}
      description={description}
      variant="sections"
    >
      {visibleSections.length > 0 ? (
        <div className="flex h-full flex-col">
          <div className="space-y-3">
            {visibleSections.map(([sectionTitle, content]) => (
              <article
                key={sectionTitle}
                className="rounded-lg bg-white/85 p-3 shadow-inner ring-1 ring-inset ring-violet-100/80"
              >
                <h4 className="text-xs font-bold uppercase tracking-wide text-violet-600">
                  {sectionTitle}
                </h4>
                <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {content}
                </p>
              </article>
            ))}
          </div>
          {hiddenCount > 0 && (
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-violet-600">
              {formatMoreLabel(hiddenCount)}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-slate-500">{emptyLabel}</p>
      )}
    </InsightCard>
  );
}

export function ResumeSummaryCard({ resume, filename }: ResumeSummaryCardProps) {
  const { t } = useLanguage();

  if (!resume) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-3xl">
          {glyph(0x1F4C4)}
        </div>
        <h2 className="mt-5 text-xl font-semibold text-slate-900">{t("summary.emptyStateTitle")}</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">{t("summary.emptyStateDescription")}</p>
      </div>
    );
  }

  const summaryInsights = Array.isArray(resume.summary.insights) ? resume.summary.insights : [];
  const highlightSource = [...summaryInsights, ...resume.highlights];
  const combinedHighlights: string[] = [];
  const highlightSeen = new Set<string>();
  for (const item of highlightSource) {
    if (typeof item !== "string") {
      continue;
    }
    const candidate = item.trim();
    if (!candidate) {
      continue;
    }
    const key = candidate.toLowerCase();
    if (highlightSeen.has(key)) {
      continue;
    }
    highlightSeen.add(key);
    combinedHighlights.push(candidate);
  }

  const skillsByCategory = resume.summary.skills_by_category ?? null;
  const rawSkillBadges: SkillBadge[] = skillsByCategory
    ? Object.entries(skillsByCategory).flatMap(([category, items]) =>
        items
          .filter((item): item is string => typeof item === "string")
          .map((item) => ({ label: item.trim(), category: category.trim() || undefined })),
      )
    : resume.summary.skills.map((skill) => ({ label: skill, category: undefined }));
  const skillBadges: SkillBadge[] = [];
  const skillSeen = new Set<string>();
  for (const badge of rawSkillBadges) {
    const label = badge.label?.trim();
    if (!label) {
      continue;
    }
    const category = badge.category?.trim();
    const key = `${(category ?? "general").toLowerCase()}::${label.toLowerCase()}`;
    if (skillSeen.has(key)) {
      continue;
    }
    skillSeen.add(key);
    skillBadges.push({ label, category: category || undefined });
  }
  const sectionEntries = Object.entries(resume.sections ?? {});
  const uploadedLabel = filename ? t("summary.uploadedLabel", { filename }) : null;

  const formatHighlightsMore = (count: number) => t("summary.cards.highlights.more", { count });
  const formatSkillsMore = (count: number) => t("summary.cards.skills.more", { count });
  const formatSectionsMore = (count: number) => t("summary.cards.sections.more", { count });

  return (
    <section className="flex max-h-[72vh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 p-6 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-2xl">
            {glyph(0x1F4C4)}
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{t("resumeStepTitles.insights")}</h2>
            {uploadedLabel && <p className="mt-1 text-sm text-slate-600">{uploadedLabel}</p>}
          </div>
        </div>
        {resume.summary.headline && (
          <span className="inline-flex max-w-xs items-center truncate rounded-full bg-primary-100 px-4 py-1 text-xs font-semibold text-primary-700 shadow-sm">
            {resume.summary.headline}
          </span>
        )}
      </header>
      <p className="mt-4 text-sm leading-relaxed text-slate-600">{t("summary.overviewDescription")}</p>
      <div className="mt-6 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <HighlightsCard
            className="sm:col-span-2"
            highlights={combinedHighlights}
            title={t("summary.cards.highlights.title")}
            description={t("summary.cards.highlights.description")}
            emptyLabel={t("summary.cards.highlights.empty")}
            iconLabel={t("summary.cards.highlights.iconLabel")}
            formatMoreLabel={formatHighlightsMore}
          />
          <SkillsCard
            skills={skillBadges}
            title={t("summary.cards.skills.title")}
            description={t("summary.cards.skills.description")}
            emptyLabel={t("summary.cards.skills.empty")}
            iconLabel={t("summary.cards.skills.iconLabel")}
            tooltipLabel={t("summary.cards.skills.tooltip")}
            className="sm:col-span-1"
            formatMoreLabel={formatSkillsMore}
          />
          <SectionsCard
            sections={sectionEntries}
            title={t("summary.cards.sections.title")}
            description={t("summary.cards.sections.description")}
            emptyLabel={t("summary.cards.sections.empty")}
            iconLabel={t("summary.cards.sections.iconLabel")}
            className="sm:col-span-2 lg:col-span-3"
            formatMoreLabel={formatSectionsMore}
          />
        </div>
      </div>
    </section>
  );
}





