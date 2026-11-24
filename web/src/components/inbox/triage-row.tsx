"use client";

import Link from "next/link";
import { Bookmark, BookmarkCheck, Loader2, X, CirclePause, Sparkles, AlertTriangle, RotateCcw } from "lucide-react";
import type { InboxJob } from "@/lib/career-ops";
import type { AtsSource } from "@/lib/explore";
import { ATS_LABEL } from "@/lib/explore";
import { unscoredInboxHref } from "@/lib/posting-url.mjs";
import { Badge } from "@/components/ui/badge";
import { CompanyLogo } from "@/components/company-logo";
import { cn } from "@/lib/cn";
import { inboxScoreTarget } from "@/lib/inbox-score-target.mjs";

export type RowScore = {
  score: number | null;
  tone: "good" | "warn" | "bad" | "muted";
  jobId: string;
  running: boolean;
  error?: string | null;
  reportN?: number | null;
  needsReview?: boolean;
};

function agoLabel(age: number | null): string | null {
  if (age == null) return null;
  if (age <= 0) return "today";
  if (age === 1) return "yesterday";
  if (age < 7) return `${age}d ago`;
  if (age < 30) return `${Math.floor(age / 7)}w ago`;
  return `${Math.floor(age / 30)}mo ago`;
}

// One raw posting in the triage list. Shows ONLY cheap, free signals + an honest
// "not scored" (CRUDA) — never a fake match%. Once its shortlist eval finishes it
// flips to EVALUADA (a real A–F badge). Save→shortlist / Skip→hidden are free + undoable.
export function TriageRow({
  index,
  cursor,
  job,
  source,
  age,
  reason,
  scored,
  selected,
  shortlisted,
  onToggleSelect,
  onSave,
  onSkip,
  onEvaluate,
}: {
  index: number;
  cursor: boolean;
  job: InboxJob;
  source: AtsSource | null;
  age: number | null;
  reason?: string;
  scored?: RowScore;
  selected: boolean;
  shortlisted: boolean;
  onToggleSelect: () => void;
  onSave: () => void;
  onSkip: () => void;
  onEvaluate: () => void;
}) {
  const ago = agoLabel(age);
  const target = inboxScoreTarget(scored);
  const evaluated = target.evaluated;
  const postingHref = unscoredInboxHref(job.url, evaluated);
  const title = (
    <>
      <span className="font-medium text-foreground">{job.company}</span>
      <span className="text-muted"> · {job.role}</span>
    </>
  );

  return (
    <li
      data-triage-index={index}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 transition-colors sm:gap-3 sm:px-4",
        selected ? "bg-brand-soft/50" : "hover:bg-surface-hover",
        cursor && "ring-2 ring-inset ring-brand",
        evaluated && "opacity-95",
      )}
    >
      {/* multi-select — power-user batch to shortlist */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select ${job.company} ${job.role}`}
        className="size-4 shrink-0 accent-brand max-sm:min-h-[44px] max-sm:min-w-[24px]"
      />

      <CompanyLogo name={job.company} size={20} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {postingHref ? (
            <a href={postingHref} target="_blank" rel="noreferrer" className="hover:text-brand-text">
              {title}
            </a>
          ) : (
            title
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-faint">
          {job.location && <span className="truncate">{job.location}</span>}
          {source && <span className="rounded bg-surface-hover px-1 py-px font-medium text-muted">{ATS_LABEL[source]}</span>}
          {ago && <span>{ago}</span>}
          {reason ? <span className="text-muted">{reason}</span> : null}
          {!evaluated && <span className="italic text-muted">not scored</span>}
        </p>
      </div>

      {/* Scoring / Error / Evaluated / Action buttons */}
      {scored?.running ? (
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft/70 px-3 py-1 text-xs font-medium text-brand-text shadow-sm">
          <Loader2 className="size-3.5 animate-spin" />
          <span>Scoring…</span>
        </div>
      ) : scored?.error ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href={`/jobs/${scored.jobId}`}
            title={scored.error}
            className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
          >
            <AlertTriangle className="size-3.5" />
            <span className="max-w-[120px] truncate">{scored.error}</span>
          </Link>
          <button
            type="button"
            onClick={onEvaluate}
            title="Retry evaluation"
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted hover:border-brand/40 hover:text-brand-text"
          >
            Retry
          </button>
        </div>
      ) : scored?.needsReview ? (
        <div className="flex shrink-0 items-center gap-1">
          <Link href={`/jobs/${scored.jobId}`} className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-400">
            <CirclePause className="size-3.5" /> Needs review
          </Link>
          <button
            type="button"
            onClick={onSkip}
            title="Skip — hide from the inbox"
            aria-label={`Skip ${job.company} ${job.role}`}
            className="inline-flex items-center justify-center rounded-md p-1 text-faint transition-colors hover:bg-surface-hover hover:text-foreground max-sm:min-h-[44px] max-sm:min-w-[44px]"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : evaluated && target.href ? (
        <div className="flex shrink-0 items-center gap-2">
          <Link href={target.href} className="flex items-center gap-1.5 text-xs">
            {target.showScore ? (
              <Badge tone={scored!.tone}>{scored!.score}/5</Badge>
            ) : (
              <span className="text-brand-text font-medium">Report #{scored?.reportN ?? ""}</span>
            )}
          </Link>
          <button
            type="button"
            onClick={onEvaluate}
            title="Re-evaluate this role"
            className="inline-flex items-center justify-center p-1 rounded text-faint hover:text-brand-text hover:bg-surface-hover transition-colors"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onEvaluate}
            title="Evaluate this role"
            className="inline-flex items-center justify-center gap-1 rounded-md bg-brand/10 border border-brand/30 px-2.5 py-1 text-xs font-medium text-brand-text transition-colors hover:bg-brand hover:text-brand-foreground max-sm:min-h-[44px]"
          >
            <Sparkles className="size-3.5" />
            <span>Evaluate</span>
          </button>
          <button
            type="button"
            onClick={onSave}
            title={shortlisted ? "In your shortlist" : "Save to shortlist"}
            aria-pressed={shortlisted}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors max-sm:min-h-[44px] max-sm:min-w-[44px]",
              shortlisted ? "text-brand-text" : "text-muted hover:bg-surface-hover hover:text-brand-text",
            )}
          >
            {shortlisted ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
            <span className="max-sm:hidden">{shortlisted ? "Saved" : "Save"}</span>
          </button>
          <button
            type="button"
            onClick={onSkip}
            title="Remove from pipeline"
            aria-label={`Remove ${job.company} ${job.role} from pipeline`}
            className="inline-flex items-center justify-center rounded-md p-1 text-faint transition-colors hover:bg-red-500/10 hover:text-red-500 max-sm:min-h-[44px] max-sm:min-w-[44px]"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </li>
  );
}
