import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import "../helpers/web-ts-alias-loader.mjs";

test("API: Master Resume lifecycle (GET, POST, DELETE)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "master-resume-test-"));
  process.env.CAREER_OPS_ROOT = root;

  const docDir = path.join(root, "documents");
  const outDir = path.join(root, "output");
  fs.mkdirSync(docDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const { GET, POST, DELETE } = await import("../../src/app/api/cv/master-resume/route.ts");

    // 1. Initial state: No master resume
    const initialRes = await GET();
    assert.equal(initialRes.status, 200);
    const initialData = await initialRes.json();
    assert.equal(initialData.exists, false);

    // 2. Upload / Add Master Resume via POST
    const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]); // %PDF-1.5
    const blob = new Blob([fakePdfBytes], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", blob, "my_resume.pdf");

    const postReq = new Request("http://localhost:3000/api/cv/master-resume", {
      method: "POST",
      body: formData,
    });

    const postRes = await POST(postReq);
    assert.equal(postRes.status, 200);
    const postData = await postRes.json();
    assert.equal(postData.ok, true);

    // Verify files were created on disk
    assert.ok(fs.existsSync(path.join(docDir, "Bhanuprasad_L_Resume.pdf")));
    assert.ok(fs.existsSync(path.join(outDir, "Bhanuprasad_L_Original_Resume.pdf")));

    // 3. GET should now report exists: true
    const checkRes = await GET();
    assert.equal(checkRes.status, 200);
    const checkData = await checkRes.json();
    assert.equal(checkData.exists, true);
    assert.equal(checkData.template, "jake");

    // 4. DELETE should remove master resume
    const delRes = await DELETE();
    assert.equal(delRes.status, 200);
    const delData = await delRes.json();
    assert.equal(delData.ok, true);

    // Verify files were removed
    assert.equal(fs.existsSync(path.join(docDir, "Bhanuprasad_L_Resume.pdf")), false);
    assert.equal(fs.existsSync(path.join(outDir, "Bhanuprasad_L_Original_Resume.pdf")), false);

    // 5. GET should now report exists: false again
    const finalRes = await GET();
    assert.equal(finalRes.status, 200);
    const finalData = await finalRes.json();
    assert.equal(finalData.exists, false);
  } finally {
    delete process.env.CAREER_OPS_ROOT;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
