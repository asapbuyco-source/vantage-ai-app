import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Activity, Scale, ShieldAlert, Zap, Loader2, Trophy, Crosshair, Target, BarChart3 } from 'lucide-react';
import { NavigationTab, Match } from '../types';
import { getTeamForm, getH2H, getMatchOdds, getTeamInjuries, TeamForm, H2HRecord, MatchOdds, InjuryReport } from '../services/sportsData';
import { TeamLogo } from './TeamLogo';
import { useAppContext } from '../context/AppContext';

interface Props {
    match: Match | null;
    onClose: () => void;
    setTab?: (tab: NavigationTab) => void;
}

export const MatchDetailsModal: React.FC<Props> = ({ match, onClose, setTab }) => {
    const { language } = useAppContext();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'stats' | 'h2h' | 'injuries'>('overview');

    const [homeForm, setHomeForm] = useState<TeamForm | null>(null);
    const [awayForm, setAwayForm] = useState<TeamForm | null>(null);
    const [h2h, setH2h] = useState<H2HRecord | null>(null);
    const [odds, setOdds] = useState<MatchOdds | null>(null);
    const [homeInjuries, setHomeInjuries] = useState<InjuryReport | null>(null);
    const [awayInjuries, setAwayInjuries] = useState<InjuryReport | null>(null);

    useEffect(() => {
        if (!match) return;

        let isMounted = true;
        setLoading(true);

        // Lock body scroll while modal is open
        document.body.style.overflow = 'hidden';

        const fetchDetails = async () => {
            try {
                const homeId = Number(match.homeTeamId) || 0;
                const awayId = Number(match.awayTeamId) || 0;
                const leagueId = Number(match.leagueId) || 0;
                const seasonId = Number(match.seasonId) || 2024;
                const fixtureId = Number(match.fixtureId || match.id) || 0;

                // If IDs are all zero, this is a fallback AI match — skip API calls
                if (!homeId && !awayId && !fixtureId) {
                    if (isMounted) setLoading(false);
                    return;
                }

                // Fetch all data in parallel
                const [hf, af, h2, od, hi, ai] = await Promise.all([
                    homeId && leagueId ? getTeamForm(homeId, leagueId, seasonId) : null,
                    awayId && leagueId ? getTeamForm(awayId, leagueId, seasonId) : null,
                    homeId && awayId ? getH2H(homeId, awayId) : null,
                    fixtureId ? getMatchOdds(fixtureId) : null,
                    homeId ? getTeamInjuries(homeId) : null,
                    awayId ? getTeamInjuries(awayId) : null,
                ]);

                if (isMounted) {
                    setHomeForm(hf);
                    setAwayForm(af);
                    setH2h(h2);
                    setOdds(od);
                    setHomeInjuries(hi);
                    setAwayInjuries(ai);
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
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
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
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="relative w-full max-w-md bg-white dark:bg-[#12141A] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-slate-200 dark:border-white/10"
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
                            { id: 'overview', icon: Activity, label: language === 'fr' ? 'Aperçu' : 'Overview' },
                            { id: 'stats', icon: BarChart3, label: language === 'fr' ? 'Stats' : 'Stats' },
                            { id: 'h2h', icon: Target, label: 'H2H' },
                            { id: 'injuries', icon: ShieldAlert, label: language === 'fr' ? 'Absents' : 'Injuries' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === tab.id
                                    ? 'bg-vantage-cyan/10 text-vantage-cyan border-b-2 border-vantage-cyan'
                                    : 'text-gray-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                                    }`}
                            >
                                <tab.icon size={16} />
                                {tab.label}
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

                                    {activeTab === 'overview' && (
                                        <>
                                            {/* Form Guide */}
                                            {(homeForm || awayForm) && (
                                                <div className="space-y-4">
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                                        <Activity size={12} /> {language === 'fr' ? 'État de Forme (5 Derniers)' : 'Form Guide (Last 5)'}
                                                    </h4>
                                                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                                                        {homeForm && (
                                                            <div className="flex justify-between items-center mb-3">
                                                                <span className="text-xs font-bold">{match.homeTeam}</span>
                                                                <div className="flex gap-1">
                                                                    {homeForm.last5.split(' ').map((res, i) => (
                                                                        <span key={i} className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${res === 'W' ? 'bg-green-500/20 text-green-500' :
                                                                            res === 'L' ? 'bg-red-500/20 text-red-500' :
                                                                                res === 'D' ? 'bg-gray-500/20 text-gray-500' : 'bg-slate-200 dark:bg-white/10 text-gray-500'
                                                                            }`}>{res || '?'}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {awayForm && (
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs font-bold">{match.awayTeam}</span>
                                                                <div className="flex gap-1">
                                                                    {awayForm.last5.split(' ').map((res, i) => (
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

                                            {/* Odds */}
                                            {odds && (
                                                <div className="space-y-3">
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                                                        <Scale size={12} /> {language === 'fr' ? 'Probabilités 1X2' : '1X2 Probabilities'}
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
                                        </>
                                    )}

                                    {activeTab === 'stats' && (
                                        <div className="space-y-5">
                                            {(homeForm || awayForm) ? (
                                                <>
                                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">
                                                        <span>{match.homeTeam}</span>
                                                        <span>{match.awayTeam}</span>
                                                    </div>
                                                    {homeForm && awayForm && (
                                                        <>
                                                            {renderStatBar(language === 'fr' ? 'Victoires (dom/ext)' : 'Win Rate %', homeForm.homeWinRate, awayForm.awayWinRate, true)}
                                                            {renderStatBar(language === 'fr' ? 'Buts marqués (moy)' : 'Avg Goals Scored', homeForm.avgGoalsScored, awayForm.avgGoalsScored, false)}
                                                            {renderStatBar(language === 'fr' ? 'Buts concédés (moy)' : 'Avg Goals Conceded', homeForm.avgGoalsConceded, awayForm.avgGoalsConceded, false)}
                                                            {renderStatBar(language === 'fr' ? 'Clean sheets %' : 'Clean Sheets %', homeForm.cleanSheetRate, awayForm.cleanSheetRate, true)}
                                                        </>
                                                    )}
                                                    {(!homeForm || !awayForm) && (
                                                        <p className="text-xs text-gray-500 text-center py-4">
                                                            {language === 'fr' ? 'Stats partielles disponibles.' : 'Partial stats available for one side only.'}
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="text-center py-10 text-gray-500 text-sm">
                                                    <BarChart3 size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                                    <p>{language === 'fr' ? 'Statistiques non disponibles' : 'Stats not available for this match'}</p>
                                                    <p className="text-xs mt-1 text-gray-400">{language === 'fr' ? '(Match sans données API en temps réel)' : '(No live API data for this fixture)'}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'h2h' && (
                                        <div className="space-y-6">
                                            {h2h ? (
                                                <>
                                                    <div className="p-6 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-center">
                                                        <Trophy size={24} className="text-yellow-500 mx-auto mb-3" />
                                                        <h4 className="text-sm font-bold mb-4">{language === 'fr' ? 'Confrontations Directes (5 dernières)' : 'Head-to-Head (Last 5)'}</h4>

                                                        <div className="flex justify-center items-center gap-6">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-2xl font-bold text-vantage-cyan mb-1">{h2h.homeTeamWins}</span>
                                                                <span className="text-[10px] text-gray-500 uppercase">{match.homeTeam}</span>
                                                            </div>
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-lg font-bold text-gray-400 mb-1">{h2h.draws}</span>
                                                                <span className="text-[10px] text-gray-500 uppercase">Draws</span>
                                                            </div>
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-2xl font-bold text-vantage-purple mb-1">{h2h.awayTeamWins}</span>
                                                                <span className="text-[10px] text-gray-500 uppercase">{match.awayTeam}</span>
                                                            </div>
                                                        </div>
                                                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 text-xs text-gray-500">
                                                            Scores: {h2h.last5Goals || 'N/A'}
                                                        </div>
                                                    </div>

                                                    {(homeForm && awayForm) && (
                                                        <div className="pt-2">
                                                            {renderStatBar("Win Rate", homeForm.homeWinRate, awayForm.awayWinRate, true)}
                                                            {renderStatBar("Avg Scored", homeForm.avgGoalsScored, awayForm.avgGoalsScored, false)}
                                                            {renderStatBar("Avg Conceded", homeForm.avgGoalsConceded, awayForm.avgGoalsConceded, false)}
                                                            {renderStatBar("Clean Sheets", homeForm.cleanSheetRate, awayForm.cleanSheetRate, true)}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="text-center py-10 text-gray-500 text-sm">
                                                    {language === 'fr' ? 'Données H2H non disponibles' : 'H2H data not available'}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'injuries' && (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <h4 className="text-xs font-bold text-center border-b border-slate-200 dark:border-white/10 pb-2">{match.homeTeam}</h4>
                                                    {homeInjuries?.injured.length ? (
                                                        homeInjuries.injured.map((inj, i) => (
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
                                                    {awayInjuries?.injured.length ? (
                                                        awayInjuries.injured.map((inj, i) => (
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

                                </motion.div>
                            </AnimatePresence>
                        )}
                    </div>

                    {/* VIP CTA Footer */}
                    {setTab && (
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
