
import { Match, TeamAsset, AccumulatorSet, DailyAnalysis, WinRateStats, UserProfile } from "../types";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, updateDoc, serverTimestamp, getCountFromServer, query, where, writeBatch } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";

// ─── IN-MEMORY CACHE WITH TTL ────────────────────────────────────────────────
// Prevents redundant Firestore reads when multiple components mount simultaneously.
// Task 3.2 from IMPLEMENTATION_PLAN: reduces costs by 60-80% on repeated page loads.
const _cache = new Map<string, { data: any; expires: number }>();

function cacheGet<T>(key: string): T | null {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) { _cache.delete(key); return null; }
    return entry.data as T;
}

function cacheSet(key: string, data: any, ttlMs: number): void {
    _cache.set(key, { data, expires: Date.now() + ttlMs });
}


// Return YYYY-MM-DD for Africa/Lagos (UTC+1)
export const getGlobalTodayKey = () => {
    const now = new Date();
    const lagosOffset = 60;
    const localMs = now.getTime() + (lagosOffset - now.getTimezoneOffset()) * 60000;
    const d = new Date(localMs);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Return YYYY-MM-DD for Yesterday (Africa/Lagos timezone)
export const getGlobalYesterdayKey = () => {
    const now = new Date();
    const lagosOffset = 60;
    const localMs = now.getTime() + (lagosOffset - now.getTimezoneOffset()) * 60000;
    const d = new Date(localMs);
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/** Helper to get a date key for N days ago (Africa/Lagos timezone) */
const getDateKeyDaysAgo = (daysAgo: number) => {
    const now = new Date();
    const lagosOffset = 60;
    const localMs = now.getTime() + (lagosOffset - now.getTimezoneOffset()) * 60000;
    const date = new Date(localMs);
    date.setDate(date.getDate() - daysAgo);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** 
 * Normalizes a raw prediction object from the Python quant_pipeline (snake_case)
 * into the camelCase shape expected by all React components.
 * EXPORTED so VIP.tsx and other pages can call the same canonical normalizer.
 */
export const normalizeQuantPrediction = (p: any): any => {
    if (!p) return p;
    // Already normalized (has homeTeam) — skip to avoid double-mapping
    if (p.homeTeam !== undefined) return p;

    return {
        ...p,
        // Core identity fields
        id: p.id ?? p.fixture_id ?? `${p.homeTeam || p.home_team || 'home'}_${p.awayTeam || p.away_team || 'away'}`.replace(/\s+/g, '-').toLowerCase(),
        homeTeam: p.home_team ?? '',
        awayTeam: p.away_team ?? '',
        homeTeamLogo: p.home_team_logo ?? '',
        awayTeamLogo: p.away_team_logo ?? '',
        league: p.league ?? '',
        // Time: prefer human-readable kickoff_local; fall back to kickoff_utc snippet
        time: p.time ?? p.kickoff_local ?? (p.kickoff_utc ? p.kickoff_utc.substring(11, 16) : ''),
        // Prediction labels expected by AccumulatorModal / FreePicks / Home
        prediction: p.prediction ?? p.bet_type ?? '',
        prediction_en: p.prediction_en ?? p.prediction ?? p.bet_type ?? '',
        prediction_fr: p.prediction_fr ?? p.prediction ?? p.bet_type ?? '',
        // Stats / form
        homeForm: p.homeForm ?? p.home_form ?? '',
        awayForm: p.awayForm ?? p.away_form ?? '',
        homeWinRate: p.homeWinRate ?? p.home_win_prob ?? null,
        awayWinRate: p.awayWinRate ?? p.away_win_prob ?? null,
        // Category / confidence
        category: p.category ?? 'value',
        confidence: p.confidence ?? (p.probability ? Math.round(p.probability * 100) : 0),
        // Analysis line expected in some card renderers
        analysis_en: p.analysis_en ?? `EV: +${p.ev_pct ?? 0}% | Model: Quant Engine`,
        analysis_fr: p.analysis_fr ?? `VE: +${p.ev_pct ?? 0}% | Modèle: Quant Engine`,
    };
};

export const getDailyData = async (dateStr: string): Promise<DailyAnalysis | null> => {
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const cacheKey = `daily_${dateStr}`;
    const cached = cacheGet<DailyAnalysis>(cacheKey);
    if (cached) return cached;

    try {
        let dailyAnalysis: any = null;
        let found = false;

        // 1. Fetch legacy or raw base data from daily_predictions (like rawFixtures)
        const docRef = doc(db, "daily_predictions", dateStr);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            dailyAnalysis = docSnap.data();
            found = true;
        } else {
            dailyAnalysis = { matches: [], rawFixtures: [], accumulators: null };
        }

        // 2. Fetch Quant specific predictions, and let them override the legacy predictions
        const quantDocRef = doc(db, "quant_predictions", dateStr);
        const quantDocSnap = await getDoc(quantDocRef);
        if (quantDocSnap.exists()) {
            const data = quantDocSnap.data();
            // The python script writes to 'predictions' instead of 'matches'
            // Normalize snake_case → camelCase so all components work correctly
            const rawPreds = data.predictions || dailyAnalysis.matches || [];
            dailyAnalysis.matches = rawPreds.map(normalizeQuantPrediction);
            if (data.accumulators) dailyAnalysis.accumulators = data.accumulators;
            found = true;
        }

        if (found) {
            const result = dailyAnalysis as DailyAnalysis;
            cacheSet(cacheKey, result, CACHE_TTL);
            return result;
        }
    } catch (e) {
        console.warn(`Firestore Fetch Error for ${dateStr}:`, e);
    }
    return null;
};


export const getPredictionsForDate = async (dateStr: string): Promise<Match[] | null> => {
    const data = await getDailyData(dateStr);
    return data ? data.matches : null;
};

export const getAccumulatorsForDate = async (dateStr: string): Promise<AccumulatorSet | null> => {
    const data = await getDailyData(dateStr);
    return data && data.accumulators ? data.accumulators : null;
};

export const savePredictionsForDate = async (dateStr: string, matches: Match[]): Promise<void> => {
    try {
        if (!auth.currentUser) return;

        // Use batch write for atomic updates to daily_predictions and quant_predictions
        const batch = writeBatch(db);

        const docRef = doc(db, "daily_predictions", dateStr);
        batch.set(docRef, {
            matches: matches,
            updatedAt: new Date().toISOString(),
            date: dateStr
        }, { merge: true });

        // Try to sync graded statuses to quant_predictions
        const quantRef = doc(db, "quant_predictions", dateStr);
        const quantSnap = await getDoc(quantRef);
        if (quantSnap.exists()) {
            const quantPreds: any[] = quantSnap.data()?.predictions || [];
            if (quantPreds.length > 0) {
                const statusMap: Record<string, { status: string; score?: string }> = {};
                matches.forEach((m: any) => {
                    const fid = String(m.fixture_id ?? m.id ?? '');
                    if (fid && m.status) statusMap[fid] = { status: m.status, score: m.score };
                });

                const updatedPreds = quantPreds.map((p: any) => {
                    const fid = String(p.fixture_id ?? p.id ?? '');
                    const override = statusMap[fid];
                    if (!override) return p;
                    return {
                        ...p,
                        status: override.status,
                        ...(override.score ? { score: override.score } : {}),
                        graded_at: new Date().toISOString(),
                    };
                });

                batch.set(quantRef, {
                    predictions: updatedPreds,
                    graded_at: new Date().toISOString(),
                }, { merge: true });
            }
        }

        await batch.commit();
        console.log(`Predictions successfully batch-updated for ${dateStr}.`);

        console.log(`Predictions successfully updated for ${dateStr}.`);
    } catch (e) {
        console.error("Firestore Save Error:", e);
        throw e;
    }
};

export const saveAccumulatorsForDate = async (dateStr: string, accumulators: AccumulatorSet): Promise<void> => {
    try {
        if (!auth.currentUser) return;
        const docRef = doc(db, "daily_predictions", dateStr);
        await setDoc(docRef, {
            accumulators: accumulators,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (e) {
        console.error("Firestore Accumulator Save Error:", e);
        throw e;
    }
};

export const getFirestorePredictionsOnly = async (): Promise<Match[] | null> => {
    return getPredictionsForDate(getGlobalTodayKey());
};

export const getTodaysPredictions = getFirestorePredictionsOnly;

export const saveTodaysPredictions = async (matches: Match[]): Promise<void> => {
    return savePredictionsForDate(getGlobalTodayKey(), matches);
};

export const saveDailyFixtures = async (dateStr: string, fixtures: Match[]): Promise<void> => {
    try {
        if (!auth.currentUser) return;
        const docRef = doc(db, "daily_predictions", dateStr);
        await setDoc(docRef, {
            rawFixtures: fixtures,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log(`Raw fixtures successfully updated for ${dateStr}.`);
    } catch (e) {
        console.error("Firestore Save Fixtures Error:", e);
    }
};

export const deleteTodaysPredictions = async (): Promise<void> => {
    const todayStr = getGlobalTodayKey();
    localStorage.removeItem(`vantage_cache_${todayStr}`);
    try {
        if (!auth.currentUser) return;
        await Promise.all([
            deleteDoc(doc(db, "daily_predictions", todayStr)),
            deleteDoc(doc(db, "quant_predictions", todayStr))
        ]);
        console.log("Firestore data cleared for today (both legacy and quant).");
    } catch (e: any) {
        if (e.code === 'permission-denied') {
            console.warn("[DB] Firestore delete denied. Local cache cleared only.");
        } else {
            console.error("Firestore Delete Error:", e);
        }
    }
};

// ─── BASKETBALL PREDICTIONS ──────────────────────────────────────────────────

/**
 * Reads today's basketball predictions from the 'basketball_predictions' Firestore collection.
 * The backend generates these via generateBasketballPredictionsServerSide().
 */
export const getTodaysBasketballPredictions = async (): Promise<Match[]> => {
    try {
        const todayStr = getGlobalTodayKey();
        const docRef = doc(db, "basketball_predictions", todayStr);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            return (data.matches as Match[]) || [];
        }
    } catch (e) {
        console.warn("[DB] Error fetching basketball predictions:", e);
    }
    return [];
};

/**
 * Saves basketball predictions to the 'basketball_predictions' Firestore collection.
 * Used by the frontend admin basketball generation flow.
 */
export const saveBasketballPredictions = async (matches: Match[]): Promise<void> => {
    try {
        if (!auth.currentUser) return;
        const todayStr = getGlobalTodayKey();
        const docRef = doc(db, "basketball_predictions", todayStr);
        await setDoc(docRef, {
            matches,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log(`[DB] Basketball predictions saved for ${todayStr}.`);
    } catch (e) {
        console.error("[DB] Basketball predictions save error:", e);
        throw e;
    }
};


// ─── WIN RATE STATS ──────────────────────────────────────────────────────────

/**
 * Calculates win rates from the last 30 days of graded predictions in Firestore.
 */
export const getWinRateStats = async (): Promise<WinRateStats> => {
    const defaultStats: WinRateStats = { daily: 0, weekly: 0, monthly: 0, streak: 0, todayWon: 0, todayTotal: 0 };
    const todayStr = getGlobalTodayKey();
    const cacheKey = `vantage_stats_cache_v2_${todayStr}`;

    // 1. Check Local Cache (0 reads)
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const { stats, timestamp } = JSON.parse(cached);
            // Cache valid for 2 hours
            if (Date.now() - timestamp < 2 * 60 * 60 * 1000) {
                return stats;
            }
        }
    } catch (e) {
        console.warn("Stats cache read error", e);
    }

    // 2. Check quant_performance/all — Python backend writes this doc after each grading run.
    // This is a SINGLE read vs 31 reads below. Saves ~$0.002 per user per refresh at scale.
    try {
        const perfDoc = await getDoc(doc(db, 'quant_performance', 'all'));
        if (perfDoc.exists()) {
            const d = perfDoc.data();
            // Only use if it was written for today (prevents using stale yesterday's stats)
            if (d.date === todayStr && d.stats) {
                const stats = d.stats as WinRateStats;
                localStorage.setItem(cacheKey, JSON.stringify({ stats, timestamp: Date.now() }));
                return stats;
            }
        }
    } catch (e) {
        console.warn('[Stats] quant_performance read failed, falling through to calculation:', e);
    }

    // 3. Check Global Firestore Cache (1 read instead of 31)
    try {
        const statsDoc = await getDoc(doc(db, "settings", "app_stats"));
        if (statsDoc.exists()) {
            const data = statsDoc.data();
            // We consider the global cache valid if it matches today
            if (data.date === todayStr && data.stats) {
                const stats = data.stats;
                localStorage.setItem(cacheKey, JSON.stringify({ stats, timestamp: Date.now() }));
                return stats as WinRateStats;
            }
        }
    } catch (e) {
        console.warn("Global stats read error", e);
    }

    // 3. Perform Heavy Calculation (31 reads - only happens if global cache is stale/missing)
    try {
        const results: { won: number; total: number }[] = [];

        // Fetch last 31 days (yesterday through 30 days ago)
        const fetchPromises = Array.from({ length: 31 }, (_, i) => {
            const dateKey = getDateKeyDaysAgo(i + 1); // start from yesterday
            return getPredictionsForDate(dateKey).then(matches => ({ dateKey, matches }));
        });
        const allDays = await Promise.all(fetchPromises);

        let streakActive = true;
        let streak = 0;
        let weekWon = 0, weekTotal = 0;
        let monthWon = 0, monthTotal = 0;
        let todayWon = 0, todayTotal = 0;
        let mostRecentDailyWon = 0, mostRecentDailyTotal = 0;
        let foundDaily = false;

        // Also check today's results
        const todayMatches = await getPredictionsForDate(getGlobalTodayKey());
        if (todayMatches) {
            const gradedToday = todayMatches.filter(m => m.status === 'won' || m.status === 'lost');
            gradedToday.forEach(m => {
                todayTotal++;
                if (m.status === 'won') todayWon++;
            });
        }

        allDays.forEach(({ matches }, index) => {
            if (!matches) return;

            // Strictly get ONLY matches that are finalized as won or lost (exclude void/pending)
            const graded = matches.filter(m => m.status === 'won' || m.status === 'lost');
            if (graded.length === 0) return;

            const won = graded.filter(m => m.status === 'won').length;
            const validTotal = graded.length;
            const isWinDay = (won / validTotal) >= 0.5;

            // Capture the first valid day with results as our "Daily" metric
            if (!foundDaily) {
                mostRecentDailyWon = won;
                mostRecentDailyTotal = validTotal;
                foundDaily = true;
            }

            // Streak = consecutive winning days from yesterday backward (ignoring empty days)
            if (streakActive && isWinDay) {
                streak++;
            } else {
                streakActive = false;
            }

            // Week Calculation: Days 1-7 backward
            if (index < 7) {
                weekWon += won;
                weekTotal += validTotal;
            }

            // Month Calculation: Days 1-30 backward
            monthWon += won;
            monthTotal += validTotal;

            results.push({ won, total: validTotal });
        });

        const daily = mostRecentDailyTotal > 0
            ? Math.round((mostRecentDailyWon / mostRecentDailyTotal) * 100)
            : 0;
        const weekly = weekTotal > 0 ? Math.round((weekWon / weekTotal) * 100) : 0;
        const monthly = monthTotal > 0 ? Math.round((monthWon / monthTotal) * 100) : 0;

        const stats: WinRateStats = { daily, weekly, monthly, streak, todayWon, todayTotal };

        localStorage.setItem(cacheKey, JSON.stringify({
            stats,
            timestamp: Date.now()
        }));

        // Attempt to save to global cache for all other users today
        if (auth.currentUser) {
            try {
                await setDoc(doc(db, "settings", "app_stats"), {
                    date: todayStr,
                    stats,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            } catch (e) {
                // Fails silently if user doesn't have write permissions (e.g. non-admin)
            }
        }

        return stats;
    } catch (e) {
        console.error("Failed to calculate win rate stats:", e);
        return defaultStats;
    }
};


// ─── TEAM ASSETS ──────────────────────────────────────────────────────────────

export const getTeamAssetsMap = async (): Promise<Record<string, string>> => {
    try {
        const snapshot = await getDocs(collection(db, "team_assets"));
        const assets: Record<string, string> = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            assets[doc.id] = data.logoUrl;
            if (data.name) assets[data.name.toLowerCase().trim()] = data.logoUrl;
        });
        return assets;
    } catch (e) {
        console.error("Failed to load team assets", e);
        return {};
    }
};

export const getAllTeamAssets = async (): Promise<TeamAsset[]> => {
    try {
        const snapshot = await getDocs(collection(db, "team_assets"));
        const list: TeamAsset[] = [];
        snapshot.forEach(doc => {
            list.push({ id: doc.id, ...doc.data() } as TeamAsset);
        });
        return list;
    } catch (e) {
        return [];
    }
};

export const saveTeamAsset = async (name: string, logoUrl: string) => {
    if (!auth.currentUser || !name || typeof name !== 'string') return;
    const normalized = name.toLowerCase().trim().replace(/\s+/g, '-');
    if (!normalized) return;
    try {
        await setDoc(doc(db, "team_assets", normalized), {
            name: name.trim(),
            logoUrl: logoUrl ? logoUrl.trim() : '',
            updatedAt: new Date().toISOString()
        });
    } catch (e) {
        console.warn(`[DB] Failed to save team asset for ${name}:`, e);
    }
};

export const deleteTeamAsset = async (id: string) => {
    if (!auth.currentUser) return;
    await deleteDoc(doc(db, "team_assets", id));
};

// ─── RESULTS HISTORY ─────────────────────────────────────────────────────────

export interface DayResult {
    date: string;
    matches: Match[];
    wonCount: number;
    lostCount: number;
    totalGraded: number;
}

export const getResultsHistory = async (days: number = 30): Promise<DayResult[]> => {
    const results: DayResult[] = [];
    const fetchPromises = Array.from({ length: days }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (i + 1));
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return getPredictionsForDate(dateKey).then(matches => ({ dateKey, matches }));
    });

    const allDays = await Promise.all(fetchPromises);
    allDays.forEach(({ dateKey, matches }) => {
        if (!matches || matches.length === 0) return;
        
        const graded = matches.filter(m => m.status === 'won' || m.status === 'lost');
        
        results.push({
            date: dateKey,
            matches: matches, // Return all matches so pending ones show up
            wonCount: graded.filter(m => m.status === 'won').length,
            lostCount: graded.filter(m => m.status === 'lost').length,
            totalGraded: graded.length,
        });
    });

    return results;
};

// ─── APP SETTINGS ─────────────────────────────────────────────────────────────

export interface AppSettings {
    whatsappGroupUrl?: string;
    telegramBotToken?: string;
    telegramChannelId?: string;
    telegramEnabled?: boolean;
    telegramSendTime?: string;      // HH:MM — time for daily predictions broadcast
    telegramLastSentAt?: string;    // ISO timestamp of last successful send
    telegramLastSentCount?: number; // Number of picks shown in last send
    referralRewardDays?: number; // Free VIP days granted per successful referral
    freePicksCount?: number;     // Number of picks shown to free users (default 2)
    annualPlanEnabled?: boolean;
    footballGenTime?: string;
    basketballGenTime?: string;
    blogGenTime?: string; // Daily time to generate AI SEO blog
    googleSiteVerificationTag?: string; // GSC Meta tag for injection
    gradingTime?: string;
    updatedAt?: string;
}

export const getAppSettings = async (): Promise<AppSettings> => {
    const SETTINGS_CACHE_KEY = 'app_settings';
    const cached = cacheGet<AppSettings>(SETTINGS_CACHE_KEY);
    if (cached) return cached;
    try {
        const snap = await getDoc(doc(db, "settings", "app"));
        if (snap.exists()) {
            const settings = snap.data() as AppSettings;
            cacheSet(SETTINGS_CACHE_KEY, settings, 10 * 60 * 1000); // 10-min TTL
            return settings;
        }
    } catch (e) {
        console.warn("Failed to load app settings", e);
    }
    return {};
};

export const saveAppSettings = async (settings: Partial<AppSettings>): Promise<void> => {
    if (!auth.currentUser) return;
    // Invalidate cache immediately so next read gets fresh data
    _cache.delete('app_settings');
    await setDoc(doc(db, "settings", "app"), {
        ...settings,
        updatedAt: new Date().toISOString(),
    }, { merge: true });
};

// ─── GENERATION LOCK (prevents concurrent Gemini calls by multiple users) ──────

/**
 * Tries to acquire a generation lock for today.
 * Returns true if lock was acquired (caller may proceed to generate).
 * Returns false if another client already holds the lock (caller should wait).
 */
export const acquireGenerationLock = async (todayKey: string): Promise<boolean> => {
    try {
        const lockRef = doc(db, "generation_locks", todayKey);
        const lockSnap = await getDoc(lockRef);

        if (lockSnap.exists()) {
            const data = lockSnap.data();
            // Allow re-acquiring if lock is stale (older than 10 minutes)
            const lockedAt = data.lockedAt?.toDate?.();
            if (lockedAt && Date.now() - lockedAt.getTime() < 10 * 60 * 1000) {
                return false; // Lock is fresh, another client is generating
            }
        }

        // Write our lock
        await setDoc(lockRef, {
            lockedAt: serverTimestamp(),
            lockedBy: auth.currentUser?.uid || 'anonymous',
        });
        return true;
    } catch (e) {
        // If we can't write the lock, assume we can proceed (fail open)
        console.warn('[Lock] Could not acquire generation lock:', e);
        return true;
    }
};

export const releaseGenerationLock = async (todayKey: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, "generation_locks", todayKey));
    } catch (e) {
        console.warn('[Lock] Could not release generation lock:', e);
    }
};

// ─── REFERRAL SYSTEM ──────────────────────────────────────────────────────────

/** Generate a unique referral code for a user (based on their UID). */
export const generateReferralCode = (uid: string): string => {
    return uid.slice(0, 6).toUpperCase();
};

/** Save the referral code to a user's Firestore profile. */
export const ensureReferralCode = async (uid: string): Promise<string> => {
    const code = generateReferralCode(uid);
    try {
        const userRef = doc(db, 'profiles', uid);
        await setDoc(userRef, { referralCode: code }, { merge: true });
    } catch (e) {
        console.warn('[Referral] Could not save referral code', e);
    }
    return code;
};

/** (Removed dangerous full-table scan recordReferral function) **/

// ─── USER PROFILE HELPERS ─────────────────────────────────────────────────────

export const getUserProfile = async (uid: string): Promise<Partial<UserProfile> | null> => {
    try {
        const snap = await getDoc(doc(db, 'profiles', uid));
        if (snap.exists()) return snap.data() as Partial<UserProfile>;
    } catch (e) {
        console.warn('[DB] getUserProfile error:', e);
    }
    return null;
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
    try {
        await setDoc(doc(db, 'profiles', uid), data, { merge: true });
    } catch (e) {
        console.error('[DB] updateUserProfile error:', e);
    }
};

// ─── USER COUNT ───────────────────────────────────────────────────────────────

export const getUserCount = async (): Promise<{ total: number; vip: number }> => {
    try {
        const coll = collection(db, 'profiles');
        const [totalSnap, vipSnap] = await Promise.all([
            getCountFromServer(coll),
            getCountFromServer(query(coll, where('isVip', '==', true)))
        ]);
        return { total: totalSnap.data().count, vip: vipSnap.data().count };
    } catch (e) {
        console.warn('getUserCount error', e);
        return { total: 0, vip: 0 };
    }
};
