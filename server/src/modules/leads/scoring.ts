/**
 * Server-side lead scoring engine.
 * Computes a 0-100 confidence score based on engagement signals.
 */

const STAGE_WEIGHTS: Record<string, number> = {
  "new": 10,
  "contacted": 25,
  "tour-scheduled": 40,
  "tour-done": 55,
  "quote-sent": 65,
  "negotiation": 75,
  "not-responding-3d": 15,
  "not-responding-7d": 5,
  "booked": 100,
  "dropped": 0,
};

const INTENT_WEIGHTS: Record<string, number> = {
  "hot": 30,
  "warm": 15,
  "cold": 0,
};

export interface ScoreBreakdown {
  stageScore: number;
  engagementScore: number;
  budgetScore: number;
  recencyScore: number;
  intentScore: number;
  total: number;
}

export function scoreLead(
  lead: { stage: string; intent: string; budget?: number },
  tourCount = 0,
  completedTours = 0,
  activityCount = 0,
  daysSinceLastActivity = 30,
): ScoreBreakdown {
  const stageScore = Math.min(40, STAGE_WEIGHTS[lead.stage] ?? 10);
  const intentScore = Math.min(10, INTENT_WEIGHTS[lead.intent] ?? 5);

  let engagementScore = 0;
  if (tourCount > 0) engagementScore += Math.min(15, tourCount * 5);
  if (completedTours > 0) engagementScore += Math.min(5, completedTours * 2);
  if (activityCount > 0) engagementScore += Math.min(5, activityCount);
  engagementScore = Math.min(25, engagementScore);

  const budget = lead.budget || 0;
  let budgetScore = 0;
  if (budget >= 30000) budgetScore = 15;
  else if (budget >= 20000) budgetScore = 12;
  else if (budget >= 15000) budgetScore = 10;
  else if (budget >= 10000) budgetScore = 7;
  else if (budget > 0) budgetScore = 5;

  let recencyScore = 5;
  if (daysSinceLastActivity <= 1) recencyScore = 10;
  else if (daysSinceLastActivity <= 3) recencyScore = 8;
  else if (daysSinceLastActivity <= 7) recencyScore = 5;
  else if (daysSinceLastActivity <= 14) recencyScore = 3;
  else recencyScore = 1;

  const total = Math.max(0, Math.min(100, stageScore + engagementScore + budgetScore + recencyScore + intentScore));

  return { stageScore, engagementScore, budgetScore, recencyScore, intentScore, total };
}
