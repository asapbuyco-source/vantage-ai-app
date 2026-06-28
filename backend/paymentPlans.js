export const PLAN_CONFIG = {
  daily: { days: 1, amount: 4.99 },
  weekly_trial: { days: 7, amount: 6.99 },
  weekly: { days: 7, amount: 14.99 },
  monthly: { days: 30, amount: 24.99 },
  quarterly: { days: 90, amount: 59.99 },
  annual: { days: 365, amount: 99.99 },
};

// XAF-equivalent amounts for Cameroon MoMo (Fapshi) payment verification.
// These are approximate conversions; update as exchange rates change.
export const PLAN_AMOUNT_XAF = {
  daily: 500,
  weekly_trial: 700,
  weekly: 2000,
  monthly: 5000,
  quarterly: 12000,
  annual: 35000,
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

export function inferPlanFromAmountXAF(amount) {
  if (amount >= PLAN_AMOUNT_XAF.annual) return "annual";
  if (amount >= PLAN_AMOUNT_XAF.quarterly) return "quarterly";
  if (amount >= PLAN_AMOUNT_XAF.monthly) return "monthly";
  if (amount >= PLAN_AMOUNT_XAF.weekly) return "weekly";
  if (amount >= PLAN_AMOUNT_XAF.daily) return "daily";
  return null;
}