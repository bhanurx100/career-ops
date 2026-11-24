import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { atomicWriteWithBackup } from "@/lib/core/safe-write";
import { pdfText } from "@/lib/cv/pdf-text.mjs";
import { encodeId } from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getMasterPaths() {
  const root = careerOpsRoot();
  const docDir = path.join(root, "documents");
  const outDir = path.join(root, "output");
  const cvPath = path.join(root, "cv.md");

  const candidates = [
    path.join(outDir, "Bhanuprasad_L_Original_Resume.pdf"),
    path.join(docDir, "Bhanuprasad_L_Resume.pdf"),
  ];

  return { root, docDir, outDir, cvPath, candidates };
}

export async function GET() {
  try {
    const { candidates, outDir, cvPath } = getMasterPaths();
    let foundPath: string | null = null;
    let filename = "";

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        foundPath = p;
        filename = path.basename(p);
        break;
      }
    }

    if (!foundPath && fs.existsSync(outDir)) {
      const files = fs.readdirSync(outDir);
      const match = files.find((f) => f.toLowerCase().includes("original") || f.toLowerCase().includes("bhanuprasad"));
      if (match) {
        foundPath = path.join(outDir, match);
        filename = match;
      }
    }

    if (!foundPath) {
      return Response.json({
        exists: false,
        filename: null,
        message: "No master resume uploaded yet.",
      });
    }

    const stat = fs.statSync(foundPath);
    const hasCvMd = fs.existsSync(cvPath);

    return Response.json({
      exists: true,
      filename,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      docId: encodeId(filename),
      hasCvMd,
      template: "jake",
    });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Failed to inspect master resume" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const ctype = req.headers.get("content-type") || "";
    if (!ctype.includes("multipart/form-data")) {
      return Response.json(
        { error: "Expected multipart/form-data with file" },
        { status: 400 }
      );
    }

    const { docDir, outDir, cvPath } = getMasterPaths();
    fs.mkdirSync(docDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (buffer.length === 0) {
      return Response.json({ error: "File is empty" }, { status: 400 });
    }

    const isPdf = /\.pdf$/i.test(file.name);
    let extractedText = "";

    if (isPdf) {
      // 1. Persist master PDF copies directly in both documents/ and output/
      const primaryDocPath = path.join(docDir, "Bhanuprasad_L_Resume.pdf");
      const primaryOutPath = path.join(outDir, "Bhanuprasad_L_Original_Resume.pdf");
      fs.writeFileSync(primaryDocPath, buffer);
      fs.writeFileSync(primaryOutPath, buffer);

      // Also copy with original name if distinct
      const safeOrigName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      if (safeOrigName !== "Bhanuprasad_L_Resume.pdf" && safeOrigName !== "Bhanuprasad_L_Original_Resume.pdf") {
        fs.writeFileSync(path.join(docDir, safeOrigName), buffer);
      }

      // 2. Extract text locally (fast, under 1s)
      try {
        extractedText = await pdfText(bytes);
      } catch (e: any) {
        console.warn("Could not extract text from PDF:", e?.message);
      }
    } else {
      // Markdown or text file
      extractedText = new TextDecoder("utf-8").decode(bytes);
    }

    // 3. If extracted text is readable, update cv.md with backup
    if (extractedText.trim()) {
      try {
        // If extracted text doesn't look like markdown, preserve its lines
        const finalMarkdown = extractedText.startsWith("#")
          ? extractedText
          : `# CV -- Bhanuprasad L.\n\n${extractedText.trim()}`;

        atomicWriteWithBackup(cvPath, finalMarkdown);
      } catch (err: any) {
        console.warn("Failed to backup/write cv.md:", err?.message);
      }
    }

    return Response.json({
      ok: true,
      filename: isPdf ? "Bhanuprasad_L_Resume.pdf" : file.name,
      size: buffer.length,
      isPdf,
      extractedChars: extractedText.length,
      message: "Master resume successfully updated. Original PDF preserved without alteration.",
    });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Failed to upload master resume" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const { candidates, outDir, docDir } = getMasterPaths();
    let removedCount = 0;

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          removedCount++;
        } catch {}
      }
    }

    // Also remove any Bhanuprasad or original files in output or documents
    for (const dir of [outDir, docDir]) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          if (f.toLowerCase().includes("bhanuprasad") || f.toLowerCase().includes("original_resume")) {
            try {
              fs.unlinkSync(path.join(dir, f));
              removedCount++;
            } catch {}
          }
        }
      }
    }

    return Response.json({
      ok: true,
      removedCount,
      message: "Master resume removed successfully.",
    });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Failed to remove master resume" },
      { status: 500 }
    );
  }
}
