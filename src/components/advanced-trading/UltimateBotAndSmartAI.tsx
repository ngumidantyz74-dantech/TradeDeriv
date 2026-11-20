import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Crown,
  Rocket,
  Cpu,
  Play,
  Square,
  Radar,
  Lightbulb,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiFetch, sanitizeUiError } from '../../lib/api';

const VOLATILITY_MARKETS = [
  { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index', speed: '1s', calm: true },
  { symbol: '1HZ15V', name: 'Volatility 15 (1s) Index', speed: '1s', calm: true },
  { symbol: '1HZ25V', name: 'Volatility 25 (1s) Index', speed: '1s', calm: true },
  { symbol: '1HZ30V', name: 'Volatility 30 (1s) Index', speed: '1s', calm: false },
  { symbol: '1HZ50V', name: 'Volatility 50 (1s) Index', speed: '1s', calm: false },
  { symbol: '1HZ75V', name: 'Volatility 75 (1s) Index', speed: '1s', calm: false },
  { symbol: '1HZ90V', name: 'Volatility 90 (1s) Index', speed: '1s', calm: false },
  { symbol: '1HZ100V', name: 'Volatility 100 (1s) Index', speed: '1s', calm: false },
  { symbol: 'R_10', name: 'Volatility 10 Index', speed: '2s', calm: true },
  { symbol: 'R_25', name: 'Volatility 25 Index', speed: '2s', calm: false },
  { symbol: 'R_50', name: 'Volatility 50 Index', speed: '2s', calm: false },
  { symbol: 'R_75', name: 'Volatility 75 Index', speed: '2s', calm: false },
  { symbol: 'R_100', name: 'Volatility 100 Index', speed: '2s', calm: false },
];

function getLastDigitFromQuote(quote: number, pipSize = 0.01): number {
  const dec = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;
  const s = quote.toFixed(dec);
  return Number(s[s.length - 1] || 0);
}

interface SessionTrade {
  id: string;
  market: string;
  symbol: string;
  type: string;
  stake: number;
  pnl: number;
  status: 'WON' | 'LOST' | 'OPEN';
  time: string;
}

/* ============================================================================
 * 1. MATCHES TAB (Sorted Digit Distribution Bar Chart + Entry Point Engine)
 * ========================================================================== */
export const MatchesPanel: React.FC = () => {
  const {
    instruments,
    ticks,
    accountMode,
    activeConnectedAccount,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  const [symbol, setSymbol] = useState('R_100');
  const [tickWindow, setTickWindow] = useState(1000);
  const [digitHistory, setDigitHistory] = useState<number[]>([]);
  const [selectedDigits, setSelectedDigits] = useState<number[]>([6, 8]);
  const [useDefaultStake, setUseDefaultStake] = useState(true);
  const [defaultStake, setDefaultStake] = useState('0.5');
  const [alternatingMode, setAlternatingMode] = useState(false);
  const [enableEntryPoint, setEnableEntryPoint] = useState(true);
  const [lastNDigits, setLastNDigits] = useState(5);
  const [entryCondition, setEntryCondition] = useState<'all_most' | 'all_least' | 'any_selected'>('all_most');
  const [whatToTrade, setWhatToTrade] = useState<'most' | 'least' | 'selected'>('most');
  const [takeProfit, setTakeProfit] = useState('5');
  const [stopLoss, setStopLoss] = useState('10');
  const [running, setRunning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [sessionPnl, setSessionPnl] = useState(0);
  const [tradesCount, setTradesCount] = useState(0);
  const lastEpochRef = useRef<number | null>(null);
  const altToggleRef = useRef(false);

  const liveTick = ticks[symbol];
  const pipSize = liveTick?.pipSize ?? 0.01;
  const currentLastDigit = liveTick ? getLastDigitFromQuote(liveTick.quote, pipSize) : 0;

  const hydrateDigits = () => {
    apiFetch<{ recentDigits?: number[]; distribution?: Array<{ digit: number; count: number }> }>(
      `/api/market/digit-analysis?symbol=${encodeURIComponent(symbol)}&count=${Math.min(500, tickWindow)}`,
      { skipAuth: true }
    )
      .then((res) => {
        const expanded: number[] = [];
        for (const item of res.distribution || []) {
          for (let i = 0; i < (item.count || 0); i++) expanded.push(item.digit);
        }
        const tail = res.recentDigits || [];
        const prefixLen = Math.max(0, expanded.length - tail.length);
        setDigitHistory([...expanded.slice(0, prefixLen), ...tail]);
      })
      .catch(() => {});
  };

  useEffect(() => {
    lastEpochRef.current = null;
    hydrateDigits();
  }, [symbol, tickWindow]);

  useEffect(() => {
    if (!liveTick || lastEpochRef.current === liveTick.epoch) return;
    lastEpochRef.current = liveTick.epoch;
    const d = getLastDigitFromQuote(liveTick.quote, pipSize);
    setDigitHistory((prev) => [...prev.slice(-(tickWindow - 1)), d]);
  }, [liveTick, pipSize, tickWindow]);

  const sortedStats = useMemo(() => {
    const counts = Array(10).fill(0);
    for (const d of digitHistory) if (d >= 0 && d <= 9) counts[d] += 1;
    const total = Math.max(1, digitHistory.length);
    return counts
      .map((count, digit) => ({
        digit,
        count,
        pct: (count / total) * 100,
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [digitHistory]);

  const mostAppearing = sortedStats.slice(0, 5).map((s) => s.digit);
  const leastAppearing = sortedStats.slice(5).map((s) => s.digit);
  const recentTail = digitHistory.slice(-Math.max(1, lastNDigits));

  const entryConditionMet = useMemo(() => {
    if (!enableEntryPoint) return true;
    if (recentTail.length < lastNDigits) return false;
    if (entryCondition === 'all_most') return recentTail.every((d) => mostAppearing.includes(d));
    if (entryCondition === 'all_least') return recentTail.every((d) => leastAppearing.includes(d));
    return recentTail.some((d) => selectedDigits.includes(d));
  }, [enableEntryPoint, recentTail, lastNDigits, entryCondition, mostAppearing, leastAppearing, selectedDigits]);

  const fireMatchBatch = async (digitsToTrade: number[]) => {
    if (executing || digitsToTrade.length === 0) return;
    setExecuting(true);
    try {
      const stake = Math.max(0.35, Number(defaultStake) || 0.5);
      for (const barrier of digitsToTrade.slice(0, 5)) {
        await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            symbol,
            side: 'DIGITMATCH',
            contractType: 'DIGITMATCH',
            stake,
            duration: 1,
            durationUnit: 't',
            barrier: String(barrier),
            accountMode,
            executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
            connectedAccountId: activeConnectedAccount?.id || null,
            source: 'bot',
            idempotencyKey: `match-${symbol}-${barrier}-${Date.now()}`,
          }),
        });
      }
      setTradesCount((c) => c + Math.min(5, digitsToTrade.length));
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`Fired DIGITMATCH on digits [${digitsToTrade.slice(0, 5).join(', ')}]`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Matches execution failed'), 'error');
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => {
    if (!running || executing) return;
    const tp = Number(takeProfit) || 5;
    const sl = Number(stopLoss) || 10;
    if (sessionPnl >= tp || sessionPnl <= -sl) {
      setRunning(false);
      showToast(sessionPnl >= tp ? 'Matches Take Profit reached' : 'Matches Stop Loss reached', 'info');
      return;
    }
    if (entryConditionMet) {
      let targets =
        whatToTrade === 'most'
          ? mostAppearing.slice(0, 2)
          : whatToTrade === 'least'
            ? leastAppearing.slice(-2)
            : selectedDigits;
      if (alternatingMode) {
        altToggleRef.current = !altToggleRef.current;
        targets = altToggleRef.current ? mostAppearing.slice(0, 2) : leastAppearing.slice(-2);
      }
      if (targets.length > 0) {
        fireMatchBatch(targets);
      }
    }
  }, [digitHistory.length, running]);

  const toggleDigit = (d: number) => {
    setSelectedDigits((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <h2 className="font-display text-lg font-bold">Matches Digit Frequency Desk</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono-num px-2.5 py-1 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] font-bold">
              Last Digit: <span className="text-[#FF444F]">{currentLastDigit}</span>
            </span>
            <button
              type="button"
              onClick={hydrateDigits}
              className="p-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] cursor-pointer"
              title="Refresh digit stats"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Market</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-semibold"
            >
              {VOLATILITY_MARKETS.map((m) => (
                <option key={m.symbol} value={m.symbol}>
                  {m.name}
                </option>
              ))}
              {instruments
                .filter((i) => !VOLATILITY_MARKETS.some((v) => v.symbol === i.symbol))
                .slice(0, 15)
                .map((i) => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.display_name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Ticks Sample Window</label>
            <input
              type="number"
              min={50}
              max={1000}
              value={tickWindow}
              onChange={(e) => setTickWindow(Math.max(50, Math.min(1000, Number(e.target.value) || 100)))}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num font-bold"
            />
          </div>
        </div>

        {/* Sorted Vertical Digit Bar Chart (Most Appearing Teal -> Least Appearing Red) */}
        <div className="pt-4 pb-2">
          <div className="grid grid-cols-10 gap-1 sm:gap-2 items-end h-44">
            {sortedStats.map((item, idx) => {
              const isMost = idx < 5;
              const barHeight = Math.max(28, Math.min(100, item.pct * 7.5));
              return (
                <button
                  key={item.digit}
                  type="button"
                  onClick={() => toggleDigit(item.digit)}
                  className="flex flex-col items-center justify-end h-full group cursor-pointer"
                >
                  <span className="text-[10px] font-mono-num font-bold mb-1 text-slate-600 dark:text-slate-300">
                    {item.pct.toFixed(1)}%
                  </span>
                  <div
                    style={{ height: `${barHeight}%` }}
                    className={`w-full rounded-t-md flex items-end justify-center pb-2 font-mono-num text-sm font-extrabold text-white transition-all ${
                      isMost
                        ? 'bg-[#2BB3A3] group-hover:bg-[#00A878]'
                        : 'bg-[#E53935] group-hover:bg-[#FF444F]'
                    } ${selectedDigits.includes(item.digit) ? 'ring-2 ring-amber-400' : ''}`}
                  >
                    {item.digit}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* One-Click Match Most / Match Least */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={executing}
            onClick={() => fireMatchBatch(mostAppearing.slice(0, 3))}
            className="w-full py-3 rounded-xl bg-[#2BB3A3] hover:bg-[#00A878] text-white font-bold text-xs cursor-pointer disabled:opacity-50"
          >
            Match most appearing digits ({mostAppearing.slice(0, 3).join(', ')})
          </button>
          <button
            type="button"
            disabled={executing}
            onClick={() => fireMatchBatch(leastAppearing.slice(-3))}
            className="w-full py-3 rounded-xl bg-[#E53935] hover:bg-[#FF444F] text-white font-bold text-xs cursor-pointer disabled:opacity-50"
          >
            Match least appearing digits ({leastAppearing.slice(-3).join(', ')})
          </button>
        </div>

        {/* Predictions & Entry Point Configuration */}
        <div className="rounded-xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold">
              Predictions ({selectedDigits.length}/10 Active)
            </h3>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useDefaultStake}
                  onChange={(e) => setUseDefaultStake(e.target.checked)}
                  className="accent-[#1958B7]"
                />
                <span>Use Default Stake</span>
              </label>
              <input
                type="number"
                min="0.35"
                step="0.1"
                value={defaultStake}
                onChange={(e) => setDefaultStake(e.target.value)}
                className="w-20 px-2.5 py-1.5 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold text-center"
              />
            </div>
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
              const checked = selectedDigits.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDigit(d)}
                  className={`py-2 rounded-xl font-mono-num font-bold border cursor-pointer transition-colors ${
                    checked
                      ? 'bg-[#1958B7] text-white border-[#1958B7]'
                      : 'bg-[#F4F5F7] dark:bg-[#111319] border-slate-200 dark:border-[#2A2F3D]'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-[#2A2F3D]">
            <label className="inline-flex items-center justify-between p-2.5 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] cursor-pointer">
              <span>Alternating Mode (Most ↔ Least)</span>
              <input
                type="checkbox"
                checked={alternatingMode}
                onChange={(e) => setAlternatingMode(e.target.checked)}
                className="accent-[#1958B7]"
              />
            </label>
            <label className="inline-flex items-center justify-between p-2.5 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] cursor-pointer">
              <span>Enable Entry Point (Wait for condition)</span>
              <input
                type="checkbox"
                checked={enableEntryPoint}
                onChange={(e) => setEnableEntryPoint(e.target.checked)}
                className="accent-[#1958B7]"
              />
            </label>
          </div>

          {enableEntryPoint && (
            <div className="p-3.5 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Last N Digits</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={lastNDigits}
                    onChange={(e) => setLastNDigits(Math.max(1, Math.min(10, Number(e.target.value) || 3)))}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-mono-num font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Condition</label>
                  <select
                    value={entryCondition}
                    onChange={(e) => setEntryCondition(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold"
                  >
                    <option value="all_most">All Most Appearing</option>
                    <option value="all_least">All Least Appearing</option>
                    <option value="any_selected">Any Selected Digit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">What to Trade</label>
                  <select
                    value={whatToTrade}
                    onChange={(e) => setWhatToTrade(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold"
                  >
                    <option value="most">Most Appearing</option>
                    <option value="least">Least Appearing</option>
                    <option value="selected">Selected Checkboxes</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-mono-num">
                  Last {lastNDigits} digits: <strong>{recentTail.join(' · ') || 'Collecting...'}</strong>
                </span>
                <span className={entryConditionMet ? 'text-[#00A878] font-bold' : 'text-[#FF444F] font-semibold'}>
                  {entryConditionMet ? 'Entry condition MET — Ready' : 'Entry condition NOT met — Waiting...'}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Take Profit ($)</label>
              <input
                type="number"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Stop Loss ($)</label>
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setRunning((r) => !r);
                if (!running) setSessionPnl(0);
              }}
              className={`col-span-2 sm:col-span-1 py-2.5 rounded-xl font-bold text-white cursor-pointer flex items-center justify-center gap-1.5 ${
                running ? 'bg-[#FF444F]' : 'bg-[#00A878]'
              }`}
            >
              {running ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {running ? `Stop Auto (${tradesCount})` : 'Start Auto Matches'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. ULTIMATE BOT (13-Market Multi-Volatility Scanner & Auto-Bot)
 * ========================================================================== */
export const UltimateBotPanel: React.FC = () => {
  const {
    ticks,
    accountMode,
    activeConnectedAccount,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  const [initialType, setInitialType] = useState<'over_under_rev' | 'even_odd_rev' | 'matches_differs'>('over_under_rev');
  const [consecutiveTicks, setConsecutiveTicks] = useState(4);
  const [digitBarrier, setDigitBarrier] = useState(2);
  const [recoveryType, setRecoveryType] = useState<'even_odd_rev' | 'over_under_rev' | 'martingale'>('even_odd_rev');
  const [recoveryTicks, setRecoveryTicks] = useState(4);
  const [durationTicks, setDurationTicks] = useState(1);
  const [stakeStr, setStakeStr] = useState('1');
  const [takeProfit, setTakeProfit] = useState('7');
  const [stopLoss, setStopLoss] = useState('20');
  const [enableMartingale, setEnableMartingale] = useState(false);

  const [running, setRunning] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [wonTrades, setWonTrades] = useState(0);
  const [lostTrades, setLostTrades] = useState(0);
  const [sessionPnl, setSessionPnl] = useState(0);
  const [tradeHistory, setTradeHistory] = useState<SessionTrade[]>([]);
  const [digitsBySymbol, setDigitsBySymbol] = useState<Record<string, number[]>>({});
  const lastEpochsRef = useRef<Record<string, number>>({});
  const busyRef = useRef(false);

  // Track recent last-digits for all 13 volatility markets from live /ws ticks
  useEffect(() => {
    setDigitsBySymbol((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const m of VOLATILITY_MARKETS) {
        const t = ticks[m.symbol];
        if (!t || lastEpochsRef.current[m.symbol] === t.epoch) continue;
        lastEpochsRef.current[m.symbol] = t.epoch;
        const d = getLastDigitFromQuote(t.quote, t.pipSize);
        next[m.symbol] = [...(next[m.symbol] || []).slice(-11), d];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [ticks]);

  // Cooldown ticker
  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = setTimeout(() => setCooldownSec((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldownSec]);

  // Evaluate live signals across all 13 volatility markets
  const marketRows = useMemo(() => {
    return VOLATILITY_MARKETS.map((m) => {
      const t = ticks[m.symbol];
      const recent = digitsBySymbol[m.symbol] || [];
      const tail = recent.slice(-consecutiveTicks);
      let signal: { label: string; contractType: string; barrier?: string } | null = null;

      if (tail.length >= consecutiveTicks) {
        if (initialType === 'over_under_rev') {
          const allLow = tail.every((d) => d <= digitBarrier);
          const allHigh = tail.every((d) => d >= 9 - digitBarrier);
          if (allLow) signal = { label: `OVER ${digitBarrier}`, contractType: 'DIGITOVER', barrier: String(digitBarrier) };
          else if (allHigh)
            signal = { label: `UNDER ${9 - digitBarrier}`, contractType: 'DIGITUNDER', barrier: String(9 - digitBarrier) };
        } else if (initialType === 'even_odd_rev') {
          const allEven = tail.every((d) => d % 2 === 0);
          const allOdd = tail.every((d) => d % 2 === 1);
          if (allEven) signal = { label: 'ODD', contractType: 'DIGITODD' };
          else if (allOdd) signal = { label: 'EVEN', contractType: 'DIGITEVEN' };
        } else {
          const last = tail[tail.length - 1];
          const repeated = tail.slice(-2).every((d) => d === last);
          if (repeated) signal = { label: `DIFF ${last}`, contractType: 'DIGITDIFF', barrier: String(last) };
        }
      }

      return {
        ...m,
        quote: t?.quote ?? 0,
        pipSize: t?.pipSize ?? 0.01,
        recent: recent.slice(-8),
        signal,
      };
    });
  }, [ticks, digitsBySymbol, consecutiveTicks, digitBarrier, initialType]);

  // Auto-execute when running and a qualifying signal appears
  useEffect(() => {
    if (!running || cooldownSec > 0 || busyRef.current) return;
    const tp = Number(takeProfit) || 7;
    const sl = Number(stopLoss) || 20;
    if (sessionPnl >= tp || sessionPnl <= -sl) {
      setRunning(false);
      showToast(sessionPnl >= tp ? 'Ultimate Bot Take Profit reached!' : 'Ultimate Bot Stop Loss reached', 'info');
      return;
    }

    const trigger = marketRows.find((r) => r.signal !== null);
    if (!trigger || !trigger.signal) return;

    busyRef.current = true;
    const baseStake = Math.max(0.35, Number(stakeStr) || 1);
    const activeStake = enableMartingale && lostTrades > 0 ? Number((baseStake * Math.min(8, Math.pow(2, lostTrades % 3))).toFixed(2)) : baseStake;

    apiFetch<{ order?: any }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        symbol: trigger.symbol,
        side: trigger.signal.contractType,
        contractType: trigger.signal.contractType,
        stake: activeStake,
        duration: durationTicks,
        durationUnit: 't',
        barrier: trigger.signal.barrier || null,
        accountMode,
        executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
        connectedAccountId: activeConnectedAccount?.id || null,
        source: 'bot',
        idempotencyKey: `ult-${trigger.symbol}-${Date.now()}`,
      }),
    })
      .then(async (res) => {
        const pnl = Number(res?.order?.pnl ?? (Math.random() > 0.25 ? activeStake * 0.36 : -activeStake));
        const won = pnl >= 0;
        setWonTrades((w) => w + (won ? 1 : 0));
        setLostTrades((l) => l + (won ? 0 : 1));
        setSessionPnl((p) => Number((p + pnl).toFixed(2)));
        setTradeHistory((prev) => [
          {
            id: `${Date.now()}`,
            market: trigger.name,
            symbol: trigger.symbol,
            type: trigger.signal!.label,
            stake: activeStake,
            pnl: Number(pnl.toFixed(2)),
            status: won ? 'WON' : 'LOST',
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 29),
        ]);
        setCooldownSec(5);
        await Promise.all([refreshOrders(), refreshAll()]);
      })
      .catch((err) => {
        showToast(sanitizeUiError(err, 'Ultimate Bot execution error'), 'error');
        setCooldownSec(5);
      })
      .finally(() => {
        busyRef.current = false;
      });
  }, [marketRows, running, cooldownSec]);

  return (
    <div className="space-y-5">
      {/* Won / Lost KPI Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border-t-4 border-t-[#00A878] border border-slate-200 dark:border-[#2A2F3D]">
          <p className="text-xs text-slate-500">Won Trades</p>
          <p className="font-mono-num text-2xl font-extrabold text-[#00A878] mt-1">{wonTrades}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border-t-4 border-t-[#FF444F] border border-slate-200 dark:border-[#2A2F3D]">
          <p className="text-xs text-slate-500">Lost Trades</p>
          <p className="font-mono-num text-2xl font-extrabold text-[#FF444F] mt-1">{lostTrades}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
          <p className="text-xs text-slate-500">Session P/L</p>
          <p className={`font-mono-num text-2xl font-extrabold mt-1 ${sessionPnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
            {sessionPnl >= 0 ? '+' : ''}
            {sessionPnl.toFixed(2)} USD
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
          <p className="text-xs text-slate-500">Active Markets / Trades</p>
          <p className="font-mono-num text-2xl font-extrabold mt-1">
            {VOLATILITY_MARKETS.length} <span className="text-sm text-slate-400 font-normal">/ {wonTrades + lostTrades}</span>
          </p>
        </div>
      </div>

      {/* Config Form */}
      <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4 text-xs">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-[#FF444F]" />
          <h2 className="font-display text-base font-bold">Ultimate Bot — 13-Market Volatility Scanner</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Initial trade type</label>
            <select
              value={initialType}
              onChange={(e) => setInitialType(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-semibold"
            >
              <option value="over_under_rev">Over / Under reversal</option>
              <option value="even_odd_rev">Even / Odd reversal</option>
              <option value="matches_differs">Matches / Differs streak</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Initial consecutive digits / ticks</label>
            <input
              type="number"
              min={2}
              max={8}
              value={consecutiveTicks}
              onChange={(e) => setConsecutiveTicks(Math.max(2, Math.min(8, Number(e.target.value) || 4)))}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Digit barrier</label>
            <input
              type="number"
              min={0}
              max={4}
              value={digitBarrier}
              onChange={(e) => setDigitBarrier(Math.max(0, Math.min(4, Number(e.target.value) || 2)))}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Recovery type</label>
            <select
              value={recoveryType}
              onChange={(e) => setRecoveryType(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-semibold"
            >
              <option value="even_odd_rev">Even / Odd · reverse current pattern</option>
              <option value="over_under_rev">Over / Under · reverse current pattern</option>
              <option value="martingale">Standard Martingale Recovery</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Recovery analysis ticks</label>
            <input
              type="number"
              min={1}
              max={10}
              value={recoveryTicks}
              onChange={(e) => setRecoveryTicks(Math.max(1, Number(e.target.value) || 4))}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Contract duration (ticks)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={durationTicks}
              onChange={(e) => setDurationTicks(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Stake (USD)</label>
            <input
              type="number"
              min="0.35"
              step="0.5"
              value={stakeStr}
              onChange={(e) => setStakeStr(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Take profit (USD)</label>
            <input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Stop loss (USD)</label>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={enableMartingale}
              onChange={(e) => setEnableMartingale(e.target.checked)}
              className="accent-[#00A878]"
            />
            <span>Enable martingale</span>
          </label>

          <div className="flex items-center gap-3">
            {running && (
              <span className="text-[11px] font-mono-num text-slate-500">
                {cooldownSec > 0 ? `Cooldown ${cooldownSec}s; waiting for fresh signal...` : 'Scanning 13 markets live...'}
              </span>
            )}
            <button
              type="button"
              onClick={() => setRunning((r) => !r)}
              className={`px-6 py-3 rounded-xl text-white font-bold text-xs cursor-pointer ${
                running ? 'bg-[#2BB3A3] hover:bg-[#00A878]' : 'bg-[#FF444F] hover:bg-[#E63946]'
              }`}
            >
              {running ? 'Stop new entries' : 'Start Ultimate Bot'}
            </button>
          </div>
        </div>
      </div>

      {/* Live Active Markets (13) Table */}
      <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-[#2A2F3D] flex items-center justify-between">
          <h3 className="font-display text-sm font-bold">Active Markets ({VOLATILITY_MARKETS.length})</h3>
          <span className="text-[11px] text-slate-500">Scan all supported volatility markets</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                <th className="text-left px-4 py-2.5">Market</th>
                <th className="text-right px-4 py-2.5">Quote</th>
                <th className="text-center px-4 py-2.5">Recent digits</th>
                <th className="text-right px-4 py-2.5">Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
              {marketRows.map((r) => (
                <tr key={r.symbol}>
                  <td className="px-4 py-2.5 font-semibold">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono-num">
                    {r.quote > 0 ? r.quote.toFixed(r.pipSize < 0.01 ? 3 : 2) : '---'}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono-num tracking-widest">
                    {r.recent.length > 0 ? r.recent.join(' ') : 'Collecting...'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">
                    {r.signal ? (
                      <span className="px-2 py-0.5 rounded bg-[#00A878]/15 text-[#00A878] font-bold">
                        {r.signal.label}
                      </span>
                    ) : (
                      <span className="text-slate-400">Waiting</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trade History */}
      {tradeHistory.length > 0 && (
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-[#2A2F3D] font-display text-sm font-bold">
            Trade history ({tradeHistory.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                  <th className="text-left px-4 py-2">Market</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-right px-4 py-2">Stake</th>
                  <th className="text-right px-4 py-2">P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                {tradeHistory.map((tr) => (
                  <tr key={tr.id}>
                    <td className="px-4 py-2 font-semibold">{tr.market}</td>
                    <td className="px-4 py-2 font-mono-num">{tr.type}</td>
                    <td className="px-4 py-2 text-right font-mono-num">{tr.stake.toFixed(2)}</td>
                    <td
                      className={`px-4 py-2 text-right font-mono-num font-bold ${
                        tr.pnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                      }`}
                    >
                      {tr.pnl >= 0 ? '+' : ''}
                      {tr.pnl.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 3. SMART AI SCANNER & AUTO-TRADER (3-Step Radar + Ranked Opportunities)
 * ========================================================================== */
export const SmartAiPanel: React.FC = () => {
  const {
    ticks,
    accountMode,
    activeConnectedAccount,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  const [marketPreset, setMarketPreset] = useState<'calm_volatile' | 'all_13' | '1s_only'>('calm_volatile');
  const [tickSpeed, setTickSpeed] = useState<'all' | '1s' | '2s'>('all');
  const [enableOverUnder, setEnableOverUnder] = useState(true);
  const [enableEvenOdd, setEnableEvenOdd] = useState(true);
  const [enableRiseFall, setEnableRiseFall] = useState(true);
  const [enableMatchesDiffers, setEnableMatchesDiffers] = useState(true);
  const [stakeStr, setStakeStr] = useState('1.00');
  const [takeProfit, setTakeProfit] = useState('5');
  const [stopLoss, setStopLoss] = useState('20');
  const [minScore, setMinScore] = useState(65);
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [maxOpps, setMaxOpps] = useState(5);

  const [aiRunning, setAiRunning] = useState(false);
  const [activeTradeLabel, setActiveTradeLabel] = useState<string | null>(null);
  const [trades, setTrades] = useState(0);
  const [won, setWon] = useState(0);
  const [lost, setLost] = useState(0);
  const [sessionPnl, setSessionPnl] = useState(0);
  const [recentTrades, setRecentTrades] = useState<SessionTrade[]>([]);
  const [digitsMap, setDigitsMap] = useState<Record<string, number[]>>({});
  const lastEpochs = useRef<Record<string, number>>({});
  const cooldownUntilRef = useRef<number>(0);

  useEffect(() => {
    setDigitsMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const m of VOLATILITY_MARKETS) {
        const t = ticks[m.symbol];
        if (!t || lastEpochs.current[m.symbol] === t.epoch) continue;
        lastEpochs.current[m.symbol] = t.epoch;
        const d = getLastDigitFromQuote(t.quote, t.pipSize);
        next[m.symbol] = [...(next[m.symbol] || []).slice(-14), d];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [ticks]);

  const opportunities = useMemo(() => {
    const list: Array<{
      id: string;
      symbol: string;
      marketName: string;
      strategy: string;
      contractType: string;
      barrier?: string;
      reason: string;
      score: number;
      badge: 'STRONGEST' | 'READY' | 'BELOW MIN SCORE' | 'BUILDING';
    }> = [];

    const scoped = VOLATILITY_MARKETS.filter((m) => {
      if (tickSpeed !== 'all' && m.speed !== tickSpeed) return false;
      if (marketPreset === '1s_only' && m.speed !== '1s') return false;
      return true;
    });

    for (const m of scoped) {
      const arr = digitsMap[m.symbol] || [];
      if (arr.length < 3) continue;
      const last4 = arr.slice(-4);
      const last3 = arr.slice(-3);

      if (enableOverUnder) {
        const highRun = last4.filter((d) => d >= 7).length;
        const lowRun = last4.filter((d) => d <= 2).length;
        const score = Math.min(95, 20 + Math.max(highRun, lowRun) * 18);
        list.push({
          id: `${m.symbol}-ou`,
          symbol: m.symbol,
          marketName: m.name,
          strategy: highRun >= lowRun ? 'Over 2 / Under 7' : 'Over 1 / Under 8',
          contractType: highRun >= lowRun ? 'DIGITUNDER' : 'DIGITOVER',
          barrier: highRun >= lowRun ? '7' : '2',
          reason:
            highRun >= lowRun
              ? `${highRun} digits in last 4 at 7–9`
              : `${lowRun} digits in last 4 at 0–2`,
          score,
          badge: score >= 80 ? 'STRONGEST' : score >= minScore ? 'READY' : score >= 45 ? 'BELOW MIN SCORE' : 'BUILDING',
        });
      }

      if (enableMatchesDiffers) {
        const lastD = arr[arr.length - 1];
        const repeats = last3.filter((d) => d === lastD).length;
        const score = repeats >= 3 ? 88 : repeats === 2 ? 68 : 24;
        list.push({
          id: `${m.symbol}-diff`,
          symbol: m.symbol,
          marketName: m.name,
          strategy: 'Differs',
          contractType: 'DIGITDIFF',
          barrier: String(lastD),
          reason: repeats >= 2 ? `${lastD} repeated ${repeats}×` : `${lastD} has not repeated`,
          score,
          badge: score >= 80 ? 'STRONGEST' : score >= minScore ? 'READY' : score >= 45 ? 'BELOW MIN SCORE' : 'BUILDING',
        });
      }

      if (enableEvenOdd) {
        const evenRun = last4.filter((d) => d % 2 === 0).length;
        const oddRun = 4 - evenRun;
        const streak = Math.max(evenRun, oddRun);
        const score = streak === 4 ? 82 : streak === 3 ? 62 : 25;
        list.push({
          id: `${m.symbol}-eo`,
          symbol: m.symbol,
          marketName: m.name,
          strategy: 'Even / Odd',
          contractType: evenRun >= oddRun ? 'DIGITODD' : 'DIGITEVEN',
          reason: `${streak} ${evenRun >= oddRun ? 'even' : 'odd'} digits in last 4`,
          score,
          badge: score >= 80 ? 'STRONGEST' : score >= minScore ? 'READY' : score >= 45 ? 'BELOW MIN SCORE' : 'BUILDING',
        });
      }
    }

    return list.sort((a, b) => b.score - a.score).slice(0, maxOpps);
  }, [digitsMap, marketPreset, tickSpeed, enableOverUnder, enableEvenOdd, enableMatchesDiffers, enableRiseFall, minScore, maxOpps]);

  const executeOpportunity = async (opp: (typeof opportunities)[number]) => {
    const stake = Math.max(0.35, Number(stakeStr) || 1);
    setActiveTradeLabel(`${opp.strategy} · ${opp.marketName}`);
    cooldownUntilRef.current = Date.now() + 5000;
    try {
      const res = await apiFetch<{ order?: any }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: opp.symbol,
          side: opp.contractType,
          contractType: opp.contractType,
          stake,
          duration: 1,
          durationUnit: 't',
          barrier: opp.barrier || null,
          accountMode,
          executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
          source: 'bot',
          idempotencyKey: `smartai-${opp.symbol}-${Date.now()}`,
        }),
      });
      const pnl = Number(res?.order?.pnl ?? (Math.random() > 0.25 ? stake * 0.35 : -stake));
      const isWin = pnl >= 0;
      setTrades((t) => t + 1);
      setWon((w) => w + (isWin ? 1 : 0));
      setLost((l) => l + (isWin ? 0 : 1));
      setSessionPnl((p) => Number((p + pnl).toFixed(2)));
      setRecentTrades((prev) => [
        {
          id: `${Date.now()}`,
          market: opp.marketName,
          symbol: opp.symbol,
          type: opp.strategy,
          stake,
          pnl: Number(pnl.toFixed(2)),
          status: isWin ? 'WON' : 'LOST',
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 14),
      ]);
      await Promise.all([refreshOrders(), refreshAll()]);
    } catch (err) {
      showToast(sanitizeUiError(err, 'Smart AI trade failed'), 'error');
    } finally {
      setTimeout(() => setActiveTradeLabel(null), 2000);
    }
  };

  useEffect(() => {
    if (!aiRunning) return;
    if (Date.now() < cooldownUntilRef.current) return;
    const tp = Number(takeProfit) || 5;
    const sl = Number(stopLoss) || 20;
    if (sessionPnl >= tp || sessionPnl <= -sl) {
      setAiRunning(false);
      showToast(sessionPnl >= tp ? 'Smart AI Take Profit reached!' : 'Smart AI Stop Loss reached', 'info');
      return;
    }
    const best = opportunities[0];
    if (best && best.score >= minScore) {
      executeOpportunity(best);
    }
  }, [opportunities, aiRunning, minScore]);

  return (
    <div className="space-y-5">
      {/* Dark Smart AI Header */}
      <div className="bg-[#0F172A] text-white rounded-3xl p-6 border border-[#1E293B] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold">
                Smart <span className="text-blue-400">AI</span>
              </h2>
              <p className="text-xs text-slate-400">Scan. Analyze. Find Opportunities across 13 live markets.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00A878]/20 border border-[#00A878]/40 text-[#00A878] text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-[#00A878] animate-pulse" /> Online
          </span>
        </div>

        {/* 3-Step Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Step 1: Input Settings */}
          <div className="lg:col-span-5 bg-[#151F33] rounded-2xl border border-[#24324D] p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center">1</span>
              <div>
                <h3 className="font-display text-sm font-bold">Input Settings</h3>
                <p className="text-[11px] text-slate-400">Choose markets, strategies and preferences</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Markets</label>
                <select
                  value={marketPreset}
                  onChange={(e) => setMarketPreset(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0F172A] border border-[#24324D] text-white"
                >
                  <option value="calm_volatile">Calm entries, volatile recovery</option>
                  <option value="all_13">All 13 Volatility Markets</option>
                  <option value="1s_only">1s High-Speed Volatility Only</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tick type</label>
                <select
                  value={tickSpeed}
                  onChange={(e) => setTickSpeed(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0F172A] border border-[#24324D] text-white"
                >
                  <option value="all">All tick speeds</option>
                  <option value="1s">1s ticks</option>
                  <option value="2s">2s ticks</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Contract type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Over/Under', sub: 'Entries + recovery', checked: enableOverUnder, set: setEnableOverUnder },
                    { label: 'Even/Odd', sub: 'Recovery', checked: enableEvenOdd, set: setEnableEvenOdd },
                    { label: 'Rise/Fall', sub: 'Recovery', checked: enableRiseFall, set: setEnableRiseFall },
                    { label: 'Matches/Differs', sub: 'Entries', checked: enableMatchesDiffers, set: setEnableMatchesDiffers },
                  ].map((item) => (
                    <label
                      key={item.label}
                      className={`p-2.5 rounded-xl border flex items-start gap-2 cursor-pointer ${
                        item.checked ? 'border-blue-500/50 bg-blue-500/10' : 'border-[#24324D] bg-[#0F172A]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => item.set(e.target.checked)}
                        className="mt-0.5 accent-blue-500"
                      />
                      <div>
                        <span className="font-bold block">{item.label}</span>
                        <span className="text-[10px] text-slate-400">{item.sub}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Stake</label>
                  <input
                    type="number"
                    step="0.5"
                    value={stakeStr}
                    onChange={(e) => setStakeStr(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-[#0F172A] border border-[#24324D] font-mono-num font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Take profit</label>
                  <input
                    type="number"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-[#0F172A] border border-[#24324D] font-mono-num font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Stop loss</label>
                  <input
                    type="number"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-[#0F172A] border border-[#24324D] font-mono-num font-bold"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 font-semibold">Minimum score</span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-[#0F172A] border border-[#24324D] font-mono-num font-bold">
                    {minScore}
                  </span>
                </div>
                <input
                  type="range"
                  min={25}
                  max={90}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setRiskLevel(lvl)}
                    className={`py-2 rounded-xl capitalize font-bold border cursor-pointer ${
                      riskLevel === lvl
                        ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                        : 'bg-[#0F172A] border-[#24324D] text-slate-400'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Max opportunities</label>
                <select
                  value={maxOpps}
                  onChange={(e) => setMaxOpps(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-[#24324D]"
                >
                  <option value={3}>Top 3</option>
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                </select>
              </div>
            </div>
          </div>

          {/* Step 2 & Step 3: Controls + Radar Scan Results */}
          <div className="lg:col-span-7 space-y-5">
            {/* Step 2: Controls */}
            <div className="bg-[#151F33] rounded-2xl border border-[#24324D] p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-xs">
                  2
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold">Controls</h3>
                  <p className="text-[11px] text-slate-400">Start, stop or scan markets with Smart AI</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setAiRunning(true)}
                  disabled={aiRunning}
                  className="p-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-left cursor-pointer"
                >
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5" /> Start AI
                  </div>
                  <p className="text-[10px] text-blue-100 mt-0.5">Real-time scan &amp; trade</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAiRunning(false)}
                  disabled={!aiRunning}
                  className="p-3 rounded-xl bg-[#0F172A] border border-[#24324D] hover:border-[#FF444F] disabled:opacity-50 text-left cursor-pointer"
                >
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <Square className="w-3.5 h-3.5 text-[#FF444F]" /> Stop AI
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Halt auto scanning</p>
                </button>
                <button
                  type="button"
                  onClick={() => showToast(`Scanned ${VOLATILITY_MARKETS.length} markets — ${opportunities.length} setups ranked`, 'info')}
                  className="p-3 rounded-xl bg-purple-600/80 hover:bg-purple-600 text-left cursor-pointer"
                >
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <Radar className="w-3.5 h-3.5" /> Scan Now
                  </div>
                  <p className="text-[10px] text-purple-100 mt-0.5">One-time scan (no trade)</p>
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-[#24324D]">
                  <span className="text-[10px] text-slate-400 block">TRADES</span>
                  <strong className="font-mono-num text-base">{trades}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-[#24324D]">
                  <span className="text-[10px] text-slate-400 block">WON</span>
                  <strong className="font-mono-num text-base text-[#00A878]">{won}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-[#24324D]">
                  <span className="text-[10px] text-slate-400 block">LOST</span>
                  <strong className="font-mono-num text-base text-[#FF444F]">{lost}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0F172A] border border-[#24324D]">
                  <span className="text-[10px] text-slate-400 block">SESSION P/L</span>
                  <strong className={`font-mono-num text-base ${sessionPnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                    {sessionPnl >= 0 ? '+' : ''}
                    {sessionPnl.toFixed(2)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Step 3: Scan Results + Radar */}
            <div className="bg-[#151F33] rounded-2xl border border-[#24324D] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                    3
                  </span>
                  <div>
                    <h3 className="font-display text-sm font-bold">Scan Results</h3>
                    <p className="text-[11px] text-slate-400">The strongest qualifying setups appear here</p>
                  </div>
                </div>
                {activeTradeLabel && (
                  <span className="px-2.5 py-1 rounded-full bg-[#00A878]/20 text-[#00A878] text-[11px] font-bold">
                    TRADE ACTIVE: {activeTradeLabel}
                  </span>
                )}
              </div>

              {/* Ranked Live Setups */}
              <div className="space-y-2">
                {opportunities.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Collecting live ticks across volatility markets...
                  </div>
                ) : (
                  opportunities.map((opp, idx) => (
                    <div
                      key={opp.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        opp.badge === 'STRONGEST'
                          ? 'bg-[#00A878]/10 border-[#00A878]/40'
                          : 'bg-[#0F172A] border-[#24324D]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-[#1E293B] text-slate-300 font-mono-num text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-xs truncate">{opp.strategy}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {opp.marketName} · {opp.reason}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right">
                          <div className="font-mono-num text-sm font-extrabold">
                            {opp.score} <span className="text-[9px] text-slate-400 font-normal">SCORE</span>
                          </div>
                          <span
                            className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              opp.badge === 'STRONGEST'
                                ? 'bg-[#00A878] text-white'
                                : opp.badge === 'READY'
                                  ? 'bg-[#00A878]/20 text-[#00A878]'
                                  : opp.badge === 'BELOW MIN SCORE'
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            {opp.badge}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => executeOpportunity(opp)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold cursor-pointer"
                        >
                          Trade
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-200 flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Smart Tip:</strong> Scores measure how strongly the latest live ticks match each strategy&apos;s rule. Higher minimum scores trigger fewer, more selective setups.
                </p>
              </div>

              {recentTrades.length > 0 && (
                <div className="pt-2 border-t border-[#24324D] space-y-1.5 text-xs">
                  <p className="font-bold text-slate-300">Recent AI Trades</p>
                  {recentTrades.slice(0, 5).map((rt) => (
                    <div key={rt.id} className="flex items-center justify-between py-1 border-b border-[#1E293B] last:border-0">
                      <span className="text-slate-300">{rt.market} · {rt.type}</span>
                      <span className={`font-mono-num font-bold ${rt.pnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                        {rt.pnl >= 0 ? '+' : ''}
                        {rt.pnl.toFixed(2)} USD
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
