import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiFetch, sanitizeUiError } from '../../lib/api';
import { TemplateChart } from './TemplateChart';
import { TemplatePositionsPanel, RealTradeConfirmModal } from './TemplatePositionsPanel';

type Direction = 'CALL' | 'PUT';
type DurationUnit = 't' | 'm' | 'h' | 'end-time';

export const RiseFallTemplateView: React.FC = () => {
  const {
    instruments,
    ticks,
    orders,
    selectedSymbol,
    setSelectedSymbol,
    accountMode,
    activeConnectedAccount,
    formatMoney,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  const activeSymbol = useMemo(() => {
    return (
      instruments.find((i) => i.symbol === selectedSymbol) ||
      instruments[0] || {
        symbol: '1HZ100V',
        display_name: 'Volatility 100 (1s) Index',
        pip_size: 0.01,
        price: 1000,
      }
    );
  }, [instruments, selectedSymbol]);

  const [direction, setDirection] = useState<Direction>('CALL');
  const [allowEquals, setAllowEquals] = useState<boolean>(false);
  const [stakeStr, setStakeStr] = useState<string>('10');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('t');
  const [duration, setDuration] = useState<number>(5);
  const [chartGranularity, setChartGranularity] = useState<number>(1);
  const [endDateStr, setEndDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [endTimeStr, setEndTimeStr] = useState<string>(() => {
    const d = new Date(Date.now() + 15 * 60 * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [proposal, setProposal] = useState<{ askPrice: number; payout: number; source: string } | null>(null);
  const [loadingProposal, setLoadingProposal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const liveTick = ticks[activeSymbol.symbol];
  const currentQuote = liveTick?.quote ?? activeSymbol.price ?? 1000;
  const pipSize = liveTick?.pipSize ?? activeSymbol.pip_size ?? 0.01;
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;
  const effectiveContractType = allowEquals ? (`${direction}E` as 'CALLE' | 'PUTE') : direction;

  const openRfOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status === 'OPEN' &&
        o.symbol === activeSymbol.symbol &&
        ['CALL', 'CALLE', 'PUT', 'PUTE'].includes(String(o.contract_type || '').toUpperCase()) &&
        (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) === accountMode
    );
  }, [orders, activeSymbol.symbol, accountMode]);

  const computeEndExpiry = (): { epoch: number; minsFromNow: number } | null => {
    if (!endDateStr || !endTimeStr) return null;
    const target = new Date(`${endDateStr}T${endTimeStr}:00`);
    if (Number.isNaN(target.getTime())) return null;
    const diffSec = Math.floor((target.getTime() - Date.now()) / 1000);
    if (diffSec < 60) return null;
    return {
      epoch: Math.floor(target.getTime() / 1000),
      minsFromNow: Math.max(1, Math.ceil(diffSec / 60)),
    };
  };

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
        const endInfo = durationUnit === 'end-time' ? computeEndExpiry() : null;
        if (durationUnit === 'end-time' && !endInfo) {
          setProposal(null);
          setLoadingProposal(false);
          return;
        }
        const resolvedDuration =
          durationUnit === 'end-time'
            ? endInfo!.minsFromNow
            : durationUnit === 'h'
              ? duration * 60
              : duration;
        const resolvedUnit = durationUnit === 'end-time' || durationUnit === 'h' ? 'm' : durationUnit;

        const res = await apiFetch<{ source: string; proposal: any }>('/api/deriv/proposal', {
          method: 'POST',
          body: JSON.stringify({
            symbol: activeSymbol.symbol,
            contractType: effectiveContractType,
            stake,
            duration: resolvedDuration,
            durationUnit: resolvedUnit,
            dateExpiry: endInfo?.epoch,
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

    const timer = setTimeout(fetchProposal, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeSymbol.symbol,
    effectiveContractType,
    stakeStr,
    durationUnit,
    duration,
    endDateStr,
    endTimeStr,
    activeConnectedAccount?.id,
  ]);

  const executeBuy = async () => {
    const stake = parseFloat(stakeStr);
    if (!Number.isFinite(stake) || stake < 0.35) {
      showToast('Minimum stake is $0.35 USD', 'error');
      return;
    }

    let finalDuration = duration;
    let finalUnit: 't' | 'm' | 'h' = durationUnit === 'end-time' ? 'm' : durationUnit;
    if (durationUnit === 'end-time') {
      const endInfo = computeEndExpiry();
      if (!endInfo) {
        showToast('Select an end time at least 1 minute in the future', 'error');
        return;
      }
      finalDuration = endInfo.minsFromNow;
      finalUnit = 'm';
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: activeSymbol.symbol,
          side: effectiveContractType,
          contractType: effectiveContractType,
          stake,
          duration: finalDuration,
          durationUnit: finalUnit,
          executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
          accountMode,
          source: 'manual',
          idempotencyKey: `rf-${activeSymbol.symbol}-${effectiveContractType}-${Date.now()}`,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      setConfirmOpen(false);
      showToast(
        `${direction === 'CALL' ? 'Rise' : 'Fall'} contract opened on ${activeSymbol.symbol}`,
        'success'
      );
    } catch (err) {
      showToast(sanitizeUiError(err, 'Unable to purchase Rise/Fall contract'), 'error');
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

  const roiPct =
    proposal && proposal.askPrice > 0
      ? (((proposal.payout - proposal.askPrice) / proposal.askPrice) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        {/* Left: Market Picker, Live Spot & Rise/Fall Chart */}
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <label className="block text-[11px] text-slate-500">Market</label>
              <select
                value={activeSymbol.symbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="bg-transparent font-display text-sm font-bold outline-none cursor-pointer max-w-full"
              >
                {instruments.map((s) => (
                  <option key={s.symbol} value={s.symbol} className="bg-white dark:bg-[#181C25]">
                    {s.display_name} ({s.symbol})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex items-center bg-[#F4F5F7] dark:bg-[#111319] p-0.5 rounded-lg text-[11px]">
                {[
                  { label: '1t', g: 1 },
                  { label: '1m', g: 60 },
                  { label: '5m', g: 300 },
                ].map((tf) => (
                  <button
                    key={tf.g}
                    type="button"
                    onClick={() => setChartGranularity(tf.g)}
                    className={`px-2.5 py-1 rounded-md font-mono-num font-semibold cursor-pointer ${
                      chartGranularity === tf.g
                        ? 'bg-white dark:bg-[#232734] text-[#0E1117] dark:text-white shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              <div className="text-right">
                <p className="text-[11px] text-slate-500">Spot Price</p>
                <p className="font-mono-num text-lg font-bold">{currentQuote.toFixed(decimals)}</p>
              </div>
            </div>
          </div>

          <TemplateChart
            symbol={activeSymbol.symbol}
            granularity={chartGranularity}
            openOrders={openRfOrders}
            heightClass="h-[320px] sm:h-[400px]"
          />
        </div>

        {/* Right: Official Deriv Rise/Fall Trade Controls */}
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4">
          <h3 className="font-display text-base font-bold">Rise / Fall</h3>

          {/* Rise / Fall Segmented Toggle */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-full bg-[#F4F5F7] dark:bg-[#111319]">
            <button
              type="button"
              onClick={() => setDirection('CALL')}
              className={`py-2.5 rounded-full text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                direction === 'CALL'
                  ? 'bg-[#00A878] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#00A878]'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Rise</span>
            </button>
            <button
              type="button"
              onClick={() => setDirection('PUT')}
              className={`py-2.5 rounded-full text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                direction === 'PUT'
                  ? 'bg-[#FF444F] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#FF444F]'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>Fall</span>
            </button>
          </div>

          {/* Allow Equals */}
          <label className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] cursor-pointer">
            <div>
              <span className="text-xs font-semibold block">Allow equals</span>
              <span className="text-[11px] text-slate-500">Win if exit spot equals entry spot</span>
            </div>
            <input
              type="checkbox"
              checked={allowEquals}
              onChange={(e) => setAllowEquals(e.target.checked)}
              className="w-4 h-4 accent-[#FF444F] cursor-pointer"
            />
          </label>

          {/* Stake */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="rf-stake" className="text-xs text-slate-500 font-medium">
                Stake
              </label>
              <div className="flex items-center gap-1">
                {[1, 5, 10, 25, 50].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setStakeStr(String(v))}
                    className="px-2 py-0.5 rounded bg-[#F4F5F7] dark:bg-[#111319] text-[10px] font-mono-num font-semibold hover:bg-slate-200 dark:hover:bg-[#232734] cursor-pointer"
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <input
                id="rf-stake"
                type="number"
                min="0.35"
                step="0.5"
                value={stakeStr}
                onChange={(e) => setStakeStr(e.target.value)}
                className="w-full px-3.5 py-2.5 pr-14 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200/80 dark:border-[#2A2F3D] font-mono-num text-sm font-bold outline-none focus:border-[#FF444F]"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                USD
              </span>
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <label className="block text-xs text-slate-500 font-medium">Duration</label>
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
              {(
                [
                  { id: 't', label: 'Ticks' },
                  { id: 'm', label: 'Min' },
                  { id: 'h', label: 'Hours' },
                  { id: 'end-time', label: 'End time' },
                ] as const
              ).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setDurationUnit(u.id);
                    if (u.id === 't') setDuration((d) => Math.min(10, Math.max(1, d)));
                  }}
                  className={`py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    durationUnit === u.id
                      ? 'bg-white dark:bg-[#232734] text-[#0E1117] dark:text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  {u.label}
                </button>
              ))}
            </div>

            {durationUnit !== 'end-time' ? (
              <input
                type="number"
                min={1}
                max={durationUnit === 't' ? 10 : 1440}
                step={1}
                value={duration}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v)) {
                    setDuration(
                      durationUnit === 't' ? Math.min(10, Math.max(1, v)) : Math.max(1, v)
                    );
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200/80 dark:border-[#2A2F3D] font-mono-num text-sm font-bold outline-none focus:border-[#FF444F]"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={endDateStr}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200/80 dark:border-[#2A2F3D] text-xs font-mono-num font-bold"
                />
                <div className="relative">
                  <input
                    type="time"
                    value={endTimeStr}
                    onChange={(e) => setEndTimeStr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200/80 dark:border-[#2A2F3D] text-xs font-mono-num font-bold"
                  />
                  <Clock className="w-3.5 h-3.5 text-slate-400 pointer-events-none hidden" />
                </div>
              </div>
            )}
          </div>

          {/* Proposal Summary */}
          <div className="p-3.5 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200/70 dark:border-[#2A2F3D] space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Contract</span>
              <span className="font-bold">
                {direction === 'CALL' ? 'Rise' : 'Fall'}
                {allowEquals ? ' (or Equals)' : ''}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Potential payout</span>
              {loadingProposal && !proposal ? (
                <span className="h-4 w-20 rounded bg-slate-300/60 dark:bg-[#232734] animate-pulse inline-block" />
              ) : proposal ? (
                <span className="font-mono-num font-bold text-[#00A878]">
                  {formatMoney(proposal.payout)} {roiPct ? `(+${roiPct}%)` : ''}
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
            className={`w-full py-3.5 rounded-full text-white font-bold text-sm transition-colors cursor-pointer disabled:opacity-50 ${
              direction === 'CALL'
                ? 'bg-[#00A878] hover:bg-[#00966B]'
                : 'bg-[#FF444F] hover:bg-[#E63946]'
            }`}
          >
            {submitting ? (
              'Purchasing...'
            ) : (
              <span className="flex flex-col items-center leading-tight">
                <span>Buy {direction === 'CALL' ? 'Rise' : 'Fall'}</span>
                {proposal && (
                  <span className="text-[11px] font-mono-num font-normal opacity-90">
                    Payout {formatMoney(proposal.payout)}
                  </span>
                )}
              </span>
            )}
          </button>
        </div>
      </div>

      <TemplatePositionsPanel
        title="Rise / Fall"
        contractTypes={['CALL', 'CALLE', 'PUT', 'PUTE']}
        contractTypeLabels={{
          CALL: 'Rise',
          CALLE: 'Rise (Equal)',
          PUT: 'Fall',
          PUTE: 'Fall (Equal)',
        }}
      />

      <RealTradeConfirmModal
        open={confirmOpen}
        title="Rise / Fall"
        symbol={activeSymbol.symbol}
        stake={parseFloat(stakeStr) || 0}
        summary={`${direction === 'CALL' ? 'Rise' : 'Fall'}${allowEquals ? ' (Equals)' : ''} · ${
          durationUnit === 'end-time' ? `Until ${endDateStr} ${endTimeStr}` : `${duration}${durationUnit}`
        }`}
        submitting={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={executeBuy}
      />
    </div>
  );
};
