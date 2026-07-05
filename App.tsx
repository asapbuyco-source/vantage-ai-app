import React, { useState, useEffect, lazy, Suspense } from 'react';
import { HashRouter as BrowserRouter, Routes, Route, useNavigate, useLocation, Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AnimatePresence } from 'framer-motion';
import { Loader2, X, Crown, RefreshCw } from 'lucide-react';
import { NavigationTab } from './types';
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

// ── Web-only lazy imports — never loaded on native mobile ─────────────────
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
const WEEKLY_REGULAR_PRICE = '14.99';

// ── Shared lazy imports (used on both platforms) ─────────────────────────
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

  useEffect(() => { enableFirestorePersistence(); }, []);

  // ── Set status bar style + inject real height as CSS var (native only) ────
  useEffect(() => {
    if (!IS_NATIVE) return;
    const initStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#0f172a' });
        // Read the real status bar height and expose it as a CSS variable
        const info = await StatusBar.getInfo();
        const height = (info as any).statusBarHeight ?? 28;
        document.documentElement.style.setProperty('--status-bar-height', `${height}px`);
      } catch (e) {
        // Fallback: use a safe default
        document.documentElement.style.setProperty('--status-bar-height', '28px');
      }
    };
    initStatusBar();
  }, []);

  // Service worker update listener (web-only)
  useEffect(() => {
    if (IS_NATIVE || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') setShowUpdateBanner(true);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  // VIP renewal
  const [showRenewalBanner, setShowRenewalBanner] = useState(false);
  const [renewalDaysLeft, setRenewalDaysLeft] = useState(0);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  const { theme, language, showToast } = useAppContext();
  const { user, userProfile, loading: authLoading, isAdmin } = useAuth();

  // RevenueCat init + link to Firebase UID (native-only, runs after auth resolves)
  useEffect(() => {
    if (!IS_NATIVE || !user?.uid) return;
    const linkRevenueCat = async () => {
      try {
        const apiKey = import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY;
        if (!apiKey || apiKey.includes('PLACEHOLDER') || apiKey.includes('your_')) return;
        const { Purchases } = await import('@revenuecat/purchases-capacitor');
        
        // Initialize RevenueCat SDK
        await Purchases.configure({ apiKey });

        await Purchases.logIn({ appUserID: user.uid });
        console.log('RevenueCat linked to Firebase UID:', user.uid);
      } catch (e) {
        console.error('RevenueCat link error:', e);
      }
    };
    linkRevenueCat();
  }, [user?.uid]);

  useEffect(() => {
    if (user && !localStorage.getItem('vantage_onboarded')) {
      setShowOnboarding(true);
    }
  }, [user]);

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

  // Capture referral code from URL
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

  // Auth loading spinner
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-vantage-bg">
        <Loader2 className="animate-spin text-vantage-cyan mb-4" size={40} />
        <p className="text-gray-500 text-sm font-medium animate-pulse">Establishing Secure Connection...</p>
      </div>
    );
  }

  // ── Unauthenticated flow ───────────────────────────────────────────────────
  if (!user) {
    if (IS_NATIVE) {
      return (
        <div className="min-h-screen overflow-x-hidden font-sans bg-vantage-bg">
          <main className="container mx-auto max-w-md px-4 pt-10 min-h-screen">
            <Profile initialMode="login" onBack={() => {}} />
          </main>
        </div>
      );
    }

    return (
      <Routes>
        <Route path="/blog" element={
          <Suspense fallback={null}>{BlogIndex && <BlogIndex />}</Suspense>
        } />
        <Route path="/blog/:date" element={
          <Suspense fallback={null}>{BlogPost && <BlogPost />}</Suspense>
        } />
        <Route path="*" element={
          <div className="min-h-screen bg-vantage-bg text-white font-sans overflow-x-hidden selection:bg-vantage-cyan/30">
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
              <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 blur-[100px] rounded-full mix-blend-screen transition-colors duration-500 ${theme === 'dark' ? 'bg-vantage-cyan/5' : 'bg-blue-200/40'}`} />
            </div>
            <main className="relative z-10 container mx-auto max-w-md md:max-w-6xl px-4 pt-6 min-h-screen">
              <AnimatePresence mode="wait">
                {authView === 'landing' ? (
                  <MotionDiv key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                    <Suspense fallback={
                      <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={32} /></div>
                    }>
                      {LandingPage && <LandingPage onGetStarted={() => setAuthView('signup')} onLogin={() => setAuthView('login')} onShowStats={() => setAuthView('stats')} />}
                    </Suspense>
                  </MotionDiv>
                ) : authView === 'stats' ? (
                  <MotionDiv key="stats" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
                    <div className="flex flex-col min-h-screen">
                      <div className="flex items-center gap-2 py-4 mb-2">
                        <button onClick={() => setAuthView('landing')} className="p-2 bg-white/5 rounded-lg text-gray-500 hover:text-vantage-cyan transition-colors">
                          <X size={20} />
                        </button>
                        <span className="text-sm font-bold uppercase tracking-widest text-gray-400">Back</span>
                      </div>
                      <PublicStats />
                      <div className="mt-auto py-8">
                        <button onClick={() => setAuthView('signup')} className="w-full py-4 bg-white text-slate-900 font-bold rounded-xl shadow-lg">
                          Get Started Free
                        </button>
                      </div>
                    </div>
                  </MotionDiv>
                ) : (
                  <MotionDiv key="auth" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
                    <div className="max-w-md mx-auto">
                      <Profile initialMode={authView === 'login' ? 'login' : 'signup'} onBack={() => setAuthView('landing')} />
                    </div>
                  </MotionDiv>
                )}
              </AnimatePresence>
            </main>
          </div>
        } />
      </Routes>
    );
  }

  // ── Authenticated app ───────────────────────────────────────────────────────
  return (
    <Routes>
      {/* Blog routes — web only */}
      {!IS_NATIVE && <Route path="/blog" element={<Suspense fallback={null}>{BlogIndex && <BlogIndex />}</Suspense>} />}
      {!IS_NATIVE && <Route path="/blog/:date" element={<Suspense fallback={null}>{BlogPost && <BlogPost />}</Suspense>} />}

      <Route path="/match/:id" element={<MatchDetails />} />

      <Route path="*" element={
        <div className={`min-h-screen overflow-x-hidden selection:bg-vantage-cyan/30 font-sans transition-colors duration-300 md:flex bg-vantage-bg ${IS_NATIVE ? 'pt-[var(--status-bar-height,28px)]' : ''}`}>
          <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 blur-[120px] rounded-full mix-blend-screen transition-colors duration-500 ${theme === 'dark' ? 'bg-vantage-cyan/5' : 'bg-blue-200/40'}`} />
            <div className={`absolute bottom-0 right-0 w-96 h-96 blur-[120px] rounded-full mix-blend-screen transition-colors duration-500 ${theme === 'dark' ? 'bg-vantage-purple/5' : 'bg-purple-200/40'}`} />
          </div>

          {/* New version banner — web only (service worker) */}
          {!IS_NATIVE && <AnimatePresence>
            {showUpdateBanner && (
              <MotionDiv
                initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-sm font-bold shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <RefreshCw size={15} className="shrink-0 animate-spin" />
                  <span>New version available — tap to update</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => window.location.reload()} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors font-black">Refresh Now</button>
                  <button onClick={() => setShowUpdateBanner(false)} className="text-white/70 hover:text-white"><X size={16} /></button>
                </div>
              </MotionDiv>
            )}
          </AnimatePresence>}

          {/* VIP renewal banner */}
          <AnimatePresence>
            {showRenewalBanner && (
              <MotionDiv
                initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}
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
                  <button onClick={() => navigate('/vip')} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors">
                    {language === 'fr' ? 'Renouveler' : 'Renew'}
                  </button>
                  <button onClick={() => { localStorage.setItem('vantage_renewal_dismissed', userProfile?.vipExpiry || ''); setShowRenewalBanner(false); }} className="text-white/70 hover:text-white"><X size={16} /></button>
                </div>
              </MotionDiv>
            )}
          </AnimatePresence>

          <main className="relative z-10 w-full mx-auto max-w-md md:max-w-7xl md:ml-64 px-4 min-h-screen pb-24 md:pb-6" style={{ paddingTop: showRenewalBanner ? '4rem' : IS_NATIVE ? '1rem' : '1.5rem' }}>
            <AnimatePresence mode="wait">
              <Suspense fallback={<div className="min-h-screen flex flex-col items-center justify-center"><Loader2 className="animate-spin text-vantage-cyan mb-4" size={40} /><p className="text-gray-500 text-sm font-medium animate-pulse">Loading...</p></div>}>
                <ErrorBoundary>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/free" element={<Home />} />
                    <Route path="/vip" element={<VIP />} />
                    <Route path="/arb" element={<VIP />} />
                    <Route path="/learn" element={<Learn />} />
                    <Route path="/guide" element={<Learn />} />
                    <Route path="/concierge" element={<Learn />} />
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

          <AnimatePresence>
            {showOnboarding ? <Onboarding onComplete={handleOnboardingComplete} /> : null}
          </AnimatePresence>
          <BetSlip />

          {/* Trial components removed */}
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
