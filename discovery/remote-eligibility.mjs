// @ts-check
/**
 * discovery/remote-eligibility.mjs
 * 
 * Verifies whether a remote job posting accepts candidates residing in India.
 * Distinguishes true Worldwide / Global / India-Remote opportunities from
 * region-restricted roles (e.g. "US Only", "EU Work Authorization Required").
 */

// Explicit negative patterns that disqualify applicants residing in India
const EXCLUDED_PATTERNS = [
  /\b(us|usa|united states)\s+(only|citizens?|residents?|based)\b/i,
  /\b(must|have to)\s+be\s+(located|living|physically located)\s+in\s+the\s+(us|usa|united states|uk|canada|eu|europe)\b/i,
  /\bwork\s+authorization\s+in\s+(the\s+)?(us|united states|eu|uk|canada)\s+(is\s+)?required\b/i,
  /\bno\s+sponsorship\b/i,
  /\bwe\s+cannot\s+sponsor\s+visas?\b/i,
  /\bsecurity\s+clearance\s+(is\s+)?required\b/i,
  /\bactive\s+(secret|top\s+secret)\s+clearance\b/i,
  /\b(latin\s+america|latam)\s+only\b/i,
  /\b(emea)\s+only\b/i,
  /\b(european\s+union|eu)\s+citizens?\b/i,
];

// Positive patterns indicating global or India-friendly remote eligibility
const GLOBAL_ELIGIBILITY_PATTERNS = [
  /\b(worldwide|anywhere|global|world|international)\b/i,
  /\b(work\s+from\s+anywhere|remote\s+first\s+company|fully\s+distributed)\b/i,
  /\b(india|bengaluru|bangalore|hyderabad|pune|delhi|mumbai|chennai|noida|gurgaon)\b/i,
  /\b(apac|asia|asia-pacific)\b/i,
  /\b(all\s+locations|everywhere)\b/i,
  /\b(open\s+to\s+all\s+geographies|hire\s+globally)\b/i,
];

/**
 * Evaluates remote eligibility for an India-based candidate.
 * @param {{
 *   location?: string;
 *   title?: string;
 *   description?: string;
 *   country?: string;
 * }} posting
 * @returns {{
 *   isEligible: boolean;
 *   reason: string;
 *   confidence: 'high' | 'medium' | 'low';
 *   matchedRestriction?: string;
 * }}
 */
export function evaluateRemoteEligibility(posting) {
  const loc = (posting.location || '').toLowerCase();
  const title = (posting.title || '').toLowerCase();
  const desc = (posting.description || '').toLowerCase();
  const combined = `${loc} ${title} ${desc.slice(0, 3000)}`;

  // 1. Check for immediate geographic match with India
  if (/\b(india|remote\s*,\s*india|india\s*-\s*remote)\b/i.test(loc) || posting.country === 'IN') {
    return {
      isEligible: true,
      reason: 'Explicitly targeted for India / India-Remote',
      confidence: 'high',
    };
  }

  // 2. Check for explicit negative exclusions (US only, no sponsorship, etc.)
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.test(loc) || pattern.test(title)) {
      return {
        isEligible: false,
        reason: `Explicit region restriction: ${pattern}`,
        confidence: 'high',
        matchedRestriction: pattern.source,
      };
    }
    if (pattern.test(desc)) {
      return {
        isEligible: false,
        reason: `Description contains restriction: ${pattern}`,
        confidence: 'high',
        matchedRestriction: pattern.source,
      };
    }
  }

  // 3. Check for explicit positive global patterns
  for (const pattern of GLOBAL_ELIGIBILITY_PATTERNS) {
    if (pattern.test(loc)) {
      return {
        isEligible: true,
        reason: `Global/Worldwide remote location declared: ${pattern.source}`,
        confidence: 'high',
      };
    }
  }

  // 4. If labeled just "Remote" or "Remote - Anywhere"
  if (loc.includes('remote') || loc.includes('telecommute') || loc.includes('distributed')) {
    // Check if location restricts to a specific foreign country or continent despite being remote
    const foreignRegionMatch = loc.match(/\b(united states|usa|north america|canada|united kingdom|uk|germany|france|netherlands|australia|latin america|latam|europe|emea)\b/i);
    if (foreignRegionMatch) {
      const isGlobal = GLOBAL_ELIGIBILITY_PATTERNS.some(p => p.test(loc));
      if (!isGlobal) {
        return {
          isEligible: false,
          reason: `Region-restricted remote role (${foreignRegionMatch[1]}) without India or Worldwide eligibility`,
          confidence: 'high',
          matchedRestriction: foreignRegionMatch[1],
        };
      }
    }

    // Check if US states are mentioned in location (e.g., "Remote, CA", "Remote, NY")
    if (/\bremote\s*,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b/i.test(loc)) {
      // Note: 'in' is Indiana in US state abbreviations, check carefully!
      if (!/\bremote\s*,\s*in\b/i.test(loc) || loc.includes('indiana') || loc.includes('usa') || loc.includes('united states')) {
        return {
          isEligible: false,
          reason: 'US state-specific remote posting',
          confidence: 'medium',
        };
      }
    }

    // If description mentions global team or anywhere
    if (/\b(anywhere\s+in\s+the\s+world|global\s+team|worldwide)\b/i.test(desc)) {
      return {
        isEligible: true,
        reason: 'Remote with global distributed wording in description',
        confidence: 'medium',
      };
    }

    return {
      isEligible: true,
      reason: 'General remote position without explicit geographical restriction',
      confidence: 'medium',
    };
  }

  // Non-remote without India location
  return {
    isEligible: false,
    reason: 'On-site or non-remote position outside India',
    confidence: 'high',
  };
}
