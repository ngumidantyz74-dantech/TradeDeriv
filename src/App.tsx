import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LandingHero } from './components/LandingHero';
import { AppShell } from './components/AppShell';
import { HomeHub } from './pages/HomeHub';
import { CfdsHub } from './pages/CfdsHub';
import { ExchangeHub } from './pages/ExchangeHub';
import { OptionsHub } from './pages/OptionsHub';
import { PortfolioHub } from './pages/PortfolioHub';
import { ProfileHub } from './pages/ProfileHub';
import { MT5TradingView } from './components/mt5/MT5TradingView';
import { SmartTraderPage } from './pages/SmartTraderPage';
import { BotBuilderPage } from './pages/BotBuilderPage';
import { TradingBotsPage } from './pages/TradingBotsPage';
import { AnalysisToolPage } from './pages/AnalysisToolPage';
import { BulkTraderPage } from './pages/BulkTraderPage';
import {
  RiskCalculatorPage,
  ReportsPage,
  NotificationsPage,
  LearningHubPage,
} from './pages/ToolsPages';
import { AdminMISPage } from './pages/AdminMISPage';
import { DerivCircleLoader } from './components/DerivLoadingModal';
import { AskAmyModal } from './components/AskAmyModal';
import { apiFetch, sanitizeUiError } from './lib/api';

