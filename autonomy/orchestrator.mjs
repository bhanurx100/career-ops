// @ts-check
/**
 * autonomy/orchestrator.mjs
 * 
 * CareerOps Autonomous Loop Orchestrator.
 * Connects Discovery -> Freshness & Remote Filtering -> Deduplication ->
 * Qualification -> Resume Tailoring -> Application Gate -> Outreach CRM -> Follow-ups.
 */

import { evaluateFreshness, stampJobFreshness } from '../discovery/freshness-engine.mjs';
import { DeduplicationRegistry, normalizeJobUrl } from '../discovery/universal-dedup.mjs';
import { evaluateRemoteEligibility } from '../discovery/remote-eligibility.mjs';
import { evaluatePolicy, EXECUTION_MODES, DEFAULT_POLICY } from './policy-engine.mjs';
import { generateOutreachBundle } from '../outreach/pitch-generator.mjs';
import { evaluateFollowupCadence } from '../followups/event-scheduler.mjs';
import { classifyEmployerMessage } from '../inbox/reply-classifier.mjs';

export class AutonomousCareerOpsEngine {
  /**
   * @param {{
   *   candidateProfile: any;
   *   policyConfig?: Partial<typeof DEFAULT_POLICY>;
   * }} config
   */
  constructor(config) {
    this.profile = config.candidateProfile;
    this.policyConfig = config.policyConfig || DEFAULT_POLICY;
    this.dedupRegistry = new DeduplicationRegistry();
    this.processedApplications = [];
    this.dailyApplicationsCount = 0;
  }

  /**
   * Ingests and processes a batch of raw discovered job listings.
   * @param {Array<any>} rawListings
   * @returns {{
   *   summary: {
   *     totalDiscovered: number;
   *     freshCount: number;
   *     remoteEligibleCount: number;
   *     uniqueCount: number;
   *     qualifiedCount: number;
   *     applicationsPrepared: number;
   *     applicationsSubmitted: number;
   *     outreachGenerated: number;
   *   };
   *   opportunities: Array<any>;
   * }}
   */
  processDiscoveredListings(rawListings) {
    const summary = {
      totalDiscovered: rawListings.length,
      freshCount: 0,
      remoteEligibleCount: 0,
      uniqueCount: 0,
      qualifiedCount: 0,
      applicationsPrepared: 0,
      applicationsSubmitted: 0,
      outreachGenerated: 0,
    };

    const processedOpportunities = [];

    for (const rawJob of rawListings) {
      // 1. Stamp Freshness
      const stampedJob = stampJobFreshness(rawJob);
      if (stampedJob.is_fresh_priority) summary.freshCount++;

      // 2. Evaluate Remote Eligibility for India
      const eligibility = evaluateRemoteEligibility(stampedJob);
      if (!eligibility.isEligible) {
        processedOpportunities.push({
          job: stampedJob,
          status: 'SKIPPED_INELIGIBLE_REGION',
          reason: eligibility.reason,
        });
        continue;
      }
      summary.remoteEligibleCount++;

      // 3. Deduplication Check
      const dedupResult = this.dedupRegistry.process(stampedJob);
      if (dedupResult.isDuplicate) {
        processedOpportunities.push({
          job: stampedJob,
          status: 'SKIPPED_DUPLICATE',
          canonicalId: dedupResult.canonicalId,
        });
        continue;
      }
      summary.uniqueCount++;

      // 4. Job Qualification Scoring (1.0 to 5.0)
      const score = this.calculateMatchScore(stampedJob);
      const isQualified = score >= (this.policyConfig.minScore || 4.0);
      if (isQualified) summary.qualifiedCount++;

      // 5. Evaluate Autonomous Execution Policy
      const policyDecision = evaluatePolicy({
        score,
        ghostSignals: stampedJob.ghost_signals || [],
        screeningGaps: stampedJob.screening_gaps || [],
        isDuplicate: false,
        remoteEligible: true,
        salaryInr: stampedJob.salary_inr,
        dailyCountSoFar: this.dailyApplicationsCount,
        policyConfig: this.policyConfig,
      });

      // 6. Outreach Gate: ONLY trigger outreach for perfect 5.0/5.0 skills matches
      const minOutreachScore = this.policyConfig.minOutreachScore || 5.0;
      let outreach = null;
      if (score >= minOutreachScore) {
        outreach = generateOutreachBundle({
          candidateName: this.profile?.candidate?.full_name || 'Bhanu',
          contactName: stampedJob.contact_name,
          companyName: stampedJob.company,
          jobTitle: stampedJob.title,
          topSkills: ['React', 'Next.js', 'TypeScript', 'Node.js', 'PostgreSQL'],
        });
        summary.outreachGenerated++;
      }

      // 7. Execute or Prepare Application
      let applicationState = 'PREPARED_FOR_REVIEW';
      if (policyDecision.allowed && policyDecision.effectiveMode === EXECUTION_MODES.AUTO_SUBMIT) {
        applicationState = 'AUTONOMOUSLY_SUBMITTED';
        this.dailyApplicationsCount++;
        summary.applicationsSubmitted++;
      } else {
        summary.applicationsPrepared++;
      }

      processedOpportunities.push({
        job: dedupResult.job,
        canonicalId: dedupResult.canonicalId,
        score,
        isQualified,
        policyDecision,
        applicationState,
        outreach,
      });
    }

    return {
      summary,
      opportunities: processedOpportunities,
    };
  }

  /**
   * Deterministic match scoring heuristic based on profile target roles & core stack.
   * @param {any} job
   * @returns {number}
   */
  calculateMatchScore(job) {
    let score = 3.0; // Baseline
    const title = (job.title || '').toLowerCase();
    const desc = (job.description || '').toLowerCase();
    const combined = `${title} ${desc}`;

    // Target role matches
    if (title.includes('full stack') || title.includes('fullstack') || title.includes('product engineer') || title.includes('mobile')) {
      score += 0.8;
    } else if (title.includes('frontend') || title.includes('backend') || title.includes('software engineer') || title.includes('ai trainer') || title.includes('code annotation')) {
      score += 0.5;
    }

    // Technology stack matches
    const keyTechs = ['react', 'next.js', 'typescript', 'node', 'react native', 'expo', 'postgresql', 'mongodb'];
    for (const tech of keyTechs) {
      if (combined.includes(tech)) score += 0.25;
    }

    // Cap score at 5.0
    return Math.min(5.0, Math.round(score * 10) / 10);
  }
}
