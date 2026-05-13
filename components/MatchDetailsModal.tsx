import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Activity, Scale, ShieldAlert, Zap, Loader2, Trophy, Crosshair, Target, BarChart3, Newspaper, Users, CheckCircle2 } from 'lucide-react';
import { NavigationTab, Match, MatchNews } from '../types';
import { getLiveOddsFromDB, getH2HFromDB, getMatchNewsFromDB, getMatchNewsForDate, getFixtureLineupsFromDB, getMatchStatsFromDB, getMatchFactsFromDB, LineupPlayer, TeamForm, H2HRecord, MatchOdds, InjuryReport, MatchStatsData, MatchFact } from '../services/sportsData';
import { TeamLogo } from './TeamLogo';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

interface Props {
    match: Match | null;
    onClose: () => void;
    setTab?: (tab: NavigationTab) => void;
}

export const MatchDetailsModal: React.FC<Props> = ({ match, onClose, setTab }) => {
    const { language } = useAppContext();
    // useAuth MUST be called here at the component level — never inside render callbacks
    const { userProfile, isAdmin } = useAuth();
    const isVipUser = userProfile?.isVip === true || isAdmin;
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'prediction' | 'overview' | 'stats' | 'h2h' | 'injuries' | 'news' | 'lineup'>('prediction');

    const [odds, setOdds] = useState<MatchOdds | null>(null);
    const [realH2H, setRealH2H] = useState<H2HRecord | null>(null);
    const [news, setNews] = useState<MatchNews[]>([]);
    const [lineup, setLineup] = useState<{ home: LineupPlayer[]; away: LineupPlayer[] } | null>(null);
    const [matchStats, setMatchStats] = useState<MatchStatsData | null>(null);
    const [matchFacts, setMatchFacts] = useState<MatchFact[]>([]);

    useEffect(() => {
        if (!match) return;

        let isMounted = true;
        setLoading(true);
        setActiveTab('prediction');
        setRealH2H(null);
        setNews([]);
        setLineup(null);
        setMatchStats(null);
        setMatchFacts([]);

        document.body.style.overflow = 'hidden';

        const fetchDetails = async () => {
            try {
                const fixtureId = Number(match.fixtureId || match.id) || 0;

                const [od, h2hData, newsData, lineupData, statsData, factsData] = await Promise.all([
                    fixtureId ? getLiveOddsFromDB(fixtureId) : null,
                    (match.homeTeamId && match.awayTeamId) ? getH2HFromDB(match.homeTeamId, match.awayTeamId) : null,
                    fixtureId ? getMatchNewsFromDB(fixtureId) : [],
                    fixtureId ? getFixtureLineupsFromDB(fixtureId) : null,
                    fixtureId ? getMatchStatsFromDB(fixtureId) : null,
                    fixtureId ? getMatchFactsFromDB(fixtureId) : [],
                ]);

                if (isMounted) {
                    setOdds(od);
                    setRealH2H(h2hData);
                    setNews(newsData);
                    setLineup(lineupData);
                    setMatchStats(statsData);
                    setMatchFacts(factsData || []);
                    setLoading(false);
                }
            } catch (e) {
                console.error("Error fetching match details:", e);
                if (isMounted) setLoading(false);
            }
        };

        fetchDetails();

        return () => {
            isMounted = false;
            document.body.style.overflow = '';
        };
    }, [match]);

    if (!match) return null;

    const renderStatBar = (label: string, homeVal: number, awayVal: number, isPercentage = false) => {
        const total = homeVal + awayVal || 1; // avoid div by zero
        const homePct = (homeVal / total) * 100;
        const awayPct = (awayVal / total) * 100;

        return (
            <div className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                    <span className="font-bold">{homeVal}{isPercentage ? '%' : ''}</span>
                    <span className="text-gray-500 uppercase">{label}</span>
                    <span className="font-bold">{awayVal}{isPercentage ? '%' : ''}</span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-white/10 rounded-full flex overflow-hidden">
                    <div className="bg-vantage-cyan h-full" style={{ width: `${homePct}%` }} />
                    <div className="bg-vantage-purple h-full" style={{ width: `${awayPct}%` }} />
                </div>
            </div>
        );
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 md:items-start">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />

                <motion.div
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: "100%", opacity: 0 }}
                    transition={{ type: "spring", damping: 28, stiffness: 320 }}
                    className="relative w-full max-w-md bg-[#12141A] rounded-t-3xl md:rounded-b-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col border border-white/10 border-b-0"
                >
                    {/* Header */}
                    <div className="p-5 border-b border-slate-200 dark:border-white/5 relative shrink-0">
                        <button
                            onClick={onClose}
                            className="absolute right-4 top-4 p-2 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                        >
                            <X size={20} className="text-slate-600 dark:text-gray-400" />
                        </button>

                        <div className="text-center mb-6 mt-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-full">
                                {match.league} · {match.time}
                            </span>
                        </div>

                        <div className="flex justify-between items-center px-4">
                            <div className="flex flex-col items-center w-1/3">
                                <TeamLogo src={match.homeTeamLogo} teamName={match.homeTeam} className="w-16 h-16 mb-2" />
                                <span className="text-xs font-bold text-center leading-tight line-clamp-2">{match.homeTeam}</span>
                            </div>

                            <div className="flex flex-col items-center justify-center w-1/3">
                                <span className="text-2xl font-orbitron font-bold text-vantage-cyan/50">VS</span>
                            </div>

                            <div className="flex flex-col items-center w-1/3">
                                <TeamLogo src={match.awayTeamLogo} teamName={match.awayTeam} className="w-16 h-16 mb-2" />
                                <span className="text-xs font-bold text-center leading-tight line-clamp-2">{match.awayTeam}</span>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex px-4 pt-4 shrink-0 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-white/5 gap-2">
                        {[
                            { id: 'prediction', icon: Zap, label: language === 'fr' ? 'Prédiction' : 'Prediction' },
                            { id: 'overview', icon: Activity, label: language === 'fr' ? 'Aperçu' : 'Overview' },
                            { id: 'stats', icon: BarChart3, label: 'Stats' },
                            { id: 'h2h', icon: Target, label: 'H2H' },
                            { id: 'injuries', icon: ShieldAlert, label: language === 'fr' ? 'Absents' : 'Injuries' },
                            { id: 'news', icon: Newspaper, label: language === 'fr' ? 'Actualités' : 'News', badge: news.length > 0 },
                            { id: 'lineup', icon: Users, label: language === 'fr' ? 'Compo' : 'Lineup' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === tab.id
                                    ? 'bg-vantage-cyan/10 text-vantage-cyan border-b-2 border-vantage-cyan'
                                    : 'text-gray-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                                    }`}
                            >
                                <tab.icon size={16} />
                                {tab.label}
                                {'badge' in tab && tab.badge && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-vantage-cyan" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Content Area */}
                    <div className="p-5 overflow-y-auto max-h-[50vh] min-h-[300px] relative">
                        {loading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 dark:bg-[#12141A]/50 backdrop-blur-sm z-10">
                                <Loader2 className="w-8 h-8 text-vantage-cyan animate-spin mb-3" />
                                <span className="text-sm text-gray-500 font-medium animate-pulse">
                                    {language === 'fr' ? 'Chargement des données...' : 'Loading match details...'}
                                </span>
                            </div>
                        ) : (
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-6"
                                >

                                    {/* ── PREDICTION TAB: always shows stored AI data ── */}
                                    {activeTab === 'prediction' && (() => {
                                        // isVipUser is derived at component level (above) to avoid Rules of Hooks violation

                                        if (!isVipUser) {
                                            return (
                                                <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-4">
                                                    <div className="w-16 h-16 bg-vantage-purple/20 rounded-full flex items-center justify-center mb-2">
                                                        <Target size={32} className="text-vantage-purple" />
                                                    </div>
                                                    <h3 className="text-lg font-bold">
                                                        {language === 'fr' ? 'Prédiction VIP Exclusive' : 'Exclusive VIP Prediction'}
                                                    </h3>
                                                    <p className="text-sm text-gray-500 max-w-[250px] mx-auto">
                                                        {language === 'fr'
                                                            ? 'Débloquez cette analyse IA, la probabilité de réussite et notre pronostic exact en devenant membre VIP.'
                                                            : 'Unlock this AI analysis, the exact success probability, and our precise prediction by becoming a VIP member.'}
                                                    </p>

                                                    {setTab && (
                                                        <button
                                                            onClick={() => {
                                                                onClose();
                                                                setTab('vip');
                                                            }}
                                                            className="mt-4 flex items-center gap-2 px-6 py-3 bg-vantage-purple hover:bg-purple-600 active:scale-95 transition-all text-white rounded-xl font-bold font-orbitron shadow-lg shadow-vantage-purple/20"
                                                        >
                                                            <Zap size={18} className="text-yellow-400 fill-yellow-400" />
                                                            {language === 'fr' ? 'DEVENIR VIP' : 'BECOME VIP'}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        }

                                        const prediction = match.prediction_en || match.prediction || '';
                                        const predictionFr = match.prediction_fr || match.prediction || '';
                                        const analysis = (language === 'fr' ? match.analysis_fr : match.analysis_en) || match.analysis || '';
                                        const confidence = match.confidence || 0;
                                        const odds = typeof match.odds === 'number' ? match.odds : 0;
                                        const category = match.category || 'value';
                                        const categoryColor = category === 'safe' ? 'text-green-400' : category === 'risky' ? 'text-red-400' : 'text-yellow-400';
                                        const categoryBg = category === 'safe' ? 'bg-green-500/10 border-green-500/20' : category === 'risky' ? 'bg-red-500/10 border-red-500/20' : 'bg-yellow-500/10 border-yellow-500/20';
                                        const predLabel = language === 'fr' ? predictionFr : prediction;

                                        return (
                                            <div className="space-y-5">
                                                {/* Main prediction */}
                                                <div className={`rounded-2xl border p-5 text-center ${categoryBg}`}>
                                                    <span className={`text-[10px] font-bold uppercase tracking-widest mb-2 block ${categoryColor}`}>
                                                        {category === 'safe' ? (language === 'fr' ? '🔒 Sûr' : '🔒 Safe Bet') :
                                                            category === 'risky' ? (language === 'fr' ? '⚡ Risqué' : '⚡ Risky') :
                                                                (language === 'fr' ? '💎 Valeur' : '💎 Value Pick')}
                                                    </span>
                                                    <p className={`text-xl font-bold tracking-tight ${categoryColor}`}>{predLabel || (language === 'fr' ? 'Analyse en attente' : 'Analysis Pending')}</p>
                                                </div>

                                                {/* Confidence + Odds row */}
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-4 flex flex-col items-center">
                                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                                                            {language === 'fr' ? 'Confiance' : 'Confidence'}
                                                        </span>
                                                        <div className="relative w-16 h-16">
                                                            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                                                                <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-200 dark:text-white/10" />
                                                                <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3"
                                                                    strokeDasharray={`${confidence} ${100 - confidence}`}
                                                                    strokeLinecap="round"
                                                                    className={confidence >= 80 ? 'text-green-400' : confidence >= 70 ? 'text-yellow-400' : 'text-red-400'}
                                                                />
                                                            </svg>
                                                            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{confidence}%</span>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-4 flex flex-col items-center justify-center">
                                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                                                            {language === 'fr' ? 'Cote' : 'Odds'}
                                                        </span>
                                                        <span className="text-2xl font-bold text-vantage-cyan">
                                                            {odds > 0 ? odds.toFixed(2) : '—'}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 mt-1">{language === 'fr' ? 'décimal' : 'decimal'}</span>
                                                    </div>
                                                </div>

                                                {/* AI Analysis */}
                                                {analysis ? (
                                                    <div className="rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-4">
                                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2 mb-3">
                                                            <Crosshair size={12} /> {language === 'fr' ? 'Analyse IA' : 'AI Analysis'}
                                                        </h4>
                                                        <p className="text-sm leading-relaxed text-slate-700 dark:text-gray-300">{analysis}</p>
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-6 text-gray-500 text-sm">
                                                        <Crosshair size={28} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                                                        <p>{language === 'fr' ? 'Analyse non disponible' : 'Analysis not yet available'}</p>
                                                    </div>
                                                )}

                                                {/* Match meta info */}
                                                <div className="flex flex-wrap gap-2">
                                                    {match.league && (
                                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-white/5 text-gray-500 px-3 py-1.5 rounded-full">
                                                            🏆 {match.league}
                                                        </span>
                                                    )}
                                                    {match.time && (
                                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-white/5 text-gray-500 px-3 py-1.5 rounded-full">
                                                            🕐 {match.time}
                                                        </span>
                                                    )}
                                                    {match.sport && (
                                                        <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-white/5 text-gray-500 px-3 py-1.5 rounded-full">
                                                            {match.sport === 'basketball' ? '🏀' : '⚽'} {match.sport}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* ── OVERVIEW TAB: Team form + Live odds ── */}
                                    {activeTab === 'overview' && (
                                        <>
                                            {/* Form Guide */}
                                            {(match.homeForm || match.awayForm) && (
                                                <div className="space-y-4">
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                                        <Activity size={12} /> {language === 'fr' ? 'État de Forme (5 Derniers)' : 'Form Guide (Last 5)'}
                                                    </h4>
                                                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                                                        {match.homeForm && (
                                                            <div className="flex justify-between items-center mb-3">
                                                                <span className="text-xs font-bold">{match.homeTeam}</span>
                                                                <div className="flex gap-1">
                                                                    {match.homeForm.split(' ').map((res, i) => (
                                                                        <span key={i} className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${res === 'W' ? 'bg-green-500/20 text-green-500' :
                                                                            res === 'L' ? 'bg-red-500/20 text-red-500' :
                                                                                res === 'D' ? 'bg-gray-500/20 text-gray-500' : 'bg-slate-200 dark:bg-white/10 text-gray-500'
                                                                            }`}>{res || '?'}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {match.awayForm && (
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs font-bold">{match.awayTeam}</span>
                                                                <div className="flex gap-1">
                                                                    {match.awayForm.split(' ').map((res, i) => (
                                                                        <span key={i} className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${res === 'W' ? 'bg-green-500/20 text-green-500' :
                                                                            res === 'L' ? 'bg-red-500/20 text-red-500' :
                                                                                res === 'D' ? 'bg-gray-500/20 text-gray-500' : 'bg-slate-200 dark:bg-white/10 text-gray-500'
                                                                            }`}>{res || '?'}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Odds — clearly labeled as REAL MARKET ODDS */}
                                            {odds && (
                                                <div className="space-y-3">
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                                        <Scale size={12} /> {language === 'fr' ? 'Probabilités Marché Réel' : 'Real Market Odds (1X2)'}
                                                        <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 border border-green-500/30 flex items-center gap-1">
                                                            <CheckCircle2 size={8} /> LIVE DATA
                                                        </span>
                                                    </h4>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div className="p-3 rounded-lg bg-vantage-cyan/10 border border-vantage-cyan/20 flex flex-col items-center">
                                                            <span className="text-[10px] text-vantage-cyan mb-1 font-bold">1 (Home)</span>
                                                            <span className="text-lg font-bold">{odds.homeImpliedProb}%</span>
                                                            <span className="text-xs text-gray-500">{odds.home.toFixed(2)}</span>
                                                        </div>
                                                        <div className="p-3 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex flex-col items-center">
                                                            <span className="text-[10px] text-gray-500 mb-1 font-bold">X (Draw)</span>
                                                            <span className="text-lg font-bold">{odds.drawImpliedProb}%</span>
                                                            <span className="text-xs text-gray-500">{odds.draw.toFixed(2)}</span>
                                                        </div>
                                                        <div className="p-3 rounded-lg bg-vantage-purple/10 border border-vantage-purple/20 flex flex-col items-center">
                                                            <span className="text-[10px] text-vantage-purple mb-1 font-bold">2 (Away)</span>
                                                            <span className="text-lg font-bold">{odds.awayImpliedProb}%</span>
                                                            <span className="text-xs text-gray-500">{odds.away.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Match Facts — Sportmonks pre-computed streaks/trends */}
                                            {matchFacts.length > 0 && (
                                                <div className="space-y-2">
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                                        <Zap size={12} /> {language === 'fr' ? 'Faits du Match' : 'Match Facts'}
                                                        <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full bg-vantage-cyan/15 text-vantage-cyan border border-vantage-cyan/30">AI DATA</span>
                                                    </h4>
                                                    {matchFacts.map((fact, i) => (
                                                        <div key={fact.id || i} className={`p-3 rounded-xl text-xs leading-relaxed border ${
                                                            fact.importance === 'high'
                                                                ? 'bg-vantage-cyan/5 border-vantage-cyan/20 text-vantage-cyan'
                                                                : 'bg-white/5 border-white/10 text-gray-300'
                                                        }`}>
                                                            {fact.importance === 'high' && <span className="font-black mr-1">⚡</span>}
                                                            {fact.fact}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {activeTab === 'stats' && (
                                        <div className="space-y-5">
                                            {/* Real Sportmonks stats (possession, shots, corners) */}
                                            {matchStats?.stats && (
                                                <>
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                                        <BarChart3 size={12} /> {language === 'fr' ? 'Stats du Match (Live)' : 'Live Match Statistics'}
                                                        <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 border border-green-500/30">LIVE DATA</span>
                                                    </h4>
                                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">
                                                        <span>{match.homeTeam}</span>
                                                        <span>{match.awayTeam}</span>
                                                    </div>
                                                    {matchStats.stats.possession?.home != null && renderStatBar(language === 'fr' ? 'Possession %' : 'Possession %', matchStats.stats.possession.home, matchStats.stats.possession.away ?? 0, true)}
                                                    {matchStats.stats.shots?.home != null && renderStatBar(language === 'fr' ? 'Tirs' : 'Shots', matchStats.stats.shots.home, matchStats.stats.shots.away ?? 0)}
                                                    {matchStats.stats.shots_on_target?.home != null && renderStatBar(language === 'fr' ? 'Tirs cadrés' : 'Shots on Target', matchStats.stats.shots_on_target.home, matchStats.stats.shots_on_target.away ?? 0)}
                                                    {matchStats.stats.corners?.home != null && renderStatBar(language === 'fr' ? 'Corners' : 'Corners', matchStats.stats.corners.home, matchStats.stats.corners.away ?? 0)}
                                                    {matchStats.stats.fouls?.home != null && renderStatBar(language === 'fr' ? 'Fautes' : 'Fouls', matchStats.stats.fouls.home, matchStats.stats.fouls.away ?? 0)}
                                                    {matchStats.stats.yellow_cards?.home != null && renderStatBar(language === 'fr' ? 'Cartons Jaunes' : 'Yellow Cards', matchStats.stats.yellow_cards.home, matchStats.stats.yellow_cards.away ?? 0)}
                                                </>
                                            )}
                                            {/* Fallback: AI-generated season stats */}
                                            {!matchStats?.stats && (match.homeWinRate !== undefined || match.awayWinRate !== undefined) && (
                                                <>
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                                        <BarChart3 size={12} /> {language === 'fr' ? 'Stats Saison (IA)' : 'Season Stats (AI)'}
                                                    </h4>
                                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">
                                                        <span>{match.homeTeam}</span>
                                                        <span>{match.awayTeam}</span>
                                                    </div>
                                                    {match.homeWinRate !== undefined && renderStatBar(language === 'fr' ? 'Victoires %' : 'Win Rate %', match.homeWinRate || 0, match.awayWinRate || 0, true)}
                                                    {match.homeAvgScored !== undefined && renderStatBar(language === 'fr' ? 'Buts marqués (moy)' : 'Avg Goals Scored', match.homeAvgScored || 0, match.awayAvgScored || 0)}
                                                    {match.homeAvgConceded !== undefined && renderStatBar(language === 'fr' ? 'Buts concédés (moy)' : 'Avg Goals Conceded', match.homeAvgConceded || 0, match.awayAvgConceded || 0)}
                                                    {match.homeCleanSheetRate !== undefined && renderStatBar(language === 'fr' ? 'Clean sheets %' : 'Clean Sheets %', match.homeCleanSheetRate || 0, match.awayCleanSheetRate || 0, true)}
                                                </>
                                            )}
                                            {!matchStats?.stats && match.homeWinRate === undefined && (
                                                <div className="text-center py-10 text-gray-500 text-sm">
                                                    <BarChart3 size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                                    <p>{language === 'fr' ? 'Statistiques non disponibles' : 'Stats not available for this match'}</p>
                                                    <p className="text-xs mt-1 text-gray-400">{language === 'fr' ? '(Disponibles pendant/après le match)' : '(Available during/after the match)'}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'h2h' && (
                                        <div className="space-y-6">
                                            {/* Use real H2H from API first, fall back to AI-stored data */}
                                            {(() => {
                                                const h2hData = realH2H || (match.h2hHomeWins !== undefined ? { homeTeamWins: match.h2hHomeWins!, awayTeamWins: match.h2hAwayWins!, draws: match.h2hDraws!, last5Goals: match.h2hLast5Goals || '' } : null);
                                                if (!h2hData) return (
                                                    <div className="text-center py-10 text-gray-500 text-sm">
                                                        {language === 'fr' ? 'Données H2H non disponibles' : 'H2H data not available'}
                                                    </div>
                                                );
                                                return (
                                                    <>
                                                        <div className="p-6 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-center">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <Trophy size={24} className="text-yellow-500" />
                                                                {realH2H && (
                                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 border border-green-500/30 flex items-center gap-1">
                                                                        <CheckCircle2 size={8} /> LIVE DATA
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <h4 className="text-sm font-bold mb-4">{language === 'fr' ? 'Confrontations Directes (5 dernières)' : 'Head-to-Head (Last 5)'}</h4>
                                                            <div className="flex justify-center items-center gap-6">
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-2xl font-bold text-vantage-cyan mb-1">{h2hData.homeTeamWins}</span>
                                                                    <span className="text-[10px] text-gray-500 uppercase">{match.homeTeam}</span>
                                                                </div>
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-lg font-bold text-gray-400 mb-1">{h2hData.draws}</span>
                                                                    <span className="text-[10px] text-gray-500 uppercase">Draws</span>
                                                                </div>
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-2xl font-bold text-vantage-purple mb-1">{h2hData.awayTeamWins}</span>
                                                                    <span className="text-[10px] text-gray-500 uppercase">{match.awayTeam}</span>
                                                                </div>
                                                            </div>
                                                            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 text-xs text-gray-500 truncate px-2">
                                                                Scores: {h2hData.last5Goals || 'N/A'}
                                                            </div>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {activeTab === 'injuries' && (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <h4 className="text-xs font-bold text-center border-b border-slate-200 dark:border-white/10 pb-2">{match.homeTeam}</h4>
                                                    {match.homeInjured?.length ? (
                                                        match.homeInjured.map((inj, i) => (
                                                            <div key={i} className="flex gap-2 p-2 rounded bg-red-500/5 border border-red-500/10 text-xs">
                                                                <ShieldAlert size={14} className="text-red-500 shrink-0" />
                                                                <span className="text-slate-700 dark:text-gray-300">{inj}</span>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <p className="text-center text-xs text-gray-500 py-4">{language === 'fr' ? 'Aucun absent rapporté' : 'No injuries reported'}</p>
                                                    )}
                                                </div>
                                                <div className="space-y-2">
                                                    <h4 className="text-xs font-bold text-center border-b border-slate-200 dark:border-white/10 pb-2">{match.awayTeam}</h4>
                                                    {match.awayInjured?.length ? (
                                                        match.awayInjured.map((inj, i) => (
                                                            <div key={i} className="flex gap-2 p-2 rounded bg-red-500/5 border border-red-500/10 text-xs">
                                                                <ShieldAlert size={14} className="text-red-500 shrink-0" />
                                                                <span className="text-slate-700 dark:text-gray-300">{inj}</span>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <p className="text-center text-xs text-gray-500 py-4">{language === 'fr' ? 'Aucun absent rapporté' : 'No injuries reported'}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── NEWS TAB ── */}
                                    {activeTab === 'news' && (
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                                <Newspaper size={12} /> {language === 'fr' ? 'Actualités Avant-Match' : 'Pre-Match News'}
                                                <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 border border-green-500/30">LIVE DATA</span>
                                            </h4>
                                            {news.length === 0 ? (
                                                <div className="text-center py-10">
                                                    <Newspaper size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                                    <p className="text-sm text-gray-500">{language === 'fr' ? 'Aucune actualité disponible' : 'No news for this match yet'}</p>
                                                    <p className="text-xs text-gray-400 mt-1">{language === 'fr' ? 'Les news seront publiées le jour du match.' : 'News is published on match day.'}</p>
                                                </div>
                                            ) : (
                                                news.map((item, i) => (
                                                    <div key={item.id || i} className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 space-y-2">
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-vantage-cyan/15 text-vantage-cyan border border-vantage-cyan/30 shrink-0 mt-0.5">
                                                                {item.type || 'preview'}
                                                            </span>
                                                            <p className="text-sm text-slate-700 dark:text-gray-200 font-medium leading-snug">{item.title}</p>
                                                        </div>
                                                        {item.body && (
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed pl-1 border-l-2 border-vantage-cyan/20">
                                                                {item.body}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}

                                    {/* ── LINEUP TAB ── */}
                                    {activeTab === 'lineup' && (
                                        <div className="space-y-4">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                                <Users size={12} /> {language === 'fr' ? 'Compositions Probables' : 'Expected Lineups'}
                                                {lineup && (
                                                    <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 border border-green-500/30">LIVE DATA</span>
                                                )}
                                            </h4>
                                            {!lineup || (lineup.home.length === 0 && lineup.away.length === 0) ? (
                                                <div className="text-center py-10">
                                                    <Users size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                                    <p className="text-sm text-gray-500">{language === 'fr' ? 'Compo pas encore annoncée' : 'Lineups not yet announced'}</p>
                                                    <p className="text-xs text-gray-400 mt-1">{language === 'fr' ? 'Disponibles ~1h avant le coup d\'envoi.' : 'Usually available ~1hr before kickoff.'}</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] font-bold text-center text-vantage-cyan pb-2 border-b border-vantage-cyan/20">{match.homeTeam}</p>
                                                        {lineup.home.map((p, i) => (
                                                            <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                                                                <span className="text-[9px] font-bold font-orbitron text-vantage-cyan w-5 text-center shrink-0">{p.number ?? i + 1}</span>
                                                                <span className="text-xs text-slate-700 dark:text-gray-200 truncate">{p.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] font-bold text-center text-vantage-purple pb-2 border-b border-vantage-purple/20">{match.awayTeam}</p>
                                                        {lineup.away.map((p, i) => (
                                                            <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                                                                <span className="text-[9px] font-bold font-orbitron text-vantage-purple w-5 text-center shrink-0">{p.number ?? i + 1}</span>
                                                                <span className="text-xs text-slate-700 dark:text-gray-200 truncate">{p.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </motion.div>
                            </AnimatePresence>
                        )}
                    </div>

                    {/* VIP CTA Footer — only show to NON-VIP users */}
                    {setTab && !isVipUser && (
                        <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5 shrink-0">
                            <button
                                onClick={() => {
                                    onClose();
                                    setTab('vip');
                                }}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-vantage-purple hover:bg-purple-600 text-white rounded-xl font-bold shadow-lg shadow-vantage-purple/20 transition-all active:scale-95"
                            >
                                <Zap size={16} className="text-yellow-400 fill-yellow-400" />
                                {language === 'fr' ? 'Voir la Prédiction de l\'IA' : 'Unlock AI Prediction (VIP)'}
                            </button>
                        </div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
