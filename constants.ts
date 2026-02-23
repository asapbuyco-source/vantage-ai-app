
import { Match, UserStats, BettingHistoryItem } from './types';

export const FEATURED_MATCH: Match = {
  id: 'feat-1',
  league: 'Premier League',
  homeTeam: 'Man City',
  awayTeam: 'Arsenal',
  time: '20:00',
  prediction: 'Man City Gagne',
  confidence: 88,
  odds: 2.10,
  category: 'safe',
  isLive: true,
  homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg',
  awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg'
};

export const FREE_MATCHES: Match[] = [
  {
    id: 'free-1',
    league: 'La Liga',
    homeTeam: 'Real Madrid',
    awayTeam: 'Girona',
    time: '18:30',
    prediction: 'Plus de 2.5 Buts',
    confidence: 82,
    odds: 1.65,
    category: 'safe',
    homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg',
    awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/9/90/Girona_FC_Badge.svg'
  },
  {
    id: 'free-2',
    league: 'Serie A',
    homeTeam: 'Inter Milan',
    awayTeam: 'Napoli',
    time: '20:45',
    prediction: 'Inter Milan Gagne',
    confidence: 75,
    odds: 1.95,
    category: 'value',
    homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/commons/0/05/FC_Internazionale_Milano_2021.svg',
    awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/commons/2/2d/SSC_Napoli_2024_%28logo%29.svg'
  },
  {
    id: 'free-3',
    league: 'Ligue 1',
    homeTeam: 'PSG',
    awayTeam: 'Lyon',
    time: '19:00',
    prediction: 'PSG -1 Handicap',
    confidence: 79,
    odds: 1.80,
    category: 'value',
    homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/a/a7/Paris_Saint-Germain_F.C..svg',
    awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/c/c6/Olympique_Lyonnais.svg'
  }
];

export const VIP_MATCHES_LOCKED: Match[] = [
  {
    id: 'vip-1',
    league: 'Champions League',
    homeTeam: 'Bayern',
    awayTeam: 'Barca',
    time: '21:00',
    prediction: 'SECRET VIP',
    confidence: 94,
    odds: 2.45,
    category: 'risky',
    homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/commons/1/1b/FC_Bayern_München_logo_%282017%29.svg',
    awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg'
  },
  {
    id: 'vip-2',
    league: 'Europa League',
    homeTeam: 'Liverpool',
    awayTeam: 'Bayer L.',
    time: '21:00',
    prediction: 'SECRET VIP',
    confidence: 91,
    odds: 3.10,
    category: 'risky',
    homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg',
    awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/5/59/Bayer_04_Leverkusen_logo.svg'
  }
];

export const USER_STATS: UserStats = {
  balance: 0,
  totalWon: 154000,
  winRate: 78,
  membership: 'Free'
};

export const HISTORY: BettingHistoryItem[] = [
  { id: 'h1', match: 'Chelsea vs Spurs', prediction: 'Chelsea Win', status: 'won', amount: 5000, date: 'Hier' },
  { id: 'h2', match: 'Barca vs Real', prediction: 'Over 3.5', status: 'lost', amount: 2000, date: 'Hier' },
  { id: 'h3', match: 'Juve vs Milan', prediction: 'Draw', status: 'won', amount: 10000, date: '02 Oct' },
];
