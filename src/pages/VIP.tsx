import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Star, ShieldCheck, CheckCircle2, Unlock, Loader2, Zap, Flame, Copy, Check, Clock, User, ArrowRight, ShieldAlert, BrainCircuit, Layers, RefreshCw, Crown, Sparkles, TrendingUp } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useAppContext } from '../context/AppContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { PaymentModal } from '../components/PaymentModal';
import { NavigationTab, Match } from '../types';
import { TeamLogo } from '../components/TeamLogo';
import { AccumulatorModal } from '../components/AccumulatorModal';

interface VIPProps {
  setTab: (tab: NavigationTab) => void;
}

export const VIP: React.FC<VIPProps> = ({ setTab }) => {
  const { t, language } = useAppContext();
  const { predictions, loading } = useData();
  const { user, userProfile, isAdmin, verifyTransaction } = useAuth();
  
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Accumulator Modal State
  const [isAccuOpen, setIsAccuOpen] = useState(false);
  const [accuRisk, setAccuRisk] = useState<'low' | 'medium' | 'high'>('medium');

  const plans = [
    { 
        id: 'daily', 
        label: t('vip.plan_daily'), 
        price: '500', 
        originalPrice: null,
        badge: null,
        features: [t('vip.feat_1')],
        color: 'border-slate-700 bg-slate-800/50' 
    },
    { 
        id: 'weekly', 
        label: t('vip.plan_weekly'), 
        price: '1500', 
        originalPrice: '3500', // 500 * 7 = 3500
        badge: 'MOST POPULAR',
        features: [t('vip.feat_1'), 'Accumulator Access', 'Priority Support'],
        color: 'border-vantage-purple bg-vantage-purple/10 shadow-[0_0_30px_rgba(168,85,247,0.15)]' 
    },
    { 
        id: 'monthly', 
        label: t('vip.plan_monthly'), 
        price: '4500', 
        originalPrice: '15000', // 500 * 30 = 15000
        badge: 'BEST VALUE',
        features: ['Full Month Access', 'All Features', 'VIP WhatsApp', 'Biggest Saving'],
        color: 'border-vantage-cyan bg-vantage-cyan/10 shadow-[0_0_30px_rgba(34,211,238,0.15)]' 
    },
  ] as const;

  const handlePlanClick = (planId: 'daily' | 'weekly' | 'monthly') => {
      setSelectedPlanId(planId);
      setShowPaymentModal(true);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const openAccumulator = (risk: 'low' | 'medium' | 'high') => {
    setAccuRisk(risk);
    setIsAccuOpen(true);
  };

  const handleManualCheck = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const transId = urlParams.get('transId');
      
      if (!transId) {
          alert(language === 'fr' ? "Aucune transaction trouvée dans l'URL." : "No transaction ID found.");
          return;
      }

      setIsVerifying(true);
      const success = await verifyTransaction(transId);
      setIsVerifying(false);

      if (success) {
          alert(language === 'fr' ? "Transaction validée ! Bienvenue VIP." : "Transaction verified! Welcome VIP.");
      } else {
          alert(language === 'fr' ? "Transaction non trouvée ou échouée." : "Transaction not found or failed.");
      }
  };

  const getPredictionText = (match: Match) => {
    if (language === 'fr') return match.prediction_fr || match.prediction;
    return match.prediction_en || match.prediction;
  };

  const getAnalysisText = (match: Match) => {
    if (language === 'fr') return match.analysis_fr || match.analysis;
    return match.analysis_en || match.analysis;
  };

  const isUnlocked = (userProfile?.isVip === true) || isAdmin;

  const safeBets = predictions.filter(m => m.category === 'safe');
  const valueBets = predictions.filter(m => m.category === 'value');
  const riskyBets = predictions.filter(m => m.category === 'risky');

  const renderMatchList = (matches: Match[], title: string, icon: React.ReactNode, color: string) => {
    if (matches.length === 0) return null;
    return (
      <div className="space-y-3 mb-6">
        <h3 className={`text-sm font-bold uppercase tracking-widest flex items-center gap-2 ${color}`}>
          {icon} {title}
        </h3>
        {matches.map((match) => (
          <GlassCard key={match.id} className="border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1">{match.league}</span>
                <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{match.time}</span>
                    <button
                        onClick={() => handleCopy(`${match.homeTeam} vs ${match.awayTeam}`, match.id)}
                        className="p-1.5 rounded-md bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-gray-400 dark:text-gray-500 hover:text-vantage-cyan dark:hover:text-vantage-cyan"
                        title="Copier le match"
                    >
                        {copiedId === match.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </button>
                </div>
            </div>
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-3 w-5/12 overflow-hidden">
                    <TeamLogo src={match.homeTeamLogo} teamName={match.homeTeam} className="w-8 h-8" />
                    <span className="text-base font-bold text-slate-900 dark:text-white truncate">{match.homeTeam}</span>
                </div>
                <span className="text-xs text-gray-400">VS</span>
                <div className="flex items-center justify-end space-x-3 w-5/12 overflow-hidden">
                    <span className="text-base font-bold text-slate-900 dark:text-white text-right truncate">{match.awayTeam}</span>
                    <TeamLogo src={match.awayTeamLogo} teamName={match.awayTeam} className="w-8 h-8" />
                </div>
            </div>
            
            <div className="p-3 bg-slate-100 dark:bg-black/30 rounded-xl flex items-center justify-between border border-slate-200 dark:border-white/5 relative overflow-hidden">
                <div 
                  className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-vantage-cyan to-green-400 opacity-50" 
                  style={{ width: `${match.confidence}%` }}
                />

                <div className="flex flex-col flex-1 mr-4 min-w-0">
                   <span className="text-[10px] text-gray-500 uppercase tracking-wide">{t('free.pred_label')}</span>
                   <span className="text-sm font-bold text-vantage-cyan break-words leading-tight">{getPredictionText(match)}</span>
                </div>

                <div className="flex flex-col items-end border-l border-slate-200 dark:border-white/5 pl-4 shrink-0">
                   <span className="text-[10px] text-gray-500 uppercase tracking-wide">{t('free.prob_label')}</span>
                   <span className="text-sm font-bold text-green-500 dark:text-green-400">{match.confidence}%</span>
                </div>
            </div>

            <div className="mt-3 flex items-start gap-2 bg-slate-50 dark:bg-white/5 p-2 rounded-lg border border-slate-100 dark:border-white/5">
                <BrainCircuit size={14} className="text-vantage-purple mt-0.5 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-vantage-purple font-bold uppercase">AI Reasoning</span>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-tight">
                    {getAnalysisText(match)}
                  </p>
                </div>
            </div>
          </GlassCard>
        ))}
      </div>
    );
  };

  const selectedPlanObj = plans.find(p => p.id === selectedPlanId) || plans[0];

  // --- UNLOCKED VIEW (Active VIP) ---
  if (isUnlocked) {
    return (
        <div className="space-y-4 pb-24 relative min-h-screen">
           <div className="flex flex-col space-y-1">
             <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">{t('vip.title')} <span className="text-vantage-purple">{t('vip.title_accent')}</span></h1>
             <p className="text-sm text-gray-500 dark:text-gray-400">{t('vip.subtitle')}</p>
           </div>
           
           <GlassCard className="border-green-500/30 bg-green-500/5 mb-6">
             <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
                    {isAdmin ? <ShieldAlert size={24} className="text-red-500" /> : <CheckCircle2 size={24} />}
                    <span className="font-bold text-lg">
                        {isAdmin ? 'Admin Bypass Active' : t('vip.active')}
                    </span>
                </div>
                {userProfile?.vipExpiry && !isAdmin && (
                    <span className="text-xs font-bold font-orbitron text-green-800 dark:text-green-200 bg-green-500/10 px-2 py-1 rounded">
                      Exp: {new Date(userProfile.vipExpiry).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                    </span>
                )}
             </div>
           </GlassCard>

           {/* SMART ACCUMULATORS SECTION */}
           <div className="mb-8">
              <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-slate-700 dark:text-gray-300 mb-3">
                 <Layers size={16} className="text-vantage-purple" /> Smart Accumulators
              </h3>
              <div className="grid grid-cols-3 gap-3">
                 <button 
                   onClick={() => openAccumulator('low')}
                   className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-green-500/50 hover:bg-green-500/10 transition-all group"
                 >
                    <ShieldCheck size={24} className="text-green-500 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-slate-700 dark:text-white">Safe Acca</span>
                    <span className="text-[10px] text-gray-500">Low Risk</span>
                 </button>
                 <button 
                   onClick={() => openAccumulator('medium')}
                   className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-vantage-cyan/50 hover:bg-vantage-cyan/10 transition-all group"
                 >
                    <Zap size={24} className="text-vantage-cyan mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-slate-700 dark:text-white">Value Acca</span>
                    <span className="text-[10px] text-gray-500">Best Odds</span>
                 </button>
                 <button 
                   onClick={() => openAccumulator('high')}
                   className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-orange-500/50 hover:bg-orange-500/10 transition-all group"
                 >
                    <Flame size={24} className="text-orange-500 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-slate-700 dark:text-white">High Risk</span>
                    <span className="text-[10px] text-gray-500">Big Win</span>
                 </button>
              </div>
           </div>

           {renderMatchList(safeBets, "Sure Bets (Safe)", <ShieldCheck size={16} />, "text-green-500")}
           {renderMatchList(valueBets, "Value Picks", <Star size={16} />, "text-vantage-cyan")}
           {renderMatchList(riskyBets, "High Risk / High Reward", <Flame size={16} />, "text-orange-500")}
           
           <AccumulatorModal isOpen={isAccuOpen} onClose={() => setIsAccuOpen(false)} initialRisk={accuRisk} />
        </div>
    );
  }

  // --- LOCKED VIEW (Conversion Page) ---
  return (
    <div className="space-y-4 pb-24 relative min-h-screen">
      <div className="flex flex-col space-y-1 relative z-10">
        <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">{t('vip.title')} <span className="text-vantage-purple">{t('vip.title_accent')}</span></h1>
        <div className="flex items-center gap-2 text-xs text-green-500 font-bold bg-green-500/10 w-fit px-2 py-0.5 rounded-full border border-green-500/20">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            2,405 VIPs Active Now
        </div>
      </div>

      <div className="absolute top-20 right-0 w-64 h-64 bg-vantage-purple/10 rounded-full blur-[80px] pointer-events-none" />

      {loading ? (
        <div className="flex justify-center items-center py-20">
           <Loader2 className="animate-spin text-vantage-purple" size={40} />
        </div>
      ) : !user ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <GlassCard className="flex flex-col items-center text-center p-8 border-vantage-purple/20 bg-vantage-purple/5">
             <div className="w-16 h-16 bg-slate-200 dark:bg-white/10 rounded-full flex items-center justify-center mb-4 text-gray-500 dark:text-gray-400">
               <User size={32} />
             </div>
             <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('auth.auth_error') || 'Authentication Required'}</h3>
             <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
               {t('auth.login_subtitle') || 'Please log in or create an account to view VIP plans and predictions.'}
             </p>
             <button
               onClick={() => setTab('profile')}
               className="px-6 py-3 bg-vantage-purple hover:bg-purple-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-vantage-purple/20 flex items-center space-x-2"
             >
               <span>{t('auth.login_btn')}</span>
               <ArrowRight size={18} />
             </button>
          </GlassCard>
        </div>
      ) : (
        <>
          {/* TEASER SECTION (Locked Content Visual) */}
          <div className="relative mb-8">
             {/* The "Blur" Effect Layer */}
             <div className="absolute inset-0 z-20 backdrop-blur-[6px] bg-vantage-bg/30 rounded-2xl flex flex-col items-center justify-center text-center p-4 border border-vantage-purple/30">
                <div className="w-14 h-14 bg-vantage-purple text-white rounded-full flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(168,85,247,0.4)]">
                    <Lock size={24} />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Premium Analysis Locked</h3>
                <p className="text-xs text-gray-300 mb-4 max-w-[200px]">
                    Unlock 3 "Sure Banker" matches and our high-yield accumulator for today.
                </p>
                <button 
                    onClick={() => document.getElementById('plans-section')?.scrollIntoView({ behavior: 'smooth' })}
                    className="text-xs font-bold text-vantage-cyan flex items-center gap-1 hover:underline"
                >
                    View Access Plans <ArrowRight size={12} />
                </button>
             </div>

             {/* Fake Content Behind Blur */}
             <div className="opacity-50 pointer-events-none select-none filter grayscale-[50%]">
                {[1, 2].map(i => (
                  <div key={i} className="mb-3 p-4 rounded-xl border border-white/5 bg-white/5 flex justify-between items-center"> 
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-700" />
                        <div className="space-y-1">
                            <div className="h-3 w-20 bg-slate-700 rounded" />
                            <div className="h-2 w-12 bg-slate-700 rounded" />
                        </div>
                    </div>
                    <div className="h-6 w-12 bg-green-500/20 rounded" />
                  </div>
                ))}
             </div>
          </div>

          <div id="plans-section" className="space-y-4">
             <div className="flex items-center justify-between px-1">
                 <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">{t('vip.select_plan')}</h3>
                 <div className="flex items-center gap-1.5 text-[10px] text-vantage-purple bg-vantage-purple/10 px-2 py-0.5 rounded border border-vantage-purple/20">
                     <Sparkles size={10} /> 90% Win Rate
                 </div>
             </div>

             {/* HIGH CONVERSION PRICING CARDS */}
             <div className="flex flex-col gap-4">
                {plans.map((plan) => (
                    <motion.button
                        key={plan.id}
                        onClick={() => handlePlanClick(plan.id as any)}
                        whileTap={{ scale: 0.98 }}
                        className={`
                            relative w-full text-left p-0 rounded-2xl border transition-all duration-300 overflow-hidden group
                            ${plan.color}
                            ${selectedPlanId === plan.id ? 'ring-2 ring-vantage-purple ring-offset-2 ring-offset-black' : ''}
                        `}
                    >
                        {/* Popular Badge */}
                        {plan.badge && (
                            <div className="absolute top-0 right-0 bg-gradient-to-l from-vantage-purple to-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-lg flex items-center gap-1 z-10">
                                {plan.badge === 'MOST POPULAR' && <Crown size={10} fill="currentColor" />}
                                {plan.badge}
                            </div>
                        )}

                        <div className="p-5 flex justify-between items-center relative z-0">
                             <div className="flex flex-col gap-1">
                                 <span className="text-sm font-bold text-slate-300 uppercase tracking-wide">{plan.label}</span>
                                 <div className="flex items-baseline gap-2">
                                     <span className="text-2xl font-bold font-orbitron text-white">{plan.price} <span className="text-sm text-gray-400 font-sans">FCFA</span></span>
                                     {plan.originalPrice && (
                                         <span className="text-xs text-gray-500 line-through decoration-red-500 decoration-2">{plan.originalPrice}</span>
                                     )}
                                 </div>
                                 <div className="flex items-center gap-2 mt-2">
                                     {plan.features.map((feat, idx) => (
                                         <span key={idx} className="text-[10px] flex items-center text-gray-400 bg-black/20 px-2 py-0.5 rounded-full">
                                             <Check size={8} className="mr-1 text-vantage-cyan" /> {feat}
                                         </span>
                                     ))}
                                 </div>
                             </div>
                             
                             <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-vantage-purple group-hover:text-white transition-colors text-gray-400">
                                 <ArrowRight size={20} />
                             </div>
                        </div>

                        {/* Hover Effect */}
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    </motion.button>
                ))}
             </div>

             {/* Trust Signals */}
             <div className="pt-4 flex flex-col items-center space-y-3">
                 <div className="flex items-center gap-4 opacity-60 grayscale hover:grayscale-0 transition-all">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/MTN_Logo.svg/1024px-MTN_Logo.svg.png" alt="MTN" className="h-6 object-contain" />
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Orange_logo.svg/1200px-Orange_logo.svg.png" alt="Orange" className="h-6 object-contain" />
                 </div>
                 
                 <div className="flex items-center gap-1 text-[10px] text-gray-500">
                     <ShieldCheck size={12} className="text-green-500" />
                     <span>Secure Payment via Fapshi • Instant Activation</span>
                 </div>

                 {/* Manual Verification Button */}
                 <div className="w-full border-t border-slate-200 dark:border-white/5 pt-2 mt-2">
                     <button 
                         onClick={handleManualCheck}
                         disabled={isVerifying}
                         className="w-full text-xs text-gray-500 hover:text-vantage-cyan flex items-center justify-center space-x-1 py-1"
                     >
                         <RefreshCw size={12} className={isVerifying ? "animate-spin" : ""} />
                         <span>
                             {language === 'fr' ? "Problème d'activation ? Vérifier le statut" : "Activation issue? Check status"}
                         </span>
                     </button>
                 </div>
             </div>
          </div>
        </>
      )}

      <PaymentModal 
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        plan={selectedPlanObj}
        onSuccess={() => console.log("Payment flow completed")}
      />
    </div>
  );
};