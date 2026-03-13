
export type NavigationTab = 'home' | 'free' | 'vip' | 'guide' | 'profile' | 'admin' | 'kelly' | 'concierge' | 'stats' | 'results' | 'live';

export type Language = 'en' | 'fr';

export type Sport = 'football' | 'basketball';

export interface Match {
  id: string;
  league: string;
  leagueId?: number;
  seasonId?: number;
  fixtureId?: number;
  homeTeam: string;
  homeTeamId?: number;
  awayTeam: string;
  awayTeamId?: number;
  time: string;
  prediction: string; // Fallback
  prediction_en?: string;
  prediction_fr?: string;
  confidence: number;
  odds: number;
  category: 'safe' | 'value' | 'risky';
  analysis?: string; // Fallback
  analysis_en?: string;
  analysis_fr?: string;
  isLive?: boolean;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  sport?: Sport;
  // Grading Fields
  status?: 'won' | 'lost' | 'void' | 'pending';
  score?: string; // e.g. "2-1"
  // Match Details / AI Generated Stats
  homeForm?: string;
  awayForm?: string;
  homeWinRate?: number;
  awayWinRate?: number;
  homeAvgScored?: number;
  awayAvgScored?: number;
  homeAvgConceded?: number;
  awayAvgConceded?: number;
  homeCleanSheetRate?: number;
  awayCleanSheetRate?: number;
  h2hHomeWins?: number;
  h2hAwayWins?: number;
  h2hDraws?: number;
  h2hLast5Goals?: string;
  homeInjured?: string[];
  awayInjured?: string[];
}

// ── Live Match (from SportMonks /livescores — stored in Firestore live_scores/{date}/matches) ────
export interface LiveEvent {
  id: number;
  type: string;           // e.g. 'goal', 'yellowcard', 'redcard', 'substitution'
  name: string;
  playerName?: string;
  minute: number;
  teamId?: number;
}

export interface LiveMatch {
  id: string;             // fixture ID (string)
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeTeamId?: number;
  awayTeamId?: number;
  homeScore: number;
  awayScore: number;
  league: string;
  leagueId?: number;
  stateShort: string;     // e.g. '1H', 'HT', '2H', 'FT'
  stateLong: string;      // e.g. 'First Half', 'Half Time'
  minute: number;         // elapsed minutes
  events: LiveEvent[];
  updatedAt?: string;
}

// ── Pre-Match News (from SportMonks /news/pre-match — stored in Firestore match_news/{date}) ────
export interface MatchNews {
  id: number;
  fixtureId: number;
  leagueId?: number;
  title: string;
  type: string;           // e.g. 'preview', 'injury'
}

export interface AccumulatorSet {
  safe: string[]; // Array of Match IDs
  medium: string[];
  high: string[];
}

export interface UserStats {
  balance: number;
  totalWon: number;
  winRate: number;
  membership: 'Free' | 'VIP';
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  isVip: boolean;
  isAdmin?: boolean;
  isBlocked?: boolean;
  country?: string;
  vipExpiry?: string;
  vipPlan?: 'daily' | 'weekly' | 'monthly' | 'annual';
  totalPaid?: number;
  createdAt?: string;
  // Referral System
  referralCode?: string;
  referredBy?: string; // UID of the referrer
  referralCount?: number;
  referralEarnings?: number; // Current Available Balance
  lifetimeEarnings?: number; // Total accumulated over time
}

export interface PayoutRequest {
  id: string;
  userId: string;
  userEmail: string;
  amount: number;
  status: 'pending' | 'paid' | 'rejected';
  date: string;
  phoneNumber: string; // MOMO/OM number
  paymentMethod: string;
}

export interface BettingHistoryItem {
  id: string;
  match: string;
  prediction: string;
  status: 'won' | 'lost' | 'pending';
  amount: number;
  date: string;
}

export interface DailyAnalysis {
  date: string;
  matches: Match[];
  rawFixtures?: Match[];
  accumulators?: AccumulatorSet;
  generatedAt?: string;
}

export interface TeamAsset {
  id: string; // Normalized ID (lowercase)
  name: string; // Display Name
  logoUrl: string;
}

export interface WinRateStats {
  daily: number;
  weekly: number;
  monthly: number;
  streak: number;       // consecutive win streak
  todayWon: number;
  todayTotal: number;
}

export interface SavedPick {
  id: string;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  confidence: number;
  odds: number;
  league: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  sport?: Sport;
  savedAt: string;
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}