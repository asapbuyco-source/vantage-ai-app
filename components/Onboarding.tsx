import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Crown, Gift, ArrowRight, X, Globe, Check, TrendingUp, BarChart3, BrainCircuit } from 'lucide-react';
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
        id: 'ev_explained',
        icon: TrendingUp,
        color: 'text-emerald-400',
        bg: 'from-emerald-400/20 via-vantage-cyan/10 to-transparent',
        badge: 'The Edge Explained',
        title_en: 'What is\n+EV?',
        title_fr: 'Qu\'est-ce que\nle +VE ?',
        desc_en: '+EV means the odds are better than the true probability. If a bookie offers 2.10 for a coin flip, but you know it\'s really 50/50, you have +EV. Our AI finds these gaps every day.',
        desc_fr: '+VE signifie que les cotes sont meilleures que la vraie probabilité. Si un bookmaker offre 2.10 pour un pile ou face, mais que vous savez que c\'est vraiment 50/50, vous avez +VE. Notre IA trouve ces écarts chaque jour.',
    },
    {
        id: 'how_it_works',
        icon: BarChart3,
        color: 'text-vantage-cyan',
        bg: 'from-vantage-cyan/20 via-vantage-purple/10 to-transparent',
        badge: 'The Process',
        title_en: 'Data → Model\n→ Signal',
        title_fr: 'Données → Modèle\n→ Signal',
        desc_en: 'We pull live data from dozens of leagues, run it through our statistical models to calculate win probabilities, then compare against bookie odds to find +EV bets. You just pick from the ranked list.',
        desc_fr: 'Nous collectons les données en direct de dizaines de ligues, les analysons avec nos modèles statistiques pour calculer les probabilités, puis les comparons aux cotes des bookmakers pour trouver les paris +VE. Vous choisissez simplement dans la liste classée.',
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
        id: 'long_game',
        icon: BrainCircuit,
        color: 'text-vantage-purple',
        bg: 'from-vantage-purple/20 via-vantage-cyan/10 to-transparent',
        badge: 'Reality Check',
        title_en: 'Think in 1,000\nbets, not 1',
        title_fr: 'Pensez en 1,000\nparis, pas 1',
        desc_en: 'Even a 60% win-rate model will lose 10 in a row sometimes. That\'s variance. The smart play: bet consistently, size your stakes with Kelly, and trust the model over 1,000 picks. That\'s how edge compounds.',
        desc_fr: 'Même un modèle à 60% de victoires perdra parfois 10 fois de suite. C\'est la variance. La bonne stratégie : pariez régulièrement, taille vos enjeux avec Kelly, et faites confiance au modèle sur 1,000 paris. C\'est ainsi que l\'avantage s\'accumule.',
    },
    {
        id: 'vip',
        icon: Crown,
        color: 'text-yellow-400',
        bg: 'from-yellow-400/20 via-vantage-purple/10 to-transparent',
        badge: 'Premium Access',
        title_en: 'Unlock VIP\nPredictions',
        title_fr: 'Déverrouillez les\nPronostics VIP',
        desc_en: 'VIP members get Smart Accumulators, full match analysis, high-confidence picks (85%+), and real-time updates — starting from just $4.99.',
        desc_fr: 'Les membres VIP ont accès aux Accumulateurs Intelligents, à l\'analyse complète et aux pronostics haute confiance (85%+) dès $4.99.',
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

const firstRunSlideIds = new Set(['welcome', 'ev_explained', 'long_game', 'vip']);

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const { language, showToast } = useAppContext();
    const { updateUserCountry } = useAuth();
    const [step, setStep] = useState(0);
    const [direction, setDirection] = useState(1);
    const [selectedCountry, setSelectedCountry] = useState<string>('other');
    const [isSaving, setIsSaving] = useState(false);

    const onboardingSlides = slides.filter(slide => firstRunSlideIds.has(slide.id));
    const current = onboardingSlides[step];
    const isLast = step === onboardingSlides.length - 1;
    const isCountrySlide = current.id === 'country';

    const countries = [
        { code: 'cm', label_en: 'Cameroon', label_fr: 'Cameroun', flag: '🇨🇲' },
        { code: 'ci', label_en: 'Ivory Coast', label_fr: 'Côte d\'Ivoire', flag: '🇨🇮' },
        { code: 'sn', label_en: 'Senegal', label_fr: 'Sénégal', flag: '🇸🇳' },
        { code: 'ng', label_en: 'Nigeria (NGN)', label_fr: 'Nigéria (NGN)', flag: '🇳🇬' },
        { code: 'ke', label_en: 'Kenya (KES)', label_fr: 'Kenya (KES)', flag: '🇰🇪' },
        { code: 'gh', label_en: 'Ghana (GHS)', label_fr: 'Ghana (GHS)', flag: '🇬🇭' },
        { code: 'za', label_en: 'South Africa (ZAR)', label_fr: 'Afrique du Sud (ZAR)', flag: '🇿🇦' },
        { code: 'other', label_en: 'Other / Default', label_fr: 'Autre / Par défaut', flag: '🌍' }
    ];

    const Icon = current.icon;

    const next = async () => {
        if (isSaving) return;

        // Save country when leaving the country slide
        if (isCountrySlide) {
            setIsSaving(true);
            try {
                await updateUserCountry(selectedCountry);
            } catch (e) {
                console.error('Failed to save country', e);
                showToast(language === 'fr' ? 'Pays non enregistré, vous pourrez le modifier plus tard.' : 'Country save failed, you can update it later in Profile.', 'error');
            } finally {
                setIsSaving(false);
            }
        }

        if (isLast) {
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

    // Determine button label
    const btnLabel = (() => {
        if (isLast) return language === 'fr' ? 'Commencer ✨' : 'Get Started ✨';
        if (isCountrySlide) return language === 'fr' ? 'Confirmer le pays' : 'Confirm Country';
        return language === 'fr' ? 'Suivant' : 'Next';
    })();

    return (
        <div className="fixed inset-0 z-[10000] flex flex-col bg-slate-950">
            {/* Background gradient */}
            <div className={`absolute inset-0 bg-gradient-to-br ${current.bg} transition-all duration-700`} />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.06)_0%,transparent_70%)]" />

            {/* Skip button */}
            <div className="relative z-10 flex justify-end p-4 flex-shrink-0">
                <button
                    onClick={skip}
                    className="text-sm text-gray-500 hover:text-white transition-colors flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-white/10"
                >
                    <X size={14} /> Skip
                </button>
            </div>

            {/* Slide Content — scrollable on mobile for the country slide */}
            <div className="relative z-10 flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                    {/* @ts-ignore */}
                    <motion.div
                        key={current.id}
                        initial={{ opacity: 0, x: direction * 60 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: direction * -60 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className={`h-full w-full flex flex-col items-center px-6 ${isCountrySlide ? 'overflow-y-auto py-4' : 'justify-center py-4'}`}
                    >
                        {/* Icon container */}
                        <div className="relative mb-6 flex-shrink-0">
                            <div className={`w-24 h-24 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-sm shadow-2xl`}>
                                <Icon className={current.color} size={46} strokeWidth={1.5} />
                            </div>
                            {/* Glow */}
                            <div className={`absolute inset-0 rounded-[2rem] blur-2xl opacity-30 bg-gradient-to-br ${current.bg}`} />
                        </div>

                        {/* Badge */}
                        <div className={`mb-4 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest ${current.color} flex-shrink-0`}>
                            {current.badge}
                        </div>

                        {/* Title */}
                        <h1 className="text-2xl font-black text-white font-orbitron leading-tight mb-4 whitespace-pre-line text-center flex-shrink-0">
                            {language === 'fr' ? current.title_fr : current.title_en}
                        </h1>

                        {/* Description */}
                        <p className="text-gray-400 text-sm leading-relaxed max-w-xs mb-5 text-center flex-shrink-0">
                            {language === 'fr' ? current.desc_fr : current.desc_en}
                        </p>

                        {/* Country list — rendered inline, no separate scroll container needed */}
                        {isCountrySlide && (
                            <div className="w-full max-w-xs flex flex-col gap-2 flex-shrink-0 pb-4">
                                {countries.map(c => (
                                    <button
                                        key={c.code}
                                        onClick={() => setSelectedCountry(c.code)}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left w-full ${selectedCountry === c.code ? 'border-blue-400 bg-blue-400/20 text-white' : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                    >
                                        <span className="text-2xl">{c.flag}</span>
                                        <span className="font-bold text-sm flex-1">{language === 'fr' ? c.label_fr : c.label_en}</span>
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedCountry === c.code ? 'border-blue-400 bg-blue-400' : 'border-gray-500'}`}>
                                            {selectedCountry === c.code && <Check size={10} className="text-white" />}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Bottom Controls */}
            <div className="relative z-10 px-6 pb-10 pt-4 flex flex-col items-center gap-4 flex-shrink-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent">
                {/* Progress Dots */}
                <div className="flex gap-2">
                    {onboardingSlides.map((_, idx) => (
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
                    disabled={isSaving}
                    className={`w-full max-w-xs py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed
                        ${isLast
                            ? 'bg-gradient-to-r from-vantage-cyan to-vantage-purple text-white'
                            : isCountrySlide
                                ? 'bg-blue-500 text-white'
                                : 'bg-white text-slate-900'
                        }
                    `}
                >
                    {isSaving ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            {language === 'fr' ? 'Enregistrement...' : 'Saving...'}
                        </span>
                    ) : (
                        <>
                            {btnLabel}
                            {!isLast && !isSaving && (isCountrySlide ? <Check size={18} /> : <ArrowRight size={18} />)}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
