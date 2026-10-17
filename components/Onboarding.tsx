import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Zap, Crown, Gift, ArrowRight, X, Globe, Check, TrendingUp, BarChart3, BrainCircuit } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Flag } from './Flag';

interface OnboardingProps {
    onComplete: () => void;
}

const slides = [
    {
        id: 'language',
        icon: Globe,
        color: 'text-vantage-cyan',
        bg: 'from-vantage-cyan/20 via-vantage-purple/10 to-transparent',
        badge_en: 'Choose Language', badge_fr: 'Choisir la langue', badge_es: 'Elige tu idioma', badge_pt: 'Escolha o idioma',
        title_en: 'Choose your\nlanguage',
        title_fr: 'Choisissez votre\nlangue',
        title_es: 'Elige tu\nidioma',
        title_pt: 'Escolha o seu\nidioma',
        desc_en: 'Select your preferred language. You can change this anytime in settings.',
        desc_fr: 'Sélectionnez votre langue préférée. Vous pourrez la modifier à tout moment dans les paramètres.',
        desc_es: 'Selecciona tu idioma preferido. Puedes cambiarlo cuando quieras en los ajustes.',
        desc_pt: 'Selecione seu idioma preferido. Você pode alterá-lo a qualquer momento nas configurações.',
    },
    {
        id: 'welcome',
        icon: Zap,
        color: 'text-vantage-cyan',
        bg: 'from-vantage-cyan/20 via-vantage-purple/10 to-transparent',
        badge_en: 'AI Sports Analytics', badge_fr: 'Analytique Sportive IA', badge_es: 'Análisis Deportivo IA', badge_pt: 'Análise Esportiva IA',
        title_en: 'Welcome to\nVantage AI',
        title_fr: 'Bienvenue sur\nVantage AI',
        title_es: 'Bienvenido a\nVantage AI',
        title_pt: 'Bem-vindo ao\nVantage AI',
        desc_en: 'Advanced football analysis powered by live data, statistical models, and real performance indicators.',
        desc_fr: 'Analyse football avancée propulsée par des données en direct, des modèles statistiques et de vrais indicateurs de performance.',
        desc_es: 'Análisis de fútbol avanzado impulsado por datos en vivo, modelos estadísticos e indicadores de rendimiento reales.',
        desc_pt: 'Análise de futebol avançada com dados ao vivo, modelos estatísticos e indicadores reais de desempenho.',
    },
    {
        id: 'ev_explained',
        icon: TrendingUp,
        color: 'text-emerald-400',
        bg: 'from-emerald-400/20 via-vantage-cyan/10 to-transparent',
        badge_en: 'The Edge Explained', badge_fr: 'L\'avantage expliqué', badge_es: 'La ventaja explicada', badge_pt: 'A vantagem explicada',
        title_en: 'What is\n+EV?',
        title_fr: 'Qu\'est-ce que\nle +VE ?',
        title_es: '¿Qué es el\n+EV?',
        title_pt: 'O que é\n+EV?',
        desc_en: '+EV means the odds are better than the true probability. If the market offers 2.10 for a coin flip, but our model shows it is really 50/50, that is +EV. Our AI finds these gaps every day.',
        desc_fr: '+VE signifie que les cotes du marché sont meilleures que la vraie probabilité. Si le marché offre 2.10 pour un pile ou face, mais que notre modèle indique 50/50, vous avez +VE. Notre IA trouve ces écarts chaque jour.',
        desc_es: '+EV significa que las cuotas son mejores que la probabilidad real. Si el mercado ofrece 2.10 a un cara o cruz, pero nuestro modelo muestra 50/50, eso es +EV. Nuestra IA encuentra estas diferencias cada día.',
        desc_pt: '+EV significa que as odds são melhores que a probabilidade real. Se o mercado oferece 2.10 para um cara ou coroa, mas nosso modelo mostra 50/50, isso é +EV. Nossa IA encontra essas brechas todos os dias.',
    },
    {
        id: 'how_it_works',
        icon: BarChart3,
        color: 'text-vantage-cyan',
        bg: 'from-vantage-cyan/20 via-vantage-purple/10 to-transparent',
        badge_en: 'The Process', badge_fr: 'Le processus', badge_es: 'El proceso', badge_pt: 'O processo',
        title_en: 'Data → Model\n→ Signal',
        title_fr: 'Données → Modèle\n→ Signal',
        title_es: 'Datos → Modelo\n→ Señal',
        title_pt: 'Dados → Modelo\n→ Sinal',
        desc_en: 'We pull live data from dozens of leagues, run it through our statistical models to calculate win probabilities, then compare against bookie odds to find +EV bets. You just pick from the ranked list.',
        desc_fr: 'Nous collectons les données en direct de dizaines de ligues, les analysons avec nos modèles statistiques pour calculer les probabilités, puis les comparons aux cotes des bookmakers pour trouver les paris +VE. Vous choisissez simplement dans la liste classée.',
        desc_es: 'Extraemos datos en vivo de decenas de ligas, los procesamos con nuestros modelos estadísticos para calcular probabilidades y los comparamos con las cuotas para encontrar apuestas +EV. Tú solo eliges de la lista clasificada.',
        desc_pt: 'Coletamos dados ao vivo de dezenas de ligas, processamos com nossos modelos estatísticos para calcular probabilidades e comparamos com as odds para encontrar apostas +EV. Você só escolhe da lista classificada.',
    },
    {
        id: 'country',
        icon: Globe,
        color: 'text-blue-400',
        bg: 'from-blue-400/20 via-vantage-purple/10 to-transparent',
        badge_en: 'Local Experience', badge_fr: 'Expérience locale', badge_es: 'Experiencia local', badge_pt: 'Experiência local',
        title_en: 'Where are you\nfollowing from?',
        title_fr: 'D\'où pariez-vous ?',
        title_es: '¿Desde dónde\nnos sigues?',
        title_pt: 'De onde você\nestá acompanhando?',
        desc_en: 'Select your country to see local pricing and the best payment methods for your region.',
        desc_fr: 'Sélectionnez votre pays pour voir les prix locaux et les meilleures méthodes de paiement.',
        desc_es: 'Selecciona tu país para ver precios locales y los mejores métodos de pago de tu región.',
        desc_pt: 'Selecione seu país para ver preços locais e os melhores métodos de pagamento da sua região.',
    },
    {
        id: 'long_game',
        icon: BrainCircuit,
        color: 'text-vantage-purple',
        bg: 'from-vantage-purple/20 via-vantage-cyan/10 to-transparent',
        badge_en: 'Reality Check', badge_fr: 'Réalité', badge_es: 'Un poco de realidad', badge_pt: 'Realidade',
        title_en: 'Think in 1,000\npicks, not 1',
        title_fr: 'Pensez en 1,000\nanalyses, pas 1',
        title_es: 'Piensa en 1,000\npicks, no en 1',
        title_pt: 'Pense em 1.000\npicks, não em 1',
        desc_en: 'Even a 60% win-rate model will lose 10 in a row sometimes. That\'s variance. The smart approach: stay consistent, use Kelly-based allocation, and trust the model over 1,000 picks. That\'s how edge compounds.',
        desc_fr: 'Même un modèle à 60% de victoires perdra parfois 10 fois de suite. C\'est la variance. La bonne stratégie : pariez régulièrement, taille vos enjeux avec Kelly, et faites confiance au modèle sur 1,000 paris. C\'est ainsi que l\'avantage s\'accumule.',
        desc_es: 'Incluso un modelo con 60% de acierto perderá 10 seguidas a veces. Eso es varianza. El enfoque inteligente: ser constante, usar asignación basada en Kelly y confiar en el modelo a lo largo de 1,000 picks.',
        desc_pt: 'Mesmo um modelo com 60% de acerto perderá 10 seguidas às vezes. Isso é variância. A abordagem inteligente: seja consistente, use alocação baseada em Kelly e confie no modelo ao longo de 1.000 picks.',
    },
    {
        id: 'vip',
        icon: Crown,
        color: 'text-yellow-400',
        bg: 'from-yellow-400/20 via-vantage-purple/10 to-transparent',
        badge_en: 'Premium Access', badge_fr: 'Accès Premium', badge_es: 'Acceso Premium', badge_pt: 'Acesso Premium',
        title_en: 'Unlock VIP\nAnalysis',
        title_fr: 'Déverrouillez les\nAnalyses VIP',
        title_es: 'Desbloquea el\nAnálisis VIP',
        title_pt: 'Desbloqueie a\nAnálise VIP',
        desc_en: 'VIP members get Smart Accumulators, full match analysis, high-confidence indicators (85%+), and real-time updates — starting from just $3.99.',
        desc_fr: 'Les membres VIP ont accès aux Accumulateurs Intelligents, à l\'analyse complète et aux indicateurs haute confiance (85%+) dès $3.99.',
        desc_es: 'Los miembros VIP obtienen acumuladas inteligentes, análisis completo de partidos, indicadores de alta confianza (85%+) y actualizaciones en tiempo real — desde solo $3.99.',
        desc_pt: 'Membros VIP recebem acumuladas inteligentes, análise completa dos jogos, indicadores de alta confiança (85%+) e atualizações em tempo real — a partir de apenas $3.99.',
    },
    {
        id: 'referral',
        icon: Gift,
        color: 'text-green-400',
        bg: 'from-green-400/20 via-vantage-cyan/10 to-transparent',
        badge_en: '40% Commission', badge_fr: '40% de commission', badge_es: '40% de comisión', badge_pt: '40% de comissão',
        title_en: 'Earn With\nReferrals',
        title_fr: 'Gagnez Avec\nVos Filleuls',
        title_es: 'Gana Con\nReferidos',
        title_pt: 'Ganhe Com\nIndicações',
        desc_en: 'Share your unique code. Every time someone becomes VIP, you earn 40% of their subscription — automatically credited to your wallet.',
        desc_fr: 'Partagez votre code unique. Chaque fois qu\'un filleul devient VIP, vous gagnez 40% de son abonnement — automatiquement crédité.',
        desc_es: 'Comparte tu código único. Cada vez que alguien se hace VIP, ganas el 40% de su suscripción — acreditado automáticamente en tu cartera.',
        desc_pt: 'Compartilhe seu código único. Cada vez que alguém se torna VIP, você ganha 40% da assinatura — creditado automaticamente na sua carteira.',
    },
];

