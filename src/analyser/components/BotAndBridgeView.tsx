import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Pause, Play, Square, ShieldAlert, KeyRound, Trash2, Copy, Check } from 'lucide-react';
import { apiFetch, sanitizeUiError } from '../../lib/api';
import { useAnalyser } from '../AnalyserContext';

interface BridgeConnection {
  id: number;
  bridge_name: string;
  account_login: string;
  server_name: string;
  broker_name: string;
  status: string;
  last_heartbeat_at: string | null;
  account_balance: number;
  account_equity: number;
}

export const BotAndBridgeView: React.FC = () => {
  const { notify } = useAnalyser();
  const [telemetry, setTelemetry] = useState<any>(null);
  const [connections, setConnections] = useState<BridgeConnection[]>([]);
  const [bridgeOrders, setBridgeOrders] = useState<any[]>([]);
  const [bridgeName, setBridgeName] = useState('Primary MT5 Terminal');
  const [accountLogin, setAccountLogin] = useState('');
  const [serverName, setServerName] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshAll = useCallback(async () => {
    try {
      const [botRes, bridgeRes] = await Promise.all([
        apiFetch<{ telemetry: any }>('/api/bots/status'),
        apiFetch<{ connections: BridgeConnection[]; orders: any[] }>('/api/mt5-bridge/connections'),
      ]);
      setTelemetry(botRes.telemetry);
      setConnections(bridgeRes.connections || []);
      setBridgeOrders(bridgeRes.orders || []);
    } catch {
      // ignore if guest
    }
  }, []);

  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 4000);
    return () => clearInterval(t);
  }, [refreshAll]);

  const botAction = async (endpoint: string, msg: string) => {
    try {
      await apiFetch(endpoint, { method: 'POST' });
      await refreshAll();
      notify(msg, 'info');
    } catch (err) {
      notify(sanitizeUiError(err, 'Bot control failed'), 'error');
    }
  };

  const handleCreateBridge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ connection: BridgeConnection; bridgeApiKey: string }>('/api/mt5-bridge/connections', {
        method: 'POST',
        body: JSON.stringify({
          bridgeName,
          accountLogin,
          serverName,
          brokerName,
          symbols: ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'],
        }),
      });
      setNewApiKey(res.bridgeApiKey);
      setAccountLogin('');
      setServerName('');
      setBrokerName('');
      await refreshAll();
      notify('MT5 EA Bridge created. Copy your one-time Bridge API Key now.', 'success');
    } catch (err) {
      notify(sanitizeUiError(err, 'Failed to create MT5 bridge'), 'error');
    }
  };

  const handleDeleteBridge = async (id: number) => {
    try {
      await apiFetch(`/api/mt5-bridge/connections/${id}`, { method: 'DELETE' });
      await refreshAll();
      notify('Bridge connection revoked', 'info');
    } catch (err) {
      notify(sanitizeUiError(err, 'Failed to revoke bridge'), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Persistent Bot Controls & MT5 EA Bridge</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Control background execution independently of the main trading window and provision API keys for your external MetaTrader 5 Expert Advisor.
        </p>
      </div>

      {/* Persistent Worker Controls */}
      <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#FF444F]" />
            <span className="font-display text-base font-bold">
              {telemetry?.running ? telemetry.strategyName : 'No Active Background Bot'}
            </span>
          </div>
          <p className="font-mono tabular-nums text-slate-500">
            Status: <strong>{telemetry?.status || 'idle'}</strong> · Symbol: {telemetry?.symbol || '—'} · P/L: $
            {Number(telemetry?.realizedPnl || 0).toFixed(2)} · Trades: {telemetry?.tradesPlaced || 0}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {telemetry?.running && (
            <>
              <button
                type="button"
                onClick={() =>
                  botAction(telemetry.paused ? '/api/bots/resume' : '/api/bots/pause', telemetry.paused ? 'Bot resumed' : 'Bot paused')
                }
                className="px-3.5 py-2 rounded-xl bg-amber-500 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {telemetry.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                {telemetry.paused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={() => botAction('/api/bots/stop', 'Bot stopped')}
                className="px-3.5 py-2 rounded-xl bg-[#151820] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => botAction('/api/bots/kill-all', 'Emergency kill switch executed')}
            className="px-4 py-2 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" /> Kill All Bots
          </button>
        </div>
      </div>

      {/* Create MT5 EA Bridge */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <form
          onSubmit={handleCreateBridge}
          className="lg:col-span-5 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-3 text-xs"
        >
          <h2 className="font-display text-base font-bold flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-[#1958B7]" /> Generate MT5 EA Bridge Key
          </h2>
          <input
            type="text"
            required
            value={bridgeName}
            onChange={(e) => setBridgeName(e.target.value)}
            placeholder="Bridge Name (e.g. VPS Gold EA)"
            className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] outline-none"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="text"
              value={accountLogin}
              onChange={(e) => setAccountLogin(e.target.value)}
              placeholder="MT5 Login (optional)"
              className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] outline-none"
            />
            <input
              type="text"
              value={brokerName}
              onChange={(e) => setBrokerName(e.target.value)}
              placeholder="Broker Name"
              className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] outline-none"
            />
          </div>
          <input
            type="text"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            placeholder="Trade Server (e.g. Deriv-Server)"
            className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] outline-none"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[#1958B7] hover:bg-[#144694] text-white font-bold cursor-pointer"
          >
            Create Bridge Connection
          </button>

          {newApiKey && (
            <div className="p-3 rounded-xl bg-[#00A878]/10 border border-[#00A878]/30 space-y-2">
              <p className="font-bold text-[#00A878]">One-Time x-bridge-key (Copy into MQL5 EA):</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-[11px] break-all">{newApiKey}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(newApiKey);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="p-1.5 rounded-lg bg-[#00A878] text-white cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Registered Bridges & Routed Queue */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-3 text-xs">
            <h2 className="font-display text-base font-bold">Registered MT5 Bridges ({connections.length})</h2>
            {connections.length === 0 ? (
              <p className="text-slate-500">
                No MT5 bridges registered yet. Unbridged XAUUSD and Forex orders operate in Signal-Only mode.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                {connections.map((c) => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{c.bridge_name}</p>
                      <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                        {c.broker_name || 'Pending broker'} · Login {c.account_login || '—'} ·{' '}
                        <span className={c.status === 'connected' ? 'text-[#00A878] font-bold' : 'text-amber-500 font-bold'}>
                          {c.status.toUpperCase()}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteBridge(c.id)}
                      className="p-1.5 text-slate-400 hover:text-[#FF444F] cursor-pointer"
                      aria-label="Delete bridge"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-3 text-xs">
            <h2 className="font-display text-base font-bold">Recent Signal-Only & Bridge Instructions ({bridgeOrders.length})</h2>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A2F3D]">
              {bridgeOrders.length === 0 ? (
                <p className="text-slate-400">No MT5 execution instructions routed yet.</p>
              ) : (
                bridgeOrders.slice(0, 15).map((o) => (
                  <div key={o.id} className="py-2 flex items-center justify-between gap-2 font-mono tabular-nums">
                    <span>
                      <strong>{o.symbol}</strong> {o.side} {o.volume_lots}L @ {o.requested_price}
                    </span>
                    <span className="text-slate-500">{o.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
