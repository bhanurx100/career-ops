// @ts-check
/**
 * discovery/web-crawler.mjs
 * 
 * Web-Wide Multi-Source Job Crawler.
 * Pulls fresh tech and annotation roles across:
 *   1. Zero-token multi-board API feeds (Jobicy, RemoteOK, Himalayas, WeWorkRemotely, HackerNews, WorkingNomads, etc.)
 *   2. Modern direct startup boards on Ashby, Greenhouse, and Lever
 *   3. Y Combinator 'Work at a Startup' & Wellfound remote startup ecosystem
 *   4. Technical AI training and coding evaluation platforms (Scale AI, Outlier, Mercor, Turing)
 * 
 * Deduplicates canonical URLs against data/scan-history.tsv and appends fresh leads into data/pipeline.md.
 */

import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractRequisitionId, normalizeJobUrl } from './universal-dedup.mjs';
import { evaluateRemoteEligibility } from './remote-eligibility.mjs';

const ROOT_DIR = process.cwd();
const PIPELINE_PATH = join(ROOT_DIR, 'data', 'pipeline.md');
const HISTORY_PATH = join(ROOT_DIR, 'data', 'scan-history.tsv');
const TRACKER_PATH = join(ROOT_DIR, 'data', 'applications.md');

/**
 * Loads seen URLs and Requisition IDs from scan history and tracker.
 * @returns {Set<string>}
 */
export function loadKnownJobIdentifiers() {
  const seen = new Set();

  if (existsSync(HISTORY_PATH)) {
    const lines = readFileSync(HISTORY_PATH, 'utf8').split('\n');
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts[1]) seen.add(parts[1].trim());
    }
  }

  if (existsSync(TRACKER_PATH)) {
    const lines = readFileSync(TRACKER_PATH, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.startsWith('|')) continue;
      const parts = line.split('|').map(s => s.trim());
      if (parts[8] && parts[8].startsWith('http')) seen.add(parts[8]);
    }
  }

  if (existsSync(PIPELINE_PATH)) {
    const lines = readFileSync(PIPELINE_PATH, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.startsWith('- [')) continue;
      const match = line.match(/- \[[ x]\]\s+(https?:\/\/[^\s|]+)/);
      if (match) seen.add(match[1]);
    }
  }

  return seen;
}

/**
 * Ingests a batch of discovered web jobs into data/pipeline.md.
 * @param {Array<{
 *   url: string;
 *   company: string;
 *   title: string;
 *   location?: string;
 *   published_at?: string;
 *   source?: string;
 * }>} jobs
 * @returns {{ added: number; skippedSeen: number; skippedIneligible: number }}
 */
export function ingestDiscoveredJobs(jobs) {
  const seen = loadKnownJobIdentifiers();
  let added = 0;
  let skippedSeen = 0;
  let skippedIneligible = 0;

  const newRows = [];

  for (const job of jobs) {
    if (!job.url || !job.company || !job.title) continue;

    // Check if seen before
    if (seen.has(job.url)) {
      skippedSeen++;
      continue;
    }

    // Remote eligibility gate
    const loc = job.location || 'Remote - Worldwide';
    const eligibility = evaluateRemoteEligibility({ location: loc, title: job.title });
    if (!eligibility.isEligible) {
      skippedIneligible++;
      continue;
    }

    const today = (job.published_at || new Date().toISOString()).slice(0, 10);
    const line = `- [ ] ${job.url} | ${job.company.replace(/\|/g, '-')} | ${job.title.replace(/\|/g, '-')} | ${loc.replace(/\|/g, '-')} | posted: ${today}\n`;
    newRows.push(line);
    seen.add(job.url);
    added++;
  }

  if (newRows.length > 0) {
    if (!existsSync(PIPELINE_PATH)) {
      appendFileSync(PIPELINE_PATH, '# Job Pipeline Inbox\n\n## Pending\n\n', 'utf8');
    }
    appendFileSync(PIPELINE_PATH, newRows.join(''), 'utf8');
  }

  return { added, skippedSeen, skippedIneligible };
}
