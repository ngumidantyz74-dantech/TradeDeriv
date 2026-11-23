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

const MainRouter: React.FC = () => {
  const { user, loadingAuth, activeTab, publicSettings, toast, adminGateOpen, setAdminGateOpen } = useApp();
  const envSlug = import.meta.env.VITE_ADMIN_PRIVATE_SLUG || 'pf-ops-9482';
  const privateSlug = publicSettings.global?.adminPrivateSlug || envSlug;

  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => {
    const p = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const h = window.location.hash.replace(/^#\/?|\/+$/g, '');
    return p === envSlug || h === envSlug || p === 'pf-ops-9482' || h === 'pf-ops-9482' || p === 'admin' || h === 'admin';
  });

  useEffect(() => {
    const checkRoute = () => {
      const p = window.location.pathname.replace(/^\/+|\/+$/g, '');
      const h = window.location.hash.replace(/^#\/?|\/+$/g, '');
      setIsAdminRoute(
        p === privateSlug ||
          h === privateSlug ||
          p === envSlug ||
          h === envSlug ||
          p === 'pf-ops-9482' ||
          h === 'pf-ops-9482' ||
          p === 'admin' ||
          h === 'admin'
      );
    };
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    window.addEventListener('hashchange', checkRoute);
    return () => {
      window.removeEventListener('popstate', checkRoute);
      window.removeEventListener('hashchange', checkRoute);
    };
  }, [privateSlug, envSlug]);

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

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#151820] text-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#FF444F] border-t-transparent animate-spin" />
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
      case 'market-analyser':
        return <AnalysisToolPage />;
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
      <AppShell>{renderTab()}</AppShell>
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
