import React, { useState } from 'react';
import {
  CandlestickChart,
  ArrowLeftRight,
  Search,
  Eye,
  EyeOff,
  Bell,
  Sun,
  Moon,
  Bot,
  Activity,
  Zap,
  Calculator,
  FileText,
  BookOpen,
  Cpu,
  X,
  Shield,
  Sliders,
  ArrowLeft,
  UserCircle2,
  Home,
  Layers,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TradeDerivLogo } from './TradeDerivLogo';
import { AskAmyPill } from './DerivBadges';
import { getCanonicalBalances } from '../lib/balances';
import type { NavTab } from '../types';

const UsFlagIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-3 rounded-[2px] shrink-0' }) => (
  <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
    <rect width="24" height="16" fill="#FFFFFF" />
    <rect y="0" width="24" height="2.2" fill="#B22234" />
    <rect y="4.4" width="24" height="2.2" fill="#B22234" />
    <rect y="8.8" width="24" height="2.2" fill="#B22234" />
    <rect y="13.2" width="24" height="2.8" fill="#B22234" />
    <rect width="11" height="8.8" fill="#3C3B6E" />
    <circle cx="2.5" cy="2.2" r="0.7" fill="#FFFFFF" />
    <circle cx="5.5" cy="2.2" r="0.7" fill="#FFFFFF" />
    <circle cx="8.5" cy="2.2" r="0.7" fill="#FFFFFF" />
    <circle cx="4" cy="4.4" r="0.7" fill="#FFFFFF" />
    <circle cx="7" cy="4.4" r="0.7" fill="#FFFFFF" />
    <circle cx="2.5" cy="6.6" r="0.7" fill="#FFFFFF" />
    <circle cx="5.5" cy="6.6" r="0.7" fill="#FFFFFF" />
    <circle cx="8.5" cy="6.6" r="0.7" fill="#FFFFFF" />
  </svg>
);

const KeFlagIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-3 rounded-[2px] shrink-0' }) => (
  <svg viewBox="0 0 24 16" className={className} aria-hidden="true">
    <rect width="24" height="4.5" y="0" fill="#0B0B0B" />
    <rect width="24" height="1" y="4.5" fill="#FFFFFF" />
    <rect width="24" height="5" y="5.5" fill="#BB0000" />
    <rect width="24" height="1" y="10.5" fill="#FFFFFF" />
    <rect width="24" height="4.5" y="11.5" fill="#006600" />
    <ellipse cx="12" cy="8" rx="2.3" ry="4.4" fill="#BB0000" stroke="#FFFFFF" strokeWidth="0.6" />
    <path d="M12 4.2v7.6M10.4 8h3.2" stroke="#0B0B0B" strokeWidth="0.7" />
  </svg>
);

const TabHomeIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg viewBox="0 0 24 24" className="w-[21px] h-[21px]" aria-hidden="true">
    {active ? (
      <path d="M12 3.2L3.5 10.1V20.5C3.5 21 3.9 21.4 4.4 21.4H9.6V14.8H14.4V21.4H19.6C20.1 21.4 20.5 21 20.5 20.5V10.1L12 3.2Z" fill="currentColor" />
    ) : (
      <path d="M4 10.5L12 4L20 10.5V19.8C20 20.5 19.5 21 18.8 21H14.2V14.5H9.8V21H5.2C4.5 21 4 20.5 4 19.8V10.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    )}
  </svg>
);

const TabCfdsIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-[21px] h-[21px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 4.5V19.5H20.5" />
    <line x1="8" y1="8" x2="8" y2="16.5" />
    <rect x="6.7" y="10" width="2.6" height="4.5" rx="0.5" fill="currentColor" fillOpacity="0.15" />
    <line x1="12.5" y1="6.5" x2="12.5" y2="15" />
    <rect x="11.2" y="8.5" width="2.6" height="4.5" rx="0.5" fill="currentColor" fillOpacity="0.15" />
    <line x1="17" y1="9.5" x2="17" y2="17" />
    <rect x="15.7" y="11" width="2.6" height="4" rx="0.5" fill="currentColor" fillOpacity="0.15" />
  </svg>
);

const TabOptionsIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-[21px] h-[21px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17L17 7" />
    <path d="M12.5 7H17V11.5" />
    <path d="M11.5 17H7V12.5" />
  </svg>
);

const TabPortfolioIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg viewBox="0 0 24 24" className="w-[21px] h-[21px]" aria-hidden="true">
    {active ? (
      <>
        <rect x="3" y="5.5" width="18" height="13.5" rx="3" fill="currentColor" />
        <rect x="14.5" y="10.5" width="6.5" height="3.5" rx="1.2" className="fill-white dark:fill-[#16181F]" />
        <circle cx="17" cy="12.25" r="0.9" fill="currentColor" />
      </>
    ) : (
      <>
        <rect x="3.5" y="5.8" width="17" height="12.8" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path d="M15.5 10.3H20.5V14.2H15.5C14.4 14.2 13.5 13.3 13.5 12.25C13.5 11.2 14.4 10.3 15.5 10.3Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="16.3" cy="12.25" r="0.9" fill="currentColor" />
      </>
    )}
  </svg>
);

