import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { Match, AccumulatorSet, WinRateStats } from '../types';
import {
    getTodaysPredictions, deleteTodaysPredictions, getGlobalTodayKey,
    saveTodaysPredictions, getAccumulatorsForDate, saveAccumulatorsForDate,
    getDailyData, getWinRateStats, getTodaysBasketballPredictions, saveBasketballPredictions,
    acquireGenerationLock, releaseGenerationLock,
} from '../services/db';
import { generateDailyPredictions, generateSmartAccumulators, generateBasketballPredictions } from '../services/gemini';
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

    const fetchOrGenerate = async (bypassCache = false, forceGeneration = false) => {
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
                let dailyData = null;
                if (!bypassCache) { dailyData = await getDailyData(targetDate); }

                if (signal.aborted) return;

                if (dailyData && dailyData.matches && dailyData.matches.length > 0) {
                    if (mountedRef.current) {
                        setPredictions(dailyData.matches);
                        setRawFixtures(dailyData.rawFixtures || []);
                        setAccumulators(dailyData.accumulators || null);
                        setLoading(false);
                    }
                } else if (isToday) {
                    // ─── AUTO-GENERATION LOGIC (ONLY FOR TODAY) ───────────────────────────────
                    // Any authenticated user can trigger generation (not just admin).
                    // A Firestore generation lock prevents concurrent calls.

                    const lockAcquired = await acquireGenerationLock(targetDate);

                    if (!lockAcquired) {
                        // Another client is already generating. Poll every 5s for up to 2 min.
                        if (mountedRef.current) setIsSystemGenerating(true);
                        let attempts = 0;
                        while (attempts < 24) {
                            await new Promise(res => setTimeout(res, 5000));
                            if (signal.aborted) return;
                            attempts++;
                            const fresh = await getDailyData(targetDate);
                            if (fresh && fresh.matches && fresh.matches.length > 0) {
                                if (mountedRef.current) {
                                    setPredictions(fresh.matches);
                                    setRawFixtures(fresh.rawFixtures || []);
                                    setAccumulators(fresh.accumulators || null);
                                }
                                break;
                            }
                        }
                        if (mountedRef.current) setIsSystemGenerating(false);
                    } else {
                        // We hold the lock — generate predictions
                        if (mountedRef.current) setIsSystemGenerating(true);
                        try {
                            const backendMatches = await generateDailyPredictions(signal);
                            if (signal.aborted) return;
                            if (backendMatches && backendMatches.length > 0) {
                                await saveTodaysPredictions(backendMatches);
                                // Refresh to get both matches and the rawFixtures saved during generation
                                const freshDaily = await getDailyData(targetDate);
                                if (mountedRef.current) {
                                    setPredictions(backendMatches);
                                    setRawFixtures(freshDaily?.rawFixtures || []);
                                }
                            } else {
                                if (mountedRef.current) setPredictions([]);
                            }
                        } catch (genError) {
                            if (mountedRef.current) setSystemError((genError as Error).message);
                        } finally {
                            await releaseGenerationLock(targetDate);
                        }
                    }
                } else {
                    // It's a past date with no data
                    setPredictions([]);
                    setRawFixtures([]);
                    setAccumulators(null);
                }

                // Also load basketball predictions in background (only if looking at today)
                if (isToday) {
                    const bball = await getTodaysBasketballPredictions();
                    if (mountedRef.current && bball) setBasketballPredictions(bball);
                } else {
                    setBasketballPredictions([]);
                }

            } catch (e) {
                if (mountedRef.current) setSystemError((e as Error).message);
            } finally {
                if (mountedRef.current && !signal.aborted) {
                    setLoading(false);
                    setIsSystemGenerating(false);
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

    const generateData = async () => {
        await fetchOrGenerate(true, true);
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

    const generateBasketballData = async () => {
        if (!isAdmin) return;
        if (mountedRef.current) setIsBasketballGenerating(true);
        try {
            const matches = await generateBasketballPredictions();
            if (matches && matches.length > 0) {
                await saveBasketballPredictions(matches);
                if (mountedRef.current) setBasketballPredictions(matches);
            }
        } catch (e: any) {
            console.error("Basketball generation failed:", e);
            if (mountedRef.current) setSystemError(e.message);
        } finally {
            if (mountedRef.current) setIsBasketballGenerating(false);
        }
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
            // Fix: Allow data generation if missing, regardless of admin status
            // The generation logic itself (generateDailyPredictions) handles Firestore checks to avoid duplicates
            fetchOrGenerate(false, false);
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
            refreshData: () => fetchOrGenerate(false, false),
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