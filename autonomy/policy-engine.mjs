// @ts-check
/**
 * autonomy/policy-engine.mjs
 * 
 * Safety and policy gate for CareerOps Autonomous Edition.
 * Determines whether a job can proceed to autonomous submission or must be
 * held for human review.
 */

export const EXECUTION_MODES = {
  PREPARE_ONLY: 'prepare_only', // Fill form, stage resume, leave window open for human review
  AUTO_SUBMIT: 'auto_submit',   // Full autonomous submission if every gate passes
};

export const DEFAULT_POLICY = {
  mode: EXECUTION_MODES.PREPARE_ONLY,
  minScore: 4.0,                   // Minimum A-H match score required to apply (out of 5.0)
  minOutreachScore: 5.0,           // Outreach gate: ONLY trigger outreach for perfect 5.0/5.0 matches
  maxDailyApplications: 9999,      // Unbounded: apply to as many qualified opportunities as possible
  requireVerifiedSalary: false,     // Whether salary must be explicitly stated
  minSalaryInrPerMonth: 0,         // No artificial minimum restriction
  allowUnknownQuestions: false,    // Never auto-submit if a screening question has unknown answer
  blockGhostJobs: true,            // Stop if posting exhibits ghost-job / scam signals (Block G)
};

/**
 * Evaluates whether an opportunity clears the autonomous execution policy.
 * @param {{
 *   score?: number;
 *   ghostSignals?: string[];
 *   screeningGaps?: string[];
 *   isDuplicate?: boolean;
 *   remoteEligible?: boolean;
 *   salaryInr?: number;
 *   dailyCountSoFar?: number;
 *   policyConfig?: Partial<typeof DEFAULT_POLICY>;
 * }} context
 * @returns {{
 *   allowed: boolean;
 *   effectiveMode: string;
 *   reasons: string[];
 *   checklist: Record<string, boolean>;
 * }}
 */
export function evaluatePolicy(context) {
  const policy = { ...DEFAULT_POLICY, ...(context.policyConfig || {}) };
  const reasons = [];
  const checklist = {
    scorePassed: false,
    ghostJobClean: false,
    noScreeningGaps: false,
    notDuplicate: false,
    remoteEligible: false,
    dailyLimitRespected: false,
    salaryApproved: false,
    policyModePermitted: false,
  };

  // 1. Fit score check
  const score = context.score ?? 0;
  if (score >= policy.minScore) {
    checklist.scorePassed = true;
  } else {
    reasons.push(`Fit score ${score.toFixed(1)} is below threshold ${policy.minScore.toFixed(1)}`);
  }

  // 2. Ghost-job / legitimacy check (Block G)
  const ghostSignals = context.ghostSignals || [];
  if (ghostSignals.length === 0) {
    checklist.ghostJobClean = true;
  } else {
    reasons.push(`Posting raised legitimacy flags: ${ghostSignals.join(', ')}`);
  }

  // 3. Screening question completeness
  const gaps = context.screeningGaps || [];
  if (gaps.length === 0) {
    checklist.noScreeningGaps = true;
  } else {
    reasons.push(`Contains ${gaps.length} unanswered or ambiguous screening question(s)`);
  }

  // 4. Duplicate prevention
  if (!context.isDuplicate) {
    checklist.notDuplicate = true;
  } else {
    reasons.push('Candidate has already applied to this requisition');
  }

  // 5. Remote eligibility
  if (context.remoteEligible) {
    checklist.remoteEligible = true;
  } else {
    reasons.push('Position is not eligible for candidates residing in India');
  }

  // 6. Daily volume cap
  const dailyCount = context.dailyCountSoFar ?? 0;
  if (dailyCount < policy.maxDailyApplications) {
    checklist.dailyLimitRespected = true;
  } else {
    reasons.push(`Daily application limit (${policy.maxDailyApplications}) reached for today`);
  }

  // 7. Salary compensation check
  const salary = context.salaryInr;
  if (!salary || salary >= policy.minSalaryInrPerMonth) {
    checklist.salaryApproved = true;
  } else {
    reasons.push(`Advertised salary (₹${salary}) is below candidate minimum (₹${policy.minSalaryInrPerMonth})`);
  }

  // 8. Mode check
  if (policy.mode === EXECUTION_MODES.AUTO_SUBMIT) {
    checklist.policyModePermitted = true;
  } else {
    reasons.push('System is currently configured in PREPARE_ONLY mode (human review required)');
  }

  const allPassed = Object.values(checklist).every(Boolean);

  return {
    allowed: allPassed,
    effectiveMode: allPassed ? EXECUTION_MODES.AUTO_SUBMIT : EXECUTION_MODES.PREPARE_ONLY,
    reasons,
    checklist,
  };
}
