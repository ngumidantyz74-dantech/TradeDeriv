import React, { useState } from 'react';
import { Zap, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { computeLiveOrderMetrics } from '../lib/balances';

export const BulkTraderPage: React.FC = () => {
  const {
    instruments,
    ticks,
    orders,
    accountMode,
    activeConnectedAccount,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  const [symbol, setSymbol] = useState('1HZ100V');
  const [count, setCount] = useState(3);
  const [stake, setStake] = useState('2');
  const [multiplier, setMultiplier] = useState(100);
  const [contractType, setContractType] = useState('MULTUP');
  const [slUsd, setSlUsd] = useState('1');
  const [tpUsd, setTpUsd] = useState('3');
  const [executing, setExecuting] = useState(false);

  const live = ticks[symbol];
  const inst = instruments.find((i) => i.symbol === symbol);
  const price = live?.quote ?? inst?.price ?? 1000;
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

  const handleBulkFire = async (side: string, overrideType?: string) => {
    setExecuting(true);
    try {
      const res = await apiFetch<{ count: number }>('/api/orders/bulk', {
        method: 'POST',
        body: JSON.stringify({
          count,
          symbol,
          side,
          contractType: overrideType || contractType,
          stake: Number(stake),
          multiplier,
          slUsd: Number(slUsd) || null,
          tpUsd: Number(tpUsd) || null,
          accountMode,
          executionMode:
            activeConnectedAccount && !activeConnectedAccount.balance_locked_by_admin ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`Executed ${res.count} concurrent ${side} orders on ${symbol} (${accountMode.toUpperCase()})`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Bulk execution failed', 'error');
    } finally {
      setExecuting(false);
    }
  };

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div className="bg-[#151820] text-white rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#FF444F] font-semibold mb-1">
            <Zap className="w-4 h-4" /> High-Throughput Batch Desk
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                accountMode === 'real' ? 'bg-[#FF444F]/20 text-[#FF444F]' : 'bg-[#00A878]/20 text-[#00A878]'
              }`}
            >
              {accountMode} Mode
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold">Bulk Trader (1–25 Concurrent Orders)</h1>
        </div>
        <div className="text-right font-mono-num">
          <p className="text-xs text-slate-400">{inst?.display_name || symbol}</p>
          <p className="text-2xl font-bold">{price}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Instrument</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm font-semibold"
            >
              {instruments.map((i) => (
                <option key={i.symbol} value={i.symbol}>
                  {i.display_name} ({i.symbol})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-slate-500">Concurrent Orders</span>
              <strong className="font-mono-num text-[#FF444F]">{count}x</strong>
            </div>
            <input
              type="range"
              min="1"
              max="25"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-[#FF444F]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Stake per Order ($)</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Multiplier</label>
              <select
                value={multiplier}
                onChange={(e) => setMultiplier(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
              >
                {[50, 100, 200, 400].map((m) => (
                  <option key={m} value={m}>
                    x{m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">SL (USD)</label>
              <input
                type="number"
                value={slUsd}
                onChange={(e) => setSlUsd(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">TP (USD)</label>
              <input
                type="number"
                value={tpUsd}
                onChange={(e) => setTpUsd(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              disabled={executing}
              onClick={() => handleBulkFire('BUY', 'MULTUP')}
              className="py-3 rounded-full bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <TrendingUp className="w-4 h-4" /> Fire {count}x BUY
            </button>
            <button
              type="button"
              disabled={executing}
              onClick={() => handleBulkFire('SELL', 'MULTDOWN')}
              className="py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <TrendingDown className="w-4 h-4" /> Fire {count}x SELL
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-[#2A2F3D] flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleBulkClose('all')}
              className="px-3 py-1.5 rounded-full bg-[#FF444F]/10 text-[#FF444F] text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Close All ({openOrders.length})
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

        {/* Live Open Batch Table */}
        <div className="lg:col-span-7 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold">Active Positions ({openOrders.length})</h2>
            <div className="flex items-center gap-3 text-xs font-mono-num">
              <span className="text-slate-500">Exposure: ${openOrders.reduce((a, b) => a + b.stake, 0).toFixed(2)}</span>
              <span className={`font-bold ${totalFloatingPnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                P/L: {totalFloatingPnl >= 0 ? '+' : ''}${totalFloatingPnl.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                  <th className="text-left px-4 py-2.5">Symbol</th>
                  <th className="text-left px-4 py-2.5">Side</th>
                  <th className="text-right px-4 py-2.5">Stake</th>
                  <th className="text-right px-4 py-2.5">Entry</th>
                  <th className="text-right px-4 py-2.5">Current</th>
                  <th className="text-right px-4 py-2.5">P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                {openOrders.slice(0, 25).map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5 font-semibold">{o.symbol}</td>
                    <td className="px-4 py-2.5">{o.side}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
