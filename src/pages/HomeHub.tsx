import React, { useState } from 'react';
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
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const HomeHub: React.FC = () => {
  const { user, accounts, accountMode, formatMoney, setActiveTab, setSelectedSymbol } = useApp();
  const [promoDismissed, setPromoDismissed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const realAcc = accounts.find((a) => !a.is_virtual && a.status === 'active');
  const demoAcc = accounts.find((a) => Boolean(a.is_virtual) && a.status === 'active');
  const optionsBal =
    accountMode === 'real'
      ? Number(realAcc?.balance || 0)
      : Number(demoAcc?.balance ?? user?.virtual_workspace_balance ?? 10000);
  const mt5Acc = accounts.find((a) => a.platform?.includes('mt5'));
  const mt5Bal = Number(mt5Acc?.balance ?? (accountMode === 'demo' ? 10000 : 0));
  const exchangeUsdt = Number(user?.exchange_balances?.USDT || 0);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Dark Hero Banner */}
      <section className="bg-[#151820] text-white px-5 sm:px-8 pt-6 pb-8 rounded-b-[28px] lg:rounded-3xl lg:mx-6 lg:mt-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="max-w-md z-10">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Make your first deposit
            </h1>
            {/* 2-step progress indicator */}
            <div className="flex items-center gap-2 mb-5">
              <span className="h-1.5 w-14 rounded-full bg-[#00A878]" />
              <span className="h-1.5 w-14 rounded-full bg-white/15" />
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('portfolio')}
              className="px-7 py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              Deposit now
            </button>
          </div>

          <div className="flex justify-end sm:justify-center shrink-0">
            <img
              src="/src/assets/images/deposit_candlesticks_1795009383277.jpg"
              alt="Trading candlesticks illustration"
              referrerPolicy="no-referrer"
              className="w-32 h-32 sm:w-40 sm:h-40 object-cover rounded-2xl border border-[#2A2F3D]"
            />
          </div>
        </div>
      </section>

      {/* Ways to deposit chip strip */}
      <div className="px-5 sm:px-8 mt-4">
        <div className="bg-[#F4F5F7] dark:bg-[#181C25] rounded-2xl px-4 py-3 flex items-center gap-3 overflow-x-auto no-scrollbar border border-slate-200/70 dark:border-[#2A2F3D]">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0">
            Ways to deposit
          </span>
          {[
            { label: 'Mobile Money', icon: Smartphone, color: 'text-amber-500' },
            { label: 'Payment Agent', icon: Users, color: 'text-slate-700 dark:text-slate-200' },
            { label: 'M-Pesa', icon: Wallet, color: 'text-[#00A878]' },
            { label: 'Crypto', icon: ArrowLeftRight, color: 'text-blue-500' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setActiveTab('portfolio')}
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
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">TradeDeriv Exchange</p>
            <p className="font-mono-num text-lg font-bold mt-1">
              {formatMoney(exchangeUsdt, { hideable: true, currencyOverride: 'USDT' })}
            </p>
          </button>
        </div>
      </section>

      {/* Dark Promo Banner */}
      {!promoDismissed && (
        <section className="px-5 sm:px-8 mt-6">
          <div className="bg-gradient-to-r from-[#151820] via-[#1B202C] to-[#231922] text-white rounded-2xl p-5 border border-[#2A2F3D] flex items-center justify-between gap-4 relative">
            <div className="max-w-lg">
              <h3 className="font-display text-base sm:text-lg font-bold mb-1">New Crash/Boom trades</h3>
              <p className="text-xs sm:text-sm text-slate-300">
                Trade the spikes with Rise/Fall. Now live in Demo & Real workspaces.
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

      {/* Explore TradeDeriv 3x2 Circular Grid */}
      <section className="px-5 sm:px-8 mt-7">
        <h2 className="font-display text-lg font-bold mb-4">Explore TradeDeriv</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {[
            { label: 'Exchange', badge: 'New', bg: 'bg-[#FF444F]', text: 'DXN', action: () => setActiveTab('exchange') },
            { label: 'Options', bg: 'bg-[#FF444F]', icon: ArrowLeftRight, action: () => setActiveTab('options') },
            { label: 'TradingView', bg: 'bg-[#111319]', icon: CandlestickChart, action: () => setActiveTab('mt5-tv') },
            { label: 'Swap-Free', bg: 'bg-[#0284C7]', text: 'MT5', action: () => setActiveTab('cfds') },
            { label: 'P2P', bg: 'bg-[#FF444F]', text: 'P2P', action: () => setActiveTab('portfolio') },
            { label: 'More', bg: 'bg-[#151820]', icon: Bot, action: () => setMoreOpen(true) },
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
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{tile.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Highlights Horizontal Carousel */}
      <section className="px-5 sm:px-8 mt-8 pb-6">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="font-display text-lg font-bold">Highlights</h2>
          <div className="flex items-center gap-1.5 text-slate-400">
            <ChevronLeft className="w-4 h-4" />
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('bot-builder')}
            className="text-left rounded-2xl bg-[#151820] text-white p-5 border border-[#2A2F3D] hover:border-[#FF444F]/50 transition-colors cursor-pointer"
          >
            <span className="text-xs font-semibold text-[#FF444F]">Zero-Delay Automation</span>
            <h3 className="font-display text-base font-bold mt-1">Instant Bot Builder</h3>
            <p className="text-xs text-slate-400 mt-1">
              Seeds 25 historical ticks & fires immediate first trade with Martingale and XML import.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('market-analyser')}
            className="text-left rounded-2xl bg-[#151820] text-white p-5 border border-[#2A2F3D] hover:border-[#00A878]/50 transition-colors cursor-pointer"
          >
            <span className="text-xs font-semibold text-[#00A878]">Live Tick Stream</span>
            <h3 className="font-display text-base font-bold mt-1">Market Analyser & RSI(14)</h3>
            <p className="text-xs text-slate-400 mt-1">
              0–9 digit heatmap, Over/Under barriers, and 1-click bulk order execution.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cfds')}
            className="text-left rounded-2xl bg-[#151820] text-white p-5 border border-[#2A2F3D] hover:border-[#1958B7]/50 transition-colors cursor-pointer"
          >
            <span className="text-xs font-semibold text-amber-400">MT5 Gold & Metals</span>
            <h3 className="font-display text-base font-bold mt-1">Specialised Gold CFDs</h3>
            <p className="text-xs text-slate-400 mt-1">
              Trade XAU/USD with USD Stop Loss & Take Profit controls on Lightweight Charts.
            </p>
          </button>
        </div>
      </section>

      {/* More Tools Sheet Modal */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-[#181C25] rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-[#2A2F3D]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg font-bold">Pro Automation & Tools</h3>
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
                { id: 'mt5-tv', label: 'MT5 TradingView', icon: CandlestickChart },
                { id: 'bot-builder', label: 'Bot Builder', icon: Bot },
                { id: 'trading-bots', label: 'Trading Bots', icon: Shield },
                { id: 'market-analyser', label: 'Market Analyser', icon: Activity },
                { id: 'bulk-trader', label: 'Bulk Trader', icon: Zap },
                { id: 'risk-calc', label: 'Risk Calculator', icon: Calculator },
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
