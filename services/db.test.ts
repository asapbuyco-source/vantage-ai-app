import { describe, it, expect } from 'vitest';
import { normalizeQuantPrediction } from '../services/db';

describe('normalizeQuantPrediction', () => {
  it('returns null for null input', () => {
    expect(normalizeQuantPrediction(null)).toBeNull();
  });

  it('returns undefined for undefined input', () => {
    expect(normalizeQuantPrediction(undefined)).toBeUndefined();
  });

  it('passes through camelCase input (idempotent)', () => {
    const input = {
      id: 'man-city-arsenal',
      homeTeam: 'Man City',
      awayTeam: 'Arsenal',
      league: 'Premier League',
      prediction: 'Home Win',
      confidence: 88,
      status: 'pending',
      score: '',
      graded_at: '',
      graded_by: '',
    };
    const result = normalizeQuantPrediction(input);
    expect(result.homeTeam).toBe('Man City');
    expect(result.awayTeam).toBe('Arsenal');
    expect(result.id).toBe('man-city-arsenal');
    expect(result.league).toBe('Premier League');
  });

  it('converts snake_case to camelCase', () => {
    const input = {
      fixture_id: 12345,
      home_team: 'Real Madrid',
      away_team: 'Barcelona',
      home_team_logo: 'https://example.com/rm.png',
      away_team_logo: 'https://example.com/barca.png',
      kickoff_utc: '2026-06-25T20:00:00Z',
      bet_type: 'Over 2.5 Goals',
      probability: 0.75,
    };
    const result = normalizeQuantPrediction(input);
    expect(result.homeTeam).toBe('Real Madrid');
    expect(result.awayTeam).toBe('Barcelona');
    expect(result.homeTeamLogo).toBe('https://example.com/rm.png');
    expect(result.awayTeamLogo).toBe('https://example.com/barca.png');
    expect(result.id).toBe(12345);
    expect(result.prediction).toBe('Over 2.5 Goals');
    expect(result.confidence).toBe(75);
    expect(result.time).toBe('20:00');
  });

  it('generates id from team names when missing', () => {
    const input = {
      home_team: 'PSG',
      away_team: 'Lyon',
      bet_type: 'Home Win',
    };
    const result = normalizeQuantPrediction(input);
    expect(result.id).toBe('psg_lyon');
  });

  it('defaults status to pending when missing', () => {
    const input = { home_team: 'Team A', away_team: 'Team B' };
    const result = normalizeQuantPrediction(input);
    expect(result.status).toBe('pending');
  });

  it('defaults score and graded fields to empty strings', () => {
    const input = { home_team: 'Team A', away_team: 'Team B' };
    const result = normalizeQuantPrediction(input);
    expect(result.score).toBe('');
    expect(result.graded_at).toBe('');
    expect(result.graded_by).toBe('');
  });

  it('computes confidence from probability when confidence is missing', () => {
    const input = {
      home_team: 'Team A',
      away_team: 'Team B',
      probability: 0.82,
    };
    const result = normalizeQuantPrediction(input);
    expect(result.confidence).toBe(82);
  });

  it('uses existing confidence over probability', () => {
    const input = {
      home_team: 'Team A',
      away_team: 'Team B',
      confidence: 60,
      probability: 0.82,
    };
    const result = normalizeQuantPrediction(input);
    expect(result.confidence).toBe(60);
  });

  it('generates analysis text from ev_pct', () => {
    const input = {
      home_team: 'Team A',
      away_team: 'Team B',
      ev_pct: 12.5,
    };
    const result = normalizeQuantPrediction(input);
    expect(result.analysis_en).toContain('+12.5%');
    expect(result.analysis_en).toContain('Quant Engine');
  });
});
