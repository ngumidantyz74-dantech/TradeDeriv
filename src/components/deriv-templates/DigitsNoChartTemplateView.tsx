import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Hash, TrendingUp, TrendingDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiFetch, sanitizeUiError } from '../../lib/api';
import { TemplatePositionsPanel, RealTradeConfirmModal } from './TemplatePositionsPanel';

type DigitTradeType = 'matches-differs' | 'over-under' | 'even-odd';
type DigitContractMode =
  | 'DIGITMATCH'
  | 'DIGITDIFF'
  | 'DIGITOVER'
  | 'DIGITUNDER'
  | 'DIGITEVEN'
  | 'DIGITODD';

const DIGIT_PRIORITY_SYMBOLS = [
  '1HZ100V',
  '1HZ75V',
  '1HZ50V',
  '1HZ25V',
  '1HZ10V',
  'R_100',
  'R_75',
  'R_50',
  'R_25',
  'R_10',
];

const TRADE_TYPE_OPTIONS: Array<{ value: DigitTradeType; label: string; defaultMode: DigitContractMode }> = [
  { value: 'matches-differs', label: 'Matches / Differs', defaultMode: 'DIGITMATCH' },
  { value: 'over-under', label: 'Over / Under', defaultMode: 'DIGITOVER' },
  { value: 'even-odd', label: 'Even / Odd', defaultMode: 'DIGITEVEN' },
];

const MODE_OPTIONS: Record<DigitTradeType, Array<{ value: DigitContractMode; label: string }>> = {
  'matches-differs': [
    { value: 'DIGITMATCH', label: 'Matches' },
    { value: 'DIGITDIFF', label: 'Differs' },
  ],
  'over-under': [
    { value: 'DIGITOVER', label: 'Over' },
    { value: 'DIGITUNDER', label: 'Under' },
  ],
  'even-odd': [
    { value: 'DIGITEVEN', label: 'Even' },
    { value: 'DIGITODD', label: 'Odd' },
  ],
};

function predictionPhrase(mode: DigitContractMode): string {
  switch (mode) {
    case 'DIGITMATCH':
      return 'match';
    case 'DIGITDIFF':
      return 'differ from';
    case 'DIGITOVER':
      return 'be over';
    case 'DIGITUNDER':
      return 'be under';
    case 'DIGITEVEN':
      return 'be even';
    case 'DIGITODD':
      return 'be odd';
  }
}

