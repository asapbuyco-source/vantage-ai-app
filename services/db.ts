
import { Match, TeamAsset, AccumulatorSet, DailyAnalysis, WinRateStats } from "../types";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";

// Return simple YYYY-MM-DD for the current client date
export const getGlobalTodayKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Return simple YYYY-MM-DD for Yesterday
export const getGlobalYesterdayKey = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/** Helper to get a date key for N days ago */
const getDateKeyDaysAgo = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const getDailyData = async (dateStr: string): Promise<DailyAnalysis | null> => {
    try {
        const docRef = doc(db, "daily_predictions", dateStr);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data() as DailyAnalysis;
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
        const docRef = doc(db, "daily_predictions", dateStr);
        await setDoc(docRef, {
            matches: matches,
            updatedAt: new Date().toISOString(),
            date: dateStr
        }, { merge: true });
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

export const saveTodaysPredictions = async (matches: Match[]): Promise<void> => {
    return savePredictionsForDate(getGlobalTodayKey(), matches);
};

export const deleteTodaysPredictions = async (): Promise<void> => {
    const todayStr = getGlobalTodayKey();
    localStorage.removeItem(`vantage_cache_${todayStr}`);
    try {
        if (!auth.currentUser) return;
        await deleteDoc(doc(db, "daily_predictions", todayStr));
        console.log("Firestore data cleared for today.");
    } catch (e: any) {
        if (e.code === 'permission-denied') {
            console.warn("[DB] Firestore delete denied. Local cache cleared only.");
        } else {
            console.error("Firestore Delete Error:", e);
        }
    }
};

// ─── WIN RATE STATS ──────────────────────────────────────────────────────────

/**
 * Calculates win rates from the last 30 days of graded predictions in Firestore.
 */
export const getWinRateStats = async (): Promise<WinRateStats> => {
    const defaultStats: WinRateStats = { daily: 0, weekly: 0, monthly: 0, streak: 0, todayWon: 0, todayTotal: 0 };

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

        // Also check today's results
        const todayMatches = await getPredictionsForDate(getGlobalTodayKey());
        if (todayMatches) {
            todayMatches.filter(m => m.status && m.status !== 'pending').forEach(m => {
                todayTotal++;
                if (m.status === 'won') todayWon++;
            });
        }

        allDays.forEach(({ matches }, index) => {
            if (!matches) return;
            const graded = matches.filter(m => m.status && m.status !== 'pending');
            if (graded.length === 0) return;

            const won = graded.filter(m => m.status === 'won').length;
            const isWinDay = won / graded.length >= 0.5;

            // Streak = consecutive winning days from yesterday backward
            if (streakActive && isWinDay) {
                streak++;
            } else {
                streakActive = false;
            }

            if (index < 7) {
                weekWon += won;
                weekTotal += graded.length;
            }
            monthWon += won;
            monthTotal += graded.length;

            results.push({ won, total: graded.length });
        });

        const daily = results.length > 0
            ? Math.round((results[0].won / results[0].total) * 100)
            : 0;
        const weekly = weekTotal > 0 ? Math.round((weekWon / weekTotal) * 100) : 0;
        const monthly = monthTotal > 0 ? Math.round((monthWon / monthTotal) * 100) : 0;

        return { daily, weekly, monthly, streak, todayWon, todayTotal };
    } catch (e) {
        console.error("Failed to calculate win rate stats:", e);
        return defaultStats;
    }
};

// ─── BASKETBALL PREDICTIONS ───────────────────────────────────────────────────

const getBasketballKey = (dateStr: string) => `basketball_${dateStr}`;

export const getTodaysBasketballPredictions = async (): Promise<Match[] | null> => {
    try {
        const key = getBasketballKey(getGlobalTodayKey());
        const docRef = doc(db, "daily_predictions", key);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data();
            return data.matches || null;
        }
        return null;
    } catch (e) {
        console.warn("Failed to fetch basketball predictions:", e);
        return null;
    }
};

export const saveBasketballPredictions = async (matches: Match[]): Promise<void> => {
    try {
        if (!auth.currentUser) return;
        const key = getBasketballKey(getGlobalTodayKey());
        await setDoc(doc(db, "daily_predictions", key), {
            matches,
            sport: 'basketball',
            updatedAt: new Date().toISOString(),
            date: getGlobalTodayKey()
        }, { merge: true });
        console.log("Basketball predictions saved.");
    } catch (e) {
        console.error("Basketball save error:", e);
        throw e;
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
    if (!auth.currentUser) return;
    const normalized = name.toLowerCase().trim().replace(/\s+/g, '-');
    await setDoc(doc(db, "team_assets", normalized), {
        name: name.trim(),
        logoUrl: logoUrl.trim(),
        updatedAt: new Date().toISOString()
    });
};

export const deleteTeamAsset = async (id: string) => {
    if (!auth.currentUser) return;
    await deleteDoc(doc(db, "team_assets", id));
};
