import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Info, ShieldAlert, TrendingUp, Layers } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiFetch, sanitizeUiError } from '../../lib/api';
import { computeLiveOrderMetrics } from '../../lib/balances';
import { TemplateChart } from './TemplateChart';
import { TemplatePositionsPanel, RealTradeConfirmModal } from './TemplatePositionsPanel';

const ACCU_PRIORITY_SYMBOLS = [
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

const GROWTH_RATES = [0.01, 0.02, 0.03, 0.04, 0.05] as const;

interface AccuProposal {
  askPrice: number;
  payout: number;
  spot: number;
  maxPayout: number;
  maxTicks: number;
  barrierPercentage: string;
  highBarrier: string;
  lowBarrier: string;
  barrierSpotDistance: string;
  hasCrossedBarrier: boolean;
  source: 'deriv_ws' | 'estimated_schedule';
  longcode?: string;
}

export const AccumulatorsTemplateView: React.FC = () => {
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

  const accuSymbols = useMemo(() => {
    const priority = ACCU_PRIORITY_SYMBOLS.map((sym) => instruments.find((i) => i.symbol === sym)).filter(
      (i): i is NonNullable<typeof i> => Boolean(i)
    );
    const others = instruments.filter(
      (i) => i.category === 'Synthetic' && !ACCU_PRIORITY_SYMBOLS.includes(i.symbol)
    );
    return [...priority, ...others];
  }, [instruments]);

  const activeSymbol = useMemo(() => {
    return (
      accuSymbols.find((s) => s.symbol === selectedSymbol) ||
      accuSymbols[0] || {
        symbol: '1HZ100V',
        display_name: 'Volatility 100 (1s) Index',
        pip_size: 0.01,
        price: 1000,
      }
    );
  }, [accuSymbols, selectedSymbol]);

  const [growthRate, setGrowthRate] = useState<number>(0.02);
  const [accuGranularity, setAccuGranularity] = useState<number>(1);
  const [stakeStr, setStakeStr] = useState<string>('10');
  const [takeProfitStr, setTakeProfitStr] = useState<string>('');
  const [proposal, setProposal] = useState<AccuProposal | null>(null);
  const [loadingProposal, setLoadingProposal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const prevBarriersRef = useRef<{ high: string; low: string } | null>(null);

  const liveTick = ticks[activeSymbol.symbol];
  const currentSpot = liveTick?.quote ?? activeSymbol.price ?? 1000;
  const pipSize = liveTick?.pipSize ?? activeSymbol.pip_size ?? 0.01;
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;

  const activeAccuPosition = useMemo(() => {
    return (
      orders.find(
        (o) =>
          o.status === 'OPEN' &&
          String(o.contract_type || '').toUpperCase() === 'ACCU' &&
          o.symbol === activeSymbol.symbol &&
          (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) === accountMode
      ) || null
    );
  }, [orders, activeSymbol.symbol, accountMode]);

  useEffect(() => {
    prevBarriersRef.current = null;
  }, [activeSymbol.symbol, growthRate]);

  useEffect(() => {
    const stake = parseFloat(stakeStr);
    if (!Number.isFinite(stake) || stake < 0.5) {
      setProposal(null);
      return;
    }

    let cancelled = false;
    const fetchProposal = async () => {
      setLoadingProposal(true);
      try {
        const tp = parseFloat(takeProfitStr);
        const res = await apiFetch<{ source: 'deriv_ws' | 'estimated_schedule'; proposal: any }>(
          '/api/deriv/proposal',
          {
            method: 'POST',
            body: JSON.stringify({
              symbol: activeSymbol.symbol,
              contractType: 'ACCU',
              stake,
              growthRate,
              tpUsd: Number.isFinite(tp) && tp > 0 ? tp : undefined,
              connectedAccountId: activeConnectedAccount?.id || null,
            }),
          }
        );
        if (cancelled || !res?.proposal) return;
        const p = res.proposal;
        const details = p.contract_details || {};
        const newHigh = String(details.high_barrier ?? '');
        const newLow = String(details.low_barrier ?? '');
        const displayedHigh = prevBarriersRef.current?.high || newHigh;
        const displayedLow = prevBarriersRef.current?.low || newLow;
        if (newHigh && newLow) {
          prevBarriersRef.current = { high: newHigh, low: newLow };
        }
        const highNum = parseFloat(displayedHigh);
        const lowNum = parseFloat(displayedLow);
        const spotNum = Number(p.spot || currentSpot);
        const hasCrossedBarrier =
          Number.isFinite(spotNum) &&
          Number.isFinite(highNum) &&
          Number.isFinite(lowNum) &&
          (spotNum >= highNum || spotNum <= lowNum);

        setProposal({
          askPrice: Number(p.ask_price ?? stake),
          payout: Number(p.payout ?? stake * (1 + growthRate)),
          spot: spotNum,
          maxPayout: Number(details.maximum_payout ?? p.validation_params?.payout?.max ?? stake * 25),
          maxTicks: Number(details.maximum_ticks ?? p.validation_params?.max_ticks ?? 120),
          barrierPercentage: String(
            details.tick_size_barrier_percentage || `±${((0.0012 - growthRate * 0.015) * 100).toFixed(3)}%`
          ),
          highBarrier: displayedHigh,
          lowBarrier: displayedLow,
          barrierSpotDistance: String(details.barrier_spot_distance || ''),
          hasCrossedBarrier,
          source: res.source || 'estimated_schedule',
          longcode: p.longcode,
        });
      } catch {
        if (!cancelled) setProposal(null);
      } finally {
        if (!cancelled) setLoadingProposal(false);
      }
    };

    const timer = setTimeout(fetchProposal, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeSymbol.symbol, stakeStr, growthRate, takeProfitStr, activeConnectedAccount?.id]);

  // Real-time local barrier status tracking between proposals
  const highNum = parseFloat(proposal?.highBarrier || '');
  const lowNum = parseFloat(proposal?.lowBarrier || '');
  const barrierCrossed =
    Number.isFinite(highNum) &&
    Number.isFinite(lowNum) &&
    (currentSpot >= highNum || currentSpot <= lowNum);

  const executeBuy = async () => {
    const stake = parseFloat(stakeStr);
    if (!Number.isFinite(stake) || stake < 0.5) {
      showToast('Minimum stake is $0.50 USD', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const tp = parseFloat(takeProfitStr);
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: activeSymbol.symbol,
          side: 'ACCU',
          contractType: 'ACCU',
          stake,
          growthRate,
          barrier: String(growthRate),
          tpUsd: Number.isFinite(tp) && tp > 0 ? tp : null,
          executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
          accountMode,
          source: 'manual',
          idempotencyKey: `accu-${activeSymbol.symbol}-${Date.now()}`,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      setConfirmOpen(false);
      showToast(`Accumulator (${Math.round(growthRate * 100)}%) opened on ${activeSymbol.symbol}`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Unable to purchase Accumulator contract'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBuyClick = () => {
    if (submitting || activeAccuPosition) return;
    if (accountMode === 'real') {
      setConfirmOpen(true);
      return;
    }
    executeBuy();
  };

  const handleCloseActive = async () => {
    if (!activeAccuPosition || closingId === activeAccuPosition.id) return;
    setClosingId(activeAccuPosition.id);
    try {
      await apiFetch(`/api/orders/${activeAccuPosition.id}/close`, { method: 'POST' });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`Cashed out ${activeSymbol.symbol} Accumulator`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Failed to close Accumulator'), 'error');
    } finally {
      setClosingId(null);
    }
  };

  const activeMetrics = activeAccuPosition ? computeLiveOrderMetrics(activeAccuPosition, ticks) : null;
  const activeProfit = Number(activeMetrics?.pnl ?? activeAccuPosition?.pnl ?? 0);
  const activeStake = Number(activeAccuPosition?.stake ?? 0);
  const activeReturn = Math.max(0, Number((activeStake + activeProfit).toFixed(2)));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        {/* Left: Symbol Selector, Barrier Strip & Live Tick Chart */}
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#FF444F]/10 text-[#FF444F] flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] text-slate-500">Market</label>
                <select
                  value={activeSymbol.symbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="bg-transparent font-display text-sm font-bold outline-none cursor-pointer max-w-full"
                >
                  {accuSymbols.map((s) => (
                    <option key={s.symbol} value={s.symbol} className="bg-white dark:bg-[#181C25]">
                      {s.display_name} ({s.symbol})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[11px] text-slate-500">Current Spot</p>
              <p className="font-mono-num text-lg font-bold">
                {currentSpot.toFixed(decimals)}
              </p>
            </div>
          </div>

          {/* Barrier Band Summary */}
          <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs">
            <div>
              <p className="text-[11px] text-slate-500">Low Barrier</p>
              <p className="font-mono-num font-bold text-[#FF444F]">
                {Number.isFinite(lowNum) ? lowNum.toFixed(decimals) : '---'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-slate-500">Tick Range</p>
              <p className={`font-mono-num font-bold ${barrierCrossed ? 'text-[#FF444F]' : 'text-[#00A878]'}`}>
                {proposal?.barrierPercentage || `±${((0.0012 - growthRate * 0.015) * 100).toFixed(3)}%`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-500">High Barrier</p>
              <p className="font-mono-num font-bold text-[#00A878]">
                {Number.isFinite(highNum) ? highNum.toFixed(decimals) : '---'}
              </p>
            </div>
          </div>

          <TemplateChart
            symbol={activeSymbol.symbol}
            granularity={accuGranularity}
            showControls
            onGranularityChange={setAccuGranularity}
            barriers={{
              high: Number.isFinite(highNum) ? highNum : null,
              low: Number.isFinite(lowNum) ? lowNum : null,
              crossed: barrierCrossed,
            }}
            openOrders={activeAccuPosition ? [activeAccuPosition] : []}
            recentOrders={orders.filter((o) => o.symbol === activeSymbol.symbol && o.contract_type === 'ACCU').slice(0, 12)}
            heightClass="h-[320px] sm:h-[400px]"
          />
        </div>

        {/* Right: Official Deriv Accumulators Trade Controls */}
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold">Accumulators</h3>
            <span className="text-[11px] font-semibold text-[#00A878] inline-flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> {Math.round(growthRate * 100)}% / tick
            </span>
          </div>

          {/* Growth Rate */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Growth rate</span>
              <span
                className="inline-flex items-center gap-1 text-[11px] text-slate-400"
                title="Percentage your stake grows by each tick price stays within barriers"
              >
                <Info className="w-3.5 h-3.5" /> Compounds per tick
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {GROWTH_RATES.map((rate) => {
                const selected = Math.abs(growthRate - rate) < 0.001;
                return (
                  <button
                    key={rate}
                    type="button"
                    disabled={Boolean(activeAccuPosition)}
                    onClick={() => setGrowthRate(rate)}
                    className={`py-2.5 rounded-xl font-mono-num text-xs font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                      selected
                        ? 'bg-[#151820] text-white border-[#151820] dark:bg-white dark:text-[#151820] dark:border-white'
                        : 'bg-[#F4F5F7] dark:bg-[#111319] border-transparent text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-[#2A2F3D]'
                    }`}
                  >
                    {Math.round(rate * 100)}%
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stake */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="accu-stake" className="text-xs text-slate-500 font-medium">
                Stake
              </label>
              <div className="flex items-center gap-1">
                {[1, 5, 10, 25, 50].map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={Boolean(activeAccuPosition)}
                    onClick={() => setStakeStr(String(v))}
                    className="px-2 py-0.5 rounded bg-[#F4F5F7] dark:bg-[#111319] text-[10px] font-mono-num font-semibold hover:bg-slate-200 dark:hover:bg-[#232734] cursor-pointer disabled:opacity-50"
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <input
                id="accu-stake"
                type="number"
                min="0.5"
                step="0.5"
                disabled={Boolean(activeAccuPosition)}
                value={stakeStr}
                onChange={(e) => setStakeStr(e.target.value)}
                className="w-full px-3.5 py-2.5 pr-14 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200/80 dark:border-[#2A2F3D] font-mono-num text-sm font-bold outline-none focus:border-[#FF444F] disabled:opacity-50"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                USD
              </span>
            </div>
          </div>

          {/* Take Profit */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="accu-tp" className="text-xs text-slate-500 font-medium">
                Take profit (optional)
              </label>
              <span className="text-[11px] text-slate-400">Auto-close target</span>
            </div>
            <div className="relative">
              <input
                id="accu-tp"
                type="number"
                min="0"
                step="1"
                disabled={Boolean(activeAccuPosition)}
                placeholder="-"
                value={takeProfitStr}
                onChange={(e) => setTakeProfitStr(e.target.value)}
                className="w-full px-3.5 py-2.5 pr-14 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200/80 dark:border-[#2A2F3D] font-mono-num text-sm font-bold outline-none focus:border-[#FF444F] disabled:opacity-50"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                USD
              </span>
            </div>
          </div>

          {/* Active Position OR Proposal Info Summary */}
          {activeAccuPosition ? (
            <div className="p-3.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Stake</span>
                <span className="font-mono-num font-bold">{formatMoney(activeStake)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Current P&amp;L</span>
                <span
                  className={`font-mono-num font-bold ${
                    activeProfit >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                  }`}
                >
                  {activeProfit >= 0 ? '+' : '-'}
                  {formatMoney(Math.abs(activeProfit))}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-[#2A2F3D]">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Total return</span>
                <span className="font-mono-num text-sm font-bold">{formatMoney(activeReturn)}</span>
              </div>
            </div>
          ) : loadingProposal && !proposal ? (
            <div className="p-3.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] space-y-2 animate-pulse">
              <div className="h-3 w-full rounded bg-slate-300/50 dark:bg-[#232734]" />
              <div className="h-3 w-3/4 rounded bg-slate-300/50 dark:bg-[#232734]" />
              <div className="h-3 w-2/3 rounded bg-slate-300/50 dark:bg-[#232734]" />
            </div>
          ) : proposal ? (
            <div className="p-3.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200/70 dark:border-[#2A2F3D] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Max. payout</span>
                <span className="font-mono-num font-bold">{formatMoney(proposal.maxPayout)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Barrier</span>
                <span className="font-mono-num font-semibold">{proposal.barrierPercentage}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Max. duration</span>
                <span className="font-mono-num font-semibold">{proposal.maxTicks} ticks</span>
              </div>
            </div>
          ) : null}

          {/* Buy or Close Active Position Button */}
          {activeAccuPosition ? (
            <button
              type="button"
              disabled={closingId === activeAccuPosition.id}
              onClick={handleCloseActive}
              className="w-full py-3.5 rounded-full border-2 border-[#0E1117] dark:border-white bg-white dark:bg-transparent hover:bg-slate-100 dark:hover:bg-white/10 font-bold text-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {closingId === activeAccuPosition.id ? (
                'Closing...'
              ) : (
                <span className="flex flex-col items-center leading-tight">
                  <span>Close</span>
                  <span className="text-xs font-mono-num font-semibold opacity-80">
                    {formatMoney(activeReturn)}
                  </span>
                </span>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !proposal}
              onClick={handleBuyClick}
              className="w-full py-3.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Purchasing...' : 'Buy'}
            </button>
          )}

          {/* Risk Notice */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p>
              Accumulators allow 1 open position per symbol. Stake compounds {Math.round(growthRate * 100)}% per tick inside barriers; touching either barrier triggers immediate knockout.
            </p>
          </div>
        </div>
      </div>

      <TemplatePositionsPanel
        title="Accumulators"
        contractTypes={['ACCU']}
        contractTypeLabels={{ ACCU: 'Accumulator' }}
      />

      <RealTradeConfirmModal
        open={confirmOpen}
        title="Accumulators"
        symbol={activeSymbol.symbol}
        stake={parseFloat(stakeStr) || 0}
        summary={`Accumulator ${Math.round(growthRate * 100)}% Growth`}
        submitting={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={executeBuy}
      />
    </div>
  );
};
