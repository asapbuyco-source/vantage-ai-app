export const PLAN_CONFIG = {
  daily: { days: 1, amount: 500 },
  weekly: { days: 7, amount: 2000 },
  monthly: { days: 30, amount: 5000 },
  quarterly: { days: 90, amount: 12000 },
  annual: { days: 365, amount: 40000 },
};

export function assertValidPlan(plan) {
  if (!PLAN_CONFIG[plan]) {
    const err = new Error("Invalid plan");
    err.status = 400;
    throw err;
  }
  return PLAN_CONFIG[plan];
}

export function getVipExpiry(plan, now = new Date()) {
  const cfg = assertValidPlan(plan);
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + cfg.days);
  return expiry.toISOString();
}

export function inferPlanFromAmount(amount) {
  if (amount >= PLAN_CONFIG.annual.amount) return "annual";
  if (amount >= PLAN_CONFIG.quarterly.amount) return "quarterly";
  if (amount >= PLAN_CONFIG.monthly.amount) return "monthly";
  if (amount >= PLAN_CONFIG.weekly.amount) return "weekly";
  if (amount >= PLAN_CONFIG.daily.amount) return "daily";
  return null;
}