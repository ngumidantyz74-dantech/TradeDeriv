import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap,
  Trash2,
  Crown,
  Rocket,
  Cpu,
  Settings2,
  RefreshCw,
  CandlestickChart,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch, sanitizeUiError } from '../lib/api';
import { computeLiveOrderMetrics } from '../lib/balances';
import { TemplateChart } from '../components/deriv-templates/TemplateChart';
import {
  MatchesPanel,
  UltimateBotPanel,
  SmartAiPanel,
} from '../components/advanced-trading/UltimateBotAndSmartAI';

type SuiteTab = 'bulk' | 'matches' | 'ultimate' | 'smartai';
type BulkTradeType = 'even_odd' | 'over_under' | 'matches_differs' | 'rise_fall' | 'multipliers';

export const BulkTraderPage: React.FC = () => {
  const {
    instruments,
    ticks,
    orders,
    accounts,
    accountMode,
    activeConnectedAccount,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  const [suiteTab, setSuiteTab] = useState<SuiteTab>('bulk');

  // Bulk Trader state
  const [symbol, setSymbol] = useState('R_100');
  const [tradeType, setTradeType] = useState<BulkTradeType>('even_odd');
  const [sampleTicks, setSampleTicks] = useState(120);
  const [contractTicks, setContractTicks] = useState(1);
  const [barrierDigit, setBarrierDigit] = useState(4);
  const [count, setCount] = useState(1);
  const [stake, setStake] = useState('0.5');
  const [multiplier, setMultiplier] = useState(100);
  const [slUsd, setSlUsd] = useState('1');
  const [tpUsd, setTpUsd] = useState('3');
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [executing, setExecuting] = useState(false);
  const [autoTraderOn, setAutoTraderOn] = useState(false);
  const [showCandleChart, setShowCandleChart] = useState(false);
  const [chartGranularity, setChartGranularity] = useState(60);

  const [digitHistory, setDigitHistory] = useState<number[]>([]);
  const lastEpochRef = useRef<number | null>(null);
  const autoCooldownRef = useRef<number>(0);

  const eligibleAccounts = accounts.filter(
    (a) => a.status === 'active' && Boolean(a.is_virtual) === (accountMode === 'demo')
  );

  const toggleTargetAccount = (id: number) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 100 ? prev : [...prev, id]
    );
  };

  const live = ticks[symbol];
  const inst = instruments.find((i) => i.symbol === symbol);
  const price = live?.quote ?? inst?.price ?? 1000;
  const pipSize = live?.pipSize ?? inst?.pip_size ?? 0.01;
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;
  const priceStr = price.toFixed(decimals);
  const currentLastDigit = Number(priceStr[priceStr.length - 1] || 0);

  const hydrateDigitHistory = () => {
    apiFetch<{ recentDigits?: number[]; distribution?: Array<{ digit: number; count: number }> }>(
      `/api/market/digit-analysis?symbol=${encodeURIComponent(symbol)}&count=${Math.min(500, Math.max(20, sampleTicks))}`,
      { skipAuth: true }
    )
      .then((res) => {
        const expanded: number[] = [];
        for (const item of res.distribution || []) {
          for (let i = 0; i < (item.count || 0); i++) expanded.push(item.digit);
        }
        const tail = res.recentDigits || [];
        const prefixLen = Math.max(0, expanded.length - tail.length);
        setDigitHistory([...expanded.slice(0, prefixLen), ...tail].slice(-sampleTicks));
      })
      .catch(() => {});
  };

  useEffect(() => {
    lastEpochRef.current = null;
    hydrateDigitHistory();
  }, [symbol, sampleTicks]);

  useEffect(() => {
    if (!live || !Number.isFinite(live.quote)) return;
    if (lastEpochRef.current === live.epoch) return;
    lastEpochRef.current = live.epoch;
    const s = live.quote.toFixed(decimals);
    const d = Number(s[s.length - 1] || 0);
    setDigitHistory((prev) => [...prev.slice(-(sampleTicks - 1)), d]);
  }, [live, decimals, sampleTicks]);

  const digitStats = useMemo(() => {
    const counts = Array(10).fill(0);
    for (const d of digitHistory) if (d >= 0 && d <= 9) counts[d] += 1;
    const total = Math.max(1, digitHistory.length);
    const pcts = counts.map((c) => (c / total) * 100);
    const ranked = pcts.map((pct, digit) => ({ digit, pct })).sort((a, b) => b.pct - a.pct);
    const highest = ranked[0]?.digit ?? -1;
    const secondHigh = ranked[1]?.digit ?? -1;
    const lowest = ranked[ranked.length - 1]?.digit ?? -1;
    const secondLow = ranked[ranked.length - 2]?.digit ?? -1;

    const evenCount = digitHistory.filter((d) => d % 2 === 0).length;
    const overCount = digitHistory.filter((d) => d > barrierDigit).length;
    const matchCount = digitHistory.filter((d) => d === barrierDigit).length;
    return {
      pcts,
      highest,
      secondHigh,
      lowest,
      secondLow,
      evenPct: (evenCount / total) * 100,
      oddPct: ((total - evenCount) / total) * 100,
      overPct: (overCount / total) * 100,
      underPct: ((total - overCount) / total) * 100,
      matchPct: (matchCount / total) * 100,
      differPct: ((total - matchCount) / total) * 100,
    };
  }, [digitHistory, barrierDigit]);

  const openOrders = orders
    .filter(
      (o) =>
        o.status === 'OPEN' &&
        (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) === accountMode
    )
    .map((o) => {
      const m = computeLiveOrderMetrics(o, ticks);
      return m.currentPrice > 0 ? { ...o, current_price: m.currentPrice, pnl: m.pnl } : o;
    });
  const totalFloatingPnl = openOrders.reduce((s, o) => s + Number(o.pnl || 0), 0);

  const handleBulkFire = async (side: string, contractType: string, barrier?: string) => {
    setExecuting(true);
    try {
      const useMultiAccountDeriv = selectedAccountIds.length > 0;
      const stakeNum = Math.max(0.35, Number(stake) || 0.5);

      if (count <= 1 && !useMultiAccountDeriv) {
        await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            symbol,
            side,
            contractType,
            stake: stakeNum,
            multiplier,
            duration: contractTicks,
            durationUnit: 't',
            barrier: barrier ?? null,
            slUsd: tradeType === 'multipliers' ? Number(slUsd) || null : null,
            tpUsd: tradeType === 'multipliers' ? Number(tpUsd) || null : null,
            accountMode,
            executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
            connectedAccountId: activeConnectedAccount?.id || null,
            source: autoTraderOn ? 'bot' : 'manual',
            idempotencyKey: `bulk1-${symbol}-${contractType}-${Date.now()}`,
          }),
        });
        await Promise.all([refreshOrders(), refreshAll()]);
        showToast(`Executed ${contractType} on ${symbol} ($${stakeNum.toFixed(2)})`, 'success');
      } else {
        const res = await apiFetch<{ count: number; mode?: string }>('/api/orders/bulk', {
          method: 'POST',
          body: JSON.stringify({
            count,
            symbol,
            side,
            contractType,
            stake: stakeNum,
            multiplier,
            duration: contractTicks,
            durationUnit: 't',
            barrier: barrier ?? null,
            slUsd: tradeType === 'multipliers' ? Number(slUsd) || null : null,
            tpUsd: tradeType === 'multipliers' ? Number(tpUsd) || null : null,
            accountMode,
            executionMode:
              useMultiAccountDeriv || (accountMode === 'real' && activeConnectedAccount)
                ? 'deriv'
                : 'virtual',
            connectedAccountId: activeConnectedAccount?.id || null,
            targetAccountIds: useMultiAccountDeriv ? selectedAccountIds : undefined,
          }),
        });
        await Promise.all([refreshOrders(), refreshAll()]);
        showToast(
          useMultiAccountDeriv
            ? `Deriv Multi-Account Bulk Purchase: ${res.count} ${contractType} contract(s) on ${symbol}`
            : `Executed ${res.count} concurrent ${contractType} orders on ${symbol} (${accountMode.toUpperCase()})`,
          'success'
        );
      }
    } catch (err) {
      showToast(sanitizeUiError(err, 'Bulk execution failed'), 'error');
    } finally {
      setExecuting(false);
    }
  };

  // Auto Trader continuous tick trigger
  useEffect(() => {
    if (!autoTraderOn || executing || suiteTab !== 'bulk') return;
    if (Date.now() < autoCooldownRef.current) return;
    autoCooldownRef.current = Date.now() + 4500;
    if (tradeType === 'even_odd') {
      const side = digitStats.evenPct >= digitStats.oddPct ? 'DIGITEVEN' : 'DIGITODD';
      handleBulkFire(side, side);
    } else if (tradeType === 'over_under') {
      const side = digitStats.overPct >= digitStats.underPct ? 'DIGITOVER' : 'DIGITUNDER';
      handleBulkFire(side, side, String(barrierDigit));
    } else if (tradeType === 'matches_differs') {
      handleBulkFire('DIGITDIFF', 'DIGITDIFF', String(barrierDigit));
    } else if (tradeType === 'rise_fall') {
      handleBulkFire('CALL', 'CALL');
    } else {
      handleBulkFire('BUY', 'MULTUP');
    }
  }, [digitHistory.length, autoTraderOn, suiteTab]);

  const handleBulkClose = async (filter: 'all' | 'profitable' | 'losing') => {
    try {
      const res = await apiFetch<{ closedCount: number }>('/api/orders/bulk-close', {
        method: 'POST',
        body: JSON.stringify({ filter }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`Closed ${res.closedCount} position(s)`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Bulk close failed', 'error');
    }
  };

  const stakeNum = Math.max(0.35, Number(stake) || 0.5);
  const dualActions = useMemo(() => {
    switch (tradeType) {
      case 'even_odd':
        return {
          leftLabel: 'Even',
          leftPct: digitStats.evenPct,
          leftPayout: stakeNum * 1.95,
          leftFire: () => handleBulkFire('DIGITEVEN', 'DIGITEVEN'),
          rightLabel: 'Odd',
          rightPct: digitStats.oddPct,
          rightPayout: stakeNum * 1.95,
          rightFire: () => handleBulkFire('DIGITODD', 'DIGITODD'),
        };
      case 'over_under':
        return {
          leftLabel: `Over ${barrierDigit}`,
          leftPct: digitStats.overPct,
          leftPayout: stakeNum * (9.5 / Math.max(1, 9 - barrierDigit)),
          leftFire: () => handleBulkFire('DIGITOVER', 'DIGITOVER', String(barrierDigit)),
          rightLabel: `Under ${barrierDigit}`,
          rightPct: digitStats.underPct,
          rightPayout: stakeNum * (9.5 / Math.max(1, barrierDigit)),
          rightFire: () => handleBulkFire('DIGITUNDER', 'DIGITUNDER', String(barrierDigit)),
        };
      case 'matches_differs':
        return {
          leftLabel: `Match ${barrierDigit}`,
          leftPct: digitStats.matchPct,
          leftPayout: stakeNum * 9.0,
          leftFire: () => handleBulkFire('DIGITMATCH', 'DIGITMATCH', String(barrierDigit)),
          rightLabel: `Differ ${barrierDigit}`,
          rightPct: digitStats.differPct,
          rightPayout: stakeNum * 1.09,
          rightFire: () => handleBulkFire('DIGITDIFF', 'DIGITDIFF', String(barrierDigit)),
        };
      case 'rise_fall':
        return {
          leftLabel: 'Rise',
          leftPct: 50,
          leftPayout: stakeNum * 1.95,
          leftFire: () => handleBulkFire('CALL', 'CALL'),
          rightLabel: 'Fall',
          rightPct: 50,
          rightPayout: stakeNum * 1.95,
          rightFire: () => handleBulkFire('PUT', 'PUT'),
        };
      default:
        return {
          leftLabel: `Fire ${selectedAccountIds.length > 0 ? `${selectedAccountIds.length}x Acct` : `${count}x`} BUY`,
          leftPct: 50,
          leftPayout: stakeNum * 2,
          leftFire: () => handleBulkFire('BUY', 'MULTUP'),
          rightLabel: `Fire ${selectedAccountIds.length > 0 ? `${selectedAccountIds.length}x Acct` : `${count}x`} SELL`,
          rightPct: 50,
          rightPayout: stakeNum * 2,
          rightFire: () => handleBulkFire('SELL', 'MULTDOWN'),
        };
    }
  }, [tradeType, digitStats, stakeNum, barrierDigit, count, selectedAccountIds.length]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 space-y-5">
      {/* Top Advanced Trading Suite Bar */}
      <div className="bg-[#0B1633] text-white rounded-2xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar border border-[#1B2C56]">
        {(
          [
            { id: 'bulk', label: 'Bulk Trader', icon: Zap },
            { id: 'matches', label: 'Matches', icon: Crown },
            { id: 'ultimate', label: 'Ultimate Bot', icon: Rocket },
            { id: 'smartai', label: 'Smart AI', icon: Cpu },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = suiteTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSuiteTab(t.id)}
              className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                active
                  ? 'bg-[#1D3B8B] text-white border-b-2 border-b-[#FF444F]'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#FF444F]' : 'text-slate-400'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {suiteTab === 'matches' && <MatchesPanel />}
      {suiteTab === 'ultimate' && <UltimateBotPanel />}
      {suiteTab === 'smartai' && <SmartAiPanel />}

      {suiteTab === 'bulk' && (
        <div className="space-y-5">
          {/* Bulk Trader Main Card with 0-9 Digit Circles & Dual Execution Bars */}
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-5">
            {/* Market & Trade Type Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end text-xs">
              <div className="md:col-span-5">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">MARKET</label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm font-semibold"
                  >
                    {instruments.map((i) => (
                      <option key={i.symbol} value={i.symbol}>
                        {i.display_name} ({i.symbol})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={hydrateDigitHistory}
                    className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] cursor-pointer"
                    title="Reload digit sample"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="md:col-span-4">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">TRADE TYPE</label>
                <select
                  value={tradeType}
                  onChange={(e) => setTradeType(e.target.value as BulkTradeType)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm font-semibold"
                >
                  <option value="even_odd">Even/Odd</option>
                  <option value="over_under">Over/Under</option>
                  <option value="matches_differs">Matches/Differs</option>
                  <option value="rise_fall">Rise/Fall</option>
                  <option value="multipliers">Multipliers (CFD)</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">NUMBER OF TICKS</label>
                <input
                  type="number"
                  min={20}
                  max={1000}
                  value={sampleTicks}
                  onChange={(e) => setSampleTicks(Math.max(20, Math.min(1000, Number(e.target.value) || 120)))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-center font-mono-num text-sm font-bold"
                />
              </div>
            </div>

            {/* Current Tick & 0–9 Digit Circles */}
            <div className="text-center space-y-4">
              <div>
                <p className="text-[11px] font-bold text-slate-400 tracking-wider">CURRENT TICK</p>
                <p className="font-mono-num text-3xl font-extrabold mt-0.5">
                  <span>{priceStr.slice(0, -1)}</span>
                  <span className="text-[#FF444F]">{priceStr.slice(-1)}</span>
                </p>
              </div>

              <div className="grid grid-cols-5 gap-3 sm:gap-4 max-w-2xl mx-auto">
                {digitStats.pcts.map((pct, d) => {
                  const isCurrent = d === currentLastDigit;
                  const isBarrier = (tradeType === 'over_under' || tradeType === 'matches_differs') && d === barrierDigit;
                  const barColor =
                    d === digitStats.highest
                      ? 'bg-[#00A878]'
                      : d === digitStats.secondHigh
                        ? 'bg-[#2563EB]'
                        : d === digitStats.lowest
                          ? 'bg-[#FF444F]'
                          : d === digitStats.secondLow
                            ? 'bg-amber-500'
                            : 'bg-slate-300 dark:bg-[#2A2F3D]';
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setBarrierDigit(d)}
                      className="flex flex-col items-center cursor-pointer group"
                    >
                      <div
                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex flex-col items-center justify-center relative border transition-all ${
                          isBarrier
                            ? 'bg-[#FF444F]/10 border-[#FF444F] ring-2 ring-[#FF444F]/30'
                            : 'bg-[#F4F5F7] dark:bg-[#111319] border-slate-200 dark:border-[#2A2F3D] group-hover:border-[#FF444F]/60'
                        }`}
                      >
                        <span className="font-mono-num text-sm sm:text-base font-extrabold">{d}</span>
                        <span className="font-mono-num text-[10px] text-slate-500">{pct.toFixed(2)}%</span>
                        <span className={`w-5 h-1 rounded-full mt-0.5 ${barColor}`} />
                      </div>
                      <span
                        className={`mt-1 text-[10px] leading-none ${
                          isCurrent ? 'text-[#FF444F] opacity-100' : 'opacity-0'
                        }`}
                      >
                        ▲
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Live Even/Odd or Over/Under Sequence Ribbon */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {digitHistory.slice(-10).map((d, i) => {
                  const isEven = d % 2 === 0;
                  const isOver = d > barrierDigit;
                  const label =
                    tradeType === 'over_under'
                      ? isOver
                        ? 'O'
                        : 'U'
                      : tradeType === 'matches_differs'
                        ? String(d)
                        : isEven
                          ? 'E'
                          : 'O';
                  const green =
                    tradeType === 'over_under'
                      ? isOver
                      : tradeType === 'matches_differs'
                        ? d === barrierDigit
                        : isEven;
                  return (
                    <span
                      key={`${i}-${d}`}
                      className={`w-7 h-7 rounded-lg font-mono-num text-xs font-extrabold inline-flex items-center justify-center text-white ${
                        green ? 'bg-[#2BB3A3]' : 'bg-[#E53935]'
                      }`}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Ticks / Stake / No. of Bulk Trades + Auto Trader + Candlestick Toggle */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 text-center mb-1">TICKS</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={contractTicks}
                  onChange={(e) => setContractTicks(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-center font-mono-num font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 text-center mb-1">STAKE ($)</label>
                <input
                  type="number"
                  min="0.35"
                  step="0.5"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-center font-mono-num font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 text-center mb-1">NO. OF BULK TRADES</label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  disabled={selectedAccountIds.length > 0}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(25, Number(e.target.value) || 1)))}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-center font-mono-num font-bold disabled:opacity-50"
                />
              </div>
            </div>

            {/* Multiplier SL/TP Controls when Multipliers selected */}
            {tradeType === 'multipliers' && (
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Multiplier</label>
                  <select
                    value={multiplier}
                    onChange={(e) => setMultiplier(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
                  >
                    {[50, 100, 200, 400].map((m) => (
                      <option key={m} value={m}>
                        x{m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">SL (USD)</label>
                  <input
                    type="number"
                    value={slUsd}
                    onChange={(e) => setSlUsd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">TP (USD)</label>
                  <input
                    type="number"
                    value={tpUsd}
                    onChange={(e) => setTpUsd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
                  />
                </div>
              </div>
            )}

            {/* Auto Trader + Live Candles Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowCandleChart((v) => !v)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border cursor-pointer ${
                  showCandleChart
                    ? 'bg-[#00A878]/10 text-[#00A878] border-[#00A878]/40'
                    : 'bg-[#F4F5F7] dark:bg-[#111319] border-slate-200 dark:border-[#2A2F3D]'
                }`}
              >
                <CandlestickChart className="w-3.5 h-3.5" />
                {showCandleChart ? 'Hide Candlestick Chart' : 'Show Live Candles'}
              </button>

              <button
                type="button"
                onClick={() => setAutoTraderOn((v) => !v)}
                className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border cursor-pointer ${
                  autoTraderOn
                    ? 'bg-[#00A878] text-white border-[#00A878]'
                    : 'bg-[#F4F5F7] dark:bg-[#111319] border-slate-200 dark:border-[#2A2F3D]'
                }`}
              >
                <Settings2 className={`w-3.5 h-3.5 ${autoTraderOn ? 'animate-spin' : ''}`} />
                {autoTraderOn ? 'Auto trader: ON' : 'Auto trader'}
              </button>
            </div>

            {/* Dual Execution Bars (Even / Odd, Over / Under, Match / Differ, Rise / Fall, BUY / SELL) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={executing}
                onClick={dualActions.leftFire}
                className="rounded-xl overflow-hidden bg-[#2BB3A3] hover:bg-[#00A878] text-white transition-colors cursor-pointer disabled:opacity-50 text-left"
              >
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="font-display font-bold text-sm">{dualActions.leftLabel}</span>
                  <span className="font-mono-num font-extrabold text-sm">
                    USD {dualActions.leftPayout.toFixed(2)}
                  </span>
                </div>
                <div className="bg-black/15 py-1 text-center font-mono-num text-[11px] font-bold">
                  {dualActions.leftPct.toFixed(2)}%
                </div>
              </button>

              <button
                type="button"
                disabled={executing}
                onClick={dualActions.rightFire}
                className="rounded-xl overflow-hidden bg-[#E53935] hover:bg-[#FF444F] text-white transition-colors cursor-pointer disabled:opacity-50 text-left"
              >
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="font-display font-bold text-sm">{dualActions.rightLabel}</span>
                  <span className="font-mono-num font-extrabold text-sm">
                    USD {dualActions.rightPayout.toFixed(2)}
                  </span>
                </div>
                <div className="bg-black/15 py-1 text-center font-mono-num text-[11px] font-bold">
                  {dualActions.rightPct.toFixed(2)}%
                </div>
              </button>
            </div>

            {/* Multi-Account Selector (Deriv V2 Bulk Purchase) */}
            {eligibleAccounts.length > 0 && (
              <div className="p-3 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    Target Deriv Accounts (Optional · up to 100)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedAccountIds(
                        selectedAccountIds.length === eligibleAccounts.length
                          ? []
                          : eligibleAccounts.map((a) => a.id)
                      )
                    }
                    className="text-[11px] font-semibold text-[#1958B7] hover:underline cursor-pointer"
                  >
                    {selectedAccountIds.length === eligibleAccounts.length ? 'Clear All' : 'Select All'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {eligibleAccounts.map((acc) => {
                    const checked = selectedAccountIds.includes(acc.id);
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => toggleTargetAccount(acc.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono-num font-semibold border cursor-pointer ${
                          checked
                            ? 'bg-[#1958B7] text-white border-[#1958B7]'
                            : 'bg-white dark:bg-[#181C25] border-slate-200 dark:border-[#2A2F3D]'
                        }`}
                      >
                        {acc.deriv_account_id} ({Number(acc.balance ?? acc.last_known_balance ?? 0).toFixed(2)})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Optional Live Candlestick Chart */}
            {showCandleChart && (
              <TemplateChart
                symbol={symbol}
                granularity={chartGranularity}
                showControls
                onGranularityChange={setChartGranularity}
                openOrders={openOrders.filter((o) => o.symbol === symbol)}
                recentOrders={orders.filter((o) => o.symbol === symbol).slice(0, 12)}
                heightClass="h-[280px] sm:h-[340px]"
              />
            )}
          </div>

          {/* Active Positions Table + Bulk Close */}
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-base font-bold">Active Positions ({openOrders.length})</h2>
                <span className={`text-xs font-mono-num font-bold ${totalFloatingPnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                  P/L: {totalFloatingPnl >= 0 ? '+' : ''}${totalFloatingPnl.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkClose('all')}
                  className="px-3 py-1.5 rounded-full bg-[#FF444F]/10 text-[#FF444F] text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Close All
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkClose('profitable')}
                  className="px-3 py-1.5 rounded-full bg-[#00A878]/10 text-[#00A878] text-xs font-bold cursor-pointer"
                >
                  Close Profitable
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkClose('losing')}
                  className="px-3 py-1.5 rounded-full bg-slate-200/70 dark:bg-white/10 text-xs font-bold cursor-pointer"
                >
                  Close Losing
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                    <th className="text-left px-4 py-2.5">Symbol</th>
                    <th className="text-left px-4 py-2.5">Type</th>
                    <th className="text-right px-4 py-2.5">Stake</th>
                    <th className="text-right px-4 py-2.5">Entry</th>
                    <th className="text-right px-4 py-2.5">Current</th>
                    <th className="text-right px-4 py-2.5">P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                  {openOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                        No open positions in {accountMode.toUpperCase()} mode.
                      </td>
                    </tr>
                  ) : (
                    openOrders.slice(0, 25).map((o) => (
                      <tr key={o.id}>
                        <td className="px-4 py-2.5 font-semibold">{o.symbol}</td>
                        <td className="px-4 py-2.5 font-mono-num">{o.contract_type || o.side}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num">${o.stake}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num">{o.entry_price}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num">{o.current_price}</td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono-num font-bold ${
                            o.pnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                          }`}
                        >
                          {o.pnl >= 0 ? '+' : ''}
                          {Number(o.pnl).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
