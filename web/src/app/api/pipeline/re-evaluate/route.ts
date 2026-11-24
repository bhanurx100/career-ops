import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJsonObject<{ url?: string; company?: string; role?: string; location?: string }>(req);
    if (!body || !body.url) {
      return NextResponse.json({ ok: false, error: "Posting URL is required" }, { status: 400 });
    }

    const root = careerOpsRoot();
    const pipelineFile = path.join(root, "data", "pipeline.md");

    let content = "";
    if (fs.existsSync(pipelineFile)) {
      content = fs.readFileSync(pipelineFile, "utf8");
    } else {
      content = "# Pipeline Inbox\n\nTotal pending: 0\n\n<!-- pipeline-entries-start -->\n<!-- pipeline-entries-end -->\n\n## Pending\n\n";
    }

    const cleanUrl = body.url.trim();
    // Check if URL is already present in pipeline
    if (!content.includes(cleanUrl)) {
      const company = (body.company || "Company").trim();
      const role = (body.role || "Role").trim();
      const location = (body.location || "Remote").trim();
      const today = new Date().toISOString().slice(0, 10);
      const newEntry = `- [ ] ${cleanUrl} | ${company} | ${role} | ${location} | posted: ${today} | yrs: none stated\n`;

      if (content.includes("## Pending")) {
        content = content.replace("## Pending\n", `## Pending\n\n${newEntry}`);
      } else {
        content += `\n## Pending\n\n${newEntry}`;
      }

      fs.writeFileSync(pipelineFile, content, "utf8");
    }

    return NextResponse.json({ ok: true, message: "Job pushed back to pipeline inbox successfully" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
