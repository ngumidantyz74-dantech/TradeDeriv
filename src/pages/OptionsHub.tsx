import React, { useState } from 'react';
import {
  CandlestickChart,
  RotateCcw,
  ArrowRight,
  Bot,
  Activity,
  Zap,
  TrendingUp,
  ArrowUpDown,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { getCanonicalBalances } from '../lib/balances';
import { SparklineSvg } from '../components/SparklineSvg';

const MOST_TRADED_CODES = ['1HZ100V', '1HZ75V', '1HZ10V', '1HZ25V', 'R_100'];

export const OptionsHub: React.FC = () => {
  const {
    user,
    accounts,
    accountMode,
    setAccountMode,
    formatMoney,
    instruments,
    ticks,
    refreshAll,
    setActiveTab,
    setSelectedSymbol,
    showToast,
  } = useApp();

  const [tradeFilter, setTradeFilter] = useState<'Deriv Trader' | 'Deriv Bot' | 'SmartTrader'>('Deriv Trader');
  const [resetting, setResetting] = useState(false);

  const { optionsBal: totalValue } = getCanonicalBalances(user, accounts, accountMode, null);

  const handleResetBalance = async () => {
    if (accountMode !== 'demo') return;
    setResetting(true);
    try {
      await apiFetch('/api/orders/reset-balance', {
        method: 'POST',
        body: JSON.stringify({ accountMode: 'demo' }),
      });
      await refreshAll();
      showToast('Demo balance reset to $10,000.00 USD', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reset failed', 'error');
    } finally {
      setResetting(false);
    }
  };

  const featuredMarkets = MOST_TRADED_CODES.map((code) => {
    const inst = instruments.find((i) => i.symbol === code);
    const live = ticks[code];
    const price = live?.quote ?? inst?.price ?? 1000;
    const chg = inst?.change_pct ?? 0.1;
    return {
      symbol: code,
      name: inst?.display_name || code,
      price,
      changePct: chg,
      sparkline: inst?.sparkline || [price * 0.998, price * 0.999, price],
    };
  });

  const tradeTypes = [
    { name: 'Rise/Fall', tab: 'mt5-tv' },
    { name: 'Higher/Lower', tab: 'mt5-tv' },
    { name: 'Matches/Differs', tab: 'market-analyser' },
    { name: 'Even/Odd', tab: 'bulk-trader' },
    { name: 'Accumulators', tab: 'mt5-tv' },
    { name: 'Over/Under', tab: 'mt5-tv' },
    { name: 'Multipliers', tab: 'mt5-tv' },
    { name: 'Touch/No Touch', tab: 'mt5-tv' },
    { name: 'Vanillas', tab: 'mt5-tv' },
    { name: 'Turbos', tab: 'mt5-tv' },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Dark Hero Banner */}
      <section className="bg-[#151820] text-white px-5 sm:px-8 pt-5 pb-7 rounded-b-[28px] lg:rounded-3xl lg:mx-6 lg:mt-6">
        <div className="flex justify-center lg:justify-start mb-5">
          <div className="inline-flex items-center bg-[#232734] p-1 rounded-full">
            <button
              type="button"
              onClick={() => setAccountMode('real')}
              className={`px-5 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${
                accountMode === 'real' ? 'bg-[#363C4E] text-white' : 'text-slate-400'
              }`}
            >
              Real
            </button>
            <button
              type="button"
              onClick={() => setAccountMode('demo')}
              className={`px-5 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${
                accountMode === 'demo' ? 'bg-[#363C4E] text-white' : 'text-slate-400'
              }`}
            >
              Demo
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400">Total trading value</p>
        <p className="font-mono-num text-2xl sm:text-3xl font-bold mt-1">
          {formatMoney(totalValue, { hideable: true })}
        </p>
        <p className="text-xs text-slate-400 mt-1">Updated just now</p>

        <div className="flex items-center justify-center lg:justify-start gap-12 mt-6">
          <button
            type="button"
            onClick={() => setActiveTab('mt5-tv')}
            className="flex flex-col items-center gap-2 cursor-pointer"
          >
            <span className="w-12 h-12 rounded-full bg-[#FF444F] hover:bg-[#E63946] flex items-center justify-center">
              <CandlestickChart className="w-5 h-5 text-white" />
            </span>
            <span className="text-xs font-medium">Trade</span>
          </button>

          {accountMode === 'demo' && (
            <button
              type="button"
              disabled={resetting}
              onClick={handleResetBalance}
              className="flex flex-col items-center gap-2 cursor-pointer"
            >
              <span className="w-12 h-12 rounded-full border border-white/30 hover:bg-white/10 flex items-center justify-center">
                <RotateCcw className={`w-5 h-5 text-white ${resetting ? 'animate-spin' : ''}`} />
              </span>
              <span className="text-xs font-medium">Reset balance</span>
            </button>
          )}
        </div>
      </section>

      {/* Most traded markets */}
      <section className="px-5 sm:px-8 mt-7">
        <h2 className="font-display text-lg font-bold mb-3.5">Most traded markets</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
          {featuredMarkets.map((m) => {
            const pos = m.changePct >= 0;
            return (
              <button
                key={m.symbol}
                type="button"
                onClick={() => {
                  setSelectedSymbol(m.symbol);
                  setActiveTab('mt5-tv');
                }}
                className="text-left p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] hover:border-[#FF444F]/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="px-1.5 py-0.5 rounded bg-[#0E1117] text-white text-[10px] font-bold">
                    {m.symbol.replace('1HZ', '').replace('V', '')}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-[#FF444F] text-white text-[9px] font-bold">1s</span>
                </div>
                <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{m.name}</p>
                <p className="font-mono-num text-lg sm:text-xl font-bold mt-2">
                  {m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <SparklineSvg data={m.sparkline} positive={pos} width={88} height={26} />
                  <span className={`font-mono-num text-xs font-semibold whitespace-nowrap ${pos ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                    {pos ? '+' : ''}
                    {m.changePct.toFixed(2)}% (5m)
                  </span>
                </div>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setActiveTab('mt5-tv')}
            className="p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] hover:border-[#FF444F]/50 flex flex-col items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowRight className="w-5 h-5" />
            <span className="text-sm font-semibold">View all</span>
          </button>
        </div>
      </section>

      {/* Platforms Stack */}
      <section className="px-5 sm:px-8 mt-8">
        <h2 className="font-display text-lg font-bold mb-3.5">Platforms & Automation</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { code: 'DT', title: 'MT5 TradingView', desc: 'Lightweight Charts, USD SL/TP, 70+ Deriv markets & 7 bulk close controls.', color: 'bg-[#FF444F]', tab: 'mt5-tv' },
            { code: 'DB', title: 'Bot Builder (Zero-Delay)', desc: 'Build, import XML, and run instant zero-delay bots with Martingale.', color: 'bg-[#FF444F]', tab: 'bot-builder' },
            { code: 'ST', title: 'Trading Bots Library', desc: 'Pre-seeded Hit-n-Run, MagicRecovery, AutoDiffer & SignalSniper strategies.', color: 'bg-[#2C3A67]', tab: 'trading-bots' },
            { code: 'MA', title: 'Market Analyser & Bulk', desc: 'Live 0–9 digit heatmap, RSI(14) signals, and 1–25 bulk execution.', color: 'bg-[#00A878]', tab: 'market-analyser' },
          ].map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => setActiveTab(p.tab as any)}
              className="flex items-center gap-4 p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] hover:border-[#FF444F]/50 text-left cursor-pointer"
            >
              <span className={`w-12 h-12 rounded-2xl ${p.color} text-white font-display font-bold text-base flex items-center justify-center shrink-0`}>
                {p.code}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold">{p.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{p.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('bulk-trader')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold hover:border-[#FF444F] cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-[#FF444F]" /> Bulk Trader (1–25)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bot-builder')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold hover:border-[#FF444F] cursor-pointer"
          >
            <Bot className="w-3.5 h-3.5 text-[#FF444F]" /> XML Bot Builder
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('market-analyser')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold hover:border-[#FF444F] cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-[#00A878]" /> Digit Analyser
          </button>
        </div>
      </section>

      {/* Trade types */}
      <section className="px-5 sm:px-8 mt-8 pb-6">
        <h2 className="font-display text-lg font-bold mb-3">Trade types</h2>
        <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar">
          {(['Deriv Trader', 'Deriv Bot', 'SmartTrader'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setTradeFilter(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                tradeFilter === tab
                  ? 'border-[#0E1117] dark:border-white bg-white dark:bg-[#181C25]'
                  : 'border-slate-200 dark:border-[#2A2F3D] text-slate-500'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {tradeTypes.map((tt) => (
            <button
              key={tt.name}
              type="button"
              onClick={() =>
                setActiveTab(tradeFilter === 'Deriv Bot' ? 'bot-builder' : (tt.tab as any))
              }
              className="p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] hover:border-[#FF444F]/50 flex flex-col items-center justify-center gap-2.5 text-center cursor-pointer"
            >
              <div className="flex items-center gap-1 text-[#FF444F]">
                <TrendingUp className="w-4 h-4" />
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <span className="text-xs font-medium truncate max-w-full">{tt.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
