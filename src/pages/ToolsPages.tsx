import React, { useState, useEffect } from 'react';
import {
  Calculator,
  Copy,
  RefreshCw,
  Unlink,
  Ban,
  Download,
  Bell,
  CheckCheck,
  BookOpen,
  Link2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';

// 1. Risk Calculator (2% stake, 5x TP, 15x SL)
export const RiskCalculatorPage: React.FC = () => {
  const { user, kesRate } = useApp();
  const [capital, setCapital] = useState(String(user?.virtual_workspace_balance ?? 1000));
  const [riskPct, setRiskPct] = useState('2');
  const [martingale, setMartingale] = useState('2');

  const cap = Number(capital) || 0;
  const pct = Number(riskPct) || 2;
  const baseStake = Number(((cap * pct) / 100).toFixed(2));
  const tpTarget = Number((baseStake * 5).toFixed(2));
  const slLimit = Number((baseStake * 15).toFixed(2));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Calculator className="w-6 h-6 text-[#FF444F]" /> Smart Risk & Martingale Calculator
        </h1>
        <p className="text-xs text-slate-500">2% recommended base stake · 5x Take Profit · 15x Stop Loss cushion</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Account Capital (USD)</label>
          <input
            type="number"
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Risk per Trade (%)</label>
          <input
            type="number"
            step="0.5"
            value={riskPct}
            onChange={(e) => setRiskPct(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Martingale Factor</label>
          <input
            type="number"
            step="0.1"
            value={martingale}
            onChange={(e) => setMartingale(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#151820] text-white border border-[#2A2F3D]">
          <p className="text-xs text-slate-400">Recommended Base Stake ({pct}%)</p>
          <p className="font-mono-num text-2xl font-bold mt-1">${baseStake.toFixed(2)} USD</p>
          <p className="font-mono-num text-xs text-slate-400 mt-1">≈ KSh {(baseStake * kesRate).toFixed(0)}</p>
        </div>
        <div className="p-5 rounded-2xl bg-[#00A878]/10 border border-[#00A878]/30">
          <p className="text-xs font-semibold text-[#00A878]">Session Take Profit (5x)</p>
          <p className="font-mono-num text-2xl font-bold mt-1 text-[#00A878]">+${tpTarget.toFixed(2)} USD</p>
          <p className="font-mono-num text-xs text-slate-500 mt-1">≈ KSh {(tpTarget * kesRate).toFixed(0)}</p>
        </div>
        <div className="p-5 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30">
          <p className="text-xs font-semibold text-[#FF444F]">Session Stop Loss (15x)</p>
          <p className="font-mono-num text-2xl font-bold mt-1 text-[#FF444F]">-${slLimit.toFixed(2)} USD</p>
          <p className="font-mono-num text-xs text-slate-500 mt-1">≈ KSh {(slLimit * kesRate).toFixed(0)}</p>
        </div>
      </div>
    </div>
  );
};

// 2. Copy Trading & Linked Deriv Accounts
export const CopyTradingPage: React.FC = () => {
  const { accounts, refreshAccounts, launchDerivOAuth, showToast, formatMoney } = useApp();
  const [busyId, setBusyId] = useState<number | null>(null);

  const handleAction = async (id: number, action: 'sync' | 'disconnect' | 'revoke') => {
    setBusyId(id);
    try {
      await apiFetch(`/api/deriv/accounts/${id}/${action}`, { method: 'POST' });
      await refreshAccounts(false);
      showToast(`Account ${action} completed`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Copy className="w-6 h-6 text-[#FF444F]" /> Connected Deriv Accounts & Copy Desk
          </h1>
          <p className="text-xs text-slate-500">Sync balances, manage OAuth2 authorizations, or link another Deriv login</p>
        </div>

        <button
          type="button"
          onClick={() => launchDerivOAuth('login')}
          className="px-5 py-2.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
        >
          <Link2 className="w-4 h-4" /> Link Deriv Account via OAuth2
        </button>
      </div>

      <div className="space-y-3">
        {accounts.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-center">
            <p className="text-sm text-slate-500 mb-4">No external Deriv accounts connected yet.</p>
            <button
              type="button"
              onClick={() => launchDerivOAuth('login')}
              className="px-6 py-2.5 rounded-full bg-[#151820] dark:bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
            >
              Connect with Deriv OAuth2
            </button>
          </div>
        ) : (
          accounts.map((acc) => (
            <div
              key={acc.id}
              className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono-num font-bold text-sm">{acc.deriv_account_id}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1958B7]/10 text-[#1958B7]">
                    {acc.is_virtual ? 'DEMO' : 'REAL'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      acc.status === 'active' ? 'bg-[#00A878]/15 text-[#00A878]' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {acc.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {acc.account_type} · {acc.platform.toUpperCase()} · {acc.currency}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono-num text-base font-bold">{formatMoney(acc.balance)}</span>
                <button
                  type="button"
                  disabled={busyId === acc.id}
                  onClick={() => handleAction(acc.id, 'sync')}
                  className="p-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] hover:text-[#00A878] cursor-pointer"
                  title="Sync balance"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={busyId === acc.id}
                  onClick={() => handleAction(acc.id, 'disconnect')}
                  className="p-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] hover:text-amber-500 cursor-pointer"
                  title="Disconnect"
                >
                  <Unlink className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={busyId === acc.id}
                  onClick={() => handleAction(acc.id, 'revoke')}
                  className="p-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] hover:text-[#FF444F] cursor-pointer"
                  title="Revoke token"
                >
                  <Ban className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// 3. Reports & Deriv Statement Export
export const ReportsPage: React.FC = () => {
  const { orders, accounts, showToast } = useApp();
  const [selectedAccId, setSelectedAccId] = useState<string>(accounts[0]?.id ? String(accounts[0].id) : '');
  const [statementRows, setStatementRows] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedAccId) return;
    apiFetch<{ transactions: any[] }>(`/api/deriv/statement/${selectedAccId}`)
      .then((res) => setStatementRows(res.transactions || []))
      .catch(() => {});
  }, [selectedAccId]);

  const exportCsv = () => {
    const header = 'ID,Symbol,Side,Mode,Stake,Entry,Exit,PnL,Status,OpenedAt\n';
    const rows = orders
      .map((o) => `${o.id},${o.symbol},${o.side},${o.execution_mode},${o.stake},${o.entry_price},${o.exit_price ?? ''},${o.pnl},${o.status},${o.opened_at}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradederiv_reports_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Orders CSV exported', 'success');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Trading Reports & Statements</h1>
          <p className="text-xs text-slate-500">Order ledger, realized P/L, and Deriv account statement export</p>
        </div>

        <div className="flex items-center gap-2">
          {accounts.length > 0 && (
            <select
              value={selectedAccId}
              onChange={(e) => setSelectedAccId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.deriv_account_id} ({a.currency})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={exportCsv}
            className="px-4 py-2 rounded-full bg-[#151820] dark:bg-[#FF444F] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                <th className="text-left px-4 py-3">ID</th>
                <th className="text-left px-4 py-3">Symbol</th>
                <th className="text-left px-4 py-3">Side / Source</th>
                <th className="text-right px-4 py-3">Stake</th>
                <th className="text-right px-4 py-3">Entry → Exit</th>
                <th className="text-right px-4 py-3">P/L</th>
                <th className="text-right px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-mono-num">#{o.id}</td>
                  <td className="px-4 py-3 font-semibold">{o.symbol}</td>
                  <td className="px-4 py-3">
                    {o.side} <span className="text-slate-400">({o.source})</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono-num">${o.stake}</td>
                  <td className="px-4 py-3 text-right font-mono-num">
                    {o.entry_price} → {o.exit_price ?? o.current_price}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono-num font-bold ${o.pnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                    {o.pnl >= 0 ? '+' : ''}
                    {Number(o.pnl).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {statementRows.length > 0 && (
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5">
          <h2 className="font-display text-base font-bold mb-3">Deriv Account Statement Preview</h2>
          <div className="space-y-2 text-xs">
            {statementRows.slice(0, 10).map((s, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-[#2A2F3D] last:border-0">
                <span>{s.shortcode || s.symbol || s.transaction_id}</span>
                <span className="font-mono-num font-bold">{s.amount ?? s.pnl ?? 0} USD</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// 4. Notifications
export const NotificationsPage: React.FC = () => {
  const { notifications, markNotificationRead } = useApp();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Bell className="w-6 h-6 text-[#FF444F]" /> Notifications
        </h1>
        <button
          type="button"
          onClick={() => markNotificationRead('all')}
          className="px-4 py-2 rounded-full bg-[#F4F5F7] dark:bg-[#181C25] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <CheckCheck className="w-4 h-4 text-[#00A878]" /> Mark all read
        </button>
      </div>

      <div className="space-y-3">
        {notifications.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No notifications yet.</p>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.is_read && markNotificationRead(n.id)}
              className={`p-4 rounded-2xl border cursor-pointer transition-colors ${
                n.is_read
                  ? 'bg-white dark:bg-[#181C25] border-slate-200 dark:border-[#2A2F3D]'
                  : 'bg-[#FF444F]/5 border-[#FF444F]/30'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold">{n.title}</p>
                <span className="text-[11px] text-slate-400">{new Date(n.created_at).toLocaleString()}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">{n.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// 5. Learning Hub
export const LearningHubPage: React.FC = () => {
  const { setActiveTab } = useApp();
  const guides = [
    {
      title: 'MT5 CFDs & USD Risk Management',
      desc: 'How to size 0.01–1.00 lots, configure USD Stop Loss & Take Profit, and use 1:2 Risk-to-Reward presets.',
      action: () => setActiveTab('mt5-tv'),
      cta: 'Open MT5 Terminal',
    },
    {
      title: 'Zero-Delay Bot Automation & Martingale',
      desc: 'Understanding 25-tick signal warmup, Over/Under barriers, and session Take Profit protection.',
      action: () => setActiveTab('bot-builder'),
      cta: 'Open Bot Builder',
    },
    {
      title: 'Reading 0–9 Digit Heatmaps & RSI(14)',
      desc: 'Spotting hottest/coldest last digits and pairing RSI momentum with instant Over/Under execution.',
      action: () => setActiveTab('market-analyser'),
      cta: 'Open Market Analyser',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-[#FF444F]" /> TradeDeriv Learning Hub
        </h1>
        <p className="text-xs text-slate-500">Practical playbooks for synthetic indices, MT5 CFDs, and automated strategies</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {guides.map((g) => (
          <div
            key={g.title}
            className="p-5 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] flex flex-col justify-between space-y-4"
          >
            <div>
              <h2 className="font-display text-base font-bold">{g.title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{g.desc}</p>
            </div>
            <button
              type="button"
              onClick={g.action}
              className="py-2.5 px-4 rounded-full bg-[#151820] dark:bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
            >
              {g.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
