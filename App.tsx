import React, { useState, useEffect, lazy, Suspense } from 'react';
import { HashRouter as BrowserRouter, Routes, Route, useNavigate, useLocation, Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AnimatePresence } from 'framer-motion';
import { Loader2, X, Crown, RefreshCw } from 'lucide-react';
import { BottomNav } from './components/BottomNav';
import { ToastContainer } from './components/Toast';
import { BetSlip } from './components/BetSlip';
import { Onboarding } from './components/Onboarding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { PublicStats } from './pages/PublicStats';
import { Results } from './pages/Results';
import { LiveScores } from './pages/LiveScores';
import { MatchDetails } from './pages/MatchDetails';
import { AppProvider, useAppContext } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { enableFirestorePersistence } from './firebaseConfig';
import { PaymentModal } from './components/PaymentModal';
import { MotionDiv } from './components/MotionDiv';
import { TicketWizard } from './components/TicketWizard';

const IS_NATIVE = Capacitor.isNativePlatform();

const LandingPage = !IS_NATIVE
  ? lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })))
  : null;
const BlogIndex = !IS_NATIVE
  ? lazy(() => import('./pages/BlogIndex').then(m => ({ default: m.BlogIndex })))
  : null;
const BlogPost = !IS_NATIVE
  ? lazy(() => import('./pages/BlogPost').then(m => ({ default: m.BlogPost })))
  : null;
const VIP = lazy(() => import('./pages/VIP').then(m => ({ default: m.VIP })));
const Admin = !IS_NATIVE
  ? lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })))
  : null;
