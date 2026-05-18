import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, TrendingUp, ShieldAlert, CheckCircle2, DollarSign } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';

interface PortfolioOnboardingProps {
    onComplete: () => void;
    onCancel?: () => void;
    initialBankroll?: number;
    initialRisk?: 'low' | 'medium' | 'high';
    isEditMode?: boolean;
}

export const PortfolioOnboarding: React.FC<PortfolioOnboardingProps> = ({
    onComplete,
    onCancel,
    initialBankroll,
    initialRisk,
    isEditMode = false
}) => {
    const { updatePortfolioConfig } = useAuth();
    const { t, language, showToast } = useAppContext();
    const [bankroll, setBankroll] = useState<string>(initialBankroll ? String(initialBankroll) : '');
    const [risk, setRisk] = useState<'low' | 'medium' | 'high'>(initialRisk || 'medium');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCancel = () => {
        if (onCancel) onCancel();
        else onComplete();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = parseInt(bankroll, 10);
        if (isNaN(value) || value < 1000) {
            showToast(language === 'fr' ? 'Le capital initial doit être d\'au moins 1000' : 'Starting bankroll must be at least 1000', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await updatePortfolioConfig(value, risk);
            showToast(language === 'fr' ? 'Configuration du portefeuille enregistrée' : 'Portfolio configuration saved', 'success');
            onComplete();
        } catch (error) {
            console.error(error);
            showToast(language === 'fr' ? 'Erreur lors de la sauvegarde' : 'Error saving configuration', 'error');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md bg-slate-900 border border-vantage-cyan/30 rounded-2xl overflow-hidden shadow-2xl shadow-vantage-cyan/10"
            >
                <div className="p-6 sm:p-8">
                    <div className="flex items-center justify-center w-16 h-16 rounded-full bg-vantage-cyan/10 mx-auto mb-6">
                        <Target className="w-8 h-8 text-vantage-cyan" />
                    </div>
                    
                    <h2 className="text-2xl font-black text-center text-white mb-2 uppercase tracking-wide">
                        {language === 'fr' ? 'Configuration Alpha' : 'Alpha Configuration'}
                    </h2>
                    <p className="text-gray-400 text-center mb-8 text-sm">
                        {language === 'fr' 
                            ? 'Définissez votre capital pour que notre IA calcule précisément la taille de vos positions.'
                            : 'Set your bankroll so our AI can calculate precise position sizing using the Kelly Criterion.'}
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Bankroll Input */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                {language === 'fr' ? 'Capital Initial (FCFA)' : 'Starting Bankroll (FCFA)'}
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <DollarSign className="w-5 h-5 text-gray-500" />
                                </div>
                                <input
                                    type="number"
                                    value={bankroll}
                                    onChange={(e) => setBankroll(e.target.value)}
                                    placeholder="e.g. 50000"
                                    className="w-full bg-black/50 border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white font-mono text-lg focus:border-vantage-cyan focus:ring-1 focus:ring-vantage-cyan outline-none transition-all"
                                    required
                                    min="1000"
                                />
                            </div>
                        </div>

                        {/* Risk Tolerance */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                {language === 'fr' ? 'Profil de Risque (Kelly Multiplier)' : 'Risk Profile (Kelly Multiplier)'}
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setRisk('low')}
                                    className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all ${
                                        risk === 'low' 
                                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' 
                                        : 'bg-black/50 border-slate-700 text-gray-500 hover:border-slate-500'
                                    }`}
                                >
                                    <ShieldAlert className="w-5 h-5 mb-1" />
                                    <span className="text-[10px] font-bold uppercase">{language === 'fr' ? 'Faible' : 'Low'}</span>
                                    <span className="text-[9px] font-mono opacity-70">0.25x</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRisk('medium')}
                                    className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all ${
                                        risk === 'medium' 
                                        ? 'bg-vantage-cyan/10 border-vantage-cyan text-vantage-cyan' 
                                        : 'bg-black/50 border-slate-700 text-gray-500 hover:border-slate-500'
                                    }`}
                                >
                                    <CheckCircle2 className="w-5 h-5 mb-1" />
                                    <span className="text-[10px] font-bold uppercase">{language === 'fr' ? 'Moyen' : 'Med'}</span>
                                    <span className="text-[9px] font-mono opacity-70">0.5x</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRisk('high')}
                                    className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all ${
                                        risk === 'high' 
                                        ? 'bg-vantage-purple/10 border-vantage-purple text-vantage-purple' 
                                        : 'bg-black/50 border-slate-700 text-gray-500 hover:border-slate-500'
                                    }`}
                                >
                                    <TrendingUp className="w-5 h-5 mb-1" />
                                    <span className="text-[10px] font-bold uppercase">{language === 'fr' ? 'Élevé' : 'High'}</span>
                                    <span className="text-[9px] font-mono opacity-70">1.0x</span>
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting || !bankroll}
                            className="w-full bg-vantage-cyan text-slate-900 font-bold uppercase tracking-wider py-4 rounded-xl hover:bg-vantage-cyan/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            {isSubmitting ? (
                                <span className="animate-pulse">{language === 'fr' ? 'Enregistrement...' : 'Saving...'}</span>
                            ) : (
                                <span>{language === 'fr' ? 'Enregistrer les modifications' : 'Save Changes'}</span>
                            )}
                        </button>

                        {isEditMode && onCancel && (
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="w-full py-3 border border-slate-700 text-gray-400 font-bold uppercase tracking-wider rounded-xl hover:bg-white/5 transition-colors"
                            >
                                {language === 'fr' ? 'Annuler' : 'Cancel'}
                            </button>
                        )}
                    </form>
                </div>
            </motion.div>
        </div>
    );
};
