// @ts-check
/**
 * discovery/universal-dedup.mjs
 * 
 * Requisition-level cross-source deduplication engine.
 * Consolidates duplicate listings discovered across LinkedIn, Wellfound, WeWorkRemotely,
 * company career pages, and direct ATS boards into a single canonical opportunity.
 */

import { createHash } from 'node:crypto';

// Standard tracking / referral parameters to strip
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gh_src', 'lever-source', 'ref', 'source', 'src', 'from', 'fbclid', 'gclid',
  'sid', 'linkedin_job_id', 'trk', 'tracking', 'original_referer'
]);

/**
 * Normalizes a job URL to its canonical form by stripping tracking and session tokens.
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeJobUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl.trim());
    
    // Sort search parameters and remove trackers
    const cleanParams = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      if (!TRACKING_PARAMS.has(key.toLowerCase()) && !key.toLowerCase().startsWith('utm_')) {
        cleanParams.append(key, value);
      }
    }
    
    parsed.search = cleanParams.toString() ? `?${cleanParams.toString()}` : '';
    parsed.hash = ''; // Remove fragments
    
    // Remove trailing slash for uniformity unless it's just root
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;

    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Normalizes company name into a clean comparable slug.
 * @param {string} company
 * @returns {string}
 */
export function normalizeCompany(company) {
  if (!company || typeof company !== 'string') return '';
  return company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|gmbh|pvt|private|limited|technologies|corp|corporation)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Normalizes job title into a clean comparable token set.
 * @param {string} title
 * @returns {string}
 */
export function normalizeTitle(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/[([{\-–|/\\].*$/g, '') // Strip qualifiers after separators (e.g. " - Remote", " (US)")
    .replace(/\b(senior|sr|lead|junior|jr|mid|staff|principal|experienced)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts candidate ATS requisition ID from URL or explicit payload fields.
 * @param {string} url
 * @param {string} [explicitId]
 * @returns {string | null}
 */
export function extractRequisitionId(url, explicitId) {
  if (explicitId && String(explicitId).trim().length > 1) {
    return String(explicitId).trim();
  }
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    // Greenhouse pattern: /jobs/{id} or ?gh_jid={id}
    const ghParam = parsed.searchParams.get('gh_jid');
    if (ghParam) return ghParam;
    const ghPath = pathname.match(/\/jobs\/(\d+)/i);
    if (ghPath) return ghPath[1];

    // Lever pattern: /jobs/{uuid}
    const leverMatch = pathname.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (leverMatch) return leverMatch[1];

    // Ashby pattern: /{company}/{id}
    const ashbyMatch = pathname.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (ashbyMatch) return ashbyMatch[1];

    // Generic trailing numeric ID: /roles/12345 or /req-12345
    const trailingNumeric = pathname.match(/[-/_](\d{4,12})(?:\/|$)/);
    if (trailingNumeric) return trailingNumeric[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Computes a deterministic content fingerprint for a job description.
 * @param {string} [descriptionText]
 * @returns {string}
 */
export function computeDescriptionFingerprint(descriptionText) {
  if (!descriptionText || typeof descriptionText !== 'string') return '';
  const clean = descriptionText
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (clean.length < 50) return '';
  return createHash('sha256').update(clean.slice(0, 1500)).digest('hex').slice(0, 16);
}

/**
 * Generates composite deduplication keys for a job.
 * @param {{
 *   url: string;
 *   company: string;
 *   title: string;
 *   requisition_id?: string;
 *   description?: string;
 *   location?: string;
 * }} job
 * @returns {{
 *   canonicalUrl: string;
 *   primaryKey: string;
 *   reqKey: string | null;
 *   semanticKey: string;
 *   fingerprint: string;
 * }}
 */
export function generateDeduplicationKeys(job) {
  const canonicalUrl = normalizeJobUrl(job.url);
  const normCompany = normalizeCompany(job.company);
  const normTitle = normalizeTitle(job.title);
  const reqId = extractRequisitionId(job.url, job.requisition_id);
  const fingerprint = computeDescriptionFingerprint(job.description);

  const reqKey = reqId && normCompany ? `req:${normCompany}:${reqId}` : null;
  const semanticKey = `sem:${normCompany}:${normTitle}`;
  const primaryKey = reqKey || `url:${canonicalUrl}`;

  return {
    canonicalUrl,
    primaryKey,
    reqKey,
    semanticKey,
    fingerprint,
  };
}

/**
 * In-memory or stateful Deduplication Registry to track seen jobs across sources.
 */
export class DeduplicationRegistry {
  constructor() {
    /** @type {Map<string, string>} primaryKey -> canonicalJobId */
    this.primaryMap = new Map();
    /** @type {Map<string, string>} reqKey -> canonicalJobId */
    this.reqMap = new Map();
    /** @type {Map<string, string>} url -> canonicalJobId */
    this.urlMap = new Map();
    /** @type {Map<string, string>} fingerprint -> canonicalJobId */
    this.fingerprintMap = new Map();
    /** @type {Map<string, any>} canonicalJobId -> JobRecord */
    this.records = new Map();
  }

  /**
   * Registers a job candidate. If a duplicate is detected, attaches the new source
   * and returns { isDuplicate: true, canonicalJob }. Otherwise registers as fresh.
   * @param {any} job
   * @returns {{ isDuplicate: boolean; canonicalId: string; job: any }}
   */
  process(job) {
    const keys = generateDeduplicationKeys(job);
    
    // Check for match across priority hierarchy:
    // 1. Requisition key (Exact ATS match across multiple boards)
    // 2. Canonical URL match
    // 3. Exact Description Fingerprint + Same Company
    let matchedId = null;

    if (keys.reqKey && this.reqMap.has(keys.reqKey)) {
      matchedId = this.reqMap.get(keys.reqKey);
    } else if (this.urlMap.has(keys.canonicalUrl)) {
      matchedId = this.urlMap.get(keys.canonicalUrl);
    } else if (keys.fingerprint && this.fingerprintMap.has(keys.fingerprint)) {
      const candidateId = this.fingerprintMap.get(keys.fingerprint);
      const existing = this.records.get(candidateId);
      if (existing && normalizeCompany(existing.company) === normalizeCompany(job.company)) {
        matchedId = candidateId;
      }
    }

    if (matchedId) {
      const existing = this.records.get(matchedId);
      // Merge sources and alternative URLs
      if (!existing.alternative_urls) existing.alternative_urls = [];
      if (!existing.alternative_urls.includes(job.url) && job.url !== existing.url) {
        existing.alternative_urls.push(job.url);
      }
      if (!existing.discovered_sources) existing.discovered_sources = [existing.source || 'primary'];
      if (job.source && !existing.discovered_sources.includes(job.source)) {
        existing.discovered_sources.push(job.source);
      }
      return { isDuplicate: true, canonicalId: matchedId, job: existing };
    }

    // New unique job
    const newId = `job-${createHash('md5').update(keys.primaryKey).digest('hex').slice(0, 10)}`;
    const record = {
      ...job,
      id: newId,
      canonical_url: keys.canonicalUrl,
      alternative_urls: [],
      discovered_sources: [job.source || 'primary'],
    };

    this.records.set(newId, record);
    this.primaryMap.set(keys.primaryKey, newId);
    this.urlMap.set(keys.canonicalUrl, newId);
    if (keys.reqKey) this.reqMap.set(keys.reqKey, newId);
    if (keys.fingerprint) this.fingerprintMap.set(keys.fingerprint, newId);

    return { isDuplicate: false, canonicalId: newId, job: record };
  }
}
