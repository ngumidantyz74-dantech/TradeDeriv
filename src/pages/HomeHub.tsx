import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Bot,
  Activity,
  Zap,
  Calculator,
  CandlestickChart,
  ArrowLeftRight,
  Shield,
  Users,
  Smartphone,
  Wallet,
  SlidersHorizontal,
  FileText,
  Sparkles,
  Wifi,
  WifiOff,
  Sliders,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { getCanonicalBalances, computeLiveOrderMetrics } from '../lib/balances';
import { SparklineSvg } from '../components/SparklineSvg';

export const HomeHub: React.FC = () => {
  const {
    user,
    accounts,
    accountMode,
    activeConnectedAccount,
    orders,
    ticks,
    instruments,
    wsConnected,
    formatMoney,
    setActiveTab,
    setSelectedSymbol,
    workspacePreferences,
    saveWorkspacePreferences,
    publicSettings,
  } = useApp();

  const appName = publicSettings.branding?.appName || 'DERIV';
  const [promoDismissed, setPromoDismissed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [perfSummary, setPerfSummary] = useState<any>(null);

  useEffect(() => {
    apiFetch(`/api/analytics/performance?_t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => setPerfSummary(res))
      .catch(() => {});
  }, [orders.length]);

  const layout = {
    showKpis: workspacePreferences.layout?.showKpis ?? true,
    showAccounts: workspacePreferences.layout?.showAccounts ?? true,
    showQuickTools: workspacePreferences.layout?.showQuickTools ?? true,
    showHighlights: workspacePreferences.layout?.showHighlights ?? true,
  };

  const toggleWidget = (key: keyof typeof layout) => {
    saveWorkspacePreferences({
      layout: {
        ...layout,
        [key]: !layout[key],
      },
    });
  };

  const {
    optionsBal,
    cfdsTotalBal: mt5Bal,
    exchangeUsdt,
    activeTradingBalance: activeBalance,
  } = getCanonicalBalances(user, accounts, accountMode, activeConnectedAccount);

  const openOrders = orders.filter(
    (o) =>
      o.status === 'OPEN' &&
      (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) === accountMode
  );
  const floatingPnl = openOrders.reduce((s, o) => s + computeLiveOrderMetrics(o, ticks).pnl, 0);
  const usedMargin = openOrders.reduce((s, o) => s + Number(o.stake || 0), 0);
  const equity = activeBalance + floatingPnl;
  const freeMargin = Math.max(0, equity - usedMargin);

  const cohort = accountMode === 'real' ? perfSummary?.real : perfSummary?.demo;
  const dailyPnl = Number(perfSummary?.periods?.dailyPnlUsd ?? 0);
  const weeklyPnl = Number(perfSummary?.periods?.weeklyPnlUsd ?? 0);
  const monthlyPnl = Number(perfSummary?.periods?.monthlyPnlUsd ?? 0);

  const topMovers = ['1HZ100V', '1HZ75V', '1HZ50V', 'frxXAUUSD', 'cryBTCUSD'].map((sym) => {
    const inst = instruments.find((i) => i.symbol === sym);
    const live = ticks[sym];
    const price = live?.quote ?? inst?.price ?? 1000;
    const base = inst?.price || price;
    const livePct = base > 0 ? Number((((price - base) / base) * 100 + (inst?.change_pct || 0)).toFixed(2)) : (inst?.change_pct || 0);
    return {
      symbol: sym,
      name: inst?.display_name || sym,
      price,
      changePct: livePct,
      sparkline: inst?.sparkline?.length ? [...inst.sparkline.slice(-18), price] : [price * 0.999, price],
    };
  });

  return (
    <div className="max-w-7xl mx-auto">
      {/* Dark Hero Banner */}
      <section className="bg-[#151820] text-white px-5 sm:px-8 pt-6 pb-8 rounded-b-[28px] lg:rounded-3xl lg:mx-6 lg:mt-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="max-w-md z-10">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  wsConnected ? 'bg-[#00A878]/20 text-[#00A878]' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {wsConnected ? 'Live Markets Connected' : 'Connecting Feed'}
              </span>
              <button
                type="button"
                onClick={() => setCustomizeOpen(!customizeOpen)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-slate-200 cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" /> Widgets
              </button>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Make your first deposit
            </h1>
            <div className="flex items-center gap-2 mb-5">
              <span className="h-1.5 w-14 rounded-full bg-[#00A878]" />
              <span className="h-1.5 w-14 rounded-full bg-white/15" />
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href="https://app.deriv.com/cashier/deposit"
                target="_blank"
                rel="noopener noreferrer"
                className="px-7 py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Deposit now
              </a>
              <button
                type="button"
                onClick={() => setActiveTab('mt5-tv')}
                className="px-5 py-3 rounded-full bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Deriv Trader
              </button>
            </div>
          </div>

          <div className="flex justify-end sm:justify-center shrink-0">
            <img
              src="/src/assets/images/deposit_candlesticks_1795009383277.jpg"
              alt="Trading candlesticks"
              referrerPolicy="no-referrer"
              className="w-32 h-32 sm:w-40 sm:h-40 object-cover rounded-2xl border border-[#2A2F3D]"
            />
          </div>
        </div>

        {/* Customize Widgets Inline Strip */}
        {customizeOpen && (
          <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-semibold mr-1">Dashboard Modules:</span>
            {[
              { key: 'showKpis' as const, label: 'Account KPIs' },
              { key: 'showAccounts' as const, label: 'Trading Accounts' },
              { key: 'showQuickTools' as const, label: 'Explore Hub' },
              { key: 'showHighlights' as const, label: 'Market Intelligence' },
            ].map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => toggleWidget(w.key)}
                className={`px-3 py-1 rounded-full font-semibold cursor-pointer ${
                  layout[w.key] ? 'bg-[#00A878] text-white' : 'bg-white/10 text-slate-300'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Account KPI Strip */}
      {layout.showKpis && (
        <section className="px-5 sm:px-8 mt-5">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
              <p className="text-[11px] text-slate-500">Account Equity ({accountMode.toUpperCase()})</p>
              <p className="font-mono-num text-base font-bold mt-1">{formatMoney(equity, { hideable: true })}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Bal: {formatMoney(activeBalance, { hideable: true })}</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
              <p className="text-[11px] text-slate-500">Margin / Free</p>
              <p className="font-mono-num text-base font-bold mt-1">{formatMoney(usedMargin, { hideable: true })}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Free: {formatMoney(freeMargin, { hideable: true })}</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
              <p className="text-[11px] text-slate-500">Unrealized P/L</p>
              <p className={`font-mono-num text-base font-bold mt-1 ${floatingPnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                {floatingPnl >= 0 ? '+' : ''}
                {floatingPnl.toFixed(2)} USD
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">{openOrders.length} open position(s)</p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
              <p className="text-[11px] text-slate-500">Daily / Weekly P/L</p>
              <p className={`font-mono-num text-base font-bold mt-1 ${dailyPnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                {dailyPnl >= 0 ? '+' : ''}
                {dailyPnl.toFixed(2)} USD
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                7d: {weeklyPnl >= 0 ? '+' : ''}
                {weeklyPnl.toFixed(2)} · 30d: {monthlyPnl >= 0 ? '+' : ''}
                {monthlyPnl.toFixed(2)}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
              <p className="text-[11px] text-slate-500">Win Rate ({accountMode})</p>
              <p className="font-mono-num text-base font-bold mt-1">{cohort?.winRatePct ?? 0}%</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {cohort?.wins ?? 0}W / {cohort?.losses ?? 0}L ({cohort?.totalTrades ?? 0} closed)
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
              <p className="text-[11px] text-slate-500">Profit Factor</p>
              <p className="font-mono-num text-base font-bold mt-1">{cohort?.profitFactor ?? 0}</p>
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className="text-[10px] font-semibold text-[#FF444F] hover:underline mt-0.5 cursor-pointer"
              >
                View Analytics →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Ways to deposit chip strip */}
      <div className="px-5 sm:px-8 mt-4">
        <div className="bg-[#F4F5F7] dark:bg-[#181C25] rounded-2xl px-4 py-3 flex items-center gap-3 overflow-x-auto no-scrollbar border border-slate-200/70 dark:border-[#2A2F3D]">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0">
            Ways to deposit
          </span>
          {[
            { label: 'Deriv Cashier', icon: Wallet, color: 'text-[#FF444F]', href: 'https://app.deriv.com/cashier/deposit' },
            { label: 'Withdraw Funds', icon: ArrowLeftRight, color: 'text-slate-700 dark:text-slate-200', href: 'https://app.deriv.com/cashier/withdrawal' },
            { label: 'Payment Agent', icon: Users, color: 'text-slate-700 dark:text-slate-200', tab: 'portfolio' as const },
            { label: 'M-Pesa / P2P', icon: Smartphone, color: 'text-[#00A878]', tab: 'portfolio' as const },
          ].map((item) => {
            const Icon = item.icon;
            return item.href ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#1A1D26] border border-slate-200/80 dark:border-[#2A2F3D] text-xs font-semibold whitespace-nowrap shrink-0 hover:border-[#FF444F]/50 transition-colors cursor-pointer"
              >
                <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                <span>{item.label}</span>
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => setActiveTab(item.tab!)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#1A1D26] border border-slate-200/80 dark:border-[#2A2F3D] text-xs font-semibold whitespace-nowrap shrink-0 hover:border-[#FF444F]/50 transition-colors cursor-pointer"
              >
                <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* My trading accounts */}
      {layout.showAccounts && (
        <section className="px-5 sm:px-8 mt-7">
          <h2 className="font-display text-lg font-bold mb-3.5">My trading accounts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <button
              type="button"
              onClick={() => setActiveTab('options')}
              className="text-left p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] hover:border-[#FF444F]/50 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-[#FF444F] text-white flex items-center justify-center mb-3">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Options</p>
              <p className="font-mono-num text-lg font-bold mt-1">{formatMoney(optionsBal, { hideable: true })}</p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cfds')}
              className="text-left p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] hover:border-[#1958B7]/50 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-[#1958B7] text-white flex flex-col items-center justify-center mb-3 text-[10px] font-bold leading-tight">
                <span>MT5</span>
                <span className="text-[8px] opacity-80">STD</span>
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">CFDs | Standard</p>
              <p className="font-mono-num text-lg font-bold mt-1">{formatMoney(mt5Bal, { hideable: true })}</p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('exchange')}
              className="text-left p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] hover:border-[#FF444F]/50 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-[#FF444F] text-white flex items-center justify-center mb-3 text-[11px] font-bold">
                DXN
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{appName} Exchange</p>
              <p className="font-mono-num text-lg font-bold mt-1">
                {formatMoney(exchangeUsdt, { hideable: true, currencyOverride: 'USDT' })}
              </p>
            </button>
          </div>
        </section>
      )}

      {/* Most Traded Live Markets Strip */}
      <section className="px-5 sm:px-8 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-bold">Most traded</h2>
          <button
            type="button"
            onClick={() => setActiveTab('mt5-tv')}
            className="text-xs font-semibold text-[#FF444F] hover:underline cursor-pointer"
          >
            Open Live Chart →
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {topMovers.map((m) => {
            const pos = m.changePct >= 0;
            return (
              <button
                key={m.symbol}
                type="button"
                onClick={() => {
                  setSelectedSymbol(m.symbol);
                  setActiveTab('mt5-tv');
                }}
                className="min-w-[180px] p-3.5 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200/80 dark:border-[#2A2F3D] hover:border-[#FF444F]/50 text-left shrink-0 cursor-pointer"
              >
                <p className="text-xs font-semibold truncate text-slate-600 dark:text-slate-300">{m.name}</p>
                <p className="font-mono-num text-base font-bold mt-1">{m.price.toFixed(2)}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <SparklineSvg data={m.sparkline} positive={pos} width={72} height={22} />
                  <span className={`font-mono-num text-xs font-semibold ${pos ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                    {pos ? '+' : ''}
                    {m.changePct.toFixed(2)}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Dark Promo Banner */}
      {!promoDismissed && (
        <section className="px-5 sm:px-8 mt-6">
          <div className="bg-gradient-to-r from-[#151820] via-[#1B202C] to-[#231922] text-white rounded-2xl p-5 border border-[#2A2F3D] flex items-center justify-between gap-4 relative">
            <div className="max-w-lg">
              <h3 className="font-display text-base sm:text-lg font-bold mb-1">New Crash/Boom trades</h3>
              <p className="text-xs sm:text-sm text-slate-300">
                Trade the spikes with Rise/Fall. Now live in Demo & Real accounts.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedSymbol('BOOM1000');
                  setActiveTab('mt5-tv');
                }}
                className="mt-3 text-xs font-semibold text-[#FF444F] hover:underline cursor-pointer"
              >
                Open Boom 1000 chart →
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPromoDismissed(true)}
              aria-label="Dismiss banner"
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 cursor-pointer self-start"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* Explore DERIV 3x2 Circular Grid */}
      {layout.showQuickTools && (
        <section className="px-5 sm:px-8 mt-7">
          <h2 className="font-display text-lg font-bold mb-4">Explore {appName}</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            {[
              { label: 'Deriv Trader', bg: 'bg-[#FF444F]', text: 'DT', action: () => setActiveTab('mt5-tv') },
              { label: 'Deriv Bot', bg: 'bg-[#FF444F]', text: 'DB', action: () => setActiveTab('bot-builder') },
              { label: 'SmartTrader', bg: 'bg-[#2C3A67]', text: 'ST', action: () => setActiveTab('smart-trader') },
              { label: 'Exchange', badge: 'Live', bg: 'bg-[#111319]', text: 'DXN', action: () => setActiveTab('exchange') },
              { label: 'Market Analyser', bg: 'bg-[#00A878]', icon: Activity, action: () => setActiveTab('market-analyser') },
              { label: 'More Tools', bg: 'bg-[#151820]', icon: Bot, action: () => setMoreOpen(true) },
            ].map((tile) => {
              const Icon = tile.icon;
              return (
                <button
                  key={tile.label}
                  type="button"
                  onClick={tile.action}
                  className="flex flex-col items-center gap-2 group cursor-pointer"
                >
                  <div className="relative w-16 h-16 rounded-full bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] flex items-center justify-center group-hover:border-[#FF444F]/60 transition-colors">
                    {tile.badge && (
                      <span className="absolute -top-1.5 right-0 px-2 py-0.5 rounded-full bg-[#00A878] text-white text-[10px] font-bold">
                        {tile.badge}
                      </span>
                    )}
                    <div className={`w-9 h-9 rounded-lg ${tile.bg} text-white flex items-center justify-center text-xs font-bold`}>
                      {Icon ? <Icon className="w-4 h-4" /> : tile.text}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 text-center">{tile.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Market Intelligence Highlights */}
      {layout.showHighlights && (
        <section className="px-5 sm:px-8 mt-8 pb-6">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="font-display text-lg font-bold">Market Intelligence</h2>
            <div className="flex items-center gap-1.5 text-slate-400">
              <ChevronLeft className="w-4 h-4" />
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('market-analyser')}
              className="text-left rounded-2xl bg-[#151820] text-white p-5 border border-[#2A2F3D] hover:border-[#00A878]/50 transition-colors cursor-pointer"
            >
              <span className="text-xs font-semibold text-[#00A878] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> SMC & Buy Low / Sell High
              </span>
              <h3 className="font-display text-base font-bold mt-1">Market Radar & AI Analyser</h3>
              <p className="text-xs text-slate-400 mt-1">
                Live digit probabilities, RSI/MACD confluence, BOS/CHoCH zones, and direct sync to Deriv Bot.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bot-builder')}
              className="text-left rounded-2xl bg-[#151820] text-white p-5 border border-[#2A2F3D] hover:border-[#FF444F]/50 transition-colors cursor-pointer"
            >
              <span className="text-xs font-semibold text-[#FF444F]">Quick Strategy & Analyser Sync</span>
              <h3 className="font-display text-base font-bold mt-1">Deriv Bot Automation</h3>
              <p className="text-xs text-slate-400 mt-1">
                Run Martingale, D&apos;Alembert, Oscar&apos;s Grind, 1-3-2-6, Accumulators, or Analyser Sync bots live.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('risk-calc')}
              className="text-left rounded-2xl bg-[#151820] text-white p-5 border border-[#2A2F3D] hover:border-[#1958B7]/50 transition-colors cursor-pointer"
            >
              <span className="text-xs font-semibold text-amber-400">Account Protection</span>
              <h3 className="font-display text-base font-bold mt-1">Risk Centre & Trade Journal</h3>
              <p className="text-xs text-slate-400 mt-1">
                Manage daily loss limits, max exposure, consecutive-loss cooldowns, and trade execution logs.
              </p>
            </button>
          </div>
        </section>
      )}

      {/* More Tools Sheet Modal */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-[#181C25] rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-[#2A2F3D]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg font-bold">All Platforms & Tools</h3>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'mt5-tv', label: 'Deriv Trader', icon: CandlestickChart },
                { id: 'bot-builder', label: 'Deriv Bot', icon: Bot },
                { id: 'smart-trader', label: 'SmartTrader', icon: Sliders },
                { id: 'cfds', label: 'MT5 CFDs Hub', icon: Shield },
                { id: 'portfolio', label: 'Portfolio & Cashier', icon: Wallet },
                { id: 'trading-bots', label: 'Strategy Lab', icon: Activity },
                { id: 'bulk-trader', label: 'Bulk Trader', icon: Zap },
                { id: 'risk-calc', label: 'Risk Centre', icon: Calculator },
              ].map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      setActiveTab(tool.id as any);
                    }}
                    className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#F4F5F7] dark:bg-[#1A1D26] hover:border-[#FF444F] border border-transparent text-left cursor-pointer"
                  >
                    <Icon className="w-5 h-5 text-[#FF444F] shrink-0" />
                    <span className="text-sm font-semibold">{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
