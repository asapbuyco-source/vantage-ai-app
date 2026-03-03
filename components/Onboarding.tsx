import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Crown, Gift, ArrowRight, X, Bot, Globe } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

interface OnboardingProps {
    onComplete: () => void;
}

const slides = [
    {
        id: 'welcome',
        icon: Zap,
        color: 'text-vantage-cyan',
        bg: 'from-vantage-cyan/20 via-vantage-purple/10 to-transparent',
        badge: 'Africa #1 AI Platform',
        title_en: 'Welcome to\nVantage AI',
        title_fr: 'Bienvenue sur\nVantage AI',
        desc_en: 'The most advanced sports prediction platform in Africa. Powered by Vantage AI — live data, real analysis, real results.',
        desc_fr: 'La plateforme de pronostics sportifs la plus avancée d\'Afrique. Propulsée par Vantage AI — données en direct, vraie analyse.',
    },
    {
        id: 'ai',
        icon: Bot,
        color: 'text-vantage-purple',
        bg: 'from-vantage-purple/20 via-vantage-cyan/10 to-transparent',
        badge: 'Vantage AI Powered',
        title_en: 'How Our AI\nWorks',
        title_fr: 'Comment fonctionne\nnôtre IA',
        desc_en: 'Every day, our AI scans real football & basketball data, calculates win probabilities, and ranks picks by confidence — so you only see the best.',
        desc_fr: 'Chaque jour, notre IA analyse les données réelles de football et basketball, calcule les probabilités et classe les pronostics par confiance.',
    },
    {
        id: 'country',
        icon: Globe,
        color: 'text-blue-400',
        bg: 'from-blue-400/20 via-vantage-purple/10 to-transparent',
        badge: 'Local Experience',
        title_en: 'Where are you\nbetting from?',
        title_fr: 'D\'où pariez-vous ?',
        desc_en: 'Select your country to see local pricing and the best payment methods for your region.',
        desc_fr: 'Sélectionnez votre pays pour voir les prix locaux et les meilleures méthodes de paiement.',
    },
    {
        id: 'vip',
        icon: Crown,
        color: 'text-yellow-400',
        bg: 'from-yellow-400/20 via-vantage-purple/10 to-transparent',
        badge: 'Premium Access',
        title_en: 'Unlock VIP\nPredictions',
        title_fr: 'Déverrouillez les\nPronostics VIP',
        desc_en: 'VIP members get Smart Accumulators, full match analysis, high-confidence picks (85%+), and real-time updates — starting from just 500 FCFA.',
        desc_fr: 'Les membres VIP ont accès aux Accumulateurs Intelligents, à l\'analyse complète et aux pronostics haute confiance (85%+) dès 500 FCFA.',
    },
    {
        id: 'referral',
        icon: Gift,
        color: 'text-green-400',
        bg: 'from-green-400/20 via-vantage-cyan/10 to-transparent',
        badge: '40% Commission',
        title_en: 'Earn With\nReferrals',
        title_fr: 'Gagnez Avec\nVos Filleuls',
        desc_en: 'Share your unique code. Every time someone becomes VIP, you earn 40% of their subscription — automatically credited to your wallet.',
        desc_fr: 'Partagez votre code unique. Chaque fois qu\'un filleul devient VIP, vous gagnez 40% de son abonnement — automatiquement crédité.',
    },
];

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const { language, showToast } = useAppContext();
    const { updateUserCountry } = useAuth();
    const [step, setStep] = useState(0);
    const [direction, setDirection] = useState(1);
    const [selectedCountry, setSelectedCountry] = useState<string>('other');

    const current = slides[step];
    const isLast = step === slides.length - 1;
    const isLoading = false; // Add real loading state if needed for API calls

    const countries = [
        { code: 'cm', label_en: 'Cameroon (FCFA)', label_fr: 'Cameroun (FCFA)', flag: '🇨🇲' },
        { code: 'ci', label_en: 'Ivory Coast (FCFA)', label_fr: 'Côte d\'Ivoire (FCFA)', flag: '🇨🇮' },
        { code: 'sn', label_en: 'Senegal (FCFA)', label_fr: 'Sénégal (FCFA)', flag: '🇸🇳' },
        { code: 'ng', label_en: 'Nigeria (NGN)', label_fr: 'Nigéria (NGN)', flag: '🇳🇬' },
        { code: 'ke', label_en: 'Kenya (KES)', label_fr: 'Kenya (KES)', flag: '🇰🇪' },
        { code: 'gh', label_en: 'Ghana (GHS)', label_fr: 'Ghana (GHS)', flag: '🇬🇭' },
        { code: 'za', label_en: 'South Africa (ZAR)', label_fr: 'Afrique du Sud (ZAR)', flag: '🇿🇦' },
        { code: 'other', label_en: 'Other / Default', label_fr: 'Autre / Par défaut', flag: '🌍' }
    ];

    const Icon = current.icon;

    const next = async () => {
        if (isLast) {
            if (slides.some(s => s.id === 'country')) {
                await updateUserCountry(selectedCountry).catch(e => {
                    console.error("Failed to save country", e);
                });
            }
            onComplete();
            return;
        }
        setDirection(1);
        setStep(s => s + 1);
    };

    const skip = () => onComplete();

    const goTo = (idx: number) => {
        setDirection(idx > step ? 1 : -1);
        setStep(idx);
    };

    return (
        <div className="fixed inset-0 z-[10000] flex flex-col bg-slate-950">
            {/* Background gradient */}
            <div className={`absolute inset-0 bg-gradient-to-br ${current.bg} transition-all duration-700`} />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.06)_0%,transparent_70%)]" />

            {/* Skip button */}
            <div className="relative z-10 flex justify-end p-5">
                <button
                    onClick={skip}
                    className="text-sm text-gray-500 hover:text-white transition-colors flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-white/10"
                >
                    <X size={14} /> Skip
                </button>
            </div>

            {/* Slide Content */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 -mt-8">
                <AnimatePresence mode="wait">
                    {/* @ts-ignore */}
                    <motion.div
                        key={current.id}
                        initial={{ opacity: 0, x: direction * 60 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: direction * -60 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="flex flex-col items-center text-center"
                    >
                        {/* Icon container */}
                        <div className="relative mb-8">
                            <div className={`w-28 h-28 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-sm shadow-2xl`}>
                                <Icon className={current.color} size={52} strokeWidth={1.5} />
                            </div>
                            {/* Glow */}
                            <div className={`absolute inset-0 rounded-[2rem] blur-2xl opacity-30 bg-gradient-to-br ${current.bg}`} />
                        </div>

                        {/* Badge */}
                        <div className={`mb-4 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest ${current.color}`}>
                            {current.badge}
                        </div>

                        {/* Title */}
                        <h1 className="text-3xl font-black text-white font-orbitron leading-tight mb-5 whitespace-pre-line">
                            {language === 'fr' ? current.title_fr : current.title_en}
                        </h1>

                        {/* Description */}
                        <p className="text-gray-400 text-sm leading-relaxed max-w-xs mb-6">
                            {language === 'fr' ? current.desc_fr : current.desc_en}
                        </p>

                        {current.id === 'country' && (
                            <div className="w-full max-w-xs flex flex-col gap-2 mt-4 overflow-y-auto max-h-[40vh] pb-4 custom-scrollbar">
                                {countries.map(c => (
                                    <button
                                        key={c.code}
                                        onClick={() => setSelectedCountry(c.code)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${selectedCountry === c.code ? 'border-blue-400 bg-blue-400/20 text-white' : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                    >
                                        <span className="text-2xl">{c.flag}</span>
                                        <span className="font-bold text-sm flex-1">{language === 'fr' ? c.label_fr : c.label_en}</span>
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedCountry === c.code ? 'border-blue-400' : 'border-gray-500'}`}>
                                            {selectedCountry === c.code && <div className="w-2 h-2 rounded-full bg-blue-400" />}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Bottom Controls */}
            <div className="relative z-10 px-8 pb-12 flex flex-col items-center gap-6">
                {/* Progress Dots */}
                <div className="flex gap-2">
                    {slides.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => goTo(idx)}
                            className={`h-2 rounded-full transition-all duration-300 ${idx === step ? `w-6 ${current.color.replace('text-', 'bg-')}` : 'w-2 bg-white/20'
                                }`}
                        />
                    ))}
                </div>

                {/* CTA Button */}
                <button
                    onClick={next}
                    className={`w-full max-w-xs py-4 rounded-2xl font-bold text-slate-900 flex items-center justify-center gap-2 shadow-xl transition-all active:scale-95
            ${isLast
                            ? 'bg-gradient-to-r from-vantage-cyan to-vantage-purple text-white'
                            : 'bg-white'
                        }
          `}
                >
                    {isLast
                        ? (language === 'fr' ? 'Commencer ✨' : 'Get Started ✨')
                        : (language === 'fr' ? 'Suivant' : 'Next')
                    }
                    {!isLast && <ArrowRight size={18} />}
                </button>
            </div>
        </div>
    );
};
