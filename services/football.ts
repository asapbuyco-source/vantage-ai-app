
export interface SimpleFixture {
  id: string; 
  league: string;
  homeTeam: string;
  awayTeam: string;
  time: string; // HH:MM
  homeLogo?: string;
  awayLogo?: string;
  source: 'TheSportsDB' | 'Football-Data' | 'API-Football' | 'Fallback';
  timestamp?: number; // For sorting
}

// Global error tracker for Admin Dashboard
export let lastApiError: string | null = null;

// --- DIAGNOSTICS & HELPERS ONLY ---
// The actual fetching logic has been moved to Gemini Grounding (services/gemini.ts)
// This file now serves mainly as a type definition holder or for diagnostics if needed in future.

export const checkDataSources = async (dateStr: string): Promise<any[]> => {
    // Deprecated diagnostic function
    return [{ name: "Legacy APIs", status: "DISABLED", matchCount: 0, latency: 0 }];
};

export const fetchDailyFixtures = async (dateStr: string, limit: number = 30, signal?: AbortSignal): Promise<SimpleFixture[]> => {
  // Return empty - we want the Orchestrator to use Gemini Search
  console.warn("[Football Service] Legacy API fetch called. Returning empty to force Gemini Search.");
  return [];
};
