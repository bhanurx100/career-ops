"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2, Sparkles } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";

export function ReEvaluateButton({
  url,
  company,
  role,
}: {
  url?: string;
  company: string;
  role: string;
}) {
  const router = useRouter();
  const { startJob } = useJobs();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!url) return null;

  async function handleReEvaluate() {
    setBusy(true);
    setMsg("");
    try {
      // 1. Ensure it exists in pipeline
      await fetch("/api/pipeline/re-evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, company, role }),
      });

      // 2. Launch live evaluate job
      startJob({
        title: `Re-evaluate · ${company}`,
        subtitle: role,
        kind: "evaluate",
        input: url ?? "",
        page: "/pipeline",
      });

      setMsg("Re-evaluation started!");
      setTimeout(() => {
        router.push("/pipeline");
        router.refresh();
      }, 1000);
    } catch {
      setMsg("Failed to start re-evaluation");
      setBusy(false);
    }
  }

  async function handlePushToPipeline() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/pipeline/re-evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, company, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg("Pushed to Pipeline!");
        setTimeout(() => {
          router.push("/pipeline");
          router.refresh();
        }, 800);
      } else {
        setMsg(data.error || "Failed");
        setBusy(false);
      }
    } catch {
      setMsg("Failed to push to pipeline");
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-1.5 print:hidden">
      <button
        type="button"
        disabled={busy}
        onClick={handleReEvaluate}
        title="Re-run AI evaluation for this role"
        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-xs font-medium text-brand-text transition-colors hover:bg-brand hover:text-brand-foreground disabled:opacity-50 max-sm:min-h-[44px]"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        <span>Re-evaluate</span>
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={handlePushToPipeline}
        title="Push this job back to Pipeline Inbox"
        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text disabled:opacity-50 max-sm:min-h-[44px]"
      >
        <RotateCcw className="size-3.5" />
        <span>Push to Pipeline</span>
      </button>

      {msg && <span className="text-xs text-brand-text font-medium ml-1">{msg}</span>}
    </div>
  );
}
