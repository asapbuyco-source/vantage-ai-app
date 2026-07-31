import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Calculator, TrendingUp, Scale, Brain, ArrowRight, BookOpen, CheckCircle2, Target, Layers } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useAppContext } from '../context/AppContext';

export const AnalysisGuide: React.FC = () => {
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
      <div className="flex flex-col space-y-1">
        <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
          Analysis <span className="text-vantage-purple">Guide</span>
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Understand how to interpret our match data and indicators.</p>
      </div>

      {/* Probability Calculator */}
      <GlassCard className="border-vantage-cyan/30 bg-vantage-cyan/5">
        <div className="flex items-center space-x-2 text-vantage-cyan mb-4">
          <Calculator size={20} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Market Probability Tool</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">Convert market odds to implied probability to compare with our model's analysis.</p>
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <input
              type="number"
              value={oddsInput}
              onChange={(e) => setOddsInput(e.target.value)}
              placeholder="Enter odds (e.g. 2.50)"
              className="w-full p-3 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-vantage-cyan outline-none text-slate-900 dark:text-white font-bold"
            />
          </div>
          <ArrowRight className="text-gray-400" size={20} />
          <div className="flex-1 bg-slate-900 dark:bg-white/10 p-3 rounded-xl text-center border border-white/5">
            <div className="text-[10px] text-gray-400 uppercase">Implied Probability</div>
            <div className="text-xl font-bold font-orbitron text-vantage-cyan">
              {probability > 0 ? `${probability.toFixed(1)}%` : '0.0%'}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Understanding Edge */}
      <GlassCard className="border-green-500/20 bg-green-500/5">
        <div className="flex items-center space-x-2 text-green-500 mb-4">
          <Target size={20} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Understanding Analysis Scores</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-white/50 dark:bg-black/20 rounded-xl">
            <div className="p-1.5 bg-green-500/20 rounded-lg text-green-500 mt-0.5">
              <Scale size={14} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Match Index</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">Our Match Index represents the model's calculated likelihood. Higher values indicate stronger statistical patterns based on historical data, team form, and league dynamics.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-white/50 dark:bg-black/20 rounded-xl">
            <div className="p-1.5 bg-green-500/20 rounded-lg text-green-500 mt-0.5">
              <TrendingUp size={14} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Insight Score</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">Our Insight Score combines multiple statistical inputs to rate how well-supported each analysis is. Higher scores mean more data backing the indicator.</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* How to Use */}
      <GlassCard className="border-vantage-purple/30 bg-vantage-purple/5">
        <div className="flex items-center space-x-2 text-vantage-purple mb-4">
          <Target size={20} />
          <h3 className="text-sm font-bold uppercase tracking-wider">How to Use Our Data</h3>
        </div>
        <ul className="space-y-3">
          <li className="flex gap-3 items-start">
            <CheckCircle2 size={16} className="text-green-500 mt-1 shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Look at multiple indicators, not just one score. A strong Match Index combined with favorable team form is more reliable.</span>
          </li>
          <li className="flex gap-3 items-start">
            <CheckCircle2 size={16} className="text-green-500 mt-1 shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Pay attention to league context — some leagues naturally produce more goals or different outcomes based on playing style.</span>
          </li>
        </ul>
      </GlassCard>

      {/* Diversification */}
      <GlassCard className="border-blue-500/20 bg-blue-500/5">
        <div className="flex items-center space-x-2 text-blue-500 mb-4">
          <Layers size={20} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Analysis Strategy</h3>
        </div>
        <div className="space-y-4">
          <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
            <span className="font-bold block mb-1">Common Misunderstanding</span>
            Taking a single indicator at face value without considering context. Our models work best when multiple factors align.
          </div>
          <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-xs text-green-600 dark:text-green-400">
            <span className="font-bold block mb-1">Best Practice</span>
            Cross-reference our match index, form analysis, and league calibration to identify the strongest supported outcomes. Our model tracks which indicators historically perform best per league.
          </div>
        </div>
      </GlassCard>

      {/* Methodology */}
      <div>
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3 ml-1 flex items-center gap-2">
          <BookOpen size={14} /> Analysis Methodology
        </h3>
        <div className="grid gap-4">
          <GlassCard className="!p-0 overflow-hidden">
            <div className="p-4 bg-vantage-purple/10 border-b border-vantage-purple/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-vantage-purple">
                <TrendingUp size={18} />
                <span className="font-bold">Value Analysis</span>
              </div>
              <div className="px-2 py-0.5 bg-vantage-purple/20 rounded text-[10px] font-bold text-vantage-purple">CORE</div>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                Our model compares its calculated probabilities against market consensus. When our model shows a higher likelihood than what the market implies, it suggests the market may be underestimating that outcome.
              </p>
              <div className="flex items-center gap-2 p-2 bg-white/50 dark:bg-black/20 rounded-lg">
                <Brain size={14} className="text-vantage-purple" />
                <span className="text-[10px] font-bold text-gray-500">AI MODEL + STATISTICAL WEIGHTING</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="!p-0 overflow-hidden">
            <div className="p-4 bg-vantage-cyan/10 border-b border-vantage-cyan/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-vantage-cyan">
                <Scale size={18} />
                <span className="font-bold">Market Comparison</span>
              </div>
              <div className="px-2 py-0.5 bg-vantage-cyan/20 rounded text-[10px] font-bold text-vantage-cyan">ADVANCED</div>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                By comparing indicators across different data sources, you can identify patterns and consensus. Our engine harmonizes multiple statistical models to surface the most consistent findings.
              </p>
              <div className="flex items-center gap-2 p-2 bg-white/50 dark:bg-black/20 rounded-lg">
                <Brain size={14} className="text-vantage-cyan" />
                <span className="text-[10px] font-bold text-gray-500">CROSS-REFERENCED ANALYSIS</span>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
