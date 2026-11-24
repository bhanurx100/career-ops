// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { decodeEntities } from './_html-entities.mjs';

// Jobfound provider — remote-first job board indexing remote roles in India, US, UK & Worldwide
// Feed URL: https://jobfound.org/api/jobs

const API_URL = 'https://jobfound.org/api/jobs';
const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_PAGES = 3;

/** @type {Provider} */
export default {
  id: 'jobfound',

  detect(entry) {
    const raw = entry?.careers_url;
    if (typeof raw !== 'string') return null;
    try {
      const parsed = new URL(raw.trim());
      if (parsed.hostname === 'jobfound.org' || parsed.hostname === 'www.jobfound.org') {
        return { url: API_URL };
      }
    } catch {
      // not a URL
    }
    return null;
  },

  async fetch(entry, ctx) {
    const jobs = [];
    const maxPages = Math.min(Number(entry?.max_pages) || DEFAULT_MAX_PAGES, 10);
    const limit = Math.min(Number(entry?.limit) || DEFAULT_LIMIT, 100);

    for (let page = 1; page <= maxPages; page++) {
      const url = `${API_URL}?page=${page}&limit=${limit}`;
      let data;
      try {
        if (ctx && typeof ctx.fetchJson === 'function') {
          data = await ctx.fetchJson(url);
        } else {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12000);
          const res = await fetch(url, {
            headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: controller.signal,
          });
          clearTimeout(timer);
          data = await res.json();
        }
      } catch (err) {
        break;
      }

      if (!data || !Array.isArray(data.jobs) || data.jobs.length === 0) {
        break;
      }

      for (const j of data.jobs) {
        if (!j || !j.title || !j.companyName) continue;

        const title = decodeEntities(String(j.title)).trim();
        const company = decodeEntities(String(j.companyName)).trim();
        const slug = j.slug ? String(j.slug).trim() : '';
        const jobUrl = slug ? `https://jobfound.org/jobs/${slug}` : (j.applyUrl || '');
        if (!jobUrl) continue;

        const locParts = [j.location, j.country, j.workplaceType === 'remote' ? 'Remote' : '']
          .filter(Boolean)
          .map(s => decodeEntities(String(s)).trim());
        const location = locParts.length > 0 ? locParts.join(', ') : 'Remote - Worldwide';

        let postedAt;
        if (j.postedAt) {
          const parsedDate = Date.parse(j.postedAt);
          if (!Number.isNaN(parsedDate)) postedAt = parsedDate;
        }

        jobs.push({
          title,
          url: jobUrl,
          company,
          location,
          isRemote: j.workplaceType === 'remote' || location.toLowerCase().includes('remote'),
          description: j.description ? decodeEntities(String(j.description)).trim() : '',
          postedAt,
        });
      }

      if (!data.hasMore || data.jobs.length < limit) {
        break;
      }
    }

    return jobs;
  },
};
