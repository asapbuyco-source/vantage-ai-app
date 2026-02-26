import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Activity, ArrowRight, Lock, Globe, Clock, Calendar, Sun, Moon, Trophy, AlertTriangle, Hourglass, Search, SlidersHorizontal, ChevronDown, Bookmark, BookmarkCheck, Flame, TrendingUp } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { CircularProgress } from '../components/CircularProgress';
import { AnalyzingLoader } from '../components/AnalyzingLoader';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { NavigationTab, Match, Sport, SavedPick } from '../types';
import { TeamLogo } from '../components/TeamLogo';

interface HomeProps {
  setTab: (tab: NavigationTab) => void;
}

type SortKey = 'confidence' | 'time' | 'odds' | 'league';
type CategoryFilter = 'all' | 'safe' | 'value' | 'risky';

const CAT_COLORS: Record<string, string> = {
  safe: 'text-green-400 bg-green-400/10 border-green-400/30',
  value: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  risky: 'text-red-400 bg-red-400/10 border-red-400/30',
};
const CAT_LABELS: Record<string, string> = { safe: '🟢 Safe', value: '🔵 Value', risky: '🔴 Risky' };

export const Home: React.FC<HomeProps> = ({ setTab }) => {
  const { t, language, setLanguage, theme, toggleTheme, toggleSavedPick, isPickSaved, showToast } = useAppContext();
  const { userProfile, isAdmin } = useAuth();
  const { predictions, basketballPredictions, winRateStats, loading, isSystemGenerating, systemError } = useData();

  const isVip = userProfile?.isVip || isAdmin;

  // ─── Filters ─────────────────────────────────────────────────────────────
  const [activeSport, setActiveSport] = useState<Sport>('football');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('confidence');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const allMatches = activeSport === 'football' ? predictions : basketballPredictions;

  const filteredMatches = useMemo(() => {
    let result = [...allMatches];
    if (categoryFilter !== 'all') result = result.filter(m => m.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.homeTeam.toLowerCase().includes(q) ||
        m.awayTeam.toLowerCase().includes(q) ||
        m.league.toLowerCase().includes(q)
      );
    }
    switch (sortKey) {
      case 'confidence': result.sort((a, b) => b.confidence - a.confidence); break;
      case 'odds': result.sort((a, b) => b.odds - a.odds); break;
      case 'time': result.sort((a, b) => a.time.localeCompare(b.time)); break;
      case 'league': result.sort((a, b) => a.league.localeCompare(b.league)); break;
    }
    return result;
  }, [allMatches, categoryFilter, searchQuery, sortKey]);

  const groupedMatches = useMemo(() => {
    if (sortKey !== 'league' && sortKey !== 'confidence') {
      return { 'All Matches': filteredMatches };
    }
    const groups: Record<string, Match[]> = {};
    filteredMatches.forEach(p => {
      if (!groups[p.league]) groups[p.league] = [];
      groups[p.league].push(p);
    });
    return groups;
  }, [filteredMatches, sortKey]);

  const getPredictionText = (match: Match) => {
    if (language === 'fr') return match.prediction_fr || match.prediction;
    return match.prediction_en || match.prediction;
  };

  const featuredMatch = predictions.length > 0
    ? predictions.reduce((prev, curr) => (prev.confidence > curr.confidence ? prev : curr))
    : null;

  const todayDisplay = new Date().toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short'
  });

  const sortLabels: Record<SortKey, string> = {
    confidence: language === 'fr' ? 'Confiance' : 'Confidence',
    odds: language === 'fr' ? 'Cote' : 'Odds',
    time: language === 'fr' ? 'Heure' : 'Time',
    league: language === 'fr' ? 'Ligue' : 'League',
  };

  const handleSaveToggle = (match: Match) => {
    if (!isVip) {
      setTab('vip');
      showToast(language === 'fr' ? 'Accès VIP requis' : 'VIP Access Required', 'info');
      return;
    }
    const pick: SavedPick = {
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      prediction: getPredictionText(match),
      confidence: match.confidence,
      odds: match.odds,
      league: match.league,
      homeTeamLogo: match.homeTeamLogo,
      awayTeamLogo: match.awayTeamLogo,
      sport: match.sport || activeSport,
      savedAt: new Date().toISOString(),
    };
    toggleSavedPick(pick);
    const saved = isPickSaved(match.id);
    showToast(
      saved
        ? (language === 'fr' ? 'Ajouté au slip !' : 'Added to slip!')
        : (language === 'fr' ? 'Retiré du slip' : 'Removed from slip'),
      saved ? 'success' : 'info'
    );
  };

  if (isSystemGenerating) return <AnalyzingLoader />;

  return (
    <div className="space-y-5 pb-24">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">VANTAGE<span className="text-vantage-cyan">AI</span></h1>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 tracking-widest">{t('home.system')}</p>
        </div>
        <div className="flex items-center space-x-2">
          {/* Language Toggle */}
          <button onClick={() => setLanguage(language === 'fr' ? 'en' : 'fr')} className="flex items-center space-x-1 bg-slate-100 dark:bg-white/5 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
            <Globe size={12} className="text-slate-500 dark:text-gray-400" />
            <span className="text-[10px] font-bold font-orbitron text-slate-700 dark:text-gray-300 w-4 text-center">{language.toUpperCase()}</span>
          </button>
          {/* Theme Toggle */}
          <button onClick={toggleTheme} className="flex items-center justify-center bg-slate-100 dark:bg-white/5 w-8 h-7 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
            {theme === 'dark' ? <Sun size={14} className="text-yellow-500" /> : <Moon size={14} className="text-slate-600" />}
          </button>
          {/* Status dot */}
          <div className={`flex items-center justify-center w-8 h-7 rounded-lg border ${isSystemGenerating ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-vantage-cyan/10 border-vantage-cyan/20'}`}>
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isSystemGenerating ? 'bg-yellow-500' : 'bg-vantage-cyan'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isSystemGenerating ? 'bg-yellow-500' : 'bg-vantage-cyan'}`} />
            </span>
          </div>
        </div>
      </div>

      {/* ── Date Bar ── */}
      <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 px-4 py-2.5 rounded-xl border border-black/5 dark:border-white/5 text-xs">
        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <Clock size={12} />
          <span className="font-medium uppercase tracking-wide">
            {language === 'fr' ? 'Prochain: 08:00' : 'Next: 08:00 AM'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-vantage-cyan font-bold">
          <Calendar size={12} />
          <span className="uppercase">{todayDisplay}</span>
        </div>
      </div>

      {/* ── Win Rate Stats (Dynamic) ── */}
      <GlassCard delay={1}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2 text-vantage-purple">
            <Activity size={16} />
            <span className="text-sm font-bold uppercase tracking-wider">{t('home.performance')}</span>
          </div>
          {winRateStats.streak > 0 && (
            <div className="flex items-center gap-1 text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-0.5 rounded-full text-xs font-bold">
              <Flame size={12} /> {winRateStats.streak}d{' '}
              {language === 'fr' ? 'consécutifs' : 'streak'}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t('home.daily_rate'), pct: winRateStats.daily, color: '#22d3ee' },
            { label: t('home.weekly_rate'), pct: winRateStats.weekly, color: '#a855f7' },
            { label: t('home.monthly_rate'), pct: winRateStats.monthly, color: '#eab308' },
          ].map((m, i) => (
            <div key={i} className="flex flex-col items-center">
              <CircularProgress percentage={m.pct || 0} label="" color={m.color} size={72} strokeWidth={6} />
              <span className="mt-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 text-center uppercase leading-tight">{m.label}</span>
            </div>
          ))}
        </div>
        {winRateStats.todayTotal > 0 && (
          <div className="mt-3 pt-3 border-t border-white/5 flex justify-center">
            <span className="text-[11px] text-gray-500">
              {language === 'fr'
                ? `Aujourd'hui: ${winRateStats.todayWon}/${winRateStats.todayTotal} gagnés`
                : `Today: ${winRateStats.todayWon}/${winRateStats.todayTotal} won`}
            </span>
          </div>
        )}
      </GlassCard>

      {/* ── Featured Match ── */}
      {!loading && featuredMatch && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Zap size={14} className="text-yellow-500" /> {t('home.featured')}
            </h2>
            <span className="text-xs text-vantage-cyan bg-vantage-cyan/10 px-2 py-0.5 rounded border border-vantage-cyan/20">{t('home.high_conf')}</span>
          </div>
          <GlassCard highlight className="relative" delay={2}>
            <div className="absolute top-0 right-0 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-[10px] font-bold px-3 py-1 rounded-bl-xl border-l border-b border-yellow-500/20">
              🔥 {t('home.hot_pick')}
            </div>
            <div className="flex flex-col items-center space-y-4 pt-2">
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-widest">{featuredMatch.league} • {featuredMatch.time}</div>
              <div className="flex w-full items-center justify-between px-2">
                <div className="text-center w-1/3 flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 mb-1 flex items-center justify-center border border-slate-200 dark:border-white/5 p-2">
                    <TeamLogo src={featuredMatch.homeTeamLogo} teamName={featuredMatch.homeTeam} className="w-12 h-12" />
                  </div>
                  <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{featuredMatch.homeTeam}</span>
                </div>
                <div className="text-2xl font-bold font-orbitron text-vantage-cyan">{t('home.vs')}</div>
                <div className="text-center w-1/3 flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 mb-1 flex items-center justify-center border border-slate-200 dark:border-white/5 p-2">
                    <TeamLogo src={featuredMatch.awayTeamLogo} teamName={featuredMatch.awayTeam} className="w-12 h-12" />
                  </div>
                  <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{featuredMatch.awayTeam}</span>
                </div>
              </div>
              <div className="w-full bg-black/5 dark:bg-black/40 rounded-xl p-3 flex justify-between items-center border border-black/5 dark:border-white/5">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase">{t('home.ai_pred')}</div>
                  <div className="text-sm font-bold text-vantage-cyan">
                    {isVip ? getPredictionText(featuredMatch) : 'LOCKED / VIP'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-500 uppercase">{t('home.confidence')}</div>
                  <div className="text-sm font-bold text-green-500">
                    {isVip ? `${featuredMatch.confidence}%` : '??%'}
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── VIP Teaser ── */}
      {
        // @ts-ignore
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setTab('vip')}
          className="w-full relative overflow-hidden rounded-2xl p-5 border border-vantage-purple/30 bg-gradient-to-r from-vantage-purple/10 to-transparent group"
        >
          <div className="absolute inset-0 bg-vantage-purple/5 group-hover:bg-vantage-purple/10 transition-colors" />
          <div className="relative flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-vantage-purple/20 rounded-lg text-vantage-purple"><Lock size={20} /></div>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-900 dark:text-white">{t('home.vip_zone')}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('home.vip_desc')}</div>
              </div>
            </div>
            <ArrowRight size={20} className="text-gray-400 group-hover:text-white transition-colors" />
          </div>
        </motion.button>
      }

      {/* ─── SORT & FILTER TOOLBAR ─── */}
      <div className="space-y-3">
        {/* Sport Toggle */}
        <div className="flex bg-slate-100 dark:bg-white/5 rounded-xl p-1 border border-slate-200 dark:border-white/10">
          {(['football', 'basketball'] as Sport[]).map(sport => (
            <button
              key={sport}
              onClick={() => setActiveSport(sport)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeSport === sport
                ? 'bg-white dark:bg-white/10 shadow text-slate-900 dark:text-white'
                : 'text-gray-500'
                }`}
            >
              {sport === 'football' ? '⚽' : '🏀'}
              {sport === 'football'
                ? (language === 'fr' ? 'Football' : 'Football')
                : (language === 'fr' ? 'Basketball' : 'Basketball')}
            </button>
          ))}
        </div>

        {/* Category Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {(['all', 'safe', 'value', 'risky'] as CategoryFilter[]).map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${categoryFilter === cat
                ? 'bg-vantage-cyan text-slate-900 border-transparent shadow'
                : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-gray-500'
                }`}
            >
              {cat === 'all' ? (language === 'fr' ? 'Tous' : 'All') : CAT_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Search + Sort Row */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={language === 'fr' ? 'Chercher équipe ou ligue...' : 'Search team or league...'}
              className="bg-transparent text-xs outline-none text-slate-800 dark:text-white placeholder-gray-500 w-full"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowSortDropdown(v => !v)}
              className="h-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-white shrink-0"
            >
              <SlidersHorizontal size={13} />
              {sortLabels[sortKey]}
              <ChevronDown size={12} className={`transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showSortDropdown && (
                // @ts-ignore
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[130px]"
                >
                  {(Object.entries(sortLabels) as [SortKey, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { setSortKey(key); setShowSortDropdown(false); }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-slate-50 dark:hover:bg-white/10 transition-colors ${sortKey === key ? 'text-vantage-cyan' : 'text-slate-700 dark:text-white'}`}
                    >
                      {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Match Count */}
        <div className="text-xs text-gray-500 flex items-center gap-1.5">
          <TrendingUp size={11} />
          {language === 'fr'
            ? `${filteredMatches.length} sur ${allMatches.length} pronostics`
            : `${filteredMatches.length} of ${allMatches.length} predictions`}
        </div>
      </div>

      {/* ─── MATCH LIST ─── */}
      <div className="space-y-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 w-full bg-slate-200 dark:bg-white/5 rounded-2xl animate-pulse" />)}
          </div>
        ) : filteredMatches.length === 0 ? (
          <GlassCard className="text-center py-10 flex flex-col items-center justify-center min-h-[160px]">
            {systemError ? (
              <>
                <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-3">
                  <AlertTriangle size={24} className="text-red-500" />
                </div>
                <h3 className="text-slate-900 dark:text-white font-bold mb-1">{language === 'fr' ? 'Erreur de l\'IA' : 'AI Analysis Error'}</h3>
                <p className="text-xs text-gray-500 max-w-[220px]">{language === 'fr' ? 'Réessayez plus tard.' : 'Please try again later.'}</p>
              </>
            ) : searchQuery || categoryFilter !== 'all' ? (
              <>
                <div className="w-12 h-12 bg-vantage-cyan/10 rounded-full flex items-center justify-center mb-3">
                  <Search size={24} className="text-vantage-cyan" />
                </div>
                <h3 className="text-slate-900 dark:text-white font-bold mb-1">{language === 'fr' ? 'Aucun résultat' : 'No matches found'}</h3>
                <p className="text-xs text-gray-500">{language === 'fr' ? 'Essayez un autre filtre.' : 'Try adjusting your filters.'}</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-vantage-cyan/10 rounded-full flex items-center justify-center mb-3">
                  <Hourglass size={24} className="text-vantage-cyan" />
                </div>
                <h3 className="text-slate-900 dark:text-white font-bold mb-1">{language === 'fr' ? 'Analyse en cours...' : 'Daily Analysis Pending'}</h3>
                <p className="text-xs text-gray-500 max-w-[220px] leading-relaxed">
                  {activeSport === 'basketball'
                    ? (language === 'fr' ? 'Pas de pronostics basketball pour aujourd\'hui.' : 'No basketball predictions generated yet.')
                    : (language === 'fr' ? 'L\'algorithme analyse le marché. Revenez bientôt.' : 'The algorithm is analyzing the market. Check back shortly.')}
                </p>
              </>
            )}
          </GlassCard>
        ) : (
          Object.keys(groupedMatches).map(groupKey => (
            <div key={groupKey} className="space-y-3">
              {groupKey !== 'All Matches' && (
                <div className="sticky top-0 z-10 py-2 bg-gradient-to-b from-vantage-lightBg/95 to-vantage-lightBg/50 dark:from-vantage-bg/95 dark:to-vantage-bg/50 backdrop-blur-md">
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-200/50 dark:bg-white/10 border border-slate-300 dark:border-white/10">
                    <Trophy size={12} className="text-vantage-purple" />
                    <span className="text-[10px] font-bold text-slate-800 dark:text-white uppercase tracking-wider">{groupKey}</span>
                  </div>
                </div>
              )}

              <AnimatePresence>
                {groupedMatches[groupKey].map((match, idx) => {
                  const saved = isPickSaved(match.id);
                  return (
                    // @ts-ignore
                    <motion.div
                      key={match.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ delay: idx * 0.04 }}
                    >
                      <GlassCard className="!p-0 overflow-hidden relative group border border-slate-200 dark:border-white/10">
                        {/* Category badge */}
                        <div className={`absolute top-3 left-3 text-[9px] font-bold px-2 py-0.5 rounded-full border ${CAT_COLORS[match.category]}`}>
                          {CAT_LABELS[match.category]}
                        </div>

                        {/* Save button */}
                        <button
                          onClick={() => handleSaveToggle(match)}
                          className={`absolute top-3 right-3 p-1.5 rounded-full transition-all border ${saved
                            ? 'text-vantage-purple bg-vantage-purple/10 border-vantage-purple/30'
                            : 'text-gray-400 bg-white/5 border-white/10 hover:border-vantage-purple/20'
                            }`}
                        >
                          {saved ? <BookmarkCheck size={14} fill="currentColor" /> : <Bookmark size={14} />}
                        </button>

                        <div className="p-4 pt-10 relative z-10">
                          {/* Time + League */}
                          <div className="flex justify-center mb-3">
                            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                              <Clock size={10} /> {match.time} · {match.league}
                            </span>
                          </div>

                          {/* Teams */}
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col items-center w-2/5 space-y-2">
                              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 p-2 flex items-center justify-center border border-slate-200 dark:border-white/10">
                                <TeamLogo src={match.homeTeamLogo} teamName={match.homeTeam} className="w-full h-full" />
                              </div>
                              <span className="text-xs font-bold text-center text-slate-900 dark:text-white leading-tight line-clamp-2 min-h-[2.5em] flex items-center justify-center">{match.homeTeam}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center w-1/5 pt-3">
                              <span className="text-lg font-bold font-orbitron text-vantage-cyan/40">VS</span>
                            </div>
                            <div className="flex flex-col items-center w-2/5 space-y-2">
                              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 p-2 flex items-center justify-center border border-slate-200 dark:border-white/10">
                                <TeamLogo src={match.awayTeamLogo} teamName={match.awayTeam} className="w-full h-full" />
                              </div>
                              <span className="text-xs font-bold text-center text-slate-900 dark:text-white leading-tight line-clamp-2 min-h-[2.5em] flex items-center justify-center">{match.awayTeam}</span>
                            </div>
                          </div>

                          {/* Prediction Footer */}
                          <div className="mt-3 bg-black/5 dark:bg-black/30 rounded-xl p-3 flex justify-between items-center border border-black/5 dark:border-white/5">
                            <div>
                              <div className="text-[10px] text-gray-500 uppercase">{t('home.ai_pred')}</div>
                              <div className="text-xs font-bold text-vantage-cyan">
                                {isVip ? getPredictionText(match) : 'LOCKED / VIP'}
                              </div>
                            </div>
                            <div className="flex gap-3">
                              <div className="text-right">
                                <div className="text-[10px] text-gray-500 uppercase">Conf.</div>
                                <div className="text-xs font-bold text-green-500">
                                  {isVip ? `${match.confidence}%` : '??%'}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] text-gray-500 uppercase">{language === 'fr' ? 'Cote' : 'Odds'}</div>
                                <div className="text-xs font-bold text-yellow-500">
                                  {isVip ? `@${match.odds}` : '@?.??'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </GlassCard>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>
    </div>
  );
};