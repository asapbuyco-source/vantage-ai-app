import { Match } from './types';

/** Popular clubs — always shown first in lists (big-team priority). */
const BIG_TEAMS = [
  // England
  'manchester united', 'manchester city', 'man united', 'man city',
  'liverpool', 'chelsea', 'arsenal', 'tottenham', 'spurs', 'newcastle', 'aston villa',
  // Spain
  'barcelona', 'real madrid', 'atletico madrid', 'atlético madrid', 'atlético de madrid', 'sevilla', 'real betis', 'valencia',
  // Germany
  'bayern', 'borussia dortmund', 'dortmund', 'rb leipzig', 'bayer leverkusen',
  // France
  'paris saint-germain', 'psg', 'marseille', 'lyon', 'monaco',
  // Italy
  'juventus', 'inter milan', 'internazionale', 'ac milan', 'napoli', 'roma', 'lazio',
  // Portugal / Netherlands
  'benfica', 'porto', 'sporting', 'ajax', 'psv', 'feyenoord',
  // Africa
  'al ahly', 'zamalek', 'esperance', 'espérance', 'raja', 'wydad', 'mamelodi', 'kaizer',
  // South America
  'flamengo', 'palmeiras', 'corinthians', 'sao paulo', 'são paulo', 'santos', 'botafogo', 'fluminense', 'vasco', 'gremio', 'grêmio',
  'boca juniors', 'river plate', 'racing club',
  // Mexico / North America
  'club america', 'club américa', 'américa', 'chivas', 'guadalajara', 'cruz azul', 'monterrey', 'tigres', 'pumas', 'toluca', 'inter miami', 'la galaxy',
  // Middle East
  'al hilal', 'al nassr', 'al ittihad', 'al ahli',
];

export const isBigTeam = (name: unknown): boolean => {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  return BIG_TEAMS.some(t => n.includes(t));
};

/** 0 = match involves a big/popular club, 1 = small teams. Lower sorts first. */
export const bigTeamRank = (match: Match): number => {
  const home = match.homeTeam || match.home_team || '';
  const away = match.awayTeam || match.away_team || '';
  return (isBigTeam(home) || isBigTeam(away)) ? 0 : 1;
};

/** vipExpiry is stored as an ISO string (legacy / backend) or a Firestore Timestamp (new grants).
 *  This normalizes either into a Date, or null if missing/invalid. */
