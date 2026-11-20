import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiFetch, sanitizeUiError } from '../../lib/api';
import { computeLiveOrderMetrics } from '../../lib/balances';
import type { OrderRecord } from '../../types';

interface TemplatePositionsPanelProps {
  title: string;
  contractTypes: string[];
  contractTypeLabels: Record<string, string>;
}

function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function durationToSeconds(duration: number, unit: string): number {
  const u = (unit || 't').toLowerCase();
  if (u === 't') return duration * 2;
  if (u === 's') return duration;
  if (u === 'm') return duration * 60;
  if (u === 'h') return duration * 3600;
  if (u === 'd') return duration * 86400;
  return duration * 2;
}

export const TemplatePositionsPanel: React.FC<TemplatePositionsPanelProps> = ({
  title,
  contractTypes,
  contractTypeLabels,
}) => {
  const {
    orders,
    ticks,
    instruments,
    accountMode,
    formatMoney,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [scopeAll, setScopeAll] = useState(false);
  const [sellingId, setSellingId] = useState<number | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const scopedOrders = orders.filter((o) => {
    const mode = o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo');
    if (mode !== accountMode) return false;
    if (!scopeAll) {
      return contractTypes.includes(String(o.contract_type || '').toUpperCase());
    }
    return true;
  });

  const openPositions = scopedOrders.filter((o) => o.status === 'OPEN');
  const closedPositions = scopedOrders.filter((o) => o.status === 'CLOSED').slice(0, 20);

  const handleSell = async (order: OrderRecord) => {
    if (sellingId === order.id) return;
    setSellingId(order.id);
    try {
      await apiFetch(`/api/orders/${order.id}/close`, { method: 'POST' });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`Closed ${order.symbol} contract`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Unable to sell contract'), 'error');
    } finally {
      setSellingId(null);
    }
  };

  const getDisplayName = (sym: string) =>
    instruments.find((i) => i.symbol === sym)?.display_name || sym;

  const getContractLabel = (o: OrderRecord) => {
    const ct = String(o.contract_type || o.side || '').toUpperCase();
    const base = contractTypeLabels[ct] || ct;
    if (ct === 'ACCU') {
      const gr = Number(o.barrier || 0.02);
      const pct = gr > 1 ? gr : Math.round(gr * 100);
      return `Accumulator ${pct}%`;
    }
    if (['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER'].includes(ct) && o.barrier !== null && o.barrier !== '') {
      return `${base} ${o.barrier}`;
    }
    return base;
  };

  return (
    <section className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-sm font-bold">{title} Positions</h3>
          <div className="inline-flex items-center bg-[#F4F5F7] dark:bg-[#111319] p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('open')}
              className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                tab === 'open'
                  ? 'bg-white dark:bg-[#232734] text-[#0E1117] dark:text-white shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              Open ({openPositions.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('closed')}
              className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                tab === 'closed'
                  ? 'bg-white dark:bg-[#232734] text-[#0E1117] dark:text-white shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              Closed ({closedPositions.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScopeAll((v) => !v)}
            className="text-[11px] font-semibold text-slate-500 hover:text-[#0E1117] dark:hover:text-white cursor-pointer"
          >
            {scopeAll ? 'Showing all options' : `Only ${title}`}
          </button>
          <span
            className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
              accountMode === 'real'
                ? 'bg-[#FF444F]/10 text-[#FF444F]'
                : 'bg-[#00A878]/10 text-[#00A878]'
            }`}
          >
            {accountMode}
          </span>
        </div>
      </div>

      <div className="p-4">
        {tab === 'open' && openPositions.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-500">
            No open {scopeAll ? 'options' : title.toLowerCase()} positions in {accountMode.toUpperCase()} mode.
          </div>
        )}

        {tab === 'open' && openPositions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {openPositions.map((pos) => {
              const metrics = computeLiveOrderMetrics(pos, ticks);
              const stake = Number(pos.stake || 0);
              const pnl = Number(metrics.pnl || 0);
              const contractValue = Number((stake + pnl).toFixed(2));
              const isGain = pnl >= 0;
              const startedSec = Math.floor(new Date(pos.opened_at).getTime() / 1000);
              const elapsed = Math.max(0, nowSec - startedSec);
              const ct = String(pos.contract_type || '').toUpperCase();
              const isAccu = ct === 'ACCU';
              const totalDur = isAccu ? 0 : durationToSeconds(Number(pos.duration || 5), pos.duration_unit || 't');
              const progress = totalDur > 0 ? Math.min(100, Math.max(4, (elapsed / totalDur) * 100)) : 50;

              return (
                <div
                  key={pos.id}
                  className="rounded-xl border border-slate-200 dark:border-[#2A2F3D] bg-[#F8F9FB] dark:bg-[#111319] p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-[#151820] text-white text-[10px] font-mono-num font-bold shrink-0">
                        {pos.symbol}
                      </span>
                      <span className="text-xs font-semibold truncate">{getDisplayName(pos.symbol)}</span>
                    </div>
                    <span className="text-xs font-bold text-[#0E1117] dark:text-white shrink-0">
                      {getContractLabel(pos)}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatElapsed(elapsed)}
                      </span>
                      <span>Entry {Number(pos.entry_price || 0).toFixed(2)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-[#232734] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          isAccu ? 'bg-[#00A878] animate-pulse' : 'bg-[#00A878]'
                        }`}
                        style={{ width: `${isAccu ? 100 : progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <p className="text-[11px] text-slate-500">Total profit/loss</p>
                      <p
                        className={`font-mono-num text-sm font-bold ${
                          isGain ? 'text-[#00A878]' : 'text-[#FF444F]'
                        }`}
                      >
                        {pnl >= 0 ? '+' : '-'}
                        {formatMoney(Math.abs(pnl))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Contract value</p>
                      <p
                        className={`font-mono-num text-sm font-bold ${
                          isGain ? 'text-[#00A878]' : 'text-[#FF444F]'
                        }`}
                      >
                        {formatMoney(Math.max(0, contractValue))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Stake</p>
                      <p className="font-mono-num font-semibold">{formatMoney(stake)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">
                        {isAccu ? 'Take profit' : 'Potential payout'}
                      </p>
                      <p className="font-mono-num font-semibold">
                        {isAccu
                          ? pos.tp_usd
                            ? formatMoney(Number(pos.tp_usd))
                            : 'Open'
                          : Number(pos.payout) > 0
                            ? formatMoney(Number(pos.payout))
                            : 'Quoted'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={sellingId === pos.id}
                    onClick={() => handleSell(pos)}
                    className="w-full py-2 rounded-full border border-slate-300 dark:border-[#2A2F3D] hover:border-[#FF444F] hover:text-[#FF444F] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {sellingId === pos.id
                      ? 'Closing...'
                      : isAccu
                        ? `Close @ ${formatMoney(Math.max(0, contractValue))}`
                        : 'Sell / Close'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'closed' && closedPositions.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-500">
            No settled {scopeAll ? 'options' : title.toLowerCase()} positions yet in {accountMode.toUpperCase()} mode.
          </div>
        )}

        {tab === 'closed' && closedPositions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {closedPositions.map((pos) => {
              const pnl = Number(pos.pnl || 0);
              const stake = Number(pos.stake || 0);
              const sellPrice = Math.max(0, Number((stake + pnl).toFixed(2)));
              const isGain = pnl >= 0;
              const durSec =
                pos.closed_at && pos.opened_at
                  ? Math.max(1, Math.floor((new Date(pos.closed_at).getTime() - new Date(pos.opened_at).getTime()) / 1000))
                  : 0;

              return (
                <div
                  key={pos.id}
                  className="rounded-xl border border-slate-200 dark:border-[#2A2F3D] bg-[#F8F9FB] dark:bg-[#111319] p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-[#151820] text-white text-[10px] font-mono-num font-bold shrink-0">
                        {pos.symbol}
                      </span>
                      <span className="text-xs font-semibold truncate">{getDisplayName(pos.symbol)}</span>
                    </div>
                    <span className="text-xs font-bold shrink-0">{getContractLabel(pos)}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-500">
                    <span>Duration: {formatElapsed(durSec)}</span>
                    {pos.exit_price && <span>Exit {Number(pos.exit_price).toFixed(2)}</span>}
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <p className="text-[11px] text-slate-500">Total profit/loss</p>
                      <p
                        className={`font-mono-num text-sm font-bold ${
                          isGain ? 'text-[#00A878]' : 'text-[#FF444F]'
                        }`}
                      >
                        {pnl >= 0 ? '+' : '-'}
                        {formatMoney(Math.abs(pnl))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Sell price</p>
                      <p className="font-mono-num font-semibold">{formatMoney(sellPrice)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Stake</p>
                      <p className="font-mono-num font-semibold">{formatMoney(stake)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Payout</p>
                      <p className="font-mono-num font-semibold">
                        {Number(pos.payout) > 0 ? formatMoney(Number(pos.payout)) : formatMoney(sellPrice)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

interface RealTradeConfirmModalProps {
  open: boolean;
  title: string;
  symbol: string;
  stake: number;
  summary: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const RealTradeConfirmModal: React.FC<RealTradeConfirmModalProps> = ({
  open,
  title,
  symbol,
  stake,
  summary,
  submitting,
  onCancel,
  onConfirm,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FF444F]/10 text-[#FF444F] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-display text-base font-bold">Confirm Real Account Trade</h4>
              <p className="text-xs text-slate-500">{title} · {symbol}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Contract</span>
            <span className="font-bold">{summary}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Stake</span>
            <span className="font-mono-num font-bold">${stake.toFixed(2)} USD</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Account Scope</span>
            <span className="font-bold text-[#FF444F]">REAL ACCOUNT</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{submitting ? 'Executing...' : 'Confirm Real Trade'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
