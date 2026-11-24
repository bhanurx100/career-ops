// @ts-check
/**
 * discovery/freshness-engine.mjs
 * 
 * Classifies job postings into actionable freshness tiers to prioritize
 * newly published remote vacancies before they become saturated.
 * 
 * Tiers:
 *   TIER_1_ULTRA_FRESH : <= 24 hours (Top priority)
 *   TIER_2_VERY_FRESH  : <= 72 hours (High priority)
 *   TIER_3_RECENT      : <= 7 days (Standard discovery window)
 *   TIER_4_OLDER       : <= 14 days (Secondary queue)
 *   TIER_5_ARCHIVE     : > 14 days (Stale / archived)
 *   TIER_UNKNOWN       : Date unverified (Quarantine queue)
 */

export const FRESHNESS_TIERS = {
  TIER_1_ULTRA_FRESH: '24h',
  TIER_2_VERY_FRESH: '72h',
  TIER_3_RECENT: '7d',
  TIER_4_OLDER: '14d',
  TIER_5_ARCHIVE: 'archive',
  TIER_UNKNOWN: 'unknown',
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/**
 * Parses arbitrary date representations from ATS feeds, RSS, HTML, or relative strings.
 * @param {string | number | Date | null | undefined} rawDate
 * @param {Date} [referenceTime]
 * @returns {Date | null}
 */
export function parsePublicationDate(rawDate, referenceTime = new Date()) {
  if (!rawDate) return null;

  if (rawDate instanceof Date) {
    return isNaN(rawDate.getTime()) ? null : rawDate;
  }

  if (typeof rawDate === 'number') {
    // Check if timestamp is in seconds vs milliseconds
    const ts = rawDate < 1e11 ? rawDate * 1000 : rawDate;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof rawDate !== 'string') return null;

  const str = rawDate.trim();
  if (!str) return null;

  // Try standard ISO / RFC parsing
  const parsedIso = new Date(str);
  if (!isNaN(parsedIso.getTime()) && str.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/)) {
    return parsedIso;
  }

  // Handle relative strings (e.g., "2 hours ago", "yesterday", "3 days ago", "just posted")
  const lower = str.toLowerCase();
  const now = referenceTime.getTime();

  if (lower.includes('just posted') || lower.includes('just now') || lower.includes('today')) {
    return new Date(now);
  }

  if (lower.includes('yesterday')) {
    return new Date(now - ONE_DAY_MS);
  }

  const hoursMatch = lower.match(/(\d+)\s*(?:hour|hr|h)s?\s*ago/);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1], 10);
    return new Date(now - hours * ONE_HOUR_MS);
  }

  const daysMatch = lower.match(/(\d+)\s*(?:day|d)s?\s*ago/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    return new Date(now - days * ONE_DAY_MS);
  }

  const weeksMatch = lower.match(/(\d+)\s*(?:week|wk|w)s?\s*ago/);
  if (weeksMatch) {
    const weeks = parseInt(weeksMatch[1], 10);
    return new Date(now - weeks * 7 * ONE_DAY_MS);
  }

  const monthsMatch = lower.match(/(\d+)\s*(?:month|mo)s?\s*ago/);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1], 10);
    return new Date(now - months * 30 * ONE_DAY_MS);
  }

  return isNaN(parsedIso.getTime()) ? null : parsedIso;
}

/**
 * Evaluates the freshness tier of a posting.
 * @param {Date | string | number | null | undefined} rawPublishedDate
 * @param {Date} [referenceTime]
 * @returns {{
 *   tier: string;
 *   publishedAt: string | null;
 *   ageHours: number | null;
 *   isPriority: boolean;
 *   description: string;
 * }}
 */
export function evaluateFreshness(rawPublishedDate, referenceTime = new Date()) {
  const publishedDate = parsePublicationDate(rawPublishedDate, referenceTime);
  const now = referenceTime.getTime();

  if (!publishedDate) {
    return {
      tier: FRESHNESS_TIERS.TIER_UNKNOWN,
      publishedAt: null,
      ageHours: null,
      isPriority: false,
      description: 'Unknown publication date - routed to manual review queue',
    };
  }

  const ageMs = Math.max(0, now - publishedDate.getTime());
  const ageHours = Math.round(ageMs / ONE_HOUR_MS);

  if (ageHours <= 24) {
    return {
      tier: FRESHNESS_TIERS.TIER_1_ULTRA_FRESH,
      publishedAt: publishedDate.toISOString(),
      ageHours,
      isPriority: true,
      description: 'Ultra Fresh: Published within last 24 hours',
    };
  }

  if (ageHours <= 72) {
    return {
      tier: FRESHNESS_TIERS.TIER_2_VERY_FRESH,
      publishedAt: publishedDate.toISOString(),
      ageHours,
      isPriority: true,
      description: 'Very Fresh: Published within last 72 hours',
    };
  }

  if (ageHours <= 24 * 7) {
    return {
      tier: FRESHNESS_TIERS.TIER_3_RECENT,
      publishedAt: publishedDate.toISOString(),
      ageHours,
      isPriority: false,
      description: 'Recent: Published within last 7 days',
    };
  }

  if (ageHours <= 24 * 14) {
    return {
      tier: FRESHNESS_TIERS.TIER_4_OLDER,
      publishedAt: publishedDate.toISOString(),
      ageHours,
      isPriority: false,
      description: 'Older: Published within last 14 days',
    };
  }

  return {
    tier: FRESHNESS_TIERS.TIER_5_ARCHIVE,
    publishedAt: publishedDate.toISOString(),
    ageHours,
    isPriority: false,
    description: 'Archived: Older than 14 days',
  };
}

/**
 * Decorates a job record with standardized timestamps and freshness tier.
 * @template T
 * @param {T & { date_posted?: string | number, published_at?: string | number }} job
 * @param {Date} [referenceTime]
 * @returns {T & {
 *   published_at: string | null;
 *   first_seen_at: string;
 *   freshness_tier: string;
 *   freshness_age_hours: number | null;
 *   is_fresh_priority: boolean;
 * }}
 */
export function stampJobFreshness(job, referenceTime = new Date()) {
  const dateInput = job.published_at || job.date_posted;
  const freshness = evaluateFreshness(dateInput, referenceTime);

  return {
    ...job,
    published_at: freshness.publishedAt,
    first_seen_at: referenceTime.toISOString(),
    freshness_tier: freshness.tier,
    freshness_age_hours: freshness.ageHours,
    is_fresh_priority: freshness.isPriority,
  };
}
