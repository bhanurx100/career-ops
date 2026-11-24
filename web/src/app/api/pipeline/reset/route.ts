import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const root = careerOpsRoot();
    const pipelineFile = path.join(root, "data", "pipeline.md");
    const historyFile = path.join(root, "data", "scan-history.tsv");

    // Backup
    if (fs.existsSync(pipelineFile)) {
      fs.copyFileSync(pipelineFile, pipelineFile + ".bak");
    }
    if (fs.existsSync(historyFile)) {
      fs.copyFileSync(historyFile, historyFile + ".bak");
    }

    // Reset pipeline.md
    fs.writeFileSync(
      pipelineFile,
      "# Job Pipeline Inbox\n\n<!-- New job discovery URLs are placed here. Marked [x] once processed. -->\n\n## Pending\n\n",
      "utf8"
    );

    // Reset scan-history.tsv
    const header = "url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\tfingerprint\tposted_at\ttrust_score\ttrust_flags\tnormalized_company\trequisition_id\tlanguage\tlisting_key\tcloses_at\temployment_type\n";
    fs.writeFileSync(historyFile, header, "utf8");

    return NextResponse.json({ ok: true, message: "Pipeline and scan history reset. Ready for clean scan." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
