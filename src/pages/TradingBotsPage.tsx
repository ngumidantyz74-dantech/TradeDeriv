import React, { useState, useEffect } from 'react';
import { Play, Sliders, Star, Bot } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import type { BotStrategy } from '../types';

export const TradingBotsPage: React.FC = () => {
  const { setActiveTab, accountMode, activeConnectedAccount, refreshOrders, refreshAll, showToast } = useApp();
  const [strategies, setStrategies] = useState<BotStrategy[]>([]);
  const [cat, setCat] = useState('All');
  const [runningSlug, setRunningSlug] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ strategies: BotStrategy[] }>('/api/bots/strategies', { skipAuth: true })
      .then((res) => setStrategies(res.strategies || []))
      .catch(() => {});
  }, []);

  const categories = ['All', 'Free Bots', 'Scalper Bots', 'SpeedBots'];
  const filtered = strategies.filter((s) => cat === 'All' || s.category === cat);

  const handleRunInstant = async (s: BotStrategy) => {
    setRunningSlug(s.slug);
    try {
      await apiFetch('/api/bots/run', {
        method: 'POST',
        body: JSON.stringify({
          strategyName: s.name,
          symbol: s.symbol,
          contractType: s.contract_type,
          baseStake: s.config?.stake ?? 1,
          barrier: s.config?.barrier ?? '2',
          duration: s.config?.duration ?? 1,
          durationUnit: s.config?.duration_unit ?? 't',
          multiplier: s.config?.multiplier ?? 100,
          martingale: s.config?.martingale ?? 2.0,
          takeProfit: s.config?.takeProfit ?? 25,
          stopLoss: s.config?.stopLoss ?? 50,
          maxTrades: s.config?.maxTrades ?? 50,
          executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`${s.name} launched in Bot Engine`, 'success');
      setActiveTab('bot-builder');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start strategy', 'error');
    } finally {
      setRunningSlug(null);
    }
  };

  const handleLoadInBuilder = (s: BotStrategy) => {
    sessionStorage.setItem('td_loaded_bot', JSON.stringify(s));
    setActiveTab('bot-builder');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Prebuilt Trading Bots</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Instant 1-click launch or customize parameters inside Bot Builder
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`px-4 py-2 rounded-full text-xs font-semibold cursor-pointer ${
                cat === c
                  ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]'
                  : 'bg-[#F4F5F7] dark:bg-[#181C25] text-slate-600 dark:text-slate-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((s) => (
          <div
            key={s.id}
            className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-xl bg-[#FF444F]/10 text-[#FF444F] flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#F4F5F7] dark:bg-[#111319]">
                    {s.category}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500">
                  <Star className="w-3.5 h-3.5 fill-current" /> {s.rating.toFixed(1)}
                </span>
              </div>

              <h2 className="font-display text-base font-bold">{s.name}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{s.description}</p>

              <div className="grid grid-cols-3 gap-2 mt-4 p-3 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] text-xs">
                <div>
                  <p className="text-[10px] text-slate-400">Market</p>
                  <p className="font-mono-num font-bold">{s.symbol}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Type</p>
                  <p className="font-mono-num font-bold truncate">{s.contract_type}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Est. Win</p>
                  <p className="font-mono-num font-bold text-[#00A878]">{s.win_rate_est}%</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={runningSlug === s.slug}
                onClick={() => handleRunInstant(s)}
                className="py-2.5 rounded-full bg-[#00A878] hover:bg-[#00966B] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {runningSlug === s.slug ? 'Starting...' : 'Run Instant'}
              </button>
              <button
                type="button"
                onClick={() => handleLoadInBuilder(s)}
                className="py-2.5 rounded-full border border-slate-300 dark:border-[#2A2F3D] text-xs font-bold flex items-center justify-center gap-1.5 hover:border-[#FF444F] cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                Load Builder
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
