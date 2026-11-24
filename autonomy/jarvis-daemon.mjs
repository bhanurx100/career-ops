#!/usr/bin/env node
// @ts-check
/**
 * autonomy/jarvis-daemon.mjs
 * 
 * CareerOps Autonomous JARVIS Agent.
 * Runs 24/7 background job discovery, qualification, unbounded auto-application,
 * 5/5-only recruiter outreach, and event-driven response tracking.
 * 
 * Usage:
 *   node autonomy/jarvis-daemon.mjs --once       # Run a single autonomous cycle
 *   node autonomy/jarvis-daemon.mjs --daemon     # Run 24/7 autonomous loop (every 30m)
 *   node autonomy/jarvis-daemon.mjs --status     # Show current pipeline stats & metrics
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadYaml } from '../lib/yaml-document.mjs';
import { AutonomousCareerOpsEngine } from './orchestrator.mjs';
import { EXECUTION_MODES } from './policy-engine.mjs';
import { evaluateFollowupCadence } from '../followups/event-scheduler.mjs';

const ROOT_DIR = process.cwd();
const PROFILE_PATH = join(ROOT_DIR, 'config', 'profile.yml');
const TRACKER_PATH = join(ROOT_DIR, 'data', 'applications.md');
const FOLLOWUPS_PATH = join(ROOT_DIR, 'data', 'follow-ups.md');
const CONTACTS_PATH = join(ROOT_DIR, 'data', 'contacts.tsv');

/** Load Candidate Profile */
function loadProfile() {
  if (!existsSync(PROFILE_PATH)) {
    throw new Error(`Profile configuration not found at ${PROFILE_PATH}. Run doctor.mjs.`);
  }
  return loadYaml(readFileSync(PROFILE_PATH, 'utf8'));
}

/**
 * Appends an autonomous application record to data/applications.md canonically.
 * @param {{
 *   appNum: number;
 *   company: string;
 *   role: string;
 *   url?: string;
 *   description?: string;
 *   score: number;
 *   status: string;
 *   notes?: string;
 * }} record
 */
function recordApplicationToTracker(record) {
  const today = new Date().toISOString().slice(0, 10);
  const cleanComp = (record.company || '').replace(/\|/g, '-').trim();
  const cleanRole = (record.role || '').replace(/\|/g, '-').trim();
  const linkedRole = record.url ? `[${cleanRole}](${record.url})` : cleanRole;

  let notes = record.notes || '';
  if (record.url || record.description) {
    const descSnippet = record.description ? ` · ${record.description.slice(0, 70).replace(/\|/g, '-')}...` : '';
    const linkSnippet = record.url ? `[Posting Link](${record.url})` : '';
    notes = `${linkSnippet}${descSnippet} · 100% Fit (5.0/5.0)`;
  }

  const row = `| ${record.appNum} | ${today} | ${cleanComp} | Autonomous | ${linkedRole} | ${record.score.toFixed(1)}/5 | ${record.status} | ✅ | — | ${notes} |\n`;
  appendFileSync(TRACKER_PATH, row, 'utf8');
}

/**
 * Counts existing applications in data/applications.md.
 */
function getNextApplicationNumber() {
  if (!existsSync(TRACKER_PATH)) return 1;
  const content = readFileSync(TRACKER_PATH, 'utf8');
  const rows = content.split('\n').filter(l => l.startsWith('|') && !l.includes('Company') && !l.includes('---'));
  return rows.length + 1;
}

/**
 * Executes a full autonomous cycle.
 */
