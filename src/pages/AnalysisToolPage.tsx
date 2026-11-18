import React, { useState, useEffect, useMemo } from 'react';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch, fetchDerivTickHistoryDirect, subscribeDerivTicksDirect } from '../lib/api';

type AnalyserTab = 'dcircles' | 'signals' | 'over-under' | 'rise-fall';

export const AnalysisToolPage: React.FC = () => {
  const { instruments, selectedSymbol, setSelectedSymbol, accountMode, activeConnectedAccount, refreshOrders, refreshAll, showToast } =
    useApp();

  const [tab, setTab] = useState<AnalyserTab>('dcircles');
  const [tickCount, setTickCount] = useState(100);
  const [prices, setPrices] = useState<number[]>([]);
  const [barrier, setBarrier] = useState(4);
  const [stake, setStake] = useState('5');
  const [executing, setExecuting] = useState(false);

  const activeInst = instruments.find((i) => i.symbol === selectedSymbol);
  const decimals = (activeInst?.pip_size ?? 0.01) < 0.0001 ? 5 : (activeInst?.pip_size ?? 0.01) < 0.001 ? 4 : 2;

  useEffect(() => {
    let active = true;
    fetchDerivTickHistoryDirect(selectedSymbol, tickCount)
      .then((list) => {
        if (active && list.length) setPrices(list);
      })
      .catch(() => {});

    const unsub = subscribeDerivTicksDirect(selectedSymbol, (quote) => {
      if (!active) return;
      setPrices((prev) => [...prev.slice(-(tickCount - 1)), quote]);
    });

    return () => {
      active = false;
      unsub();
    };
  }, [selectedSymbol, tickCount]);

  const analytics = useMemo(() => {
    const list = prices.length ? prices : [1458.22];
    const counts = Array(10).fill(0);
    const digits: number[] = [];
    let rises = 0;
    let falls = 0;

    list.forEach((p, idx) => {
      const str = p.toFixed(decimals);
      const d = Number(str[str.length - 1] || 0);
      digits.push(d);
      counts[d] += 1;
      if (idx > 0) {
        if (p >= list[idx - 1]) rises += 1;
        else falls += 1;
      }
    });

    const total = Math.max(1, digits.length);
    const dist = counts.map((c, d) => ({ digit: d, count: c, pct: Number(((c / total) * 100).toFixed(1)) }));
    const maxPct = Math.max(...dist.map((x) => x.pct));
    const minPct = Math.min(...dist.map((x) => x.pct));

    const overPct = Number(((digits.filter((d) => d > barrier).length / total) * 100).toFixed(1));
    const underPct = Number(((digits.filter((d) => d < barrier).length / total) * 100).toFixed(1));
    const evenPct = Number(((digits.filter((d) => d % 2 === 0).length / total) * 100).toFixed(1));
    const oddPct = Number((100 - evenPct).toFixed(1));
    const risePct = Number(((rises / Math.max(1, total - 1)) * 100).toFixed(1));
    const fallPct = Number(((falls / Math.max(1, total - 1)) * 100).toFixed(1));

    // RSI(14)
    let gains = 0;
    let losses = 0;
    const pLen = Math.min(14, list.length - 1);
    for (let i = list.length - pLen; i < list.length; i++) {
      const diff = list[i] - list[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const rs = losses === 0 ? 100 : gains / losses;
    const rsi14 = Number((100 - 100 / (1 + rs)).toFixed(1));

    return {
      latestPrice: list[list.length - 1],
      lastDigit: digits[digits.length - 1],
      recentDigits: digits.slice(-20),
      dist,
      maxPct,
      minPct,
      overPct,
      underPct,
      evenPct,
      oddPct,
      risePct,
      fallPct,
      rsi14,
    };
  }, [prices, decimals, barrier]);

  const handleInstantTrade = async (contractType: string, customBarrier?: string) => {
    setExecuting(true);
    try {
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol,
          side: contractType,
          contractType,
          stake: Number(stake),
          barrier: customBarrier,
          duration: 1,
          durationUnit: 't',
          executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`Executed ${contractType} ($${stake}) on ${selectedSymbol}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Execution failed', 'error');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      {/* Header Controls */}
      <div className="bg-[#151820] text-white rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#00A878] font-semibold mb-1">
            <Activity className="w-4 h-4" /> Real-Time Deriv Tick Stream
          </div>
          <h1 className="font-display text-2xl font-bold">Market Analyser & Signals</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-[#1A1D26] border border-[#2A2F3D] text-sm font-semibold"
          >
            {instruments.filter((i) => i.category === 'Synthetic').map((inst) => (
              <option key={inst.symbol} value={inst.symbol}>
                {inst.display_name}
              </option>
            ))}
          </select>

          <select
            value={tickCount}
            onChange={(e) => setTickCount(Number(e.target.value))}
            className="px-3 py-2 rounded-xl bg-[#1A1D26] border border-[#2A2F3D] font-mono-num text-xs font-bold"
          >
            {[50, 100, 250, 500].map((c) => (
              <option key={c} value={c}>
                {c} Ticks
              </option>
            ))}
          </select>

          <div className="px-4 py-2 rounded-xl bg-[#1A1D26] border border-[#2A2F3D] font-mono-num">
            <span className="text-[10px] text-slate-400 mr-2">Spot</span>
            <strong className="text-sm">{analytics.latestPrice.toFixed(decimals)}</strong>
          </div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {([
          { id: 'dcircles', label: 'Dcircles (0–9)' },
          { id: 'signals', label: 'Signals & RSI(14)' },
          { id: 'over-under', label: 'Over / Under' },
          { id: 'rise-fall', label: 'Rise / Fall' },
        ] as Array<{ id: AnalyserTab; label: string }>).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full text-xs font-bold cursor-pointer ${
              tab === t.id
                ? 'bg-[#FF444F] text-white'
                : 'bg-[#F4F5F7] dark:bg-[#181C25] text-slate-600 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Dcircles 0–9 Circular Heatmap */}
      {tab === 'dcircles' && (
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-3">
            {analytics.dist.map((item) => {
              const isHot = item.pct === analytics.maxPct;
              const isCold = item.pct === analytics.minPct;
              const isLast = item.digit === analytics.lastDigit;
              return (
                <div
                  key={item.digit}
                  className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${
                    isHot
                      ? 'border-[#00A878] bg-[#00A878]/10'
                      : isCold
                        ? 'border-[#FF444F] bg-[#FF444F]/10'
                        : 'border-slate-200 dark:border-[#2A2F3D] bg-[#F8F9FB] dark:bg-[#111319]'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center font-mono-num text-lg font-bold border-2 ${
                      isLast
                        ? 'border-[#FF444F] bg-[#151820] text-white'
                        : isHot
                          ? 'border-[#00A878] text-[#00A878]'
                          : isCold
                            ? 'border-[#FF444F] text-[#FF444F]'
                            : 'border-slate-300 dark:border-[#2A2F3D]'
                    }`}
                  >
                    {item.digit}
                  </div>
                  <p className="font-mono-num text-xs font-bold mt-2">{item.pct}%</p>
                  <p className="text-[10px] text-slate-400">
                    {isHot ? 'Hottest' : isCold ? 'Coldest' : `${item.count}x`}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Live Digit Sequence */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Recent 20 Last Digits</p>
            <div className="flex flex-wrap gap-1.5">
              {analytics.recentDigits.map((d, i) => (
                <span
                  key={i}
                  className={`w-8 h-8 rounded-lg font-mono-num text-xs font-bold flex items-center justify-center ${
                    d % 2 === 0 ? 'bg-[#00A878]/15 text-[#00A878]' : 'bg-[#FF444F]/15 text-[#FF444F]'
                  }`}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Signals & RSI(14) */}
      {tab === 'signals' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5">
            <p className="text-xs text-slate-500">RSI (14) Momentum</p>
            <p className="font-mono-num text-3xl font-bold mt-1">{analytics.rsi14}</p>
            <p className="text-xs mt-2 font-semibold text-[#00A878]">
              {analytics.rsi14 > 70 ? 'Overbought (PUT Bias)' : analytics.rsi14 < 30 ? 'Oversold (CALL Bias)' : 'Neutral Equilibrium'}
            </p>
          </div>
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5">
            <p className="text-xs text-slate-500">Even / Odd Parity</p>
            <p className="font-mono-num text-2xl font-bold mt-1">
              {analytics.evenPct}% / {analytics.oddPct}%
            </p>
            <div className="h-2 rounded-full bg-[#FF444F]/25 overflow-hidden mt-3">
              <div className="h-full bg-[#00A878]" style={{ width: `${analytics.evenPct}%` }} />
            </div>
          </div>
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5">
            <p className="text-xs text-slate-500">1-Click Execution Stake ($)</p>
            <input
              type="number"
              min="1"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="w-full mt-2 px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
            />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                type="button"
                disabled={executing}
                onClick={() => handleInstantTrade('DIGITEVEN')}
                className="py-2 rounded-full bg-[#00A878] text-white text-xs font-bold cursor-pointer"
              >
                Trade EVEN
              </button>
              <button
                type="button"
                disabled={executing}
                onClick={() => handleInstantTrade('DIGITODD')}
                className="py-2 rounded-full bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
              >
                Trade ODD
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Over / Under */}
      {tab === 'over-under' && (
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-2">Select Barrier Digit (0–9)</p>
              <div className="flex gap-1.5 flex-wrap">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setBarrier(d)}
                    className={`w-9 h-9 rounded-xl font-mono-num text-sm font-bold cursor-pointer ${
                      barrier === d ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]' : 'bg-[#F4F5F7] dark:bg-[#111319]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="w-24 px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
              />
              <button
                type="button"
                disabled={executing}
                onClick={() => handleInstantTrade('DIGITOVER', String(barrier))}
                className="px-5 py-2.5 rounded-full bg-[#00A878] text-white text-xs font-bold cursor-pointer"
              >
                Buy OVER {barrier}
              </button>
              <button
                type="button"
                disabled={executing}
                onClick={() => handleInstantTrade('DIGITUNDER', String(barrier))}
                className="px-5 py-2.5 rounded-full bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
              >
                Buy UNDER {barrier}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[#00A878]/10 border border-[#00A878]/30">
              <p className="text-xs font-semibold text-[#00A878]">Over {barrier} Probability</p>
              <p className="font-mono-num text-3xl font-bold mt-1">{analytics.overPct}%</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30">
              <p className="text-xs font-semibold text-[#FF444F]">Under {barrier} Probability</p>
              <p className="font-mono-num text-3xl font-bold mt-1">{analytics.underPct}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Rise / Fall */}
      {tab === 'rise-fall' && (
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-[#00A878]/10 border border-[#00A878]/30 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#00A878] flex items-center gap-1">
                <TrendingUp className="w-4 h-4" /> Rise Momentum
              </p>
              <p className="font-mono-num text-3xl font-bold mt-1">{analytics.risePct}%</p>
            </div>
            <button
              type="button"
              disabled={executing}
              onClick={() => handleInstantTrade('CALL')}
              className="px-5 py-2.5 rounded-full bg-[#00A878] text-white text-xs font-bold cursor-pointer"
            >
              Buy RISE
            </button>
          </div>
          <div className="p-5 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#FF444F] flex items-center gap-1">
                <TrendingDown className="w-4 h-4" /> Fall Momentum
              </p>
              <p className="font-mono-num text-3xl font-bold mt-1">{analytics.fallPct}%</p>
            </div>
            <button
              type="button"
              disabled={executing}
              onClick={() => handleInstantTrade('PUT')}
              className="px-5 py-2.5 rounded-full bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
            >
              Buy FALL
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
