import { describe, it, expect } from 'vitest';

/**
 * Tests for referral code generation logic.
 * The actual generateReferralCode function is defined inside AuthContext.tsx
 * which requires Firebase initialization. We test the logic rules here.
 */

const generateReferralCode = (name: string | null): string => {
  const cleanName = (name || '').toUpperCase().replace(/[^A-Z]/g, '');
  const prefix = cleanName.length >= 3 ? cleanName.substring(0, 3) : (cleanName + 'VAN').substring(0, 3);
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}${random}`;
};

describe('generateReferralCode', () => {
  it('returns 8 characters total', () => {
    const code = generateReferralCode('John Doe');
    expect(code).toHaveLength(8);
  });

  it('uses first 3 letters of clean name as prefix', () => {
    const code = generateReferralCode('John Doe');
    expect(code.startsWith('JOH')).toBe(true);
  });

  it('strips non-letter characters from name', () => {
    const code = generateReferralCode('J0hn D0e!');
    expect(code.startsWith('JHN')).toBe(true);
  });

  it('pads with VAN when name has fewer than 3 letters', () => {
    const code = generateReferralCode('A');
    expect(code.startsWith('AVA') || code.startsWith('AVN') || code.startsWith('AV ')).toBe(true);
  });

  it('uses VAN prefix when name is null', () => {
    const code = generateReferralCode(null);
    expect(code.startsWith('VAN')).toBe(true);
  });

  it('uses VAN prefix when name is empty', () => {
    const code = generateReferralCode('');
    expect(code.startsWith('VAN')).toBe(true);
  });

  it('handles name with only special characters', () => {
    const code = generateReferralCode('!@#$%');
    expect(code.startsWith('VAN')).toBe(true);
  });

  it('always returns uppercase', () => {
    const code = generateReferralCode('john doe');
    expect(code).toBe(code.toUpperCase());
  });

  it('generates unique codes (probabilistic)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateReferralCode('Test User')));
    expect(codes.size).toBeGreaterThan(15); // Allow some collisions given 5 random chars
  });
});
