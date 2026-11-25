import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Copy,
  MoreVertical,
  RefreshCw,
  Unlink,
  Ban,
  Download,
  Bell,
  CheckCheck,
  BookOpen,
  Link2,
  ShieldAlert,
  ShieldCheck,
  BarChart3,
  FileText,
  Trash2,
  Plus,
  Pause,
  Play,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { getCanonicalBalances } from '../lib/balances';
import { LightweightEquityChart } from '../components/LightweightEquityChart';
import { TradeTypeCell } from '../components/DerivBadges';
import type { JournalEntry, SmartAlert } from '../types';

// 1. Risk Management Centre (Calculator + Server Guardrails)
export const RiskCalculatorPage: React.FC = () => {
  const { user, accounts, accountMode, activeConnectedAccount, kesRate, showToast } = useApp();
  const modeCapital = getCanonicalBalances(user, accounts, accountMode, activeConnectedAccount).activeTradingBalance;
  const [capital, setCapital] = useState(String(modeCapital));
  const [riskPct, setRiskPct] = useState('2');
  const [martingale, setMartingale] = useState('2');

  useEffect(() => {
    setCapital(String(modeCapital));
  }, [modeCapital]);

  // Server Risk Guardrails state
  const [riskLoading, setRiskLoading] = useState(true);
  const [savingRisk, setSavingRisk] = useState(false);
  const [riskPerTradePct, setRiskPerTradePct] = useState('2');
  const [dailyLossLimit, setDailyLossLimit] = useState('10');
  const [maxExposure, setMaxExposure] = useState('15');
  const [maxConsecLosses, setMaxConsecLosses] = useState('3');
  const [cooldownMins, setCooldownMins] = useState('30');
  const [enforceLimits, setEnforceLimits] = useState(true);
  const [telemetry, setTelemetry] = useState<{
    dailyPnlUsd: number;
    openExposureUsd: number;
    openPositionsCount: number;
    consecutiveLosses: number;
    cooldownActive: boolean;
  }>({
    dailyPnlUsd: 0,
    openExposureUsd: 0,
    openPositionsCount: 0,
    consecutiveLosses: 0,
    cooldownActive: false,
  });

  const loadRiskSettings = useCallback(async () => {
    setRiskLoading(true);
    try {
      const res = await apiFetch<{ settings: any; telemetry: any }>('/api/risk/settings');
      if (res.settings) {
        setRiskPerTradePct(String(res.settings.risk_per_trade_pct ?? 2));
        setDailyLossLimit(String(res.settings.daily_loss_limit_usd ?? 10));
        setMaxExposure(String(res.settings.max_exposure_usd ?? 15));
        setMaxConsecLosses(String(res.settings.max_consecutive_losses ?? 3));
        setCooldownMins(String(res.settings.cooldown_minutes ?? 30));
        setEnforceLimits(Boolean(res.settings.enforce_limits));
      }
      if (res.telemetry) {
        setTelemetry(res.telemetry);
      }
    } catch {
      // unauthenticated or unavailable
    } finally {
      setRiskLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRiskSettings();
  }, [loadRiskSettings]);

  const handleSaveGuardrails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRisk(true);
    try {
      await apiFetch('/api/risk/settings', {
        method: 'PUT',
        body: JSON.stringify({
          risk_per_trade_pct: Number(riskPerTradePct),
          daily_loss_limit_usd: Number(dailyLossLimit),
          max_exposure_usd: Number(maxExposure),
          max_consecutive_losses: Number(maxConsecLosses),
          cooldown_minutes: Number(cooldownMins),
          enforce_limits: enforceLimits,
        }),
      });
      await loadRiskSettings();
      showToast('Server risk guardrails updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save risk settings', 'error');
    } finally {
      setSavingRisk(false);
    }
  };

  const handleResetCooldown = async () => {
    try {
      await apiFetch('/api/risk/reset-cooldown', { method: 'POST' });
      await loadRiskSettings();
      showToast('Consecutive-loss cooldown cleared', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reset cooldown', 'error');
    }
  };

  const cap = Number(capital) || 0;
  const pct = Number(riskPct) || 2;
  const baseStake = Number(((cap * pct) / 100).toFixed(2));
  const tpTarget = Number((baseStake * 3).toFixed(2));
  const slLimit = Number((baseStake * 1).toFixed(2));

  const dailyLossUsed = Math.max(0, -telemetry.dailyPnlUsd);
  const dailyLossCap = Math.max(1, Number(dailyLossLimit) || 10);
  const dailyLossPct = Math.min(100, (dailyLossUsed / dailyLossCap) * 100);
  const expCap = Math.max(1, Number(maxExposure) || 15);
  const expPct = Math.min(100, (telemetry.openExposureUsd / expCap) * 100);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Calculator className="w-6 h-6 text-[#FF444F]" /> Risk Management Centre & Guardrails
        </h1>
        <p className="text-xs text-slate-500">
          Position sizing calculator paired with server-enforced daily loss limits, exposure caps, and consecutive-loss cooldowns.
        </p>
      </div>

      {/* Live Guardrail Telemetry */}
      {telemetry.cooldownActive && (
        <div className="p-4 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#FF444F]">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            Consecutive-Loss Cooldown Active ({telemetry.consecutiveLosses} recent losses). New trades are paused while guardrails are enforced.
          </div>
          <button
            type="button"
            onClick={handleResetCooldown}
            className="px-4 py-1.5 rounded-xl bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
          >
            Reset Cooldown
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">Daily Realized P/L vs Loss Limit</span>
            <span className="font-mono tabular-nums font-bold">
              {telemetry.dailyPnlUsd >= 0 ? '+' : ''}${telemetry.dailyPnlUsd.toFixed(2)} / -${dailyLossCap.toFixed(2)}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-[#111319] overflow-hidden">
            <div
              className={`h-full ${dailyLossPct >= 80 ? 'bg-[#FF444F]' : 'bg-[#00A878]'}`}
              style={{ width: `${dailyLossPct}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 font-mono tabular-nums">
            Daily drawdown budget used: {dailyLossPct.toFixed(1)}% · Consecutive losses: {telemetry.consecutiveLosses}
          </p>
        </div>

        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">Open Position Exposure vs Cap</span>
            <span className="font-mono tabular-nums font-bold">
              ${telemetry.openExposureUsd.toFixed(2)} / ${expCap.toFixed(2)}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-[#111319] overflow-hidden">
            <div
              className={`h-full ${expPct >= 85 ? 'bg-amber-500' : 'bg-[#1958B7]'}`}
              style={{ width: `${expPct}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 font-mono tabular-nums">
            {telemetry.openPositionsCount} open positions · {expPct.toFixed(1)}% of max exposure utilized
          </p>
        </div>
      </div>

      {/* Server Guardrails Form */}
      <form
        onSubmit={handleSaveGuardrails}
        className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#00A878]" /> Server-Enforced Execution Guardrails
          </h2>
          <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={enforceLimits}
              onChange={(e) => setEnforceLimits(e.target.checked)}
              className="accent-[#00A878]"
            />
            Enforce Risk Limits on All Orders
          </label>
        </div>

        {riskLoading ? (
          <p className="text-xs text-slate-500">Loading server risk configuration...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Max Risk / Trade (%)</label>
              <input
                type="number"
                step="0.1"
                value={riskPerTradePct}
                onChange={(e) => setRiskPerTradePct(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Daily Loss Limit ($)</label>
              <input
                type="number"
                step="5"
                value={dailyLossLimit}
                onChange={(e) => setDailyLossLimit(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Max Open Exposure ($)</label>
              <input
                type="number"
                step="10"
                value={maxExposure}
                onChange={(e) => setMaxExposure(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Max Consec. Losses</label>
              <input
                type="number"
                value={maxConsecLosses}
                onChange={(e) => setMaxConsecLosses(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Cooldown (mins)</label>
              <input
                type="number"
                value={cooldownMins}
                onChange={(e) => setCooldownMins(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingRisk}
            className="px-5 py-2 rounded-xl bg-[#151820] dark:bg-[#FF444F] text-white text-xs font-bold cursor-pointer disabled:opacity-60"
          >
            {savingRisk ? 'Saving...' : 'Save Server Guardrails'}
          </button>
        </div>
      </form>

      {/* Preserved Position & Martingale Calculator */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Account Capital (USD)</label>
          <input
            type="number"
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-sm font-bold"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Risk per Trade (%)</label>
          <input
            type="number"
            step="0.5"
            value={riskPct}
            onChange={(e) => setRiskPct(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-sm font-bold"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Martingale Factor</label>
          <input
            type="number"
            step="0.1"
            value={martingale}
            onChange={(e) => setMartingale(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-sm font-bold"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#151820] text-white border border-[#2A2F3D]">
          <p className="text-xs text-slate-400">Recommended Base Stake ({pct}%)</p>
          <p className="font-mono tabular-nums text-2xl font-bold mt-1">${baseStake.toFixed(2)} USD</p>
          <p className="font-mono tabular-nums text-xs text-slate-400 mt-1">≈ KSh {(baseStake * kesRate).toFixed(0)}</p>
        </div>
        <div className="p-5 rounded-2xl bg-[#00A878]/10 border border-[#00A878]/30">
          <p className="text-xs font-semibold text-[#00A878]">Session Take Profit (5x)</p>
          <p className="font-mono tabular-nums text-2xl font-bold mt-1 text-[#00A878]">+${tpTarget.toFixed(2)} USD</p>
          <p className="font-mono tabular-nums text-xs text-slate-500 mt-1">≈ KSh {(tpTarget * kesRate).toFixed(0)}</p>
        </div>
        <div className="p-5 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30">
          <p className="text-xs font-semibold text-[#FF444F]">Session Stop Loss (15x)</p>
          <p className="font-mono tabular-nums text-2xl font-bold mt-1 text-[#FF444F]">-${slLimit.toFixed(2)} USD</p>
          <p className="font-mono tabular-nums text-xs text-slate-500 mt-1">≈ KSh {(slLimit * kesRate).toFixed(0)}</p>
        </div>
      </div>
    </div>
  );
};

// 2. Copy Trading & Linked Deriv Accounts (Strictly scoped to current signed-in user)
export const CopyTradingPage: React.FC = () => {
  const { accounts, refreshAccounts, launchDerivOAuth, showToast, formatMoney } = useApp();
  const [busyId, setBusyId] = useState<number | null>(null);

  const realAccounts = accounts.filter((a) => !a.is_virtual);
  const demoAccounts = accounts.filter((a) => Boolean(a.is_virtual));

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

  const renderGroup = (title: string, badgeClass: string, list: typeof accounts) => (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-sm font-bold">{title}</h2>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}`}>{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div className="p-4 rounded-2xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-xs text-slate-500">
          No {title.toLowerCase()} linked to your profile.
        </div>
      ) : (
        list.map((acc) => (
          <div
            key={acc.id}
            className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums font-bold text-sm">{acc.deriv_account_id}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    acc.is_virtual ? 'bg-[#1958B7]/10 text-[#1958B7]' : 'bg-[#FF444F]/15 text-[#FF444F]'
                  }`}
                >
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
              <span className="font-mono tabular-nums text-base font-bold">{formatMoney(acc.balance)}</span>
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
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Copy className="w-6 h-6 text-[#FF444F]" /> Your Connected Deriv Accounts
          </h1>
          <p className="text-xs text-slate-500">
            Strictly scoped to your personal login — Real &amp; Demo accounts stay completely separate.
          </p>
        </div>

        <button
          type="button"
          onClick={() => launchDerivOAuth('login')}
          className="px-5 py-2.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
        >
          <Link2 className="w-4 h-4" /> Link Deriv Account via OAuth2
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-center">
          <p className="text-sm text-slate-500 mb-4">No external Deriv accounts connected to your profile yet.</p>
          <button
            type="button"
            onClick={() => launchDerivOAuth('login')}
            className="px-6 py-2.5 rounded-full bg-[#151820] dark:bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
          >
            Connect with Deriv OAuth2
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {renderGroup('Real Accounts', 'bg-[#FF444F]/15 text-[#FF444F]', realAccounts)}
          {renderGroup('Demo Accounts', 'bg-[#1958B7]/15 text-[#1958B7]', demoAccounts)}
        </div>
      )}
    </div>
  );
};

// 3. Reports, Performance Analytics Split, Trading Journal & Smart Alerts
export const ReportsPage: React.FC = () => {
  const { orders, accounts, instruments, selectedSymbol, showToast, theme, accountMode } = useApp();
  const [subTab, setSubTab] = useState<'performance' | 'journal' | 'alerts' | 'ledger'>('performance');
  const [selectedAccId, setSelectedAccId] = useState<string>(accounts[0]?.id ? String(accounts[0].id) : '');
  const [statementRows, setStatementRows] = useState<any[]>([]);

  // Performance Analytics state
  const [perf, setPerf] = useState<any>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  // Trading Journal state
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [jOrderId, setJOrderId] = useState('');
  const [jSymbol, setJSymbol] = useState(selectedSymbol || '1HZ100V');
  const [jSide, setJSide] = useState('BUY');
  const [jStrategy, setJStrategy] = useState('manual');
  const [jTimeframe, setJTimeframe] = useState('15m');
  const [jRationale, setJRationale] = useState('');
  const [jEmotions, setJEmotions] = useState('Calm & Objective');
  const [jDiscipline, setJDiscipline] = useState('8');
  const [jLessons, setJLessons] = useState('');
  const [jSubmitting, setJSubmitting] = useState(false);

  // Smart Alerts state
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [aSymbol, setASymbol] = useState(selectedSymbol || '1HZ100V');
  const [aType, setAType] = useState<'price_above' | 'price_below'>('price_above');
  const [aPrice, setAPrice] = useState('');
  const [aMessage, setAMessage] = useState('');

  const loadAnalyticsAndWorkspace = useCallback(async () => {
    setPerfLoading(true);
    try {
      const [pRes, jRes, aRes] = await Promise.all([
        apiFetch('/api/analytics/performance').catch(() => null),
        apiFetch<{ entries: JournalEntry[] }>('/api/journal').catch(() => ({ entries: [] })),
        apiFetch<{ alerts: SmartAlert[] }>('/api/alerts').catch(() => ({ alerts: [] })),
      ]);
      if (pRes) setPerf(pRes);
      setJournalEntries(jRes.entries || []);
      setAlerts(aRes.alerts || []);
    } finally {
      setPerfLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalyticsAndWorkspace();
  }, [loadAnalyticsAndWorkspace]);

  useEffect(() => {
    if (!selectedAccId) return;
    apiFetch<{ transactions: any[] }>(`/api/deriv/statement/${selectedAccId}`)
      .then((res) => setStatementRows(res.transactions || []))
      .catch(() => {});
  }, [selectedAccId]);

  const exportCsv = () => {
    const header = 'ID,Symbol,Side,Mode,AccountMode,Strategy,Stake,Entry,Exit,PnL,Status,OpenedAt\n';
    const rows = orders
      .map(
        (o) =>
          `${o.id},${o.symbol},${o.side},${o.execution_mode},${o.account_mode || 'demo'},${o.strategy_key || ''},${o.stake},${o.entry_price},${o.exit_price ?? ''},${o.pnl},${o.status},${o.opened_at}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deriv_reports_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Orders CSV exported', 'success');
  };

  const handleCreateJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    setJSubmitting(true);
    try {
      await apiFetch('/api/journal', {
        method: 'POST',
        body: JSON.stringify({
          order_id: jOrderId ? Number(jOrderId) : null,
          symbol: jSymbol,
          side: jSide,
          strategy_key: jStrategy,
          timeframe: jTimeframe,
          rationale: jRationale,
          emotions: jEmotions,
          discipline_score: Number(jDiscipline),
          lessons: jLessons,
        }),
      });
      setJRationale('');
      setJLessons('');
      await loadAnalyticsAndWorkspace();
      showToast('Journal entry logged', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to log journal entry', 'error');
    } finally {
      setJSubmitting(false);
    }
  };

  const handleDeleteJournal = async (id: number) => {
    try {
      await apiFetch(`/api/journal/${id}`, { method: 'DELETE' });
      setJournalEntries((prev) => prev.filter((e) => e.id !== id));
      showToast('Journal entry deleted', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aPrice) return;
    try {
      await apiFetch('/api/alerts', {
        method: 'POST',
        body: JSON.stringify({
          symbol: aSymbol,
          alertType: aType,
          condition: { targetPrice: Number(aPrice) },
          message: aMessage.trim() || `${aSymbol} ${aType === 'price_above' ? 'above' : 'below'} ${aPrice}`,
        }),
      });
      setAPrice('');
      setAMessage('');
      await loadAnalyticsAndWorkspace();
      showToast(`Smart alert created for ${aSymbol}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create alert', 'error');
    }
  };

  const handleToggleAlert = async (al: SmartAlert) => {
    const nextStatus = al.status === 'active' ? 'paused' : 'active';
    try {
      await apiFetch(`/api/alerts/${al.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadAnalyticsAndWorkspace();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const handleDeleteAlert = async (id: number) => {
    try {
      await apiFetch(`/api/alerts/${id}`, { method: 'DELETE' });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#FF444F]" /> Performance Analytics, Journal & Alerts
          </h1>
          <p className="text-xs text-slate-500">
            Real vs Demo performance attribution, trade psychology journal, price alerts, and Deriv statement export.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
            className="px-4 py-2 rounded-xl bg-[#151820] dark:bg-[#FF444F] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {([
          { id: 'performance', label: 'Performance Split (Real vs Demo)' },
          { id: 'journal', label: `Trading Journal (${journalEntries.length})` },
          { id: 'alerts', label: `Smart Alerts (${alerts.length})` },
          { id: 'ledger', label: `Order Ledger (${orders.length})` },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap ${
              subTab === t.id
                ? 'bg-[#FF444F] text-white'
                : 'bg-[#F4F5F7] dark:bg-[#181C25] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#2A2F3D]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: PERFORMANCE SPLIT */}
      {subTab === 'performance' && (
        <div className="space-y-6">
          {perfLoading && !perf ? (
            <div className="p-8 text-center text-xs text-slate-500">Calculating Real vs Demo performance attribution...</div>
          ) : !perf ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs text-slate-500">
              Sign in or place trades to inspect Real vs Demo performance analytics.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { title: 'Real Money Cohort', stats: perf.real, accent: 'text-[#FF444F]' },
                  { title: 'Demo / Virtual Cohort', stats: perf.demo, accent: 'text-[#1958B7]' },
                  { title: 'Combined Portfolio', stats: perf.combined, accent: 'text-[#0E1117] dark:text-white' },
                ].map((c) => (
                  <div
                    key={c.title}
                    className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className={`font-display text-sm font-bold ${c.accent}`}>{c.title}</h2>
                      <span className="font-mono tabular-nums text-xs text-slate-500">
                        {c.stats.totalTrades} closed · {c.stats.openTrades} open
                      </span>
                    </div>
                    <p
                      className={`font-mono tabular-nums text-2xl font-bold ${
                        c.stats.netPnlUsd >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                      }`}
                    >
                      {c.stats.netPnlUsd >= 0 ? '+' : ''}${Number(c.stats.netPnlUsd).toFixed(2)}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-[#2A2F3D] font-mono tabular-nums">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Win Rate</span>
                        <strong>{c.stats.winRatePct}%</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Profit Factor</span>
                        <strong>{c.stats.profitFactor}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Max Drawdown</span>
                        <strong className="text-[#FF444F]">-${c.stats.maxDrawdownUsd}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Avg Hold</span>
                        <strong>{c.stats.avgHoldMinutes}m</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Lightweight Charts Cumulative Equity / P/L Progress */}
              <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-bold">
                    Cumulative Equity Progress ({accountMode === 'real' ? 'Real Account' : 'Demo Workspace'})
                  </h2>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    TradingView Lightweight Charts
                  </span>
                </div>
                <LightweightEquityChart orders={orders} theme={theme} accountMode={accountMode} />
              </div>

              {/* Daily P/L SVG Bar Chart */}
              {Array.isArray(perf.dailySeries) && perf.dailySeries.length > 0 && (
                <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-3">
                  <h2 className="font-display text-sm font-bold">Daily Realized P/L Distribution (Last 30 Active Days)</h2>
                  <div className="flex items-end gap-1.5 h-32 pt-4">
                    {(() => {
                      const maxAbs = Math.max(1, ...perf.dailySeries.map((d: any) => Math.abs(Number(d.pnl || 0))));
                      return perf.dailySeries.map((d: any) => {
                        const val = Number(d.pnl || 0);
                        const hPct = Math.max(8, (Math.abs(val) / maxAbs) * 100);
                        return (
                          <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group" title={`${d.date}: $${val.toFixed(2)} (${d.trades} trades)`}>
                            <div
                              className={`w-full rounded-t ${val >= 0 ? 'bg-[#00A878]' : 'bg-[#FF444F]'}`}
                              style={{ height: `${hPct}%` }}
                            />
                            <span className="text-[9px] font-mono tabular-nums text-slate-400 mt-1 hidden sm:block">
                              {d.date.slice(5)}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Breakdown by Symbol & Strategy */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5">
                  <h3 className="font-display text-sm font-bold mb-3">Performance by Symbol</h3>
                  {(perf.bySymbol || []).length === 0 ? (
                    <p className="text-xs text-slate-500">No closed trades yet.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                          <th className="text-left py-2">Symbol</th>
                          <th className="text-right py-2">Trades / Wins</th>
                          <th className="text-right py-2">Net P/L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                        {(perf.bySymbol || []).map((s: any) => (
                          <tr key={s.symbol}>
                            <td className="py-2 font-mono tabular-nums font-bold">{s.symbol}</td>
                            <td className="py-2 text-right font-mono tabular-nums">
                              {s.trades} ({s.wins}W)
                            </td>
                            <td className={`py-2 text-right font-mono tabular-nums font-bold ${s.netPnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                              {s.netPnl >= 0 ? '+' : ''}${Number(s.netPnl).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5">
                  <h3 className="font-display text-sm font-bold mb-3">Performance by Strategy / Source</h3>
                  {(perf.byStrategy || []).length === 0 ? (
                    <p className="text-xs text-slate-500">No closed trades yet.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                          <th className="text-left py-2">Strategy</th>
                          <th className="text-right py-2">Trades / Wins</th>
                          <th className="text-right py-2">Net P/L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                        {(perf.byStrategy || []).map((s: any) => (
                          <tr key={s.strategy}>
                            <td className="py-2 font-semibold">{s.strategy}</td>
                            <td className="py-2 text-right font-mono tabular-nums">
                              {s.trades} ({s.wins}W)
                            </td>
                            <td className={`py-2 text-right font-mono tabular-nums font-bold ${s.netPnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                              {s.netPnl >= 0 ? '+' : ''}${Number(s.netPnl).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: TRADING JOURNAL */}
      {subTab === 'journal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreateJournal}
            className="lg:col-span-5 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-3"
          >
            <h2 className="font-display text-base font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#FF444F]" /> Log Trade Journal Entry
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Symbol</label>
                <select
                  value={jSymbol}
                  onChange={(e) => setJSymbol(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs font-semibold"
                >
                  {instruments.map((i) => (
                    <option key={i.symbol} value={i.symbol}>
                      {i.symbol}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Direction</label>
                <select
                  value={jSide}
                  onChange={(e) => setJSide(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs font-semibold"
                >
                  <option value="BUY">BUY / CALL</option>
                  <option value="SELL">SELL / PUT</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Link Order (optional)</label>
                <select
                  value={jOrderId}
                  onChange={(e) => setJOrderId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs font-mono tabular-nums"
                >
                  <option value="">Standalone Note</option>
                  {orders.slice(0, 30).map((o) => (
                    <option key={o.id} value={o.id}>
                      #{o.id} {o.symbol} ({o.pnl >= 0 ? '+' : ''}${Number(o.pnl).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Timeframe / Strategy</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={jTimeframe}
                    onChange={(e) => setJTimeframe(e.target.value)}
                    placeholder="15m"
                    className="w-16 px-2 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={jStrategy}
                    onChange={(e) => setJStrategy(e.target.value)}
                    placeholder="SMC / EMA"
                    className="flex-1 px-2 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Setup Rationale & Entry Confluence</label>
              <textarea
                rows={2}
                required
                value={jRationale}
                onChange={(e) => setJRationale(e.target.value)}
                placeholder="e.g., Discount SSL sweep + bullish CHoCH on 15m..."
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Execution Mindset</label>
                <select
                  value={jEmotions}
                  onChange={(e) => setJEmotions(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs"
                >
                  <option value="Calm & Objective">Calm & Objective</option>
                  <option value="Disciplined Execution">Disciplined Execution</option>
                  <option value="FOMO / Rushed">FOMO / Rushed</option>
                  <option value="Fearful / Hesitant">Fearful / Hesitant</option>
                  <option value="Revenge Impulse">Revenge Impulse</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  Discipline Score: <strong className="font-mono tabular-nums">{jDiscipline}/10</strong>
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={jDiscipline}
                  onChange={(e) => setJDiscipline(e.target.value)}
                  className="w-full mt-2 accent-[#FF444F]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Lessons & Rule Review</label>
              <textarea
                rows={2}
                value={jLessons}
                onChange={(e) => setJLessons(e.target.value)}
                placeholder="What worked or what to refine next session..."
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={jSubmitting}
              className="w-full py-2.5 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold cursor-pointer"
            >
              {jSubmitting ? 'Saving Entry...' : 'Save Journal Entry'}
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {journalEntries.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-center text-xs text-slate-500">
                No journal entries logged yet. Record your setups and discipline score to track execution edge.
              </div>
            ) : (
              journalEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`font-bold ${entry.side === 'BUY' ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                        {entry.side}
                      </span>
                      <span className="font-mono tabular-nums font-bold">{entry.symbol}</span>
                      <span className="text-slate-400">
                        · {entry.timeframe} · {entry.strategy_key || 'manual'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular-nums text-xs font-semibold">
                        Discipline {entry.discipline_score}/10
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteJournal(entry.id)}
                        className="text-slate-400 hover:text-[#FF444F] cursor-pointer"
                        title="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-200">{entry.rationale}</p>
                  {entry.lessons && (
                    <p className="text-[11px] text-slate-500">Lesson: {entry.lessons}</p>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-[#2A2F3D]">
                    <span>Mindset: {entry.emotions}</span>
                    <span>
                      {entry.order_id ? `Order #${entry.order_id} (${Number(entry.order_pnl || 0).toFixed(2)} USD) · ` : ''}
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SMART ALERTS */}
      {subTab === 'alerts' && (
        <div className="space-y-4">
          <form
            onSubmit={handleCreateAlert}
            className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 grid grid-cols-1 sm:grid-cols-5 gap-3"
          >
            <select
              value={aSymbol}
              onChange={(e) => setASymbol(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs font-semibold"
            >
              {instruments.map((i) => (
                <option key={i.symbol} value={i.symbol}>
                  {i.display_name}
                </option>
              ))}
            </select>
            <select
              value={aType}
              onChange={(e) => setAType(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs font-semibold"
            >
              <option value="price_above">Price Above (&ge;)</option>
              <option value="price_below">Price Below (&le;)</option>
            </select>
            <input
              type="number"
              step="any"
              required
              placeholder="Target Price"
              value={aPrice}
              onChange={(e) => setAPrice(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
            />
            <input
              type="text"
              placeholder="Alert Note (optional)"
              value={aMessage}
              onChange={(e) => setAMessage(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#FF444F] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Alert
            </button>
          </form>

          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
            {alerts.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">
                No smart price alerts configured yet. Alerts evaluate live Deriv ticks in real time.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                {alerts.map((al) => {
                  let cond: any = {};
                  try {
                    cond = JSON.parse(al.condition_json || '{}');
                  } catch {
                    cond = {};
                  }
                  return (
                    <div key={al.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="font-mono tabular-nums font-bold">{al.symbol}</span> ·{' '}
                        <span className="capitalize">{al.alert_type.replace('_', ' ')}</span>{' '}
                        <strong className="font-mono tabular-nums">{cond.targetPrice}</strong>
                        <p className="text-[11px] text-slate-500">{al.message}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold capitalize ${
                            al.status === 'active'
                              ? 'text-[#00A878]'
                              : al.status === 'triggered'
                                ? 'text-amber-500'
                                : 'text-slate-400'
                          }`}
                        >
                          {al.status}
                        </span>
                        {al.status !== 'triggered' && (
                          <button
                            type="button"
                            onClick={() => handleToggleAlert(al)}
                            className="p-1.5 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] cursor-pointer"
                            title={al.status === 'active' ? 'Pause' : 'Resume'}
                          >
                            {al.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteAlert(al.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#FF444F] cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ORDER LEDGER & DERIV STATEMENT (PRESERVED) */}
      {subTab === 'ledger' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                    <th className="text-left px-4 py-3">ID</th>
                    <th className="text-left px-4 py-3">Type</th>
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
                      <td className="px-4 py-3 font-mono tabular-nums">#{o.id}</td>
                      <td className="px-4 py-3">
                        <TradeTypeCell
                          symbol={o.symbol}
                          contractType={o.contract_type}
                          side={o.side}
                          barrier={o.barrier}
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold">{o.symbol}</td>
                      <td className="px-4 py-3">
                        {o.side} <span className="text-slate-400">({o.strategy_key || o.source})</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">${o.stake}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {o.entry_price} → {o.exit_price ?? o.current_price}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono tabular-nums font-bold ${
                          o.pnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                        }`}
                      >
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
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-[#2A2F3D] last:border-0"
                  >
                    <span>{s.shortcode || s.symbol || s.transaction_id}</span>
                    <span className="font-mono tabular-nums font-bold">{s.amount ?? s.pnl ?? 0} USD</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 4. Notifications (Matches Screenshot 105151)
function formatRelativeNotifTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'Recent';
  const diffMin = Math.max(1, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export const NotificationsPage: React.FC = () => {
  const { notifications, markNotificationRead, setActiveTab } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-[85vh] bg-[#0E0F13] text-white">
      <div className="max-w-2xl mx-auto px-5 pt-4 pb-10">
        <div className="flex items-center justify-between mb-5 relative">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            aria-label="Back to Home"
            className="w-9 h-9 rounded-full bg-[#242833] hover:bg-[#2E3342] flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-[18px] h-[18px] text-white" />
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Notification actions"
            className="w-9 h-9 rounded-full bg-[#242833] hover:bg-[#2E3342] flex items-center justify-center cursor-pointer"
          >
            <MoreVertical className="w-[18px] h-[18px] text-white" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-11 z-20 bg-[#181B22] border border-white/10 rounded-2xl shadow-xl py-1.5 w-44">
              <button
                type="button"
                onClick={() => {
                  markNotificationRead('all');
                  setMenuOpen(false);
                }}
                className="w-full px-4 py-2.5 text-left text-xs font-semibold text-white hover:bg-white/5 flex items-center gap-2 cursor-pointer"
              >
                <CheckCheck className="w-4 h-4 text-[#17B978]" />
                <span>Mark all as read</span>
              </button>
            </div>
          )}
        </div>

        <h1 className="font-display text-[22px] font-bold tracking-tight text-white mb-4">Notifications</h1>

        {notifications.length === 0 ? (
          <p className="text-sm text-[#9BA3B0] text-center py-14">No notifications yet.</p>
        ) : (
          <div className="divide-y divide-white/[0.08]">
            {notifications.map((n) => {
              const titleLower = String(n.title || '').toLowerCase();
              const isSuccess = titleLower.includes('successful') || titleLower.includes('completed') || titleLower.includes('settled');
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.is_read && markNotificationRead(n.id)}
                  className="w-full py-4 flex items-start gap-3.5 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <div className="relative shrink-0 mt-0.5">
                    <span
                      className={`w-9 h-9 rounded-full flex items-center justify-center border ${
                        isSuccess
                          ? 'bg-[#0E241C] border-[#17B978]/50 text-[#17B978]'
                          : 'bg-[#121D2D] border-[#2563EB]/55 text-[#3B82F6]'
                      }`}
                    >
                      {isSuccess ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <span className="w-5 h-5 rounded-full border border-[#3B82F6] flex items-center justify-center text-[11px] font-bold leading-none">
                          i
                        </span>
                      )}
                    </span>
                    {!n.is_read && (
                      <span className="absolute -top-0.5 right-0 w-2 h-2 rounded-full bg-[#FF444F] ring-2 ring-[#0E0F13]" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-white leading-snug">{n.title}</p>
                    <p className="text-[13px] text-[#C7CDD6] mt-1 leading-relaxed whitespace-pre-line">{n.message}</p>
                    <p className="text-[12px] text-[#8E95A2] mt-1.5">{formatRelativeNotifTime(n.created_at)}</p>
                  </div>
                </button>
              );
            })}
          </div>
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
      title: 'MT5 CFDs, SMC Zones & USD Risk Guardrails',
      desc: 'How to size 0.01–1.00 lots, enable Smart Money Concepts overlays, and enforce daily loss limits.',
      action: () => setActiveTab('mt5-tv'),
      cta: 'Open MT5 Terminal',
    },
    {
      title: 'Causal Strategy Lab & Real-Candle Backtesting',
      desc: 'Test 10 institutional rule sets across In-Sample (70%) and Out-of-Sample (30%) Deriv OHLC data with spread friction.',
      action: () => setActiveTab('trading-bots'),
      cta: 'Open Strategy Lab',
    },
    {
      title: 'Market Radar, Buy Low/Sell High & Dcircles',
      desc: 'Filter volatile Deriv markets with ADX/RSI/SMC bias and execute guarded setups or digit contracts.',
      action: () => setActiveTab('market-analyser'),
      cta: 'Open Market Intelligence',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-[#FF444F]" /> DERIV Learning Hub
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