const firstRunSlideIds = new Set(['language', 'welcome', 'ev_explained', 'long_game', 'vip']);

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const navigate = useNavigate();
    const { language, setLanguage, showToast, tr } = useAppContext();
    const { updateUserCountry } = useAuth();
    const [step, setStep] = useState(0);
    const [direction, setDirection] = useState(1);
    const [selectedCountry, setSelectedCountry] = useState<string>('other');
    const [isSaving, setIsSaving] = useState(false);

    const onboardingSlides = slides.filter(slide => firstRunSlideIds.has(slide.id));
    const current = onboardingSlides[step];
    const isLast = step === onboardingSlides.length - 1;
    const isCountrySlide = current.id === 'country';
    const isLanguageSlide = current.id === 'language';

    const countries = [
        { code: 'cm', label_en: 'Cameroon', label_fr: 'Cameroun', label_es: 'Camerún', label_pt: 'Camarões' },
        { code: 'ci', label_en: 'Ivory Coast', label_fr: 'Côte d\'Ivoire', label_es: 'Costa de Marfil', label_pt: 'Costa do Marfim' },
        { code: 'sn', label_en: 'Senegal', label_fr: 'Sénégal', label_es: 'Senegal', label_pt: 'Senegal' },
        { code: 'ng', label_en: 'Nigeria', label_fr: 'Nigéria', label_es: 'Nigeria', label_pt: 'Nigéria' },
        { code: 'ke', label_en: 'Kenya', label_fr: 'Kenya', label_es: 'Kenia', label_pt: 'Quênia' },
        { code: 'gh', label_en: 'Ghana', label_fr: 'Ghana', label_es: 'Ghana', label_pt: 'Gana' },
        { code: 'za', label_en: 'South Africa', label_fr: 'Afrique du Sud', label_es: 'Sudáfrica', label_pt: 'África do Sul' },
        { code: 'other', label_en: 'Other', label_fr: 'Autre', label_es: 'Otro', label_pt: 'Outro' }
    ];

    const langSuffix = language === 'fr' ? 'fr' : language === 'es' ? 'es' : language === 'pt' ? 'pt' : 'en';
    const slideText = (s: any, field: 'title' | 'desc' | 'badge'): string =>
        s[`${field}_${langSuffix}`] ?? s[`${field}_en`] ?? '';
    const countryLabel = (c: any): string => c[`label_${langSuffix}`] ?? c.label_en;

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
                showToast(tr('Pays non enregistré, vous pourrez le modifier plus tard.', 'Country save failed, you can update it later in Profile.', 'No se pudo guardar el país, puedes cambiarlo luego en el Perfil.', 'Não foi possível salvar o país, você pode alterá-lo depois no Perfil.'), 'error');
            } finally {
                setIsSaving(false);
            }
        }

        if (isLast) {
            onComplete();
            navigate('/vip');
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
        if (isLast) return tr('Voir les Plans VIP →', 'See VIP Plans →', 'Ver Planes VIP →', 'Ver Planos VIP →');
        if (isCountrySlide) return tr('Confirmer le pays', 'Confirm Country', 'Confirmar país', 'Confirmar país');
        return tr('Suivant', 'Next', 'Siguiente', 'Próximo');
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
                    <X size={14} /> {tr('Passer', 'Skip', 'Omitir', 'Pular')}
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
                            {slideText(current, 'badge')}
                        </div>

                        {/* Title */}
                        <h1 className="text-2xl font-black text-white font-orbitron leading-tight mb-4 whitespace-pre-line text-center flex-shrink-0">
                            {slideText(current, 'title')}
                        </h1>

                        {/* Description */}
                        <p className="text-gray-400 text-sm leading-relaxed max-w-xs mb-5 text-center flex-shrink-0">
                            {slideText(current, 'desc')}
                        </p>

                        {/* Language selection */}
                        {isLanguageSlide && (
                            <div className="w-full max-w-xs grid grid-cols-2 gap-3 flex-shrink-0 pb-4">
                                {([
                                    ['fr', 'Français'],
                                    ['en', 'English'],
                                    ['es', 'Español'],
                                    ['pt', 'Português'],
                                ] as const).map(([code, name]) => (
                                    <button
                                        key={code}
                                        onClick={() => setLanguage(code)}
                                        className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all w-full ${language === code ? 'border-vantage-cyan bg-vantage-cyan/20 scale-[1.03]' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                    >
                                        {language === code && (
                                            <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-vantage-cyan flex items-center justify-center">
                                                <Check size={10} className="text-white" strokeWidth={3} />
                                            </span>
                                        )}
                                        <span className="text-4xl leading-none">
                                            <Flag code={code} className="w-14 h-[38px] rounded-md shadow-md" />
                                        </span>
                                        <p className={`font-bold text-sm ${language === code ? 'text-white' : 'text-gray-300'}`}>{name}</p>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Country list — flag grid, minimal words */}
                        {isCountrySlide && (
                            <div className="w-full max-w-xs grid grid-cols-2 gap-2.5 flex-shrink-0 pb-4">
                                {countries.map(c => (
                                    <button
                                        key={c.code}
                                        onClick={() => setSelectedCountry(c.code)}
                                        className={`relative flex items-center gap-2.5 p-3 rounded-2xl border-2 transition-all w-full text-left ${selectedCountry === c.code ? 'border-blue-400 bg-blue-400/20' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                                    >
                                        {c.code === 'other' ? (
                                            <Globe size={26} className="text-gray-400 shrink-0" />
                                        ) : (
                                            <Flag code={c.code} className="w-9 h-6 rounded-[3px] shadow-sm shrink-0" />
                                        )}
                                        <span className={`font-bold text-xs truncate ${selectedCountry === c.code ? 'text-white' : 'text-gray-300'}`}>{countryLabel(c)}</span>
                                        {selectedCountry === c.code && (
                                            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center">
                                                <Check size={10} className="text-white" strokeWidth={3} />
                                            </span>
                                        )}
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
                            {tr('Enregistrement...', 'Saving...', 'Guardando...', 'Salvando...')}
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