const isQuantumPath = () => {
  const p = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  const h = window.location.hash.replace(/^#\/?|\/+$/g, '').toLowerCase();
  return (
    p === 'quantum-analyser' ||
    p.startsWith('quantum-analyser/') ||
    p === 'quantum' ||
    p.startsWith('quantum/') ||
    h === 'quantum-analyser' ||
    h.startsWith('quantum-analyser/') ||
    h === 'quantum' ||
    h.startsWith('quantum/')
  );
};

const StandaloneQuantumLogin: React.FC = () => {
  const { loginWithToken, showToast } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrMsg(null);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/login', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res?.token) {
        throw new Error('Authentication failed');
      }
      await loginWithToken(res.token);
      showToast('Signed in to Quantum Analyser', 'success');
    } catch (err) {
      setErrMsg(sanitizeUiError(err, 'Invalid email or password'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-[#12161F] border border-[#222938] p-7 shadow-2xl space-y-6">
        <div className="flex items-center gap-3.5">
          <svg viewBox="0 0 40 40" className="w-9 h-9 shrink-0" fill="none" aria-hidden="true">
            <path d="M31.5 29.5A14 14 0 1 1 34 20" stroke="#FF444F" strokeWidth="3.2" strokeLinecap="round" />
            <rect x="13" y="21" width="3.5" height="10" rx="1.2" fill="#FF444F" />
            <rect x="18.5" y="15" width="3.5" height="16" rx="1.2" fill="#FF444F" />
            <rect x="24" y="10" width="3.5" height="21" rx="1.2" fill="#FF444F" />
            <circle cx="31" cy="27.5" r="2.8" fill="#FF444F" />
          </svg>
          <div>
            <h1 className="font-display text-xl font-bold leading-tight text-white">
              Quantum Analyser
            </h1>
            <p className="text-xs text-[#94A3B8] italic">Deriv Options Analyser</p>
          </div>
        </div>

        <p className="text-xs text-[#CBD5E1]">
          Sign in with your account credentials to launch the standalone Quantum Analyser &amp; Deriv Bot terminal.
        </p>

        {errMsg && (
          <div className="rounded-lg bg-[#FF444F]/15 border border-[#FF444F]/40 px-3.5 py-2.5 text-xs text-[#FF6B74] font-semibold">
            {errMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] text-sm text-white outline-none focus:border-[#FF444F]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] text-sm text-white outline-none focus:border-[#FF444F]"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-[#FF444F] hover:bg-[#E63946] text-white text-sm font-bold cursor-pointer disabled:opacity-60"
          >
            {submitting ? 'Signing in...' : 'Sign in to Quantum Analyser'}
          </button>
        </form>
      </div>
    </div>
  );
};

const MainRouter: React.FC = () => {
  const { user, loadingAuth, activeTab, publicSettings, toast, adminGateOpen, setAdminGateOpen } = useApp();
  const envSlug = import.meta.env.VITE_ADMIN_PRIVATE_SLUG || 'pf-ops-9482';
  const privateSlug = publicSettings.global?.adminPrivateSlug || envSlug;

  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => {
    const p = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const h = window.location.hash.replace(/^#\/?|\/+$/g, '');
    return (
      h === 'admin_console' ||
      h.startsWith('admin_console/') ||
      p === 'admin_console' ||
      p === envSlug ||
      h === envSlug ||
      p === 'pf-ops-9482' ||
      h === 'pf-ops-9482' ||
      p === 'admin' ||
      h === 'admin'
    );
  });

  const [isQuantumRoute, setIsQuantumRoute] = useState<boolean>(() => isQuantumPath());

  useEffect(() => {
    const checkRoute = () => {
      const p = window.location.pathname.replace(/^\/+|\/+$/g, '');
      const h = window.location.hash.replace(/^#\/?|\/+$/g, '');
      setIsAdminRoute(
        h === 'admin_console' ||
          h.startsWith('admin_console/') ||
          p === 'admin_console' ||
          p === privateSlug ||
          h === privateSlug ||
          p === envSlug ||
          h === envSlug ||
          p === 'pf-ops-9482' ||
          h === 'pf-ops-9482' ||
          p === 'admin' ||
          h === 'admin'
      );
      setIsQuantumRoute(isQuantumPath());
    };
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    window.addEventListener('hashchange', checkRoute);
    return () => {
      window.removeEventListener('popstate', checkRoute);
      window.removeEventListener('hashchange', checkRoute);
    };
  }, [privateSlug, envSlug]);

  const [minSplashDone, setMinSplashDone] = useState<boolean>(false);
  const [minisiteLoading, setMinisiteLoading] = useState<boolean>(false);

  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 650);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (activeTab === 'smart-trader' || activeTab === 'mt5-tv') {
      setMinisiteLoading(true);
      const t = setTimeout(() => setMinisiteLoading(false), 450);
      return () => clearTimeout(t);
    }
    setMinisiteLoading(false);
    return undefined;
  }, [activeTab]);

  if (isAdminRoute || adminGateOpen) {
    return (
      <AdminMISPage
        onReturnToSite={() => {
          window.history.pushState({}, '', '/');
          setIsAdminRoute(false);
          setAdminGateOpen(false);
        }}
      />
    );
  }

  if (loadingAuth || !minSplashDone) {
    return (
      <div className="min-h-screen w-full bg-[#FF444F] text-white flex items-center justify-center select-none">
        <span
          className="text-[46px] sm:text-[56px] font-bold italic tracking-[-0.03em] leading-none text-white"
          style={{ fontFamily: "'IBM Plex Sans', 'Ubuntu', sans-serif" }}
        >
          deriv
        </span>
      </div>
    );
  }

  if (isQuantumRoute) {
    if (!user) {
      return (
        <>
          <StandaloneQuantumLogin />
          {toast && (
            <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-[#151820] text-white border border-[#2A2F3D] shadow-xl text-xs font-semibold">
              {toast.message}
            </div>
          )}
        </>
      );
    }

    return (
      <div className="min-h-screen bg-[#0B0E14] text-white flex flex-col">
        <AnalysisToolPage standalone />
        {toast && (
          <div
            className={`fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 px-4 py-3 rounded-xl text-white shadow-xl text-xs font-semibold border ${
              toast.type === 'error'
                ? 'bg-[#FF444F] border-[#E11D48]'
                : toast.type === 'success'
                  ? 'bg-[#0C2B21] border-[#00D084] text-[#00D084]'
                  : 'bg-[#12161F] border-[#222938]'
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LandingHero />
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-[#151820] text-white border border-[#2A2F3D] shadow-xl text-xs font-semibold">
            {toast.message}
          </div>
        )}
      </>
    );
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'home':
        return <HomeHub />;
      case 'cfds':
        return <CfdsHub />;
      case 'exchange':
        return <ExchangeHub />;
      case 'options':
        return <OptionsHub />;
      case 'portfolio':
        return <PortfolioHub />;
      case 'profile':
        return <ProfileHub />;
      case 'mt5-tv':
        return <MT5TradingView />;
      case 'smart-trader':
        return <SmartTraderPage />;
      case 'bot-builder':
        return <BotBuilderPage />;
      case 'trading-bots':
        return <TradingBotsPage />;
      case 'bulk-trader':
        return <BulkTraderPage />;
      case 'risk-calc':
        return <RiskCalculatorPage />;
      case 'reports':
        return <ReportsPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'learning-hub':
        return <LearningHubPage />;
      default:
        return <HomeHub />;
    }
  };

  return (
    <>
      {minisiteLoading && <DerivCircleLoader />}
      <AppShell>{renderTab()}</AppShell>
      <AskAmyModal />
      {toast && (
        <div
          className={`fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 px-4 py-3 rounded-2xl text-white shadow-xl text-xs font-semibold border ${
            toast.type === 'error'
              ? 'bg-[#FF444F] border-[#E63946]'
              : toast.type === 'success'
                ? 'bg-[#00A878] border-[#00966B]'
                : 'bg-[#151820] border-[#2A2F3D]'
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainRouter />
    </AppProvider>
  );
}