export const parseVipExpiry = (expiry: unknown): Date | null => {
  if (!expiry) return null;
  try {
    if (typeof expiry === 'object' && expiry !== null && typeof (expiry as any).toDate === 'function') {
      return (expiry as any).toDate() as Date;
    }
    if (typeof expiry === 'string') {
      const d = new Date(expiry);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {
    return null;
  }
  return null;
};

export interface ProbPick {
  name: string;
  prob: number;
}

export const getTopProbPicks = (match: Match): ProbPick[] => {
  const markets = [
    // 0.5 and 4.5 lines removed — they are near-certain / near-impossible and make
    // worthless "picks" (odds ~1.02 or a near-miss). Keep meaningful lines only.
    { name: 'Over 1.5 Goals', prob: match.over15_prob ?? 0 },
    { name: 'Over 2.5 Goals', prob: match.over25_prob ?? 0 },
    { name: 'Over 3.5 Goals', prob: match.over35_prob ?? 0 },
    { name: 'Under 1.5 Goals', prob: match.under15_prob ?? 0 },
    { name: 'Under 2.5 Goals', prob: match.under25_prob ?? 0 },
    { name: 'Under 3.5 Goals', prob: match.under35_prob ?? 0 },
    { name: 'BTTS', prob: match.btts_prob ?? 0 },
    { name: 'Home Win', prob: match.home_win_prob ?? 0 },
    { name: 'Draw', prob: match.draw_prob ?? 0 },
    { name: 'Away Win', prob: match.away_win_prob ?? 0 },
    { name: 'DC 1X', prob: match.double_chance_1x ?? 0 },
    { name: 'DC X2', prob: match.double_chance_x2 ?? 0 },
    { name: 'DC 12', prob: match.double_chance_12 ?? 0 },
    { name: '1H Over 1.5', prob: match.fh_over15_prob ?? 0 },
    { name: '1H BTTS', prob: match.fh_btts_prob ?? 0 },
  ];

  // Sort by probability descending
  markets.sort((a, b) => b.prob - a.prob);

  if (markets.length === 0 || markets[0].prob === 0) {
    return [];
  }

  return [markets[0]];
};

/**
 * Plain-language market names for non-technical users.
 * "Double Chance (1X)" → "Home or Draw", "FH Over 0.5" → "1st-Half Goal".
 */
export const plainMarket = (market: string, language: string = 'en'): string => {
  if (!market) return market;
  const m = market.toLowerCase();
  const pick = (fr: string, en: string, es: string, pt: string) =>
    language === 'fr' ? fr : language === 'es' ? es : language === 'pt' ? pt : en;
  const dec = (n: string) => (language === 'fr' || language === 'es' || language === 'pt') ? n.replace('.', ',') : n;
  if (m === 'double chance (1x)' || m === 'double chance 1x') return pick('Domicile ou Nul', 'Home or Draw', 'Local o Empate', 'Casa ou Empate');
  if (m === 'double chance (x2)' || m === 'double chance x2') return pick('Nul ou Extérieur', 'Draw or Away', 'Empate o Visitante', 'Empate ou Fora');
  if (m === 'double chance (12)' || m === 'double chance 12') return pick('Domicile ou Extérieur', 'Home or Away', 'Local o Visitante', 'Casa ou Fora');
  if (m === 'btts' || m.includes('both teams to score') && !m.includes('no')) return pick('Les deux marquent', 'Both Teams Score', 'Ambos Anotan', 'Ambas Marcam');
  if (m.includes('btts no')) return pick('Une équipe ne marque pas', 'One Team Fails to Score', 'Un equipo no anota', 'Um time não marca');
  if (m === 'draw no bet (home)') return pick('Victoire Domicile (nul remboursé)', 'Home Win (draw refunds)', 'Gana Local (empate reembolsa)', 'Vitória Casa (empate reembolsa)');
  if (m === 'draw no bet (away)') return pick('Victoire Extérieur (nul remboursé)', 'Away Win (draw refunds)', 'Gana Visitante (empate reembolsa)', 'Vitória Fora (empate reembolsa)');
  if (m.includes('fh over 0.5')) return pick('But 1ère MT', '1st-Half Goal', 'Gol 1ª Parte', 'Gol 1º Tempo');
  if (m.includes('fh over 1.5')) return pick('Plus de 1,5 en 1ère MT', '1st-Half Over 1.5', 'Más de 1.5 en 1ª Parte', 'Mais de 1.5 no 1º Tempo');
  if (m.includes('fh btts')) return pick('1ère MT : Les deux marquent', '1st-Half: Both Score', '1ª Parte: Ambos Anotan', '1º Tempo: Ambas Marcam');
  if (m === 'home win') return pick('Victoire Domicile', 'Home Win', 'Gana Local', 'Vitória Casa');
  if (m === 'away win') return pick('Victoire Extérieur', 'Away Win', 'Gana Visitante', 'Vitória Fora');
  if (m === 'draw') return pick('Match Nul', 'Draw', 'Empate', 'Empate');
  const overMatch = m.match(/^over (\d+(?:\.\d+)?) goals?$/);
  if (overMatch) return pick(`Plus de ${dec(overMatch[1])} buts`, `Over ${overMatch[1]} goals`, `Más de ${dec(overMatch[1])} goles`, `Mais de ${dec(overMatch[1])} gols`);
  const underMatch = m.match(/^under (\d+(?:\.\d+)?) goals?$/);
  if (underMatch) return pick(`Moins de ${dec(underMatch[1])} buts`, `Under ${underMatch[1]} goals`, `Menos de ${dec(underMatch[1])} goles`, `Menos de ${dec(underMatch[1])} gols`);
  const overShort = m.match(/^over (\d+(?:\.\d+)?)$/);
  if (overShort) return pick(`Plus de ${dec(overShort[1])}`, `Over ${overShort[1]}`, `Más de ${dec(overShort[1])}`, `Mais de ${dec(overShort[1])}`);
  const underShort = m.match(/^under (\d+(?:\.\d+)?)$/);
  if (underShort) return pick(`Moins de ${dec(underShort[1])}`, `Under ${underShort[1]}`, `Menos de ${dec(underShort[1])}`, `Menos de ${dec(underShort[1])}`);
  return market;
};

export const getPrimaryPredictionText = (match: Match, language: string): string => {
  const topPicks = getTopProbPicks(match);
  if (topPicks.length > 0) {
    return topPicks.map(p => `${plainMarket(p.name, language)} ${Math.round(p.prob * 100)}%`).join(' / ');
  }
  if (language === 'fr') return match.prediction_fr || match.prediction_en || match.prediction || '';
  return match.prediction_en || match.prediction || '';
};

export const getTopPickText = (match: Match): string => {
  const picks = getTopProbPicks(match);
  if (picks.length > 0) return `${picks[0].name} ${Math.round(picks[0].prob * 100)}%`;
  return match.prediction_en || match.prediction || '';
};

/**
 * Canonical language-aware label for a match's stored prediction field.
 * French users get the French label with a fallback to English/base value
 * (legacy or custom bet types often lack prediction_fr).
 */
export const getPredictionLabel = (match: Match, language: string): string => {
  if (language === 'fr') return match.prediction_fr || match.prediction_en || match.prediction || '';
  return match.prediction_en || match.prediction || '';
};

export const getPrimaryPredictionProb = (match: Match): number => {
  const topPicks = getTopProbPicks(match);
  if (topPicks.length > 0) {
    return Math.round(topPicks[0].prob * 100);
  }
  return match.confidence || 0;
};

export interface SmartBadge {
  icon: string;
  text: string;
  color: string;
  reason: string;
}

export const getSmartBadges = (match: any): SmartBadge[] => {
  const badges: SmartBadge[] = [];

  // Sharp Money signal
  if (match.line_signal === 'sharp_money_agrees' && Math.abs(match.line_shift || 0) > 0.02) {
    badges.push({
      icon: '📈',
      text: 'Sharp Money',
      color: 'text-emerald-400 bg-emerald-500/10',
      reason: 'Professional money moved this line in our favor',
    });
  }
  if (match.line_signal === 'sharp_money_disagrees' && Math.abs(match.line_shift || 0) > 0.04) {
    badges.push({
      icon: '📉',
      text: 'Sharp Fade',
      color: 'text-rose-400 bg-rose-500/10',
      reason: 'Smart money moved AGAINST this pick — confidence reduced',
    });
  }

  // Fatigue risk — use pre-calculated backend field first
  const fatigueRisk = match.fatigue_risk;
  if (fatigueRisk && fatigueRisk !== 'none') {
    const homeRest = match.home_days_rest ?? 7;
    const awayRest = match.away_days_rest ?? 7;
    const rest = Math.min(homeRest, awayRest);
    const tiredTeam = fatigueRisk === 'home'
      ? (match.home_team || match.homeTeam)
      : fatigueRisk === 'away'
        ? (match.away_team || match.awayTeam)
        : 'Both teams';
    badges.push({
      icon: '😴',
      text: `${tiredTeam}: ${rest}d rest`,
      color: 'text-amber-400 bg-amber-500/10',
      reason: 'Team played recently — fatigue may affect performance',
    });
  } else {
    // Fallback: compute from raw rest days
    const homeRest = match.home_days_rest ?? 7;
    const awayRest = match.away_days_rest ?? 7;
    if (homeRest < 4 || awayRest < 4) {
      const tiredTeam = homeRest < awayRest ? (match.home_team || match.homeTeam) : (match.away_team || match.awayTeam);
      const rest = Math.min(homeRest, awayRest);
      badges.push({
        icon: '😴',
        text: `${tiredTeam}: ${rest}d rest`,
        color: 'text-amber-400 bg-amber-500/10',
        reason: 'Team played recently — fatigue may affect performance',
      });
    }
  }

  // Injury risk
  const injuryRisk = match.injury_risk;
  if (injuryRisk && injuryRisk !== 'none') {
    const homeSidelined = match.home_sidelined_count ?? 0;
    const awaySidelined = match.away_sidelined_count ?? 0;
    const count = injuryRisk === 'home' ? homeSidelined : injuryRisk === 'away' ? awaySidelined : Math.max(homeSidelined, awaySidelined);
    const team = injuryRisk === 'home'
      ? (match.home_team || match.homeTeam)
      : injuryRisk === 'away'
        ? (match.away_team || match.awayTeam)
        : 'Both teams';
    badges.push({
      icon: '🚑',
      text: `${count} out (${team === 'Both teams' ? 'Both' : team})`,
      color: 'text-red-400 bg-red-500/10',
      reason: `${count} key players sidelined — squad strength reduced`,
    });
  }

  // BTTS blanking risk
  if (match.btts_blanking_risk) {
    badges.push({
      icon: '🚫',
      text: 'Low scoring',
      color: 'text-rose-400 bg-rose-500/10',
      reason: match.btts_blanking_reason || 'One team averages under 0.8 goals',
    });
  }

  // Weather risk
  if (match.weather === 'windy') {
    badges.push({
      icon: '🌬️',
      text: 'High Wind',
      color: 'text-blue-400 bg-blue-500/10',
      reason: 'High wind speeds may suppress goals — Under 2.5 more likely',
    });
  } else if (match.weather === 'rainy') {
    badges.push({
      icon: '🌧️',
      text: 'Heavy Rain',
      color: 'text-blue-400 bg-blue-500/10',
      reason: 'Rain conditions may slow play and reduce goals',
    });
  }

  // Upset alert
  if (match.upset_alert) {
    badges.push({
      icon: '⚡',
      text: 'Upset Alert',
      color: 'text-purple-400 bg-purple-500/10',
      reason: 'Model identified a high-value away win upset opportunity',
    });
  }

  return badges;
};