export const DigitsNoChartTemplateView: React.FC = () => {
  const {
    instruments,
    ticks,
    selectedSymbol,
    setSelectedSymbol,
    accountMode,
    activeConnectedAccount,
    formatMoney,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  const digitSymbols = useMemo(() => {
    const priority = DIGIT_PRIORITY_SYMBOLS.map((sym) => instruments.find((i) => i.symbol === sym)).filter(
      (i): i is NonNullable<typeof i> => Boolean(i)
    );
    const others = instruments.filter(
      (i) => i.category === 'Synthetic' && !DIGIT_PRIORITY_SYMBOLS.includes(i.symbol)
    );
    return [...priority, ...others];
  }, [instruments]);

  const activeSymbol = useMemo(() => {
    return (
      digitSymbols.find((s) => s.symbol === selectedSymbol) ||
      digitSymbols[0] || {
        symbol: '1HZ100V',
        display_name: 'Volatility 100 (1s) Index',
        pip_size: 0.01,
        price: 1000,
      }
    );
  }, [digitSymbols, selectedSymbol]);

  const [tradeType, setTradeType] = useState<DigitTradeType>('over-under');
  const [contractMode, setContractMode] = useState<DigitContractMode>('DIGITOVER');
  const [selectedDigit, setSelectedDigit] = useState<number>(4);
  const [stakeStr, setStakeStr] = useState<string>('10');
  const [duration, setDuration] = useState<number>(5);
  const [sampleWindow, setSampleWindow] = useState<number>(100);
  const [digitHistory, setDigitHistory] = useState<number[]>([]);
  const [prevQuote, setPrevQuote] = useState<number | null>(null);
  const [proposal, setProposal] = useState<{ askPrice: number; payout: number; source: string } | null>(null);
  const [loadingProposal, setLoadingProposal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const lastEpochRef = useRef<number | null>(null);

  const liveTick = ticks[activeSymbol.symbol];
  const currentQuote = liveTick?.quote ?? activeSymbol.price ?? 1000;
  const pipSize = liveTick?.pipSize ?? activeSymbol.pip_size ?? 0.01;
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;
  const priceStr = currentQuote.toFixed(decimals);
  const currentLastDigit = Number(priceStr[priceStr.length - 1] || 0);

  // Hydrate rolling digit history from real Deriv tick history on mount / symbol / window change
  useEffect(() => {
    let active = true;
    lastEpochRef.current = null;
    apiFetch<{ recentDigits?: number[]; distribution?: Array<{ digit: number; count: number }> }>(
      `/api/market/digit-analysis?symbol=${encodeURIComponent(activeSymbol.symbol)}&count=${sampleWindow}`,
      { skipAuth: true }
    )
      .then((res) => {
        if (!active) return;
        if (Array.isArray(res.recentDigits) && res.recentDigits.length > 0) {
          // reconstruct full distribution-consistent sequence or use recentDigits
          const dist = res.distribution || [];
          const expanded: number[] = [];
          for (const item of dist) {
            for (let i = 0; i < (item.count || 0); i++) {
              expanded.push(item.digit);
            }
          }
          // keep actual tail in recentDigits so ribbon order is exact
          const tail = res.recentDigits;
          const prefixLen = Math.max(0, expanded.length - tail.length);
          const merged = [...expanded.slice(0, prefixLen), ...tail].slice(-sampleWindow);
          setDigitHistory(merged.length > 0 ? merged : tail);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [activeSymbol.symbol, sampleWindow]);

  // Append incoming live /ws ticks incrementally
  useEffect(() => {
    if (!liveTick || !Number.isFinite(liveTick.quote)) return;
    if (lastEpochRef.current === liveTick.epoch) return;
    lastEpochRef.current = liveTick.epoch;
    const str = liveTick.quote.toFixed(decimals);
    const d = Number(str[str.length - 1] || 0);
    setDigitHistory((prev) => [...prev.slice(-(sampleWindow - 1)), d]);
    setPrevQuote((prev) => (prev === null ? liveTick.quote : currentQuote));
  }, [liveTick, decimals, sampleWindow]);

  // Compute exact measured digit statistics (zero fabricated probabilities)
  const digitStats = useMemo(() => {
    const counts = new Array(10).fill(0);
    for (const d of digitHistory) {
      if (d >= 0 && d <= 9) counts[d] += 1;
    }
    const total = digitHistory.length;
    const percentages = counts.map((c) => (total > 0 ? (c / total) * 100 : 0));
    const maxPct = Math.max(...percentages);
    const minPct = Math.min(...percentages);
    const evenCount = digitHistory.filter((d) => d % 2 === 0).length;
    const oddCount = total - evenCount;
    return {
      counts,
      percentages,
      total,
      maxPct,
      minPct,
      evenPct: total > 0 ? (evenCount / total) * 100 : 50,
      oddPct: total > 0 ? (oddCount / total) * 100 : 50,
    };
  }, [digitHistory]);

  // Keep contractMode aligned when switching tradeType chip
  const handleTradeTypeChange = (nextType: DigitTradeType) => {
    setTradeType(nextType);
    const opt = TRADE_TYPE_OPTIONS.find((o) => o.value === nextType);
    if (opt) setContractMode(opt.defaultMode);
  };

  // Live Deriv proposal quote
  useEffect(() => {
    const stake = parseFloat(stakeStr);
    if (!Number.isFinite(stake) || stake < 0.35) {
      setProposal(null);
      return;
    }

    let cancelled = false;
    const fetchProposal = async () => {
      setLoadingProposal(true);
      try {
        const needsBarrier = tradeType !== 'even-odd';
        const res = await apiFetch<{ source: string; proposal: any }>('/api/deriv/proposal', {
          method: 'POST',
          body: JSON.stringify({
            symbol: activeSymbol.symbol,
            contractType: contractMode,
            stake,
            duration: Math.min(10, Math.max(1, duration)),
            durationUnit: 't',
            barrier: needsBarrier ? String(selectedDigit) : undefined,
            connectedAccountId: activeConnectedAccount?.id || null,
          }),
        });
        if (cancelled || !res?.proposal) return;
        setProposal({
          askPrice: Number(res.proposal.ask_price ?? stake),
          payout: Number(res.proposal.payout ?? stake * 1.95),
          source: res.source || 'estimated_schedule',
        });
      } catch {
        if (!cancelled) setProposal(null);
      } finally {
        if (!cancelled) setLoadingProposal(false);
      }
    };

    const timer = setTimeout(fetchProposal, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeSymbol.symbol, tradeType, contractMode, selectedDigit, stakeStr, duration, activeConnectedAccount?.id]);

  const executeBuy = async () => {
    const stake = parseFloat(stakeStr);
    if (!Number.isFinite(stake) || stake < 0.35) {
      showToast('Minimum stake is $0.35 USD', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const needsBarrier = tradeType !== 'even-odd';
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: activeSymbol.symbol,
          side: contractMode,
          contractType: contractMode,
          stake,
          duration: Math.min(10, Math.max(1, duration)),
          durationUnit: 't',
          barrier: needsBarrier ? String(selectedDigit) : null,
          executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
          accountMode,
          source: 'manual',
          idempotencyKey: `digits-${activeSymbol.symbol}-${contractMode}-${Date.now()}`,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      setConfirmOpen(false);
      showToast(
        `${contractMode} contract purchased on ${activeSymbol.symbol}${needsBarrier ? ` (Digit ${selectedDigit})` : ''}`,
        'success'
      );
    } catch (err) {
      showToast(sanitizeUiError(err, 'Unable to purchase Digits contract'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBuyClick = () => {
    if (submitting) return;
    if (accountMode === 'real') {
      setConfirmOpen(true);
      return;
    }
    executeBuy();
  };

  const showDigitBadge = contractMode !== 'DIGITEVEN' && contractMode !== 'DIGITODD';
  const tickUp = prevQuote !== null && currentQuote > prevQuote;
  const tickDown = prevQuote !== null && currentQuote < prevQuote;

  return (
    <div className="space-y-5">
      {/* Main No-Chart 2-Column Layout matching digits-no-chart-app.zip */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 items-start">
        {/* Left: Market Column (Symbol + Live Tick + Measured Digit Stats — NO CHART) */}
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#FF444F]/10 text-[#FF444F] flex items-center justify-center shrink-0">
                <Hash className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] text-slate-500">Market (No-Chart Digits View)</label>
                <select
                  value={activeSymbol.symbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="bg-transparent font-display text-sm font-bold outline-none cursor-pointer max-w-full"
                >
                  {digitSymbols.map((s) => (
                    <option key={s.symbol} value={s.symbol} className="bg-white dark:bg-[#181C25]">
                      {s.display_name} ({s.symbol})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="inline-flex items-center gap-1 bg-[#F4F5F7] dark:bg-[#111319] p-1 rounded-lg text-[11px]">
              {[50, 100, 200].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setSampleWindow(w)}
                  className={`px-2 py-1 rounded-md font-mono-num font-semibold cursor-pointer ${
                    sampleWindow === w
                      ? 'bg-white dark:bg-[#232734] text-[#0E1117] dark:text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  {w}T
                </button>
              ))}
            </div>
          </div>

          {/* Current Tick Display */}
          <div className="py-5 px-4 rounded-2xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200/70 dark:border-[#2A2F3D] text-center space-y-2.5">
            <div className="flex items-center justify-center gap-2">
              <span className="font-mono-num text-3xl sm:text-4xl font-bold tracking-wide">
                <span>{priceStr.slice(0, -1)}</span>
                <span className="text-[#FF444F] text-4xl sm:text-5xl">{priceStr.slice(-1)}</span>
              </span>
              {tickUp && <TrendingUp className="w-5 h-5 text-[#00A878]" />}
              {tickDown && <TrendingDown className="w-5 h-5 text-[#FF444F]" />}
            </div>

            <div className="inline-flex items-center gap-2 text-xs text-slate-500">
              <span>Last Digit:</span>
              <span className="w-7 h-7 rounded-full bg-[#FF444F] text-white font-mono-num font-bold text-sm inline-flex items-center justify-center">
                {currentLastDigit}
              </span>
            </div>

            {/* Live Last-20 Ticks Sequence Ribbon */}
            {digitHistory.length > 0 && (
              <div className="pt-2 flex items-center justify-center gap-1 flex-wrap">
                {digitHistory.slice(-16).map((d, idx, arr) => {
                  const isNewest = idx === arr.length - 1;
                  const isMatch = showDigitBadge && d === selectedDigit;
                  return (
                    <span
                      key={`${idx}-${d}`}
                      className={`w-6 h-6 rounded-md font-mono-num text-[11px] font-bold inline-flex items-center justify-center ${
                        isNewest
                          ? 'bg-[#FF444F] text-white ring-2 ring-[#FF444F]/30'
                          : isMatch
                            ? 'bg-[#00A878]/15 text-[#00A878] border border-[#00A878]/40'
                            : 'bg-white dark:bg-[#181C25] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#2A2F3D]'
                      }`}
                    >
                      {d}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Digit Stats Bar (5x2 grid on Match/Differ & Over/Under; Even/Odd frequency bar on Even/Odd) */}
          {tradeType !== 'even-odd' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Last digit prediction</span>
                <span className="text-[11px] text-slate-400 font-mono-num">
                  Observed across {digitStats.total} ticks
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2 sm:gap-3">
                {digitStats.percentages.map((pct, digit) => {
                  const isSelected = digit === selectedDigit;
                  const isHighest = digitStats.total > 0 && pct === digitStats.maxPct;
                  const isLowest = digitStats.total > 0 && pct === digitStats.minPct;
                  return (
                    <div key={digit} className="flex flex-col items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedDigit(digit)}
                        className={`w-full max-w-[60px] h-12 sm:h-14 rounded-xl font-mono-num text-lg sm:text-xl font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF444F] text-white border-[#FF444F] shadow-sm'
                            : 'bg-[#F4F5F7] dark:bg-[#111319] text-[#0E1117] dark:text-white border-slate-200 dark:border-[#2A2F3D] hover:border-[#FF444F]/60'
                        }`}
                      >
                        {digit}
                      </button>
                      <span
                        className={`text-xs font-mono-num ${
                          isHighest
                            ? 'text-[#00A878] font-bold'
                            : isLowest
                              ? 'text-[#FF444F] font-bold'
                              : 'text-slate-500'
                        }`}
                      >
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Observed Even / Odd Distribution</span>
                <span className="font-mono-num text-[11px] text-slate-400">{digitStats.total} ticks</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200/70 dark:border-[#2A2F3D]">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold">Even (0,2,4,6,8)</span>
                    <span className="font-mono-num font-bold text-[#00A878]">
                      {digitStats.evenPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-[#232734] overflow-hidden">
                    <div
                      className="h-full bg-[#00A878] rounded-full transition-all"
                      style={{ width: `${digitStats.evenPct}%` }}
                    />
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200/70 dark:border-[#2A2F3D]">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold">Odd (1,3,5,7,9)</span>
                    <span className="font-mono-num font-bold text-[#FF444F]">
                      {digitStats.oddPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-[#232734] overflow-hidden">
                    <div
                      className="h-full bg-[#FF444F] rounded-full transition-all"
                      style={{ width: `${digitStats.oddPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Controls Column */}
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4">
          {/* Trade Type Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {TRADE_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleTradeTypeChange(opt.value)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  tradeType === opt.value
                    ? 'bg-[#151820] text-white border-[#151820] dark:bg-white dark:text-[#151820] dark:border-white'
                    : 'bg-[#F4F5F7] dark:bg-[#111319] border-transparent text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-[#2A2F3D]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Contract Mode Segmented Toggle */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-full bg-[#F4F5F7] dark:bg-[#111319]">
            {MODE_OPTIONS[tradeType].map((opt) => {
              const active = contractMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setContractMode(opt.value)}
                  className={`py-2 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-[#232734] text-[#FF444F] shadow-xs'
                      : 'text-slate-500 hover:text-[#0E1117] dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Stake & Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="digits-stake" className="text-xs text-slate-500 font-medium">
                Stake
              </label>
              <div className="relative">
                <input
                  id="digits-stake"
                  type="number"
                  min="0.35"
                  step="0.5"
                  value={stakeStr}
                  onChange={(e) => setStakeStr(e.target.value)}
                  className="w-full px-3 py-2.5 pr-12 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200/80 dark:border-[#2A2F3D] font-mono-num text-sm font-bold outline-none focus:border-[#FF444F]"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-500">
                  USD
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="digits-duration" className="text-xs text-slate-500 font-medium">
                Duration
              </label>
              <div className="relative">
                <input
                  id="digits-duration"
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={duration}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!Number.isNaN(v)) setDuration(Math.min(10, Math.max(1, v)));
                  }}
                  className="w-full px-3 py-2.5 pr-14 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200/80 dark:border-[#2A2F3D] font-mono-num text-sm font-bold outline-none focus:border-[#FF444F]"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-500">
                  Ticks
                </span>
              </div>
            </div>
          </div>

          {/* Prediction & Quoted Payout Card */}
          <div className="rounded-xl border border-slate-200 dark:border-[#2A2F3D] bg-[#F8F9FB] dark:bg-[#111319] p-3.5 space-y-2.5">
            <p className="text-[11px] text-slate-500">Prediction</p>
            <p className="text-sm font-medium leading-snug">
              Last digit of the price will{' '}
              <span className="text-[#FF444F] font-bold">{predictionPhrase(contractMode)}</span>
              {showDigitBadge && (
                <>
                  {' '}
                  <span className="inline-flex w-6 h-6 rounded-full bg-[#FF444F] text-white items-center justify-center font-mono-num text-xs font-bold align-middle">
                    {selectedDigit}
                  </span>
                </>
              )}
            </p>

            <div className="pt-2.5 border-t border-slate-200 dark:border-[#2A2F3D] flex items-center justify-between text-xs">
              <span className="text-slate-500">Quoted Payout</span>
              {loadingProposal && !proposal ? (
                <span className="h-4 w-24 rounded bg-slate-300/60 dark:bg-[#232734] animate-pulse inline-block" />
              ) : proposal ? (
                <span className="font-mono-num text-sm font-bold text-[#00A878]">
                  {formatMoney(proposal.payout)}
                </span>
              ) : (
                <span className="text-slate-400">---</span>
              )}
            </div>
          </div>

          {/* Buy Button */}
          <button
            type="button"
            disabled={submitting || !proposal}
            onClick={handleBuyClick}
            className="w-full py-3.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {submitting
              ? 'Purchasing...'
              : proposal
                ? `Buy @ ${formatMoney(proposal.askPrice)}`
                : 'Buy Contract'}
          </button>
        </div>
      </div>

      <TemplatePositionsPanel
        title="Digits"
        contractTypes={[
          'DIGITMATCH',
          'DIGITDIFF',
          'DIGITOVER',
          'DIGITUNDER',
          'DIGITEVEN',
          'DIGITODD',
        ]}
        contractTypeLabels={{
          DIGITMATCH: 'Matches',
          DIGITDIFF: 'Differs',
          DIGITOVER: 'Over',
          DIGITUNDER: 'Under',
          DIGITEVEN: 'Even',
          DIGITODD: 'Odd',
        }}
      />

      <RealTradeConfirmModal
        open={confirmOpen}
        title="Digits"
        symbol={activeSymbol.symbol}
        stake={parseFloat(stakeStr) || 0}
        summary={`${contractMode}${showDigitBadge ? ` (${selectedDigit})` : ''} · ${duration} tick(s)`}
        submitting={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={executeBuy}
      />
    </div>
  );
};
