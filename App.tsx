import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { NavigationTab } from './types';
import { BottomNav } from './components/BottomNav';
import { ToastContainer } from './components/Toast';
import { BetSlip } from './components/BetSlip';
import { Onboarding } from './components/Onboarding';
import { Home } from './pages/Home';
import { FreePicks } from './pages/FreePicks';
import { VIP } from './pages/VIP';
import { Profile } from './pages/Profile';
import { Admin } from './pages/Admin';
import { BettingGuide } from './pages/BettingGuide';
import { Kelly } from './pages/Kelly';
import { TicketWizard } from './components/TicketWizard';
import { LandingPage } from './pages/LandingPage';
import { AppProvider, useAppContext } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';

function AppContent() {
  const [activeTab, setActiveTab] = useState<NavigationTab>(() => {
    const saved = localStorage.getItem('vantage_active_tab');
    return (saved as NavigationTab) || 'home';
  });

  const [authView, setAuthView] = useState<'landing' | 'login' | 'signup'>(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'signup') return 'signup';
    if (mode === 'login') return 'login';
    return 'landing';
  });

  // Onboarding: show once, only after login
  const [showOnboarding, setShowOnboarding] = useState(false);

  const { theme, language, showToast } = useAppContext();
  const { user, userProfile, verifyTransaction, loading: authLoading } = useAuth();

  // Show onboarding for first-time users
  useEffect(() => {
    if (user && !localStorage.getItem('vantage_onboarded')) {
      setShowOnboarding(true);
    }
  }, [user]);

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

  // Automatic Payment Verification
  useEffect(() => {
    const checkPayment = async () => {
      if (authLoading || !user) return;
      const urlParams = new URLSearchParams(window.location.search);
      const transId = urlParams.get('transId');
      if (transId) {
        const success = await verifyTransaction(transId);
        window.history.replaceState({}, document.title, window.location.pathname);
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
    checkPayment();
  }, [verifyTransaction, language, authLoading, user]);

  // Auth loading spinner
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-vantage-bg">
        <Loader2 className="animate-spin text-vantage-cyan mb-4" size={40} />
        <p className="text-gray-500 text-sm font-medium animate-pulse">Establishing Secure Connection...</p>
      </div>
    );
  }

  // Unauthenticated flow
  if (!user) {
    return (
      <div className="min-h-screen overflow-x-hidden selection:bg-vantage-cyan/30 font-sans">
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className={`
                absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-64 
                blur-[100px] rounded-full mix-blend-screen transition-colors duration-500
                ${theme === 'dark' ? 'bg-vantage-cyan/5' : 'bg-blue-200/40'}
                `} />
        </div>
        <main className="relative z-10 container mx-auto max-w-md px-4 pt-6 min-h-screen">
          <AnimatePresence mode="wait">
            {authView === 'landing' ? (
              // @ts-ignore
              <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <LandingPage onGetStarted={() => setAuthView('signup')} onLogin={() => setAuthView('login')} />
              </motion.div>
            ) : (
              // @ts-ignore
              <motion.div key="auth" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
                <Profile initialMode={authView === 'login' ? 'login' : 'signup'} onBack={() => setAuthView('landing')} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    );
  }

  // Authenticated app
  return (
    <div className="min-h-screen overflow-x-hidden selection:bg-vantage-cyan/30 font-sans transition-colors duration-300">

      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-64 blur-[100px] rounded-full mix-blend-screen transition-colors duration-500 ${theme === 'dark' ? 'bg-vantage-cyan/5' : 'bg-blue-200/40'}`} />
        <div className={`absolute bottom-0 right-0 w-64 h-64 blur-[100px] rounded-full mix-blend-screen transition-colors duration-500 ${theme === 'dark' ? 'bg-vantage-purple/5' : 'bg-purple-200/40'}`} />
      </div>

      <main className="relative z-10 container mx-auto max-w-md px-4 pt-6 min-h-screen pb-24">
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
              {activeTab === 'home' && <Home setTab={setActiveTab} />}
              {activeTab === 'free' && <FreePicks />}
              {activeTab === 'vip' && <VIP setTab={setActiveTab} />}
              {activeTab === 'guide' && <BettingGuide />}
              {activeTab === 'profile' && <Profile />}
              {activeTab === 'admin' && <Admin setTab={setActiveTab} />}
              {activeTab === 'kelly' && <Kelly setTab={setActiveTab} />}
              {activeTab === 'concierge' && <TicketWizard />}
            </motion.div>
          }
        </AnimatePresence>
      </main>

      {activeTab !== 'admin' && <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />}

      {/* Global UI overlays */}
      <BetSlip />
      <ToastContainer />

      {/* First-Launch Onboarding */}
      <AnimatePresence>
        {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <DataProvider>
          <AppContent />
        </DataProvider>
      </AuthProvider>
    </AppProvider>
  );
}