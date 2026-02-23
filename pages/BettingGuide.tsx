import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Calculator, Wallet, TrendingUp, Scale, Brain, ArrowRight, BookOpen, AlertTriangle, Layers, CheckCircle2, Target } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useAppContext } from '../context/AppContext';

export const BettingGuide: React.FC = () => {
  const { t } = useAppContext();
  const [oddsInput, setOddsInput] = useState<string>('');
  
  const calculateProbability = (odds: string) => {
    const num = parseFloat(odds);
    if (!num || num <= 1) return 0;
    return (1 / num) * 100;
  };

  const probability = calculateProbability(oddsInput);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col space-y-1">
        <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
          {t('guide.title')} <span className="text-vantage-purple">{t('guide.title_accent')}</span>
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('guide.subtitle')}</p>
      </div>

      {/* Interactive Calculator */}
      <GlassCard className="border-vantage-cyan/30 bg-vantage-cyan/5">
        <div className="flex items-center space-x-2 text-vantage-cyan mb-4">
          <Calculator size={20} />
          <h3 className="text-sm font-bold uppercase tracking-wider">{t('guide.calc_title')}</h3>
        </div>
        
        <p className="text-xs text-gray-500 mb-4">{t('guide.calc_desc')}</p>
        
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <input 
              type="number" 
              value={oddsInput}
              onChange={(e) => setOddsInput(e.target.value)}
              placeholder={t('guide.enter_odds')}
              className="w-full p-3 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-vantage-cyan outline-none text-slate-900 dark:text-white font-bold"
            />
          </div>
          <ArrowRight className="text-gray-400" size={20} />
          <div className="flex-1 bg-slate-900 dark:bg-white/10 p-3 rounded-xl text-center border border-white/5">
            <div className="text-[10px] text-gray-400 uppercase">{t('guide.implied_prob')}</div>
            <div className="text-xl font-bold font-orbitron text-vantage-cyan">
              {probability > 0 ? `${probability.toFixed(1)}%` : '0.0%'}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Bankroll Management */}
      <GlassCard className="border-green-500/20 bg-green-500/5">
         <div className="flex items-center space-x-2 text-green-500 mb-4">
          <Wallet size={20} />
          <h3 className="text-sm font-bold uppercase tracking-wider">{t('guide.bankroll_title')}</h3>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-white/50 dark:bg-black/20 rounded-xl">
             <div className="p-1.5 bg-green-500/20 rounded-lg text-green-500 mt-0.5">
                <AlertTriangle size={14} />
             </div>
             <div>
               <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Risk Control</p>
               <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{t('guide.bankroll_rule_1')}</p>
             </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-white/50 dark:bg-black/20 rounded-xl">
             <div className="p-1.5 bg-green-500/20 rounded-lg text-green-500 mt-0.5">
                <Scale size={14} />
             </div>
             <div>
               <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Unit Strategy</p>
               <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{t('guide.bankroll_rule_2')}</p>
             </div>
          </div>
        </div>
      </GlassCard>

      {/* Pro Usage Tips */}
      <GlassCard className="border-vantage-purple/30 bg-vantage-purple/5">
          <div className="flex items-center space-x-2 text-vantage-purple mb-4">
              <Target size={20} />
              <h3 className="text-sm font-bold uppercase tracking-wider">{t('guide.usage_title')}</h3>
          </div>
          <ul className="space-y-3">
              <li className="flex gap-3 items-start">
                  <CheckCircle2 size={16} className="text-green-500 mt-1 shrink-0" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('guide.usage_tip1')}</span>
              </li>
              <li className="flex gap-3 items-start">
                  <CheckCircle2 size={16} className="text-green-500 mt-1 shrink-0" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{t('guide.usage_tip2')}</span>
              </li>
          </ul>
      </GlassCard>

      {/* Ticket Diversification */}
      <GlassCard className="border-blue-500/20 bg-blue-500/5">
          <div className="flex items-center space-x-2 text-blue-500 mb-4">
              <Layers size={20} />
              <h3 className="text-sm font-bold uppercase tracking-wider">{t('guide.div_title')}</h3>
          </div>
          <div className="space-y-4">
              <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20 text-xs text-red-500">
                  <span className="font-bold block mb-1">❌ The Rookie Mistake</span>
                  {t('guide.div_desc')}
              </div>
              <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-xs text-green-600 dark:text-green-400">
                  <span className="font-bold block mb-1">✅ The Pro Strategy</span>
                  {t('guide.div_strat')}
              </div>
          </div>
      </GlassCard>

      {/* Advanced Strategies */}
      <div>
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3 ml-1 flex items-center gap-2">
           <BookOpen size={14} /> {t('guide.strategy_title')}
        </h3>
        
        <div className="grid gap-4">
           {/* Value Betting */}
           <GlassCard className="!p-0 overflow-hidden">
              <div className="p-4 bg-vantage-purple/10 border-b border-vantage-purple/10 flex items-center justify-between">
                 <div className="flex items-center gap-2 text-vantage-purple">
                    <TrendingUp size={18} />
                    <span className="font-bold">{t('guide.strat_value')}</span>
                 </div>
                 <div className="px-2 py-0.5 bg-vantage-purple/20 rounded text-[10px] font-bold text-vantage-purple">PRO</div>
              </div>
              <div className="p-4">
                 <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                   {t('guide.strat_value_desc')}
                 </p>
                 <div className="text-xs bg-slate-100 dark:bg-white/5 p-2 rounded-lg border-l-2 border-vantage-purple text-gray-500">
                    Example: If AI calculates 60% win chance (Odds 1.66) but Bookie offers Odds 2.00 (50%), that is a 10% value edge.
                 </div>
              </div>
           </GlassCard>

           {/* Arbitrage */}
           <GlassCard className="!p-0 overflow-hidden">
              <div className="p-4 bg-blue-500/10 border-b border-blue-500/10 flex items-center justify-between">
                 <div className="flex items-center gap-2 text-blue-500">
                    <Scale size={18} />
                    <span className="font-bold">{t('guide.strat_arbi')}</span>
                 </div>
                 <div className="px-2 py-0.5 bg-blue-500/20 rounded text-[10px] font-bold text-blue-500">ZERO RISK</div>
              </div>
              <div className="p-4">
                 <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                   {t('guide.strat_arbi_desc')}
                 </p>
                 <div className="text-xs bg-slate-100 dark:bg-white/5 p-2 rounded-lg border-l-2 border-blue-500 text-gray-500">
                    Requires accounts on multiple bookmakers (1xBet, Premier Bet, Betmomo) to exploit price differences.
                 </div>
              </div>
           </GlassCard>
        </div>
      </div>

      {/* Psychology */}
      <GlassCard className="border-orange-500/30 bg-orange-500/5">
        <div className="flex items-center space-x-2 text-orange-500 mb-3">
          <Brain size={20} />
          <h3 className="text-sm font-bold uppercase tracking-wider">{t('guide.psy_title')}</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
           {t('guide.psy_desc')}
        </p>
      </GlassCard>

    </div>
  );
};