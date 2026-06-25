import { describe, it, expect } from 'vitest';
import { PLAN_CONFIG, assertValidPlan, getVipExpiry, inferPlanFromAmount } from '../backend/paymentPlans.js';

describe('Payment Plans', () => {
  describe('PLAN_CONFIG', () => {
    it('has all expected tiers', () => {
      expect(PLAN_CONFIG).toHaveProperty('daily');
      expect(PLAN_CONFIG).toHaveProperty('weekly');
      expect(PLAN_CONFIG).toHaveProperty('monthly');
      expect(PLAN_CONFIG).toHaveProperty('quarterly');
      expect(PLAN_CONFIG).toHaveProperty('annual');
    });

    it('has correct amounts', () => {
      expect(PLAN_CONFIG.daily.amount).toBe(500);
      expect(PLAN_CONFIG.weekly.amount).toBe(2000);
      expect(PLAN_CONFIG.monthly.amount).toBe(5000);
      expect(PLAN_CONFIG.quarterly.amount).toBe(12000);
      expect(PLAN_CONFIG.annual.amount).toBe(35000);
    });

    it('has correct durations in days', () => {
      expect(PLAN_CONFIG.daily.days).toBe(1);
      expect(PLAN_CONFIG.weekly.days).toBe(7);
      expect(PLAN_CONFIG.monthly.days).toBe(30);
      expect(PLAN_CONFIG.quarterly.days).toBe(90);
      expect(PLAN_CONFIG.annual.days).toBe(365);
    });
  });

  describe('assertValidPlan', () => {
    it('returns config for valid plan', () => {
      const result = assertValidPlan('weekly');
      expect(result).toEqual({ days: 7, amount: 2000 });
    });

    it('returns config for daily plan', () => {
      const result = assertValidPlan('daily');
      expect(result).toEqual({ days: 1, amount: 500 });
    });

    it('returns config for annual plan', () => {
      const result = assertValidPlan('annual');
      expect(result).toEqual({ days: 365, amount: 35000 });
    });

    it('throws for invalid plan', () => {
      expect(() => assertValidPlan('bogus')).toThrow('Invalid plan');
    });

    it('throws for empty string', () => {
      expect(() => assertValidPlan('')).toThrow('Invalid plan');
    });

    it('throws for null/undefined', () => {
      expect(() => assertValidPlan(null)).toThrow('Invalid plan');
      expect(() => assertValidPlan(undefined)).toThrow('Invalid plan');
    });
  });

  describe('getVipExpiry', () => {
    it('returns ISO date string for a valid plan', () => {
      const now = new Date('2026-06-25T10:00:00Z');
      const expiry = getVipExpiry('weekly', now);
      expect(expiry).toBe('2026-07-02T10:00:00.000Z');
    });

    it('daily plan adds 1 day', () => {
      const now = new Date('2026-06-25T10:00:00Z');
      const expiry = getVipExpiry('daily', now);
      expect(expiry).toBe('2026-06-26T10:00:00.000Z');
    });

    it('monthly plan adds 30 days', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const expiry = getVipExpiry('monthly', now);
      expect(expiry).toBe('2026-01-31T00:00:00.000Z');
    });
  });

  describe('inferPlanFromAmount', () => {
    it('returns annual for >= 35000', () => {
      expect(inferPlanFromAmount(35000)).toBe('annual');
      expect(inferPlanFromAmount(50000)).toBe('annual');
    });

    it('returns quarterly for >= 12000 and < 35000', () => {
      expect(inferPlanFromAmount(12000)).toBe('quarterly');
      expect(inferPlanFromAmount(20000)).toBe('quarterly');
    });

    it('returns monthly for >= 5000 and < 12000', () => {
      expect(inferPlanFromAmount(5000)).toBe('monthly');
      expect(inferPlanFromAmount(10000)).toBe('monthly');
    });

    it('returns weekly for >= 2000 and < 5000', () => {
      expect(inferPlanFromAmount(2000)).toBe('weekly');
      expect(inferPlanFromAmount(3000)).toBe('weekly');
    });

    it('returns daily for >= 500 and < 2000', () => {
      expect(inferPlanFromAmount(500)).toBe('daily');
      expect(inferPlanFromAmount(1000)).toBe('daily');
    });

    it('returns null for amounts below minimum', () => {
      expect(inferPlanFromAmount(0)).toBeNull();
      expect(inferPlanFromAmount(100)).toBeNull();
      expect(inferPlanFromAmount(499)).toBeNull();
    });
  });
});