const CORE_HUB_TABS: Array<{ id: NavTab; label: string; icon: React.ComponentType<any> }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'cfds', label: 'CFDs', icon: CandlestickChart },
  { id: 'exchange', label: 'Exchange', icon: ArrowLeftRight },
  { id: 'options', label: 'Options', icon: Layers },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet },
];

const SIDEBAR_PRO_TOOLS: Array<{ id: NavTab; label: string; icon: React.ComponentType<any> }> = [
  { id: 'mt5-tv', label: 'Deriv Trader', icon: CandlestickChart },
  { id: 'bot-builder', label: 'Deriv Bot', icon: Cpu },
  { id: 'smart-trader', label: 'SmartTrader', icon: Sliders },
  { id: 'market-analyser', label: 'Market Analyser', icon: Activity },
  { id: 'trading-bots', label: 'Trading Bots', icon: Bot },
  { id: 'bulk-trader', label: 'Bulk Trader', icon: Zap },
  { id: 'risk-calc', label: 'Risk Centre', icon: Calculator },
  { id: 'reports', label: 'Analytics & Journal', icon: FileText },
  { id: 'learning-hub', label: 'Learning Hub', icon: BookOpen },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    user,
    accounts,
    activeConnectedAccount,
    tradingScope,
    activeCfdBucket,
    activeTab,
    setActiveTab,
    accountMode,
    setAccountMode,
    currencyDisplay,
    setCurrencyDisplay,
    hideBalances,
    setHideBalances,
    theme,
    toggleTheme,
    unreadCount,
    publicSettings,
    instruments,
    setSelectedSymbol,
    wsConnected,
    registerLogoTap,
    registerHomeTap,
    openAdminPortal,
    formatMoney,
  } = useApp();

  const appName = publicSettings.branding?.appName || 'DERIV';
  const isOwnerSession = user?.role === 'owner' || user?.role === 'admin';
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const canonical = getCanonicalBalances(user, accounts, accountMode, activeConnectedAccount, tradingScope, activeCfdBucket);

  const initials = (user?.full_name || user?.email || 'DR')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const tickerText =
    publicSettings.global?.tickerText ||
    'DERIV Live Markets · Volatility 100 (1s) · Gold · Crypto Exchange · Deriv Bot & SmartTrader';

  const filteredSearch = instruments
    .filter(
      (i) =>
        i.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.symbol.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice(0, 14);

  const isCoreMobileHub = activeTab === 'home' || activeTab === 'cfds' || activeTab === 'options' || activeTab === 'portfolio';

  return (
    <div className="min-h-screen bg-white dark:bg-[#0E0F13] text-[#111319] dark:text-white flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-[#151820] border-r border-slate-200 dark:border-white/[0.08] z-30">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between">
          <TradeDerivLogo variant={theme} size="sm" appName={appName} onClick={registerLogoTap} />
          <span
            title={wsConnected ? 'Live Price Feed Connected' : 'Connecting Price Feed'}
            className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-[#00A878]' : 'bg-amber-400'}`}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          <div>
            <p className="px-3 text-[11px] font-semibold text-slate-400 tracking-wide mb-1.5">Hubs</p>
            <nav className="space-y-1">
              {CORE_HUB_TABS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#FF444F]/10 text-[#FF444F]'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold text-slate-400 tracking-wide mb-1.5">
              Platforms &amp; Tools
            </p>
            <nav className="space-y-1">
              {SIDEBAR_PRO_TOOLS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#FF444F]/10 text-[#FF444F]'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="p-3 border-t border-slate-100 dark:border-white/[0.08] space-y-2">
          {isOwnerSession && (
            <button
              type="button"
              onClick={openAdminPortal}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#1E222E] hover:bg-slate-200 dark:hover:bg-[#272C3A] text-xs font-semibold cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-[#FF444F]" />
                <span>Admin Panel</span>
              </span>
              <span className="text-[10px] text-slate-400">MIS</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 p-2.5 rounded-2xl transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-[#FF444F]/10 text-[#FF444F]'
                : 'hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-[#151820] dark:bg-[#242833] text-white text-xs font-bold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold truncate">{user?.full_name || 'Trader'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Profile &amp; Security</p>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Desktop Controls Bar */}
        <div className="hidden lg:flex items-center justify-between gap-4 px-6 py-2.5 bg-white dark:bg-[#151820] border-b border-slate-200 dark:border-white/[0.08] sticky top-0 z-20">
          <div className="flex-1 overflow-hidden mr-4">
            <div className="animate-marquee whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
              <span className="mr-12">{tickerText}</span>
              <span className="mr-12">{tickerText}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <AskAmyPill onClick={() => setActiveTab('market-analyser')} />

            <div className="px-3 py-1 rounded-full bg-[#F4F5F7] dark:bg-[#1D202A] text-xs font-semibold flex items-center gap-2">
              <span className={accountMode === 'real' ? 'text-[#00A878]' : 'text-amber-400'}>
                {accountMode === 'real' ? 'Real' : 'Demo'}
              </span>
              <span className="font-mono-num">
                {formatMoney(activeTab === 'cfds' ? canonical.cfdsTotalBal : canonical.activeTradingBalance, { hideable: true })}
              </span>
            </div>

            <div className="flex items-center bg-[#F4F5F7] dark:bg-[#1D202A] p-1 rounded-full">
              <button
                type="button"
                onClick={() => setAccountMode('real')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  accountMode === 'real'
                    ? 'bg-[#151820] text-white dark:bg-[#383D4A] dark:text-white'
                    : 'text-slate-400'
                }`}
              >
                Real
              </button>
              <button
                type="button"
                onClick={() => setAccountMode('demo')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  accountMode === 'demo'
                    ? 'bg-[#151820] text-white dark:bg-[#383D4A] dark:text-white'
                    : 'text-slate-400'
                }`}
              >
                Demo
              </button>
            </div>

            <div className="flex items-center bg-[#F4F5F7] dark:bg-[#1D202A] p-1 rounded-full">
              <button
                type="button"
                onClick={() => setCurrencyDisplay('USD')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                  currencyDisplay === 'USD' ? 'bg-white dark:bg-[#383D4A] shadow-xs' : 'text-slate-400'
                }`}
              >
                <UsFlagIcon />
                <span>USD</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrencyDisplay('KSH')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                  currencyDisplay === 'KSH' ? 'bg-white dark:bg-[#383D4A] shadow-xs' : 'text-slate-400'
                }`}
              >
                <KeFlagIcon />
                <span>KSH</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search markets and tools"
              className="w-9 h-9 rounded-full bg-[#F4F5F7] dark:bg-[#1D202A] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-[#2A2F3D] cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setHideBalances(!hideBalances)}
              aria-label="Toggle balance visibility"
              className="w-9 h-9 rounded-full bg-[#F4F5F7] dark:bg-[#1D202A] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-[#2A2F3D] cursor-pointer"
            >
              {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="w-9 h-9 rounded-full bg-[#F4F5F7] dark:bg-[#1D202A] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-[#2A2F3D] cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              aria-label="Notifications"
              className="relative w-9 h-9 rounded-full bg-[#F4F5F7] dark:bg-[#1D202A] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-[#2A2F3D] cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#FF444F] text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Top App Bar matching exact per-tab screenshot layout */}
        {activeTab !== 'profile' && isCoreMobileHub && (
          <header className="lg:hidden bg-[#171A21] text-white px-4 pt-3 pb-2 flex items-center justify-between sticky top-0 z-30">
            {/* Left Slot */}
            <div className="w-20 flex items-center justify-start">
              {activeTab === 'home' ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  aria-label="Open profile"
                  className="w-9 h-9 rounded-full bg-[#242833] hover:bg-[#2E3342] text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <UserCircle2 className="w-[19px] h-[19px]" />
                </button>
              ) : null}
            </div>

            {/* Center Slot */}
            <div className="flex items-center justify-center">
              {activeTab === 'home' || activeTab === 'portfolio' ? (
                <AskAmyPill onClick={() => setActiveTab('market-analyser')} />
              ) : (
                <div className="inline-flex items-center bg-[#232732] p-[3px] rounded-full">
                  <button
                    type="button"
                    onClick={() => setAccountMode('real')}
                    className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                      accountMode === 'real' ? 'bg-[#383D4A] text-white' : 'text-[#8E95A2]'
                    }`}
                  >
                    Real
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountMode('demo')}
                    className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                      accountMode === 'demo' ? 'bg-[#383D4A] text-white' : 'text-[#8E95A2]'
                    }`}
                  >
                    Demo
                  </button>
                </div>
              )}
            </div>

            {/* Right Slot */}
            <div className="w-20 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setHideBalances(!hideBalances)}
                aria-label="Hide balances"
                className="w-9 h-9 rounded-full bg-[#242833] hover:bg-[#2E3342] text-slate-200 flex items-center justify-center cursor-pointer"
              >
                {hideBalances ? <EyeOff className="w-[17px] h-[17px]" /> : <Eye className="w-[17px] h-[17px]" />}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                aria-label="Notifications"
                className="relative w-9 h-9 rounded-full bg-[#242833] hover:bg-[#2E3342] text-slate-200 flex items-center justify-center cursor-pointer"
              >
                <Bell className="w-[17px] h-[17px]" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[16px] px-1 rounded-full bg-[#FF444F] text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </header>
        )}

        {/* Compact Mobile Top Bar for Chart / Bot / Sub-Tool Terminals */}
        {activeTab !== 'profile' && activeTab !== 'notifications' && !isCoreMobileHub && (
          <header className="lg:hidden bg-[#171A21] text-white px-3.5 py-2.5 flex items-center justify-between gap-2 sticky top-0 z-30 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setActiveTab('home')}
                aria-label="Back to Home"
                className="w-8 h-8 rounded-full bg-[#242833] flex items-center justify-center cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setAccountMode(accountMode === 'demo' ? 'real' : 'demo')}
                className="flex flex-col items-start text-left cursor-pointer min-w-0"
              >
                <span className={`text-[10px] font-semibold ${accountMode === 'demo' ? 'text-amber-400' : 'text-[#00A878]'}`}>
                  {accountMode === 'demo' ? 'Demo' : 'Real'}
                </span>
                <span className="font-mono-num text-xs font-bold text-white truncate">
                  {formatMoney(canonical.activeTradingBalance, { hideable: true })}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="w-8 h-8 rounded-full bg-[#242833] flex items-center justify-center cursor-pointer"
                aria-label="Search markets"
              >
                <Search className="w-4 h-4 text-slate-200" />
              </button>
              <button
                type="button"
                onClick={() => setHideBalances(!hideBalances)}
                className="w-8 h-8 rounded-full bg-[#242833] flex items-center justify-center cursor-pointer"
                aria-label="Hide balances"
              >
                {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className="relative w-8 h-8 rounded-full bg-[#242833] flex items-center justify-center cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-3.5 px-1 rounded-full bg-[#FF444F] text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </header>
        )}

        {/* Viewport Page Content */}
        <main className="flex-1 pb-[76px] lg:pb-8">{children}</main>
      </div>

      {/* Fixed 4-Tab Mobile Lower Tabbar matching Screenshots (Home, CFDs, Options, Portfolio) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-[#16181F] border-t border-slate-200 dark:border-white/[0.08] pb-safe">
        <div className="grid grid-cols-4 h-[60px]">
          <button
            type="button"
            onClick={() => {
              registerHomeTap();
              if (activeTab !== 'home') {
                setActiveTab('home');
              }
            }}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer select-none ${
              activeTab === 'home' ? 'text-[#FF444F]' : 'text-[#525866] dark:text-[#8E95A2]'
            }`}
          >
            <TabHomeIcon active={activeTab === 'home'} />
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cfds')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer select-none ${
              activeTab === 'cfds' ? 'text-[#FF444F]' : 'text-[#525866] dark:text-[#8E95A2]'
            }`}
          >
            <TabCfdsIcon />
            <span>CFDs</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('options')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer select-none ${
              activeTab === 'options' ? 'text-[#FF444F]' : 'text-[#525866] dark:text-[#8E95A2]'
            }`}
          >
            <TabOptionsIcon />
            <span>Options</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('portfolio')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer select-none ${
              activeTab === 'portfolio' ? 'text-[#FF444F]' : 'text-[#525866] dark:text-[#8E95A2]'
            }`}
          >
            <TabPortfolioIcon active={activeTab === 'portfolio'} />
            <span>Portfolio</span>
          </button>
        </div>
      </nav>

      {/* Global Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 pt-16">
          <div className="w-full max-w-lg bg-white dark:bg-[#181B22] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/10">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search instruments (Volatility 100, EUR/USD, Gold, BTC)..."
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-white/10">
              {filteredSearch.map((inst) => (
                <button
                  key={inst.symbol}
                  type="button"
                  onClick={() => {
                    setSelectedSymbol(inst.symbol);
                    setActiveTab('mt5-tv');
                    setSearchOpen(false);
                  }}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-semibold">{inst.display_name}</p>
                    <p className="text-xs text-slate-500">
                      {inst.symbol} · {inst.category}
                    </p>
                  </div>
                  <span className="font-mono-num text-sm font-semibold">{inst.price}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