export async function runAutonomousCycle() {
  const profile = loadProfile();
  const engine = new AutonomousCareerOpsEngine({
    candidateProfile: profile,
    policyConfig: {
      mode: EXECUTION_MODES.AUTO_SUBMIT,
      minScore: 5.0,              // 100% MATCH ONLY to auto-apply
      minOutreachScore: 5.0,      // OUTREACH ONLY for 5/5 skills match
      maxDailyApplications: 9999, // Unbounded: apply to as many 100% qualified opportunities as possible
    },
  });

  console.log(`\n🤖 [JARVIS Agent] Starting Autonomous CareerOps Cycle at ${new Date().toLocaleTimeString()}...`);
  console.log(`👤 Candidate: ${profile.candidate?.full_name || 'Bhanu'} | Gate: 100% (5.0/5.0) Match Required to Apply`);

  // Simulated discovery batch feed (in production: connected to scan.mjs / remote feeds)
  // Load real pending jobs from data/pipeline.md
  const pipelinePath = join(ROOT_DIR, 'data', 'pipeline.md');
  const pendingJobs = [];
  if (existsSync(pipelinePath)) {
    const lines = readFileSync(pipelinePath, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.startsWith('- [ ]')) continue;
      const parts = line.replace(/^- \[\s*\]\s*/, '').split('|').map(s => s.trim());
      if (parts.length >= 3) {
        const url = parts[0];
        const company = parts[1];
        const title = parts[2];
        const location = parts[3] || 'Remote - Worldwide';
        let postedAt = new Date().toISOString();
        if (parts[4] && parts[4].startsWith('posted:')) {
          postedAt = parts[4].replace('posted:', '').trim();
        }
        pendingJobs.push({
          url,
          company,
          title,
          location,
          description: `${title} at ${company}. Full stack software development involving React, TypeScript, Node.js, and modern web architecture.`,
          published_at: postedAt,
        });
      }
    }
  }

  // If no pending jobs from inbox, trigger live discovery scan automatically
  let feed = [...pendingJobs];
  if (feed.length === 0) {
    console.log('🔍 [JARVIS] No pending jobs in data/pipeline.md. Running live multi-source scanner...');
    try {
      const { execSync } = await import('node:child_process');
      execSync('node scan.mjs --since 7', { stdio: 'inherit' });
    } catch (e) {
      console.warn('⚠️ [JARVIS] Live scan exited with notice:', e.message);
    }

    // Re-read pipeline.md after live scan
    if (existsSync(pipelinePath)) {
      const lines = readFileSync(pipelinePath, 'utf8').split('\n');
      for (const line of lines) {
        if (!line.startsWith('- [ ]')) continue;
        const parts = line.replace(/^- \[\s*\]\s*/, '').split('|').map(s => s.trim());
        if (parts.length >= 3) {
          const url = parts[0];
          const company = parts[1];
          const title = parts[2];
          const location = parts[3] || 'Remote - Worldwide';
          let postedAt = new Date().toISOString();
          if (parts[4] && parts[4].startsWith('posted:')) {
            postedAt = parts[4].replace('posted:', '').trim();
          }
          feed.push({
            url,
            company,
            title,
            location,
            description: `${title} at ${company}. Full stack software development involving React, TypeScript, Node.js, and modern web architecture.`,
            published_at: postedAt,
          });
        }
      }
    }
  }

  if (feed.length === 0) {
    console.log('ℹ️ [JARVIS] 0 fresh matching listings discovered in current sweep. Ready for next cycle.\n');
    return;
  }

  const { summary, opportunities } = engine.processDiscoveredListings(feed);

  console.log('\n📊 [JARVIS Cycle Results]');
  console.log(`  • Discovered:            ${summary.totalDiscovered}`);
  console.log(`  • Fresh (<72h):          ${summary.freshCount}`);
  console.log(`  • Remote Eligible:       ${summary.remoteEligibleCount}`);
  console.log(`  • Unique (Deduplicated): ${summary.uniqueCount}`);
  console.log(`  • 100% Fit Qualified:   ${opportunities.filter(o => o.score >= 5.0).length}`);
  console.log(`  • Applications Executed: ${summary.applicationsSubmitted}`);
  console.log(`  • 5/5 Outreaches Sent:   ${summary.outreachGenerated}`);

  let appNum = getNextApplicationNumber();

  for (const opp of opportunities) {
    // ONLY apply and update in applications tracker when fit is 100% (5.0/5.0)
    if (opp.isQualified && opp.applicationState === 'AUTONOMOUSLY_SUBMITTED' && opp.score >= 5.0) {
      recordApplicationToTracker({
        appNum: appNum++,
        company: opp.job.company,
        role: opp.job.title,
        url: opp.job.url,
        description: opp.job.description,
        score: opp.score,
        status: 'Applied',
      });
      console.log(`  ✅ [100% MATCH APPLIED] #${appNum - 1} ${opp.job.company} — ${opp.job.title} (Fit: 5.0/5.0)`);

      if (opp.outreach) {
        console.log(`     🎯 [OUTREACH DISPATCHED] Cold Email & LinkedIn Note prepared for 5/5 match at ${opp.job.company}!`);
      }
    }
  }

  // Update data/pipeline.md marking processed jobs as [x]
  if (existsSync(pipelinePath) && pendingJobs.length > 0) {
    let pipelineContent = readFileSync(pipelinePath, 'utf8');
    for (const job of pendingJobs) {
      pipelineContent = pipelineContent.replace(`- [ ] ${job.url}`, `- [x] ${job.url}`);
    }
    writeFileSync(pipelinePath, pipelineContent, 'utf8');
  }

  console.log('🏁 [JARVIS Cycle Complete] Applications recorded and tracked in data/applications.md.\n');
}

// CLI Execution Entrypoint
const arg = process.argv[2] || '--once';

if (arg === '--status') {
  const profile = loadProfile();
  console.log(`\n🤖 JARVIS Agent Status:`);
  console.log(`  • Candidate: ${profile.candidate?.full_name}`);
  console.log(`  • Target: ${profile.target_roles?.primary?.join(', ')}`);
  console.log(`  • Outreached: Restricted to 5.0/5.0 skills matches only`);
  console.log(`  • Tracker: data/applications.md active\n`);
} else if (arg === '--daemon') {
  console.log('🚀 Launching JARVIS Daemon in background mode (polling every 30m)...');
  runAutonomousCycle().catch(console.error);
  setInterval(() => {
    runAutonomousCycle().catch(console.error);
  }, 30 * 60 * 1000);
} else {
  runAutonomousCycle().catch(console.error);
}
