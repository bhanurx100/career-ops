#!/usr/bin/env node
/**
 * reset-pipeline.mjs — Resets data/pipeline.md and data/scan-history.tsv
 * with automatic .bak backup, allowing clean rescanning with updated filters.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const pipelineFile = path.join(ROOT, 'data', 'pipeline.md');
const historyFile = path.join(ROOT, 'data', 'scan-history.tsv');

if (fs.existsSync(pipelineFile)) {
  fs.copyFileSync(pipelineFile, pipelineFile + '.bak');
}
if (fs.existsSync(historyFile)) {
  fs.copyFileSync(historyFile, historyFile + '.bak');
}

fs.writeFileSync(
  pipelineFile,
  '# Job Pipeline Inbox\n\n<!-- New job discovery URLs are placed here. Marked [x] once processed. -->\n\n## Pending\n\n',
  'utf8'
);

const header = 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\tfingerprint\tposted_at\ttrust_score\ttrust_flags\tnormalized_company\trequisition_id\tlanguage\tlisting_key\tcloses_at\temployment_type\n';
fs.writeFileSync(historyFile, header, 'utf8');

console.log('✅ Pipeline and scan history successfully reset. Backups saved (.bak).');
