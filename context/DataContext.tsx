import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { Match, AccumulatorSet, WinRateStats } from '../types';
import {
    deleteTodaysPredictions, getGlobalTodayKey,
    saveTodaysPredictions, saveAccumulatorsForDate,
    getDailyData, getWinRateStats, getTodaysBasketballPredictions, saveBasketballPredictions,
} from '../services/db';
import { generateSmartAccumulators } from '../services/gemini';
import { useAuth } from './AuthContext';

interface DataContextType {
    activeDate: string;
    predictions: Match[];
    rawFixtures: Match[];
    accumulators: AccumulatorSet | null;
    basketballPredictions: Match[];
    winRateStats: WinRateStats;
    loading: boolean;
    isSystemGenerating: boolean;
    isBasketballGenerating: boolean;
    setIsSystemGenerating: (val: boolean) => void;
    setIsBasketballGenerating: (val: boolean) => void;
    refreshData: () => Promise<void>;
    generateData: () => Promise<void>;
    generateAccumulators: () => Promise<void>;
    generateBasketballData: () => Promise<void>;
    clearData: () => Promise<void>;
    cancelAnalysis: () => void;
    systemError: string | null;
}

const DEFAULT_WIN_RATES: WinRateStats = { daily: 0, weekly: 0, monthly: 0, streak: 0, todayWon: 0, todayTotal: 0 };

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user, loading: authLoading, isAdmin } = useAuth();
    const [activeDate, setActiveDate] = useState<string>(getGlobalTodayKey());
    const [predictions, setPredictions] = useState<Match[]>([]);
    const [rawFixtures, setRawFixtures] = useState<Match[]>([]);
    const [accumulators, setAccumulators] = useState<AccumulatorSet | null>(null);
    const [basketballPredictions, setBasketballPredictions] = useState<Match[]>([]);
    const [winRateStats, setWinRateStats] = useState<WinRateStats>(DEFAULT_WIN_RATES);
    const [loading, setLoading] = useState(true);
    const [isSystemGenerating, setIsSystemGenerating] = useState(false);
    const [isBasketballGenerating, setIsBasketballGenerating] = useState(false);
    const [systemError, setSystemError] = useState<string | null>(null);

    const fetchPromiseRef = useRef<Promise<void> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const cancelAnalysis = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            if (mountedRef.current) {
                setIsSystemGenerating(false);
                setLoading(false);
            }
            fetchPromiseRef.current = null;
        }
    };

    // ─── READ-ONLY DATA FETCH ─────────────────────────────────────────────────────
    // This function only reads from Firestore. It never triggers generation.
    // Data generation is the sole responsibility of:
    //   1. The backend scheduler (runs at 8am Africa/Lagos time)
    //   2. The admin manual trigger buttons in the Admin panel
    // This prevents empty fixture fetches when users visit before 8am.
    const fetchFromDB = async (bypassCache = false) => {
        if (!user) { setLoading(false); return; }
        if (fetchPromiseRef.current && !bypassCache) return fetchPromiseRef.current;

        // Check if viewing a specific date via the URL
        let targetDate = getGlobalTodayKey();
        const dateMatch = window.location.pathname.match(/^\/predictions\/(\d{4}-\d{2}-\d{2})$/);
        if (dateMatch) {
            targetDate = dateMatch[1];
        }

        setActiveDate(targetDate);
        const isToday = targetDate === getGlobalTodayKey();

        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        fetchPromiseRef.current = (async () => {
            if (mountedRef.current) { setLoading(true); setSystemError(null); }

            try {
                const dailyData = await getDailyData(targetDate);

                if (signal.aborted) return;

                if (dailyData && dailyData.matches && dailyData.matches.length > 0) {
                    if (mountedRef.current) {
                        setPredictions(dailyData.matches);
                        setRawFixtures(dailyData.rawFixtures || []);
                        setAccumulators(dailyData.accumulators || null);
                    }
                } else {
                    // No data available yet — backend scheduler hasn't run (before 8am)
                    // or it's a past date with no data. Show empty state in UI.
                    if (mountedRef.current) {
                        setPredictions([]);
                        setRawFixtures([]);
                        setAccumulators(null);
                    }
                }

                // Load basketball predictions passively (read-only)
                if (isToday) {
                    const bball = await getTodaysBasketballPredictions();
                    if (mountedRef.current) setBasketballPredictions(bball || []);
                } else {
                    if (mountedRef.current) setBasketballPredictions([]);
                }

            } catch (e) {
                if (mountedRef.current) setSystemError((e as Error).message);
            } finally {
                if (mountedRef.current && !signal.aborted) {
                    setLoading(false);
                }
                fetchPromiseRef.current = null;
            }
        })();

        return fetchPromiseRef.current;
    };

    // Fetch real win rate stats after predictions load
    const refreshWinRates = useCallback(async () => {
        if (!user) return;
        try {
            const stats = await getWinRateStats();
            if (mountedRef.current) setWinRateStats(stats);
        } catch (e) {
            console.warn("Win rate stats unavailable:", e);
        }
    }, [user]);

    // Admin-only: force a fresh DB read after triggering backend generation
    const generateData = async () => {
        await fetchFromDB(true);
    };

    const generateAccumulators = async () => {
        if (!predictions || predictions.length === 0) {
            throw new Error("Cannot generate accumulators without matches.");
        }
        if (mountedRef.current) setIsSystemGenerating(true);
        try {
            const accs = await generateSmartAccumulators(predictions);
            await saveAccumulatorsForDate(getGlobalTodayKey(), accs);
            if (mountedRef.current) setAccumulators(accs);
        } catch (e: any) {
            if (mountedRef.current) setSystemError(e.message);
        } finally {
            if (mountedRef.current) setIsSystemGenerating(false);
        }
    };

    // Basketball generation is now handled by the Admin panel calling the backend directly.
    // The client just re-reads from DB after the backend writes.
    const generateBasketballData = async () => {
        if (!isAdmin) return;
        await fetchFromDB(true);
    };

    const clearData = async () => {
        cancelAnalysis();
        if (mountedRef.current) { setLoading(true); setPredictions([]); setRawFixtures([]); setAccumulators(null); }
        try {
            await deleteTodaysPredictions();
            if (mountedRef.current) { setSystemError(null); setLoading(false); }
        } catch (e) {
            if (mountedRef.current) setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && user) {
            // On login: only READ from Firestore. Never trigger generation.
            // Data comes from the backend scheduler (8am) or admin manual trigger.
            fetchFromDB(false);
            refreshWinRates();
        } else if (!authLoading && !user) {
            setPredictions([]);
            setAccumulators(null);
            setBasketballPredictions([]);
            setWinRateStats(DEFAULT_WIN_RATES);
            setLoading(false);
        }
    }, [authLoading, user]);

    return (
        <DataContext.Provider value={{
            activeDate,
            predictions,
            rawFixtures,
            accumulators,
            basketballPredictions,
            winRateStats,
            loading,
            isSystemGenerating,
            isBasketballGenerating,
            setIsSystemGenerating,
            setIsBasketballGenerating,
            refreshData: () => fetchFromDB(false),
            generateData,
            generateAccumulators,
            generateBasketballData,
            clearData,
            cancelAnalysis,
            systemError
        }}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};