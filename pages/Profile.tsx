

import React, { useState, useEffect } from 'react';
import { Settings, LogOut, ChevronRight, Moon, Sun, User, AlertTriangle, X, Mail, Lock, ArrowRight, CheckCircle2, Crown, ShieldAlert, Globe, FileText, Calendar, CreditCard, MessageCircle, ChevronLeft, Shield, Ticket, Copy, Share2, Coins, Wallet, History, Sparkles, BookOpen, TrendingUp, Target, BarChart3, Activity, PlayCircle, ExternalLink, RefreshCw, Zap, Eye, EyeOff } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { LegalDoc } from '../components/LegalDoc';
import { AppGuide } from '../components/AppGuide';
import { ensureReferralCode } from '../services/db';
import { useNavigate } from 'react-router-dom';

interface ProfileProps {
    initialMode?: 'login' | 'signup';
    onBack?: () => void;
}

export const Profile: React.FC<ProfileProps> = ({ initialMode, onBack }) => {
    const { t, language, setLanguage, theme, toggleTheme } = useAppContext();
    const { user, userProfile, signInWithEmail, signUpWithEmail, resetPassword, logout, deleteAccount, error, clearError, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    const [isLoginMode, setIsLoginMode] = useState(true);
    const [isForgotMode, setIsForgotMode] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [referralCodeInput, setReferralCodeInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [legalPage, setLegalPage] = useState<'privacy' | 'terms' | null>(null);
    const [copiedCode, setCopiedCode] = useState(false);

    // Referral rewards are earned as free VIP days (1 day per 1000 points)
    const referralDaysEarned = userProfile?.referralEarnings
        ? Math.floor(userProfile.referralEarnings / 1000)
        : (userProfile?.referralCount || 0);

    // Sync initial mode prop with internal state & Check for Saved Referral
    useEffect(() => {
        // 1. Set mode
        if (initialMode) {
            setIsLoginMode(initialMode === 'login');
        }

        // 2. Check for saved referral code (on unauthenticated sign-up form)
        const savedRef = localStorage.getItem('vantage_referral_code');
        if (savedRef) {
            setReferralCodeInput(savedRef);
            if (!initialMode) {
                setIsLoginMode(false);
            }
        }
    }, [initialMode]);

    // 3. Auto-generate referral code for authenticated users who don't have one yet
    useEffect(() => {
        if (user && userProfile && !userProfile.referralCode) {
            ensureReferralCode(user.uid);
        }
    }, [user, userProfile]);

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;
        if (!isForgotMode && !password) return;

        setIsSubmitting(true);
        setResetSent(false);

        try {
            if (isForgotMode) {
                await resetPassword(email);
                setResetSent(true);
            } else if (isLoginMode) {
                await signInWithEmail(email, password);
            } else {
                await signUpWithEmail(email, password, referralCodeInput);
                try {
                    if (typeof window !== 'undefined' && (window as any).fbq) {
                        (window as any).fbq('track', 'CompleteRegistration');
                    }
                } catch (err) { console.error('Pixel error', err); }
            }
        } catch (e) {
            // Error handled by AuthContext
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleDeleteAccount = async () => {
        const confirmMessage = language === 'fr'
            ? "Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible."
            : "Are you sure you want to delete your account? This action cannot be undone.";

        if (window.confirm(confirmMessage)) {
            try {
                await deleteAccount();
            } catch (e: any) {
                alert(e.message || "Error deleting account. You may need to re-login recently.");
            }
        }
    };

    const toggleLanguage = () => {
        setLanguage(language === 'fr' ? 'en' : 'fr');
    };

    const openWhatsApp = () => {
        window.open('https://wa.me/237688203629', '_blank');
    };

    const copyReferralCode = () => {
        if (userProfile?.referralCode) {
            navigator.clipboard.writeText(userProfile.referralCode);
            setCopiedCode(true);
            setTimeout(() => setCopiedCode(false), 2000);
        }
    };

const shareReferral = () => {
        const code = userProfile?.referralCode;
        if (!code) return;
        const shareUrl = `${window.location.origin}?ref=${code}`;
        if (navigator.share) {
            navigator.share({
                title: 'Vantage AI — AI Football Picks',
                text: language === 'fr'
                    ? `J'utilise Vantage AI pour mes pronostics. Inscris-toi avec mon lien et gagne des accès VIP !`
                    : `I use Vantage AI for football predictions. Sign up with my link and get VIP access!`,
                url: shareUrl
            }).catch((err) => {
                if (err.name !== 'AbortError') console.error('Share error:', err);
            });
        } else {
            navigator.clipboard.writeText(shareUrl);
            setCopiedCode(true);
            setTimeout(() => setCopiedCode(false), 2000);
        }
    };

    const replayTutorial = () => {
        localStorage.removeItem('vantage_onboarded');
        window.location.reload();
    };

    if (authLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="w-10 h-10 border-4 border-vantage-cyan border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 text-sm">Authentification...</p>
            </div>
        );
    }

    if (legalPage) {
        return (
            <div className="pb-24 relative min-h-screen">
                <LegalDoc type={legalPage} onBack={() => setLegalPage(null)} />
            </div>
        );
    }

    // Removed: AppGuide + Learn Center → moved to /learn

    // --- UNAUTHENTICATED VIEW ---
    if (!user) {
        return (
            <div className="min-h-[80vh] flex flex-col justify-center items-center relative px-2">
                <AnimatePresence>
                    {error && (
                        // @ts-ignore
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="absolute top-0 left-0 right-0 z-50 p-4"
                        >
                            <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/50 rounded-2xl p-4 text-sm relative shadow-xl">
                                <button
                                    onClick={clearError}
                                    className="absolute top-2 right-2 p-1 rounded-full hover:bg-red-500/20 text-red-500 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                                <div className="flex items-start space-x-3">
                                    <div className="p-2 bg-red-500/20 rounded-lg text-red-500 shrink-0">
                                        <AlertTriangle size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-red-500 mb-1">{t('auth.auth_error')}</h3>
                                        <p className="text-slate-700 dark:text-gray-300">{error}</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {
                    // @ts-ignore
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-sm"
                    >
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="absolute top-4 left-0 p-2 text-gray-500 hover:text-white transition-colors"
                            >
                                <ChevronLeft size={24} />
                            </button>
                        )}

                        {/* Language switch — visible before anything else */}
                        <div className="flex justify-center mb-2">
                            <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-full p-1 border border-slate-200 dark:border-white/10">
                                <button
                                    type="button"
                                    onClick={() => setLanguage('fr')}
                                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${language === 'fr' ? 'bg-vantage-cyan text-white' : 'text-gray-500 hover:text-vantage-cyan'}`}
                                >
                                    Français
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLanguage('en')}
                                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${language === 'en' ? 'bg-vantage-cyan text-white' : 'text-gray-500 hover:text-vantage-cyan'}`}
                                >
                                    English
                                </button>
                            </div>
                        </div>

                        <div className="text-center space-y-2 mb-8 mt-4">
                            <div className="w-20 h-20 bg-cyan-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-cyan-200 dark:border-cyan-500/20 shadow-[0_0_30px_rgba(34,211,238,0.2)] dark:bg-vantage-cyan/10 dark:border-vantage-cyan/20">
                                <User size={40} className="text-cyan-600 dark:text-vantage-cyan" />
                            </div>
                            <h1 className="text-3xl font-bold font-orbitron text-slate-900 dark:text-white">
                                VANTAGE<span className="text-vantage-cyan">ID</span>
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {isForgotMode ? t('auth.reset_subtitle') : (isLoginMode ? t('auth.login_subtitle') : t('auth.signup_subtitle'))}
                            </p>
                        </div>

                        <GlassCard className="space-y-6 !p-6">
                            {resetSent ? (
                                <div className="text-center py-6">
                                    <div className="w-12 h-12 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <CheckCircle2 size={24} />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Check your email</h3>
                                    <p className="text-sm text-gray-500 mb-6">{t('auth.reset_success')}</p>
                                    <button onClick={() => { setResetSent(false); setIsForgotMode(false); }} className="text-vantage-cyan font-bold hover:underline">
                                        {t('auth.back_to_login')}
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleEmailAuth} className="space-y-4">
                                    <div className="space-y-1">
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                                <Mail size={18} />
                                            </div>
                                            <input
                                                type="email"
                                                placeholder={t('auth.email_placeholder')}
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-vantage-cyan/50 focus:border-vantage-cyan/50 text-slate-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all outline-none text-sm"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {!isForgotMode && (
                                        <div className="space-y-1">
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                                    <Lock size={18} />
                                                </div>
                                                <input
                                                    type={showPassword ? "text" : "password"}
                                                    placeholder={t('auth.password_placeholder')}
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    className="w-full pl-10 pr-12 py-3 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-vantage-cyan/50 focus:border-vantage-cyan/50 text-slate-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all outline-none text-sm"
                                                    required={!isForgotMode}
                                                    minLength={6}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                >
                                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                </button>
                                            </div>

                                            {/* Referral Code Input - Show in Signup Mode OR if user manually entered one */}
                                            {(!isLoginMode || referralCodeInput.length > 0) && (
                                                <div className="relative mt-2">
                                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                                        <Ticket size={18} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder={t('auth.promo_placeholder')}
                                                        value={referralCodeInput}
                                                        onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                                                        className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-vantage-cyan/50 focus:border-vantage-cyan/50 text-slate-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all outline-none text-sm uppercase"
                                                        maxLength={8}
                                                    />
                                                </div>
                                            )}

                                            {isLoginMode && (
                                                <div className="flex justify-end">
                                                    <button type="button" onClick={() => setIsForgotMode(true)} className="text-xs text-vantage-cyan hover:text-cyan-400 transition-colors">
                                                        {t('auth.forgot_password')}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full py-3 bg-vantage-cyan hover:bg-cyan-400 text-slate-900 font-bold rounded-xl shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <span>{isForgotMode ? t('auth.reset_btn') : (isLoginMode ? t('auth.login_btn') : t('auth.signup_btn'))}</span>
                                        {!isSubmitting && <ArrowRight size={18} />}
                                        {isSubmitting && <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />}
                                    </button>

                                    {isForgotMode && (
                                        <button type="button" onClick={() => { setIsForgotMode(false); clearError(); }} className="w-full py-2 text-gray-500 hover:text-slate-900 dark:hover:text-white text-sm">
                                            {t('auth.back_to_login')}
                                        </button>
                                    )}
                                </form>
                            )}

                            {!isForgotMode && !resetSent && (
                                <>
                                    <div className="text-center pt-1">
                                        {isLoginMode ? (
                                            <button onClick={() => { setIsLoginMode(false); clearError(); }} className="text-sm font-bold text-vantage-cyan hover:text-vantage-purple transition-colors">
                                                New here? <span className="underline underline-offset-2">Create an Account</span> →
                                            </button>
                                        ) : (
                                            <button onClick={() => { setIsLoginMode(true); clearError(); }} className="text-sm font-bold text-vantage-cyan hover:text-vantage-purple transition-colors">
                                                Have an account? <span className="underline underline-offset-2">Sign in</span> →
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex justify-center pt-3 pb-1">
                                        <a href="https://wa.me/237688203629" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-gray-300 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-4 py-2 rounded-full hover:border-vantage-cyan/40 hover:text-vantage-cyan transition-colors">
                                            <Mail size={12} />
                                            {language === 'fr' ? 'Contactez-nous' : 'Contact Us'}
                                        </a>
                                    </div>
                                </>
                            )}
                        </GlassCard>
                    </motion.div>
                }
            </div>
        );
    }

    // --- AUTHENTICATED VIEW (SETTINGS) ---
    if (showSettings) {
        return (
            <div className="space-y-6 pb-24">
                {/* Header */}
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => setShowSettings(false)}
                        className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                    >
                        <ChevronLeft size={24} className="text-slate-900 dark:text-white" />
                    </button>
                    <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">{t('profile.settings')}</h1>
                </div>

                {/* Preferences */}
                <GlassCard className="space-y-4">
                    <div className="flex items-center justify-between p-2">
                        <div className="flex items-center space-x-3 text-slate-700 dark:text-gray-300">
                            <Globe size={20} />
                            <span className="font-medium">{t('profile.language')}</span>
                        </div>
                        <button
                            onClick={toggleLanguage}
                            className="px-4 py-2 bg-slate-100 dark:bg-white/10 rounded-lg text-sm font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-white/5"
                        >
                            {language === 'fr' ? 'Français' : 'English'}
                        </button>
                    </div>

                    <div className="w-full h-px bg-slate-200 dark:bg-white/5" />

                    <div className="flex items-center justify-between p-2">
                        <div className="flex items-center space-x-3 text-slate-700 dark:text-gray-300">
                            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                            <span className="font-medium">{t('profile.theme')}</span>
                        </div>
                        <button
                            onClick={toggleTheme}
                            className="px-4 py-2 bg-slate-100 dark:bg-white/10 rounded-lg text-sm font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-white/5"
                        >
                            {theme === 'dark' ? t('profile.theme_dark') : t('profile.theme_light')}
                        </button>
                    </div>
                </GlassCard>

                {/* Legal Links */}
                <GlassCard className="space-y-1">
                    <button
                        onClick={() => setLegalPage('privacy')}
                        className="w-full flex items-center justify-between p-3 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors group"
                    >
                        <div className="flex items-center space-x-3 text-slate-700 dark:text-gray-300">
                            <Shield size={20} />
                            <span className="font-medium">Privacy Policy</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-vantage-cyan" />
                    </button>

                    <button
                        onClick={() => setLegalPage('terms')}
                        className="w-full flex items-center justify-between p-3 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors group"
                    >
                        <div className="flex items-center space-x-3 text-slate-700 dark:text-gray-300">
                            <FileText size={20} />
                            <span className="font-medium">Terms of Service</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-vantage-cyan" />
                    </button>
                </GlassCard>

                {/* Danger Zone */}
                <div className="pt-8">
                    <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest mb-3 ml-1 flex items-center gap-2">
                        <ShieldAlert size={14} /> Danger Zone
                    </h3>
                    <GlassCard className="border-red-500/30 bg-red-500/5">
                        <p className="text-xs text-gray-500 mb-4">
                            {language === 'fr'
                                ? "La suppression de votre compte est définitive. Toutes vos données, y compris votre statut VIP, seront effacées."
                                : "Deleting your account is permanent. All your data, including VIP status, will be wiped."}
                        </p>
                        <button
                            onClick={handleDeleteAccount}
                            className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-xl border border-red-500/20 transition-colors flex items-center justify-center space-x-2"
                        >
                            <ShieldAlert size={18} />
                            <span>Delete Account</span>
                        </button>
                    </GlassCard>
                </div>
            </div>
        );
    }

    // --- AUTHENTICATED VIEW (MAIN) ---
    return (
        <div className="space-y-6 pb-24 relative">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
                    {t('profile.title')} <span className="text-cyan-600 dark:text-vantage-cyan">{t('profile.title_accent')}</span>
                </h1>
                <button
                    onClick={() => setShowSettings(true)}
                    className="p-2 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white transition-colors border border-slate-200 dark:border-white/5"
                >
                    <Settings size={20} />
                </button>
            </div>

            {/* Profile Card */}
            <GlassCard className="relative overflow-hidden">
                <div className="flex items-center space-x-4 relative z-10">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-vantage-cyan to-vantage-purple p-0.5 shrink-0">
                        {user.photoURL ? (
                            <img src={user.photoURL} alt="Profile" className="w-full h-full rounded-full object-cover border-2 border-black" />
                        ) : (
                            <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-xl">
                                {user.email?.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{user.displayName || user.email?.split('@')[0]}</h2>
                        <div className="flex flex-col mt-1 space-y-1">
                            {userProfile?.isVip ? (
                                <>
                                    <span className="flex items-center w-fit text-xs font-bold text-vantage-purple bg-vantage-purple/10 px-2 py-0.5 rounded border border-vantage-purple/20">
                                        <Crown size={12} className="mr-1" />
                                        {t('profile.member_vip')}
                                    </span>
                                    {userProfile.vipExpiry && (
                                        <span className="text-[10px] text-gray-500">
                                            {t('profile.expires_on')}: {new Date(userProfile.vipExpiry).toLocaleDateString()}
                                        </span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <span className="flex items-center w-fit text-xs font-bold text-gray-500 bg-gray-500/10 px-2 py-0.5 rounded border border-gray-500/20">
                                        <User size={12} className="mr-1" />
                                        {t('profile.member_free')}
                                    </span>
                                    <button
                                        onClick={() => navigate('/vip')}
                                        className="flex items-center gap-1.5 w-fit text-xs font-black text-white bg-gradient-to-r from-vantage-purple to-vantage-cyan px-4 py-2 rounded-xl shadow-lg shadow-vantage-purple/25 hover:opacity-90 transition-opacity"
                                    >
                                        <Crown size={12} />
                                        {language === 'fr' ? 'Passer à VIP' : 'Upgrade to VIP'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Decor */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-vantage-cyan/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
            </GlassCard>

            {/* Referral Program Section */}
            <GlassCard className="border-vantage-purple/20 bg-vantage-purple/5">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2 text-vantage-purple">
                        <Ticket size={20} />
                        <h3 className="text-sm font-bold uppercase tracking-wider">{t('profile.referral_program')}</h3>
                    </div>
                    <button onClick={shareReferral} className="p-1.5 bg-vantage-purple/10 rounded-lg hover:bg-vantage-purple/20 text-vantage-purple transition-colors">
                        <Share2 size={16} />
                    </button>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{t('profile.referral_desc')}</p>

                {/* Code Display */}
                <div className="bg-slate-100 dark:bg-black/30 p-3 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between mb-4">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">{t('profile.referral_code')}</span>
                        <span className="text-lg font-bold font-orbitron text-slate-900 dark:text-white tracking-widest">
                            {userProfile?.referralCode || '...'}
                        </span>
                    </div>
                    <button onClick={copyReferralCode} className="p-2 bg-white dark:bg-white/10 rounded-lg shadow-sm hover:scale-105 transition-transform">
                        {copiedCode ? <CheckCircle2 size={18} className="text-green-500" /> : <Copy size={18} className="text-gray-500" />}
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/50 dark:bg-white/5 rounded-xl p-3 flex flex-col items-center">
                        <span className="text-[10px] text-gray-500 uppercase">{language === 'fr' ? 'Jours Gagnés' : 'Days Earned'}</span>
                        <div className="flex items-center gap-1 text-vantage-purple">
                            <Zap size={14} />
                            <span className="text-xl font-bold">{referralDaysEarned}</span>
                        </div>
                        <span className="text-[9px] text-gray-400 mt-0.5">{language === 'fr' ? 'jours VIP gratuits' : 'free VIP days'}</span>
                    </div>
                    <div className="bg-white/50 dark:bg-white/5 rounded-xl p-3 flex flex-col items-center">
                        <span className="text-[10px] text-gray-500 uppercase">{language === 'fr' ? 'Parrainages' : 'Referrals'}</span>
                        <span className="text-xl font-bold text-slate-900 dark:text-white">{userProfile?.referralCount || 0}</span>
                        <span className="text-[9px] text-gray-400 mt-0.5">{language === 'fr' ? 'amis invités' : 'friends invited'}</span>
                    </div>
                </div>

                {/* How it works banner */}
                <div className="w-full bg-vantage-purple/10 border border-vantage-purple/20 rounded-xl p-3 flex items-start gap-3">
                    <Sparkles size={18} className="text-vantage-purple mt-0.5 shrink-0" />
                    <div>
                        <p className="text-xs font-bold text-vantage-purple mb-0.5">
                            {language === 'fr' ? 'Comment ça marche ?' : 'How it works'}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            {language === 'fr'
                                ? 'Chaque ami qui s\'inscrit avec ton code reçoit 1 jour VIP gratuit — et toi aussi ! Les jours sont crédités automatiquement.'
                                : 'Every friend who signs up with your code gets 1 free VIP day — and so do you! Days are credited automatically.'}
                        </p>
                    </div>
                </div>
            </GlassCard>


            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-3">
                <GlassCard className="p-4 flex flex-col justify-between">
                    <div className="flex items-center space-x-2 text-gray-500 mb-2">
                        <Calendar size={16} />
                        <span className="text-xs uppercase tracking-wide">{t('profile.expiry')}</span>
                    </div>
                    <span className="text-lg font-bold font-orbitron text-slate-900 dark:text-white truncate">
                        {userProfile?.vipExpiry
                            ? new Date(userProfile.vipExpiry).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' })
                            : (userProfile?.isVip ? (language === 'fr' ? 'Illimité' : 'Unlimited') : (language === 'fr' ? 'Inactif' : 'Inactive'))}
                    </span>
                </GlassCard>
                <GlassCard className="p-4 flex flex-col justify-between">
                    <div className="flex items-center space-x-2 text-gray-500 mb-2">
                        <CreditCard size={16} />
                        <span className="text-xs uppercase tracking-wide">{t('profile.total_paid')}</span>
                    </div>
                    <span className="text-xl font-bold font-orbitron text-vantage-purple">
                        {(userProfile?.totalPaid || 0).toLocaleString()} <span className="text-xs text-vantage-purple/50">FCFA</span>
                    </span>
                </GlassCard>
            </div>

            {/* Menu List */}
            <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest ml-1">{t('profile.general')}</h3>

                <GlassCard className="!p-0 overflow-hidden">
                    <button
                        onClick={() => navigate('/results')}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors border-b border-slate-200 dark:border-white/5"
                    >
                        <div className="flex items-center space-x-3 text-slate-700 dark:text-gray-300">
                            <History size={20} />
                            <span className="font-medium">{language === 'fr' ? 'Historique & Résultats' : 'Past Results'}</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-400" />
                    </button>
                    <button
                        onClick={() => navigate('/concierge')}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors border-b border-slate-200 dark:border-white/5"
                    >
                        <div className="flex items-center space-x-3 text-vantage-cyan">
                            <Sparkles size={20} />
                            <span className="font-bold">{language === 'fr' ? 'Ticket Concierge' : 'Smart Ticket'}</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-400" />
                    </button>

                    {/* Learning Hub (moved from bottom nav) */}
                    <button
                        onClick={() => navigate('/learn')}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors border-b border-slate-200 dark:border-white/5"
                    >
                        <div className="flex items-center space-x-3 text-slate-700 dark:text-gray-300">
                            <BookOpen size={20} />
                            <div className="text-left">
                                <span className="font-bold block leading-tight">{language === 'fr' ? 'Centre d\'Apprentissage' : 'Learning Hub'}</span>
                                <span className="text-[10px] text-gray-500">Guides, strategy & betting basics</span>
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-gray-400" />
                    </button>

                    <button
                        onClick={() => setShowSettings(true)}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors border-b border-slate-200 dark:border-white/5"
                    >
                        <div className="flex items-center space-x-3 text-slate-700 dark:text-gray-300">
                            <Settings size={20} />
                            <span className="font-medium">{t('profile.settings_menu')}</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-400" />
                    </button>
                    <button
                        onClick={replayTutorial}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <div className="flex items-center space-x-3 text-vantage-cyan">
                            <RefreshCw size={20} />
                            <span className="font-bold">{language === 'fr' ? 'Revoir le Tutoriel' : 'Replay Tutorial'}</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-400" />
                    </button>
                    <button
                        onClick={openWhatsApp}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <div className="flex items-center space-x-3 text-slate-700 dark:text-gray-300">
                            <MessageCircle size={20} className="text-green-500" />
                            <span className="font-medium">{t('profile.support')}</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-400" />
                    </button>
                </GlassCard>

                {userProfile?.isAdmin && (
                    <GlassCard className="!p-0 overflow-hidden border-red-500/30">
                        <a href="/admin" onClick={(e) => { e.preventDefault(); navigate('/admin'); }} className="w-full flex items-center justify-between p-4 hover:bg-red-500/5 transition-colors">
                            <div className="flex items-center space-x-3 text-red-500">
                                <ShieldAlert size={20} />
                                <span className="font-bold">{t('profile.admin_panel')}</span>
                            </div>
                            <ChevronRight size={18} className="text-red-500" />
                        </a>
                    </GlassCard>
                )}
            </div>

            {/* Logout Button */}
            <button
                onClick={logout}
                className="w-full py-4 mt-6 bg-slate-200 dark:bg-white/5 hover:bg-slate-300 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold rounded-xl transition-all border border-slate-300 dark:border-white/10 flex items-center justify-center space-x-2"
            >
                <LogOut size={20} />
                <span>{t('profile.logout')}</span>
            </button>

            <div className="text-center pt-4">
                <p className="text-[10px] text-gray-500">Vantage AI v4.0.2 • Build 2026</p>
            </div>
        </div>
    );
};
