import React, { useState } from 'react';
import {
  Home,
  CandlestickChart,
  ArrowLeftRight,
  Layers,
  Wallet,
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
  User,
  X,
  Shield,
  ExternalLink,
  Compass,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TradeDerivLogo } from './TradeDerivLogo';
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

const CORE_HUB_TABS: Array<{ id: NavTab; label: string; icon: React.ComponentType<any> }> = [
  { id: 'home', label: 'Dashboard', icon: Home },
  { id: 'cfds', label: 'CFDs', icon: CandlestickChart },
  { id: 'exchange', label: 'Exchange', icon: ArrowLeftRight },
  { id: 'options', label: 'Options', icon: Layers },
  { id: 'portfolio', label: 'Portfolio & Cashier', icon: Wallet },
];

const MOBILE_BOTTOM_TABS: Array<{ id: NavTab; label: string; icon: React.ComponentType<any> }> = [
  { id: 'home', label: 'Dashboard', icon: Home },
  { id: 'market-analyser', label: 'Markets', icon: Activity },
  { id: 'mt5-tv', label: 'Trade', icon: CandlestickChart },
  { id: 'trading-bots', label: 'Strategies', icon: Bot },
  { id: 'profile', label: 'Profile', icon: User },
];

const SIDEBAR_PRO_TOOLS: Array<{ id: NavTab; label: string; icon: React.ComponentType<any> }> = [
  { id: 'mt5-tv', label: 'MT5 Terminal', icon: CandlestickChart },
  { id: 'market-analyser', label: 'Market Radar & SMC', icon: Activity },
  { id: 'trading-bots', label: 'Strategy Lab & Bots', icon: Bot },
  { id: 'bot-builder', label: 'Bot Builder', icon: Cpu },
  { id: 'bulk-trader', label: 'Bulk Trader', icon: Zap },
  { id: 'risk-calc', label: 'Risk Centre', icon: Calculator },
  { id: 'reports', label: 'Analytics & Journal', icon: FileText },
  { id: 'learning-hub', label: 'Learning Hub', icon: BookOpen },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    user,
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
    setAdminGateOpen,
  } = useApp();

  const isOwnerSession = user?.role === 'owner' || user?.role === 'admin';

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const initials = (user?.full_name || user?.email || 'TD')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const tickerText =
    publicSettings.global?.tickerText ||
    'Volatility 100 (1s) Live · MT5 Gold · Crypto Exchange · Zero-Delay Deriv Bot Engine Active';

  const filteredSearch = instruments
    .filter(
      (i) =>
        i.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.symbol.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .slice(0, 12);

  return (
    <div className="min-h-screen bg-[#F8F9FB] dark:bg-[#111319] text-[#0E1117] dark:text-white flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-[#151820] border-r border-slate-200 dark:border-[#2A2F3D] z-30">
        <div className="px-5 py-5 border-b border-slate-100 dark:border-[#2A2F3D] flex items-center justify-between">
          <TradeDerivLogo variant={theme} size="sm" onClick={registerLogoTap} />
          <span
            title={wsConnected ? 'Deriv WS Relay Connected' : 'Connecting to Deriv WS'}
            className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-[#00A878]' : 'bg-amber-400'}`}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            <p className="px-3 text-[11px] font-semibold text-slate-400 tracking-wide mb-2">
              Core Hubs
            </p>
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
            <p className="px-3 text-[11px] font-semibold text-slate-400 tracking-wide mb-2">
              Terminal & Intelligence
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
              <a
                href="/analyser"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-medium text-[#1958B7] dark:text-sky-400 bg-sky-500/5 hover:bg-sky-500/10 border border-sky-500/15 transition-colors cursor-pointer whitespace-nowrap mt-2"
              >
                <span className="flex items-center gap-3">
                  <Compass className="w-4 h-4 shrink-0" />
                  <span>AI Analyser App</span>
                </span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-75" />
              </a>
            </nav>
          </div>
        </div>

        <div className="p-3 border-t border-slate-100 dark:border-[#2A2F3D] space-y-2">
          {isOwnerSession && (
            <button
              type="button"
              onClick={() => setAdminGateOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#151820] text-white text-xs font-bold hover:bg-[#242936] cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-[#FF444F]" />
              <span>Admin MIS Console</span>
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
            <div className="w-9 h-9 rounded-full bg-[#151820] dark:bg-[#2A2F3D] text-white text-xs font-bold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold truncate">{user?.full_name || 'Trader'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Profile & Security</p>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Desktop Announcement Ticker + Controls Bar */}
        <div className="hidden lg:flex items-center justify-between gap-4 px-6 py-2.5 bg-white dark:bg-[#151820] border-b border-slate-200 dark:border-[#2A2F3D] sticky top-0 z-20">
          <div className="flex-1 overflow-hidden mr-4">
            <div className="animate-marquee whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
              <span className="mr-12">{tickerText}</span>
              <span className="mr-12">{tickerText}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center bg-[#F4F5F7] dark:bg-[#1A1D26] p-1 rounded-full">
              <button
                type="button"
                onClick={() => setAccountMode('real')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  accountMode === 'real'
                    ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]'
                    : 'text-slate-500'
                }`}
              >
                Real
              </button>
              <button
                type="button"
                onClick={() => setAccountMode('demo')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  accountMode === 'demo'
                    ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]'
                    : 'text-slate-500'
                }`}
              >
                Demo
              </button>
            </div>

            <div className="flex items-center bg-[#F4F5F7] dark:bg-[#1A1D26] p-1 rounded-full">
              <button
                type="button"
                onClick={() => setCurrencyDisplay('USD')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                  currencyDisplay === 'USD' ? 'bg-white dark:bg-[#2A2F3D] shadow-xs' : 'text-slate-500'
                }`}
              >
                <UsFlagIcon />
                <span>USD</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrencyDisplay('KSH')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                  currencyDisplay === 'KSH' ? 'bg-white dark:bg-[#2A2F3D] shadow-xs' : 'text-slate-500'
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
              className="w-9 h-9 rounded-full bg-[#F4F5F7] dark:bg-[#1A1D26] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-[#2A2F3D] cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setHideBalances(!hideBalances)}
              aria-label="Toggle balance visibility"
              className="w-9 h-9 rounded-full bg-[#F4F5F7] dark:bg-[#1A1D26] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-[#2A2F3D] cursor-pointer"
            >
              {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="w-9 h-9 rounded-full bg-[#F4F5F7] dark:bg-[#1A1D26] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-[#2A2F3D] cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              aria-label="Notifications"
              className="relative w-9 h-9 rounded-full bg-[#F4F5F7] dark:bg-[#1A1D26] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-[#2A2F3D] cursor-pointer"
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

        {/* Mobile Dark Top Strip */}
        <div className="lg:hidden bg-[#151820] text-white px-4 pt-3 pb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TradeDerivLogo variant="dark" size="sm" showWordmark={false} onClick={registerLogoTap} />
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="w-9 h-9 rounded-full bg-[#242936] flex items-center justify-center cursor-pointer"
              aria-label="Search"
            >
              <Search className="w-4 h-4 text-slate-200" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-[#242936] p-0.5 rounded-full">
              <button
                type="button"
                onClick={() => setAccountMode('real')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                  accountMode === 'real' ? 'bg-[#FF444F] text-white' : 'text-slate-300'
                }`}
              >
                Real
              </button>
              <button
                type="button"
                onClick={() => setAccountMode('demo')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                  accountMode === 'demo' ? 'bg-white text-[#151820]' : 'text-slate-300'
                }`}
              >
                Demo
              </button>
            </div>
            <button
              type="button"
              onClick={() => setCurrencyDisplay(currencyDisplay === 'USD' ? 'KSH' : 'USD')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#242936] text-[11px] font-semibold text-slate-200 cursor-pointer"
              title="Switch USD / KSH"
            >
              {currencyDisplay === 'USD' ? <UsFlagIcon /> : <KeFlagIcon />}
              <span>{currencyDisplay}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHideBalances(!hideBalances)}
              className="w-9 h-9 rounded-full bg-[#242936] flex items-center justify-center cursor-pointer"
              aria-label="Hide balances"
            >
              {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className="relative w-9 h-9 rounded-full bg-[#242936] flex items-center justify-center cursor-pointer"
              aria-label="Notifications"
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

        {/* Viewport Page Content */}
        <main className="flex-1 pb-24 lg:pb-8">{children}</main>
      </div>

      {/* Fixed 5-Tab Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#151820]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#2A2F3D] pb-safe">
        <div className="grid grid-cols-5 h-16">
          {MOBILE_BOTTOM_TABS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  active ? 'text-[#FF444F]' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Global Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 pt-16">
          <div className="w-full max-w-lg bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-[#2A2F3D]">
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
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A2F3D]">
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
                    <p className="text-xs text-slate-500">{inst.symbol} · {inst.category}</p>
                  </div>
                  <span className="font-mono-num text-sm font-semibold">{inst.price}</span>
                </button>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-slate-100 dark:border-[#2A2F3D] bg-slate-50/60 dark:bg-[#111319] flex items-center justify-between">
              <span className="text-xs text-slate-500">Independent XAUUSD &amp; Forex Intelligence</span>
              <a
                href="/analyser"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1958B7] dark:text-sky-400 hover:underline"
              >
                <span>Open Standalone AI Analyser</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
