import React, { useState } from 'react';
import {
  Activity,
  Bot,
  ChevronRight,
  Cpu,
  FlaskConical,
  LogOut,
  Moon,
  Radar,
  Sun,
  TrendingUp,
  Coins,
  ExternalLink,
} from 'lucide-react';
import { useAnalyser } from './AnalyserContext';
import { ScannerDashboard } from './components/ScannerDashboard';
import { GoldXauDashboard } from './components/GoldXauDashboard';
import { ForexDashboard } from './components/ForexDashboard';
import { SetupsAndSignalsView } from './components/SetupsAndSignalsView';
import { StrategyLabView } from './components/StrategyLabView';
import { AiAssistantView } from './components/AiAssistantView';
import { BotAndBridgeView } from './components/BotAndBridgeView';

type AnalyserPage = 'scanner' | 'gold' | 'forex' | 'signals' | 'lab' | 'ai' | 'bots';

const NAV_ITEMS: Array<{ id: AnalyserPage; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'scanner', label: 'Scanner', icon: Radar },
  { id: 'gold', label: 'Gold XAUUSD', icon: Coins },
  { id: 'forex', label: 'Forex', icon: TrendingUp },
  { id: 'signals', label: 'Signals & Exec', icon: Activity },
  { id: 'lab', label: 'Strategy Lab', icon: FlaskConical },
  { id: 'ai', label: 'AI Assistant', icon: Cpu },
  { id: 'bots', label: 'Bots & MT5 EA', icon: Bot },
];

export const AnalyserApp: React.FC = () => {
  const { user, loadingAuth, theme, toggleTheme, feedHealth, toast, login, register, logout } = useAnalyser();
  const [page, setPage] = useState<AnalyserPage>('scanner');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthErr(null);
    setAuthBusy(true);
    try {
      if (authMode === 'login') await login(email, password);
      else await register(email, password, fullName);
    } catch (err) {
      setAuthErr(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#111319] text-[#0E1117] dark:text-white">
      {/* Clean 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-[#2A2F3D] bg-white/95 dark:bg-[#151820]/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-6">
        <a href="/analyser" className="font-display text-lg font-extrabold tracking-tight whitespace-nowrap shrink-0">
          TradeDeriv <span className="text-[#FF444F]">Analyser</span>
        </a>

        <nav className="hidden lg:flex items-center gap-5 overflow-x-auto no-scrollbar">
          {NAV_ITEMS.map((item) => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPage(item.id)}
                className={`text-xs font-semibold whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-[#FF444F] text-[#0E1117] dark:text-white'
                    : 'border-transparent text-slate-500 hover:text-[#0E1117] dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <a
            href="/"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#FF444F] whitespace-nowrap shrink-0"
          >
            Main Terminal <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] text-slate-600 dark:text-slate-300 cursor-pointer"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {user && (
            <button
              type="button"
              onClick={logout}
              className="px-3 py-1.5 rounded-xl bg-[#151820] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          )}
        </div>
      </header>

      {/* Mobile Navigation Strip */}
      <div className="lg:hidden flex items-center gap-1.5 px-3 py-2 border-b border-slate-200 dark:border-[#2A2F3D] bg-white dark:bg-[#151820] overflow-x-auto no-scrollbar">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPage(item.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              page === item.id
                ? 'bg-[#FF444F] text-white'
                : 'bg-[#F4F5F7] dark:bg-[#181C25] text-slate-600 dark:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Independent Feed Context Strip */}
      <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pb-3 border-b border-slate-200 dark:border-[#2A2F3D]">
          <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
            <span className="font-semibold text-[#0E1117] dark:text-white">Independent Market Feed</span>
            <span aria-hidden="true">·</span>
            <span>
              Providers: {feedHealth?.providers?.length ? feedHealth.providers.join(', ') : 'Gold & FX Live Stream'}
            </span>
            {feedHealth?.totalInstruments !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {feedHealth.freshInstruments}/{feedHealth.totalInstruments} Fresh
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span
              className={
                feedHealth?.status === 'operational' || feedHealth?.status === 'online'
                  ? 'text-[#00A878] font-bold'
                  : 'text-amber-500 font-bold'
              }
            >
              {feedHealth?.status ? feedHealth.status.toUpperCase() : 'SYNCING'}
            </span>
          </div>
          {user && (
            <span className="font-mono tabular-nums">
              Analyst Session · {user.email}
            </span>
          )}
        </div>
      </div>

      {/* Main Content or Standalone Auth Gate */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5">
        {!loadingAuth && !user && ['signals', 'lab', 'ai', 'bots'].includes(page) ? (
          <div className="max-w-md mx-auto mt-8 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="font-display text-lg font-bold">
                {authMode === 'login' ? 'Sign In to Analyser Console' : 'Create Analyser Account'}
              </h1>
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                className="text-xs font-semibold text-[#1958B7] hover:underline cursor-pointer"
              >
                {authMode === 'login' ? 'Register' : 'Have an account?'}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Authenticate to execute walk-forward backtests, query the grounded AI Analyst, manage MT5 EA bridge keys, and control bots.
            </p>
            {authErr && <p className="text-xs text-[#FF444F] font-semibold">{authErr}</p>}
            <form onSubmit={handleAuthSubmit} className="space-y-3 text-xs">
              {authMode === 'register' && (
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] outline-none"
                />
              )}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] outline-none"
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] outline-none"
              />
              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-2.5 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {authBusy ? 'Authenticating...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        ) : (
          <>
            {page === 'scanner' && <ScannerDashboard onInspectGold={() => setPage('gold')} onInspectForex={() => setPage('forex')} />}
            {page === 'gold' && <GoldXauDashboard />}
            {page === 'forex' && <ForexDashboard />}
            {page === 'signals' && <SetupsAndSignalsView />}
            {page === 'lab' && <StrategyLabView />}
            {page === 'ai' && <AiAssistantView />}
            {page === 'bots' && <BotAndBridgeView />}
          </>
        )}
      </main>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold text-white ${
            toast.type === 'error' ? 'bg-[#FF444F]' : toast.type === 'success' ? 'bg-[#00A878]' : 'bg-[#1958B7]'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};
