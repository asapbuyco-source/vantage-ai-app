
import React, { useState } from 'react';
import { TrendingUp, Clock, Target, Loader2, Copy, Check } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useAppContext } from '../context/AppContext';
import { useData } from '../context/DataContext';
import { TeamLogo } from '../components/TeamLogo';

export const FreePicks: React.FC = () => {
  const { t, language } = useAppContext();
  const { predictions, loading } = useData();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const getPredictionText = (match: any) => {
    if (language === 'fr') return match.prediction_fr || match.prediction;
    return match.prediction_en || match.prediction;
  };

  // Sort by confidence and take top 3
  const freeMatches = [...predictions]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col space-y-1">
        <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">{t('free.title')} <span className="text-vantage-cyan">{t('free.title_accent')}</span></h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('free.subtitle')}</p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="animate-spin text-vantage-cyan" size={40} />
        </div>
      ) : (
        <div className="space-y-4">
          {freeMatches.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No predictions available at the moment.</div>
          ) : (
            freeMatches.map((match, idx) => (
              <GlassCard key={match.id} delay={idx + 1} className="hover:bg-white/40 dark:hover:bg-white/10 transition-colors">
                {/* Header: League & Time */}
                <div className="flex justify-between items-center mb-4">
                  <span className="flex items-center text-xs font-bold text-gray-500 dark:text-gray-500 uppercase tracking-widest">
                    <Target size={12} className="mr-1.5 text-vantage-cyan" />
                    {match.league}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md">
                      <Clock size={12} className="mr-1.5" />
                      {match.time}
                    </span>
                    <button
                        onClick={() => handleCopy(`${match.homeTeam} vs ${match.awayTeam}`, match.id)}
                        className="p-1.5 rounded-md bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-gray-400 dark:text-gray-500 hover:text-vantage-cyan dark:hover:text-vantage-cyan"
                        title="Copy match"
                    >
                        {copiedId === match.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                {/* Teams */}
                <div className="flex justify-between items-center mb-5">
                  <div className="flex items-center space-x-3 w-5/12 overflow-hidden">
                    <TeamLogo src={match.homeTeamLogo} teamName={match.homeTeam} className="w-8 h-8" />
                    <span className="text-base font-bold text-slate-900 dark:text-white truncate">{match.homeTeam}</span>
                  </div>
                  
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-orbitron">VS</span>
                  
                  <div className="flex items-center justify-end space-x-3 w-5/12 overflow-hidden">
                    <span className="text-base font-bold text-slate-900 dark:text-white text-right truncate">{match.awayTeam}</span>
                    <TeamLogo src={match.awayTeamLogo} teamName={match.awayTeam} className="w-8 h-8" />
                  </div>
                </div>

                {/* Prediction Footer */}
                <div className="relative overflow-hidden rounded-xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/5 p-3">
                  <div className="flex justify-between items-center relative z-10">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{t('free.pred_label')}</span>
                      <span className="text-sm font-bold text-vantage-cyan font-orbitron">{getPredictionText(match)}</span>
                    </div>
                    <div className="h-8 w-px bg-slate-300 dark:bg-white/10 mx-2" />
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{t('free.prob_label')}</span>
                      <div className="flex items-center text-sm font-bold text-green-500 dark:text-green-400">
                          <TrendingUp size={14} className="mr-1" />
                          {match.confidence}%
                      </div>
                    </div>
                  </div>
                  {/* Background gradient bar for confidence */}
                  <div 
                    className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-vantage-cyan to-green-400" 
                    style={{ width: `${match.confidence}%` }}
                  />
                </div>
              </GlassCard>
            ))
          )}
        </div>
      )}
      
      <div className="text-center">
        <p className="text-xs text-gray-400 dark:text-gray-500">{t('free.disclaimer')}</p>
      </div>
    </div>
  );
};
