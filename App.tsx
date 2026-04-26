import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { verifySelarOrder } from './services/selar';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Crown } from 'lucide-react';
import { NavigationTab } from './types';
import { BottomNav } from './components/BottomNav';
import { ToastContainer } from './components/Toast';
import { BetSlip } from './components/BetSlip';
import { Onboarding } from './components/Onboarding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Home } from './pages/Home';
import { FreePicks } from './pages/FreePicks';
import { VIP } from './pages/VIP';
import { Profile } from './pages/Profile';
import { Admin } from './pages/Admin';
import { BettingGuide } from './pages/BettingGuide';
import { Kelly } from './pages/Kelly';
import { TicketWizard } from './components/TicketWizard';
import { LandingPage } from './pages/LandingPage';
import { PublicStats } from './pages/PublicStats';
import { Results } from './pages/Results';
import { LiveScores } from './pages/LiveScores';
import { BlogIndex } from './pages/BlogIndex';
import { BlogPost } from './pages/BlogPost';
import { AppProvider, useAppContext } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { SpecialOfferPopup } from './components/SpecialOfferPopup';

function AppContent() {
  const [activeTab, setActiveTab] = useState<NavigationTab>(() => {
    const saved = localStorage.getItem('vantage_active_tab');
    return (saved as NavigationTab) || 'home';
  });

  const [authView, setAuthView] = useState<'landing' | 'login' | 'signup' | 'stats'>(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'signup') return 'signup';
    if (mode === 'login') return 'login';
    if (mode === 'stats') return 'stats';
    return 'landing';
  });

  // Onboarding: show once, only after login
  const [showOnboarding, setShowOnboarding] = useState(false);
  // VIP renewal reminder
  const [showRenewalBanner, setShowRenewalBanner] = useState(false);
  const [renewalDaysLeft, setRenewalDaysLeft] = useState(0);

  const { theme, language, showToast } = useAppContext();
  const { user, userProfile, verifyTransaction, loading: authLoading, isAdmin } = useAuth();

  // Show onboarding for first-time users
  useEffect(() => {
    if (user && !localStorage.getItem('vantage_onboarded')) {
      setShowOnboarding(true);
    }
  }, [user]);

  // VIP Renewal Reminder — fires when VIP expires within 3 days
  useEffect(() => {
    if (!userProfile?.isVip || !userProfile.vipExpiry) {
      setShowRenewalBanner(false);
      return;
    }
    const expiry = new Date(userProfile.vipExpiry);
    const now = new Date();
    const msLeft = expiry.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    const dismissed = localStorage.getItem('vantage_renewal_dismissed');
    if (daysLeft <= 3 && daysLeft >= 0 && dismissed !== userProfile.vipExpiry) {
      setRenewalDaysLeft(daysLeft);
      setShowRenewalBanner(true);
    } else {
      setShowRenewalBanner(false);
    }
  }, [userProfile]);

  const handleOnboardingComplete = () => {
    localStorage.setItem('vantage_onboarded', 'true');
    setShowOnboarding(false);
  };

  // Persist tab changes
  useEffect(() => {
    if (user) {
      localStorage.setItem('vantage_active_tab', activeTab);
    }
  }, [activeTab, user]);

  // Listen for custom navigation events
  useEffect(() => {
    const handleNav = (e: CustomEvent<NavigationTab>) => {
      setActiveTab(e.detail);
    };
    window.addEventListener('navigate-tab', handleNav as EventListener);
    return () => window.removeEventListener('navigate-tab', handleNav as EventListener);
  }, []);

  // Capture Referral Code from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref') || urlParams.get('referrer');
    if (ref) {
      localStorage.setItem('vantage_referral_code', ref.toUpperCase());
      if (!urlParams.get('transId') && !urlParams.get('mode')) {
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: newUrl }, '', newUrl);
      }
    }
  }, []);

  // ── Unified Payment Verification (Selar first, then Fapshi) ──────────────────
  // Runs ONCE per page load, only after auth is ready. Using a ref guard to
  // prevent re-execution when verifyTransaction function reference changes on renders.
  const paymentChecked = React.useRef(false);

  useEffect(() => {
    // Guard: only run once per page load, and only when auth is fully resolved
    if (authLoading || !user || paymentChecked.current) return;
    // Don't set the flag yet — wait until we actually find something to verify
    // (so a page load with no pending payment doesn't block future checks)

    const checkPayments = async () => {
      const urlParams = new URLSearchParams(window.location.search);

      // 1️⃣  Selar (card / global payment) — check first
      let selarRef = urlParams.get('selar_ref');
      if (!selarRef) {
        const pending = localStorage.getItem('pendingSelarRef');
        if (pending) selarRef = pending;
      }

      if (selarRef) {
        paymentChecked.current = true;
        window.history.replaceState({}, document.title, window.location.pathname);
        localStorage.removeItem('pendingSelarRef');

        const result = await verifySelarOrder(selarRef);
        if (result.success && result.plan) {
          await verifyTransaction(`SELAR_${selarRef}`);
          showToast(
            language === 'fr' ? '✅ Paiement Selar confirmé ! Bienvenue VIP 🎉' : '✅ Selar payment confirmed! Welcome VIP 🎉',
            'success'
          );
          setActiveTab('vip');
        } else if (urlParams.get('selar_ref')) {
          localStorage.removeItem('pendingSelarRef');
          localStorage.removeItem('pendingVipPlan');
          showToast(
            language === 'fr' ? 'Vérification Selar échouée. Contactez le support.' : 'Selar verification failed. Please contact support.',
            'error'
          );
        }
        return;
      }

      // 2️⃣  Fapshi (Cameroon MoMo) — only if Selar was not triggered
      let transId = urlParams.get('transId');
      if (!transId) {
        // Fallback: Check localStorage because Fapshi doesn't append transId to the redirect URL natively
        const pendingFapshi = localStorage.getItem('pendingFapshiTransId');
        if (pendingFapshi) transId = pendingFapshi;
      }

      if (transId) {
        paymentChecked.current = true;
        // Consume transId AFTER we confirmed user is ready, to prevent premature deletion
        localStorage.removeItem('pendingFapshiTransId');
        window.history.replaceState({}, document.title, window.location.pathname);
        const success = await verifyTransaction(transId);
        if (success) {
          showToast(
            language === 'fr' ? 'Paiement réussi ! Bienvenue VIP. 🎉' : 'Payment successful! Welcome VIP. 🎉',
            'success'
          );
          setActiveTab('vip');
        } else {
          showToast(
            language === 'fr' ? 'Paiement en attente ou échoué.' : 'Payment pending or failed.',
            'warning'
          );
        }
      }
    };
    checkPayments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  // Auth loading spinner
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-vantage-bg">
        <Loader2 className="animate-spin text-vantage-cyan mb-4" size={40} />
        <p className="text-gray-500 text-sm font-medium animate-pulse">Establishing Secure Connection...</p>
      </div>
    );
  }

  // Unauthenticated flow — but /blog routes are always publicly accessible
  if (!user) {
    return (
      <Routes>
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:date" element={<BlogPost />} />
        <Route path="*" element={
          <div className="min-h-screen overflow-x-hidden selection:bg-vantage-cyan/30 font-sans">
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
              <div className={`
                absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 
                blur-[100px] rounded-full mix-blend-screen transition-colors duration-500
                ${theme === 'dark' ? 'bg-vantage-cyan/5' : 'bg-blue-200/40'}
                `} />
            </div>
            <main className="relative z-10 container mx-auto max-w-md md:max-w-6xl px-4 pt-6 min-h-screen">
              <AnimatePresence mode="wait">
                {authView === 'landing' ? (
                  // @ts-ignore
                  <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                    <LandingPage
                      onGetStarted={() => setAuthView('signup')}
                      onLogin={() => setAuthView('login')}
                      onShowStats={() => setAuthView('stats')}
                    />
                  </motion.div>
                ) : authView === 'stats' ? (
                  // @ts-ignore
                  <motion.div key="stats" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
                    <div className="flex flex-col min-h-screen">
                      <div className="flex items-center gap-2 py-4 mb-2">
                        <button onClick={() => setAuthView('landing')} className="p-2 bg-white/5 rounded-lg text-gray-500 hover:text-vantage-cyan transition-colors">
                          <X size={20} />
                        </button>
                        <span className="text-sm font-bold uppercase tracking-widest text-gray-400">Back</span>
                      </div>
                      <PublicStats />
                      <div className="mt-auto py-8">
                        <button
                          onClick={() => setAuthView('signup')}
                          className="w-full py-4 bg-white text-slate-900 font-bold rounded-xl shadow-lg"
                        >
                          Get Started Free
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  // @ts-ignore
                  <motion.div key="auth" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
                    <div className="max-w-md mx-auto">
                      <Profile initialMode={authView === 'login' ? 'login' : 'signup'} onBack={() => setAuthView('landing')} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
          </div>
        } />
      </Routes>
    );
  }

  // Authenticated app
  return (
    <Routes>
      {/* ───── Public Blog Routes (NO auth required — for SEO/Google) ───── */}
      <Route path="/blog" element={<BlogIndex />} />
      <Route path="/blog/:date" element={<BlogPost />} />

      {/* ───── All other routes = main authenticated app ───── */}
      <Route path="*" element={
        <div className="min-h-screen overflow-x-hidden selection:bg-vantage-cyan/30 font-sans transition-colors duration-300 md:flex">

          {/* Ambient Background */}
          <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 blur-[120px] rounded-full mix-blend-screen transition-colors duration-500 ${theme === 'dark' ? 'bg-vantage-cyan/5' : 'bg-blue-200/40'}`} />
            <div className={`absolute bottom-0 right-0 w-96 h-96 blur-[120px] rounded-full mix-blend-screen transition-colors duration-500 ${theme === 'dark' ? 'bg-vantage-purple/5' : 'bg-purple-200/40'}`} />
          </div>

          {/* VIP Renewal Reminder Banner */}
          <AnimatePresence>
            {showRenewalBanner && (
              // @ts-ignore
              <motion.div
                initial={{ y: -60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -60, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-gradient-to-r from-vantage-purple to-vantage-cyan text-white text-sm font-bold shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <Crown size={16} className="shrink-0" />
                  <span>
                    {renewalDaysLeft === 0
                      ? (language === 'fr' ? 'Votre VIP expire aujourd\'hui !' : 'Your VIP expires today!')
                      : (language === 'fr' ? `VIP expire dans ${renewalDaysLeft}j — Renouveler` : `VIP expires in ${renewalDaysLeft}d — Renew now`)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('vip')}
                    className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors"
                  >
                    {language === 'fr' ? 'Renouveler' : 'Renew'}
                  </button>
                  <button
                    onClick={() => {
                      localStorage.setItem('vantage_renewal_dismissed', userProfile?.vipExpiry || '');
                      setShowRenewalBanner(false);
                    }}
                    className="text-white/70 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <main className="relative z-10 w-full mx-auto max-w-md md:max-w-7xl md:ml-64 px-4 pt-6 min-h-screen pb-24 md:pb-6" style={{ paddingTop: showRenewalBanner ? '4rem' : undefined }}>
            <AnimatePresence mode="wait">
              {
                // @ts-ignore
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="h-full"
                >
                  <ErrorBoundary>
                    {activeTab === 'home' && <Home setTab={setActiveTab} />}
                    {activeTab === 'free' && <FreePicks setTab={setActiveTab} />}
                    {activeTab === 'vip' && <VIP setTab={setActiveTab} />}
                    {activeTab === 'guide' && <BettingGuide />}
                    {activeTab === 'profile' && <Profile />}
                    {activeTab === 'admin' && <Admin setTab={setActiveTab} />}
                    {activeTab === 'kelly' && <Kelly setTab={setActiveTab} />}
                    {activeTab === 'concierge' && <TicketWizard setTab={setActiveTab} />}
                    {activeTab === 'stats' && <PublicStats setTab={setActiveTab} />}
                    {activeTab === 'results' && <Results />}
                    {activeTab === 'live' && <LiveScores setTab={setActiveTab} />}
                  </ErrorBoundary>
                </motion.div>
              }
            </AnimatePresence>
          </main>

          {activeTab !== 'admin' && <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />}

          {/* Popup priority system: only one at a time */}
          <AnimatePresence>
          {showOnboarding ? (
            <Onboarding onComplete={handleOnboardingComplete} />
          ) : !userProfile?.isVip && !isAdmin ? (
            <SpecialOfferPopup />
          ) : null}
          </AnimatePresence>
          <BetSlip />
          <ToastContainer />
        </div>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AuthProvider>
          <DataProvider>
            <AppContent />
          </DataProvider>
        </AuthProvider>
      </AppProvider>
    </BrowserRouter>
  );
}