const Learn = lazy(() => import('./pages/Learn').then(m => ({ default: m.Learn })));

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();

  const [authView, setAuthView] = useState<'landing' | 'login' | 'signup' | 'stats'>(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'signup') return 'signup';
    if (mode === 'login') return 'login';
    if (mode === 'stats') return 'stats';
    if (IS_NATIVE) return 'login';
    return 'landing';
  });

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showRenewalBanner, setShowRenewalBanner] = useState(false);
  const [showTrialUpsell, setShowTrialUpsell] = useState(false);
  const [renewalDaysLeft, setRenewalDaysLeft] = useState(0);
  const [showTrialPayment, setShowTrialPayment] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  const { theme, language, showToast } = useAppContext();
  const { user, userProfile, loading: authLoading, isAdmin } = useAuth();

  // Firestore persistence + RevenueCat native init
  useEffect(() => {
    enableFirestorePersistence();
    if (!IS_NATIVE) return;
    const setupRevenueCat = async () => {
      try {
        const apiKey = import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY;
        if (!apiKey || apiKey.includes('PLACEHOLDER') || apiKey.includes('your_')) return;
        const { Purchases, LOG_LEVEL } = await import('@revenuecat/purchases-capacitor');
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
        await Purchases.configure({ apiKey });
        console.log('[App] RevenueCat configured successfully');
      } catch (e) {
        console.error('[App] RevenueCat configuration failed:', e);
      }
    };
    setupRevenueCat();
  }, []);

  // RevenueCat link to Firebase UID
  useEffect(() => {
    if (!IS_NATIVE || !user?.uid) return;
    const link = async () => {
      try {
        const { Purchases } = await import('@revenuecat/purchases-capacitor');
        await Purchases.logIn({ appUserID: user.uid });
      } catch (_) {}
    };
    link();
  }, [user?.uid]);

  // Service worker update listener (web-only)
  useEffect(() => {
    if (IS_NATIVE || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') setShowUpdateBanner(true);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (user && !localStorage.getItem('vantage_onboarded')) setShowOnboarding(true);
  }, [user]);

  useEffect(() => {
    if (!userProfile?.isVip || !userProfile.vipExpiry) { setShowRenewalBanner(false); return; }
    const daysLeft = Math.ceil((new Date(userProfile.vipExpiry).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 3 && daysLeft >= 0 && localStorage.getItem('vantage_renewal_dismissed') !== userProfile.vipExpiry) {
      setRenewalDaysLeft(daysLeft); setShowRenewalBanner(true);
    } else { setShowRenewalBanner(false); }
    if (IS_NATIVE) return;
    const td = localStorage.getItem('vantage_trial_upsell_dismissed');
    if (userProfile?.vipPlan === 'weekly' && daysLeft <= 2 && daysLeft >= 0 && td !== userProfile.vipExpiry) {
      setShowTrialUpsell(true);
    } else { setShowTrialUpsell(false); }
  }, [userProfile]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref') || urlParams.get('referrer');
    if (ref) {
      localStorage.setItem('vantage_referral_code', ref.toUpperCase());
      if (!urlParams.get('transId') && !urlParams.get('mode')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem('vantage_onboarded', 'true');
    setShowOnboarding(false);
  };

  if (authLoading) {
    return <div className="min-h-screen flex flex-col items-center justify-center bg-vantage-bg">
      <Loader2 className="animate-spin text-vantage-cyan mb-4" size={40} />
      <p className="text-gray-500 text-sm font-medium animate-pulse">Loading...</p>
    </div>;
  }

  // ── Unauthenticated ───────────────────────────────────────────────────
  if (!user) {
    if (IS_NATIVE) {
      return <div className="min-h-screen font-sans"><main className="container mx-auto max-w-md px-4 pt-6 min-h-screen"><Profile initialMode="login" onBack={() => {}} /></main></div>;
    }
    return (
      <Routes>
        <Route path="/blog" element={<Suspense fallback={null}>{BlogIndex && <BlogIndex />}</Suspense>} />
        <Route path="/blog/:date" element={<Suspense fallback={null}>{BlogPost && <BlogPost />}</Suspense>} />
        <Route path="*" element={
          <div className="min-h-screen selection:bg-vantage-cyan/30 font-sans">
            <div className="fixed inset-0 pointer-events-none z-0"><div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 blur-[100px] rounded-full mix-blend-screen ${theme === 'dark' ? 'bg-vantage-cyan/5' : 'bg-blue-200/40'}`} /></div>
            <main className="relative z-10 container mx-auto max-w-md md:max-w-6xl px-4 pt-6 min-h-screen">
              <AnimatePresence mode="wait">
                {authView === 'landing' ? (
                  <MotionDiv key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -20 }}>
                    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={32} /></div>}>
                      {LandingPage && <LandingPage onGetStarted={() => setAuthView('signup')} onLogin={() => setAuthView('login')} onShowStats={() => setAuthView('stats')} />}
                    </Suspense>
                  </MotionDiv>
                ) : authView === 'stats' ? (
                  <MotionDiv key="stats" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                    <div className="flex flex-col min-h-screen">
                      <div className="flex items-center gap-2 py-4 mb-2"><button onClick={() => setAuthView('landing')} className="p-2 bg-white/5 rounded-lg text-gray-500 hover:text-vantage-cyan"><X size={20} /></button><span className="text-sm font-bold uppercase tracking-widest text-gray-400">Back</span></div>
                      <PublicStats />
                      <div className="mt-auto py-8"><button onClick={() => setAuthView('signup')} className="w-full py-4 bg-white text-slate-900 font-bold rounded-xl shadow-lg">Get Started Free</button></div>
                    </div>
                  </MotionDiv>
                ) : (
                  <MotionDiv key="auth" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                    <div className="max-w-md mx-auto"><Profile initialMode={authView === 'login' ? 'login' : 'signup'} onBack={() => setAuthView('landing')} /></div>
                  </MotionDiv>
                )}
              </AnimatePresence>
            </main>
          </div>
        } />
      </Routes>
    );
  }

  // ── Authenticated ─────────────────────────────────────────────────────
  return (
    <Routes>
      {!IS_NATIVE && <Route path="/blog" element={<Suspense fallback={null}>{BlogIndex && <BlogIndex />}</Suspense>} />}
      {!IS_NATIVE && <Route path="/blog/:date" element={<Suspense fallback={null}>{BlogPost && <BlogPost />}</Suspense>} />}
      <Route path="/match/:id" element={<MatchDetails />} />
      <Route path="*" element={
        <div className="min-h-screen selection:bg-vantage-cyan/30 font-sans md:flex">
          <div className="fixed inset-0 pointer-events-none z-0">
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 blur-[120px] rounded-full mix-blend-screen ${theme === 'dark' ? 'bg-vantage-cyan/5' : 'bg-blue-200/40'}`} />
            <div className={`absolute bottom-0 right-0 w-96 h-96 blur-[120px] rounded-full mix-blend-screen ${theme === 'dark' ? 'bg-vantage-purple/5' : 'bg-purple-200/40'}`} />
          </div>
          {!IS_NATIVE && (
            <AnimatePresence>
              {showUpdateBanner && (
                <MotionDiv
                  initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}
                  className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-sm font-bold shadow-lg"
                >
                  <div className="flex items-center gap-2"><RefreshCw size={15} className="shrink-0 animate-spin" /><span>New version available</span></div>
                  <button onClick={() => window.location.reload()} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full">Refresh</button>
                </MotionDiv>
              )}
            </AnimatePresence>
          )}
          <AnimatePresence>
            {showRenewalBanner && (
              <MotionDiv
                initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}
                className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-gradient-to-r from-vantage-purple to-vantage-cyan text-white text-sm font-bold shadow-lg"
              >
                <div className="flex items-center gap-2"><Crown size={16} /><span>{renewalDaysLeft === 0 ? 'VIP expires today!' : 'VIP expires in ' + renewalDaysLeft + 'd'}</span></div>
                <button onClick={() => navigate('/vip')} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full">Renew</button>
              </MotionDiv>
            )}
          </AnimatePresence>
          <main className="relative z-10 w-full mx-auto max-w-md md:max-w-7xl md:ml-64 px-4 pt-6 min-h-screen pb-24 md:pb-6">
            <AnimatePresence mode="wait">
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-vantage-cyan" size={40} /></div>}>
                <ErrorBoundary>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/free" element={<Home />} />
                    <Route path="/vip" element={<VIP />} />
                    <Route path="/arb" element={<VIP />} />
                    <Route path="/learn" element={<Learn />} />
                    <Route path="/guide" element={<Learn />} />
                    <Route path="/concierge" element={<TicketWizard />} />
                    <Route path="/profile" element={<Profile />} />
                    {!IS_NATIVE && Admin && <Route path="/admin" element={<Admin />} />}
                    <Route path="/stats" element={<PublicStats />} />
                    <Route path="/results" element={<Results />} />
                    <Route path="/live" element={<LiveScores />} />
                  </Routes>
                </ErrorBoundary>
              </Suspense>
            </AnimatePresence>
          </main>
          <BottomNav />
          <AnimatePresence>{showOnboarding ? <Onboarding onComplete={handleOnboardingComplete} /> : null}</AnimatePresence>
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
      <AppProvider><AuthProvider><DataProvider><AppContent /></DataProvider></AuthProvider></AppProvider>
    </BrowserRouter>
  );
}
