"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  FileText,
  File,
  Calendar,
  Loader2,
  Upload,
  Edit3,
  CheckCircle2,
  Download,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Briefcase,
  Trash2,
  RefreshCw
} from "lucide-react";
import { pageFrameWidthClass } from "@/components/page-frame";
import { documentDisplayTitle } from "@/lib/document-title.mjs";
import { createLatestRequest } from "@/lib/latest-request.mjs";

type RoleItem = {
  n?: string;
  company?: string;
  role?: string;
  status?: string;
  score?: string;
  date?: string;
  url?: string;
  report?: string;
};

type DocumentItem = {
  id: string;
  filename: string;
  kind: "cv" | "cover" | "original_cv" | "unknown";
  company?: string;
  role?: string;
  title?: string;
  date: string | null;
  reportId: string | null;
  format: string | null;
  mtimeMs: number;
  score?: string | null;
  status?: string | null;
  url?: string | null;
  isOriginal?: boolean;
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/cv/master-resume", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload master resume");
      }
      setUploadSuccess(data.message || `Successfully uploaded "${file.name}"! Original PDF preserved and facts updated.`);
      refetch();
      window.dispatchEvent(new CustomEvent("co-cv-saved"));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error uploading resume");
    } finally {
      setUploading(false);
      // Reset input value so same file can be selected again
      e.target.value = "";
    }
  };

  const handleRemoveMaster = async () => {
    if (!confirm("Are you sure you want to remove your master resume? This will delete the stored original PDF.")) return;
    setRemoving(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const res = await fetch("/api/cv/master-resume", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to remove master resume");
      setUploadSuccess("Master resume removed successfully.");
      refetch();
      window.dispatchEvent(new CustomEvent("co-cv-saved"));
    } catch (err: any) {
      setUploadError(err.message || "Failed to remove master resume");
    } finally {
      setRemoving(false);
    }
  };

  const requests = useRef(createLatestRequest());
  const refetch = useCallback(() => {
    const ticket = requests.current.start();
    fetch("/api/documents?includeRoles=true")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load documents");
        return res.json();
      })
      .then((data) => {
        if (!requests.current.isLatest(ticket)) return;
        if (Array.isArray(data)) {
          setDocuments(data);
          setRoles([]);
        } else if (data && Array.isArray(data.documents)) {
          setDocuments(data.documents);
          setRoles(data.roles || []);
        }
        setError(null);
      })
      .catch((err) => {
        if (!requests.current.isLatest(ticket)) return;
        setError(err.message || "Something went wrong");
      })
      .finally(() => {
        if (!requests.current.isLatest(ticket)) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const latest = requests.current;
    refetch();

    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };

    window.addEventListener("co-job-done", refetch);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("co-job-done", refetch);
      document.removeEventListener("visibilitychange", onVisible);
      latest.cancel();
    };
  }, [refetch]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 rounded-full bg-red-500/10 p-3 text-red-500">
          <File className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-medium text-foreground">Failed to load</h2>
        <p className="mt-1 text-sm text-muted">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  // Identify Original Master Resume
  const originalDoc = documents.find(
    (d) => d.isOriginal || d.kind === "original_cv" || d.filename.toLowerCase().includes("original") || d.filename.toLowerCase().includes("bhanuprasad")
  );

  // Filter role-specific tailored documents (excluding master resume)
  const roleDocs = documents.filter((d) => d.id !== originalDoc?.id && !d.isOriginal);

  return (
    <div className={`mx-auto space-y-8 px-6 py-8 ${pageFrameWidthClass.wide}`}>
      <div>
        <h1 className="font-display text-2xl tracking-tight text-landing">Documents & Resumes</h1>
        <p className="mt-1 text-sm text-muted">
          Your original master resume, job descriptions, and role-specific ATS PDF resumes.
        </p>
      </div>

      {/* ── Main Top Section: Master Original Resume (PDF Only) ── */}
      <Card className="overflow-hidden border border-brand/30 bg-gradient-to-br from-surface via-surface to-brand-soft/20 p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    Bhanuprasad L. — Master Resume
                  </h2>
                  <Badge tone="good" className="flex items-center gap-1 font-medium text-xs">
                    <CheckCircle2 className="h-3 w-3" /> Original PDF Preserved
                  </Badge>
                  <Badge tone="info" className="flex items-center gap-1 font-medium text-xs">
                    <Sparkles className="h-3 w-3" /> Jake&apos;s Template (Active)
                  </Badge>
                </div>
                <p className="text-xs text-muted">
                  Full-Stack Software Engineer · Bengaluru, India · 100% Ground Truth Facts
                </p>
              </div>
            </div>

            <p className="max-w-2xl text-sm leading-relaxed text-muted">
              Your master resume is permanently preserved in high-fidelity <strong>PDF format</strong>. For roles that match your core profile perfectly, this original PDF is submitted directly. When role-specific tailoring is required, the AI formats your real experience exclusively using <strong>Jake&apos;s ATS Resume Template</strong>, without ever modifying or fabricating your core facts.
            </p>

            <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
              <span className="inline-flex items-center gap-1 rounded bg-surface-hover px-2 py-0.5">
                <ShieldCheck className="size-3.5 text-emerald-500" /> Core details locked (no useless overwrites)
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-surface-hover px-2 py-0.5">
                📄 Format: Standard A4 / Letter PDF
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-surface-hover px-2 py-0.5">
                🎯 Template: Jake&apos;s Resume (Single System Standard)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {originalDoc ? (
              <>
                <Button
                  className="bg-brand text-white shadow-sm hover:bg-brand/90"
                  onClick={() => window.open(`/api/documents?id=${originalDoc.id}`, "_blank")}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Master PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = `/api/documents?id=${originalDoc.id}`;
                    a.download = originalDoc.filename || "Bhanuprasad_L_Resume.pdf";
                    a.click();
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    className="hidden"
                    disabled={uploading || removing}
                    onChange={handleUpload}
                  />
                  <Button variant="outline" className="cursor-pointer" disabled={uploading || removing}>
                    {uploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-brand" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {uploading ? "Updating…" : "Replace Master PDF"}
                  </Button>
                </label>
                <Button
                  variant="outline"
                  className="border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                  disabled={uploading || removing}
                  onClick={handleRemoveMaster}
                >
                  {removing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  {removing ? "Removing…" : "Remove Master Resume"}
                </Button>
              </>
            ) : (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  disabled={uploading}
                  onChange={handleUpload}
                />
                <Button className="bg-brand text-white shadow-sm hover:bg-brand/90 cursor-pointer" disabled={uploading}>
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {uploading ? "Uploading…" : "Upload Master PDF"}
                </Button>
              </label>
            )}
          </div>
        </div>

        {uploadSuccess && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
            <span>{uploadSuccess}</span>
          </div>
        )}
        {uploadError && (
          <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {uploadError}
          </div>
        )}
      </Card>

      {/* ── Below Section: Structured Rows for Each Role and Their Docs ── */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Role & Application Documents
            </h2>
            <p className="text-xs text-muted">
              Structured record of each target role, its job description, and the exact PDF resume used.
            </p>
          </div>
          <Link href="/pipeline">
            <Button variant="outline" size="sm" className="text-xs">
              <Briefcase className="mr-1.5 h-3.5 w-3.5" />
              Manage Roles in Pipeline
            </Button>
          </Link>
        </div>

        {roleDocs.length > 0 || roles.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border bg-surface/50 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-hover/50 text-xs font-medium text-muted">
                    <th className="px-4 py-3">Role & Company</th>
                    <th className="px-4 py-3">Job Description</th>
                    <th className="px-4 py-3">Resume / CV Document (PDF)</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {/* Render documents that have been generated */}
                  {roleDocs.map((doc) => {
                    const display = documentDisplayTitle(doc);
                    return (
                      <tr key={doc.id} className="transition-colors hover:bg-surface-hover/40">
                        {/* Role & Company */}
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-medium text-foreground">{doc.role || display.title}</div>
                          <div className="text-xs text-muted">{doc.company || "Direct Application"}</div>
                          {doc.score && (
                            <div className="mt-1">
                              <Badge tone="info" className="text-[10px] font-semibold">
                                Match: {doc.score}/5
                              </Badge>
                            </div>
                          )}
                        </td>

                        {/* Job Description */}
                        <td className="px-4 py-3.5 align-top">
                          {doc.url ? (
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                            >
                              <span>View Posting</span>
                              <ExternalLink className="size-3" />
                            </a>
                          ) : doc.reportId ? (
                            <span className="text-xs text-muted">Report #{doc.reportId}</span>
                          ) : (
                            <span className="text-xs text-faint">Saved in pipeline</span>
                          )}
                        </td>

                        {/* Resume / Document Used (PDF Only) */}
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-brand/10 text-brand">
                              <FileText className="size-3.5" />
                            </span>
                            <div>
                              <div className="text-xs font-medium text-foreground">
                                {doc.kind === "cv"
                                  ? "Tailored ATS CV (Jake Template)"
                                  : doc.kind === "cover"
                                  ? "Cover Letter (PDF)"
                                  : "Original Master Resume (PDF)"}
                              </div>
                              <div className="text-[11px] text-faint">{doc.filename}</div>
                            </div>
                          </div>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3.5 align-top text-xs text-muted">
                          {doc.date ? (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="size-3" />
                              {doc.date}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 align-top text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => window.open(`/api/documents?id=${doc.id}`, "_blank")}
                            >
                              <ExternalLink className="mr-1 size-3" />
                              Open PDF
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-muted hover:text-foreground"
                              onClick={() => {
                                const a = document.createElement("a");
                                a.href = `/api/documents?id=${doc.id}`;
                                a.download = doc.filename;
                                a.click();
                              }}
                            >
                              <Download className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Render tracked roles that use the master resume if no separate tailored doc exists */}
                  {roles
                    .filter((r) => !roleDocs.some((d) => d.reportId && r.report && r.report.includes(d.reportId)))
                    .map((role, idx) => (
                      <tr key={`role-${idx}`} className="transition-colors hover:bg-surface-hover/40">
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-medium text-foreground">{role.role}</div>
                          <div className="text-xs text-muted">{role.company}</div>
                          {role.status && (
                            <Badge tone="muted" className="mt-1 text-[10px]">
                              {role.status}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          {role.url ? (
                            <a
                              href={role.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                            >
                              <span>View JD</span>
                              <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted">Direct Job</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-emerald-600">
                              <CheckCircle2 className="size-3.5" />
                            </span>
                            <div>
                              <div className="text-xs font-medium text-foreground">
                                Original Master Resume (Jake Template)
                              </div>
                              <div className="text-[11px] text-faint">Full match ready</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 align-top text-xs text-muted">
                          {role.date || "Active"}
                        </td>
                        <td className="px-4 py-3.5 align-top text-right">
                          <div className="flex items-center justify-end gap-2">
                            {originalDoc && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => window.open(`/api/documents?id=${originalDoc.id}`, "_blank")}
                              >
                                View PDF
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 rounded-full bg-surface-hover p-3 text-muted">
              <Briefcase className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No role-specific tailored CVs yet</h3>
            <p className="mt-1 max-w-md text-xs text-muted">
              When you evaluate roles in Pipeline or Explore, the agent will automatically generate tailored ATS PDF resumes formatted with Jake&apos;s template, and pair them with the exact job description here.
            </p>
            <Link href="/pipeline" className="mt-4">
              <Button size="sm" className="bg-brand text-white hover:bg-brand/90">
                Go to Pipeline <ArrowRight className="ml-1.5 size-3.5" />
              </Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
