
export type NavigationTab = 'home' | 'free' | 'vip' | 'guide' | 'profile' | 'admin' | 'kelly' | 'concierge' | 'stats' | 'results';

export type Language = 'en' | 'fr' | 'sw' | 'ha' | 'yo' | 'ig' | 'zu' | 'xh' | 'pt';

export type Sport = 'football' | 'basketball';

export interface Match {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
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
  vipExpiry?: string;
  vipPlan?: 'daily' | 'weekly' | 'monthly';
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
  accumulators?: AccumulatorSet;
  generatedAt: string;
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