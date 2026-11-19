import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  DollarSign,
  Users,
  Link2,
  Bot,
  Activity,
  Wallet,
  Settings,
  Megaphone,
  FileText,
  LogOut,
  ArrowLeft,
  Menu,
  X,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Lock,
} from 'lucide-react';
import { TradeDerivLogo } from '../components/TradeDerivLogo';

type AdminTab =
  | 'overview'
  | 'commissions'
  | 'users'
  | 'accounts'
  | 'strategies'
  | 'orders'
  | 'cashier'
  | 'settings'
  | 'announcements'
  | 'logs'
  | 'security';

const ADMIN_TOKEN_KEY = 'tradederiv_admin_jwt';
let currentAdminReauthToken = '';

class AdminReauthRequiredError extends Error {
  code = 'REAUTH_REQUIRED';
  constructor(msg: string) {
    super(msg);
  }
}

async function adminFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (currentAdminReauthToken) headers['x-admin-reauth'] = currentAdminReauthToken;
  const resp = await fetch(path, { ...options, headers, credentials: 'include' });
  const data = await resp.json().catch(() => ({}));
  if (resp.status === 428 && data?.code === 'REAUTH_REQUIRED') {
    throw new AdminReauthRequiredError(data.error || 'Re-authentication required');
  }
  if (!resp.ok) throw new Error(data.error || `Error (${resp.status})`);
  return data as T;
}

export const AdminMISPage: React.FC<{ onReturnToSite: () => void }> = ({ onReturnToSite }) => {
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [bootstrapped, setBootstrapped] = useState<boolean>(true);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notice, setNotice] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // Auth forms
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('Platform Owner');
  const [authBusy, setAuthBusy] = useState(false);

  // Overview data
  const [overview, setOverview] = useState<any>(null);
  const [cashierLogs, setCashierLogs] = useState<any[]>([]);
  const [commData, setCommData] = useState<any>(null);
  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Commission config form
  const [derivAppId, setDerivAppId] = useState('');
  const [markupPct, setMarkupPct] = useState('2.0');
  const [affiliateLink, setAffiliateLink] = useState('');
  const [affiliateTier, setAffiliateTier] = useState('30');
  const [ownerAdminToken, setOwnerAdminToken] = useState('');

  // Settings forms
  const [appName, setAppName] = useState('TradeDeriv');
  const [supportEmail, setSupportEmail] = useState('support@tradederiv.app');
  const [kesRate, setKesRate] = useState('130');
  const [tickerText, setTickerText] = useState('');
  const [adminSlug, setAdminSlug] = useState('pf-ops-9482');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  // Create forms
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserBal, setNewUserBal] = useState('10000');

  const [newStratName, setNewStratName] = useState('');
  const [newStratSymbol, setNewStratSymbol] = useState('1HZ100V');
  const [newStratType, setNewStratType] = useState('DIGITOVER');
  const [newStratDesc, setNewStratDesc] = useState('');

  const [annTitle, setAnnTitle] = useState('');
  const [annMsg, setAnnMsg] = useState('');

  // Inline balance edit maps
  const [userBalances, setUserBalances] = useState<Record<number, string>>({});
  const [accountBalances, setAccountBalances] = useState<Record<number, string>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Re-authentication modal & Security Diagnostics state
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthBusy, setReauthBusy] = useState(false);
  const [pendingReauthAction, setPendingReauthAction] = useState<(() => Promise<void>) | null>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setNotice({ msg, type });
    setTimeout(() => setNotice(null), 4000);
  };

  useEffect(() => {
    adminFetch<{ bootstrapped: boolean }>('/api/admin/bootstrap-status')
      .then((res) => setBootstrapped(res.bootstrapped))
      .catch(() => {})
      .finally(() => setLoadingStatus(false));
  }, []);

  const loadAllAdminData = useCallback(async () => {
    if (!adminToken) return;
    try {
      const [ov, cash, comm] = await Promise.all([
        adminFetch('/api/admin/overview'),
        adminFetch('/api/admin/cashier-logs'),
        adminFetch(`/api/admin/commissions?date_from=${dateFrom}&date_to=${dateTo}`),
      ]);
      setOverview(ov);
      setCashierLogs(cash.transactions || []);
      setCommData(comm);

      const uMap: Record<number, string> = {};
      for (const u of ov.users || []) {
        uMap[u.id] = String(Number(u.virtual_workspace_balance ?? 0).toFixed(2));
      }
      setUserBalances(uMap);

      const aMap: Record<number, string> = {};
      for (const a of ov.connectedAccounts || []) {
        aMap[a.id] = String(Number(a.last_known_balance ?? a.balance ?? 0).toFixed(2));
      }
      setAccountBalances(aMap);

      setAppName(ov.branding?.appName || 'TradeDeriv');
      setSupportEmail(ov.branding?.supportEmail || 'support@tradederiv.app');
      setKesRate(String(ov.global?.kesRate || 130));
      setTickerText(ov.global?.tickerText || '');
      setAdminSlug(ov.global?.adminPrivateSlug || 'pf-ops-9482');

      setDerivAppId(comm.config?.derivAppId || '');
      setMarkupPct(String(comm.config?.markupPercentage ?? 2.0));
      setAffiliateLink(comm.config?.affiliateLink || '');
      setAffiliateTier(String(comm.config?.affiliateTierRate ?? 30));
    } catch (err) {
      if (err instanceof Error && err.message.includes('401')) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setAdminToken(null);
      }
    }
  }, [adminToken, dateFrom, dateTo]);

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  const handleBootstrapOrLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    try {
      const path = bootstrapped ? '/api/admin/login' : '/api/admin/bootstrap';
      const res = await adminFetch<{ token: string }>(path, {
        method: 'POST',
        body: JSON.stringify({ email: authEmail, password: authPassword, full_name: authName }),
      });
      localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
      setAdminToken(res.token);
      setBootstrapped(true);
      flash('Signed in to Owner MIS Console');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Authentication failed', 'err');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOutOwner = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    currentAdminReauthToken = '';
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken(null);
    setOverview(null);
    setDiagnostics(null);
  };

  const loadDiagnostics = useCallback(async () => {
    if (!adminToken) return;
    setDiagLoading(true);
    try {
      const diag = await adminFetch('/api/admin/diagnostics');
      setDiagnostics(diag);
    } catch {
      // ignore
    } finally {
      setDiagLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    if (tab === 'security') {
      loadDiagnostics();
    }
  }, [tab, loadDiagnostics]);

  const runWithReauth = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (err) {
      if (err instanceof AdminReauthRequiredError) {
        setPendingReauthAction(() => action);
        setReauthOpen(true);
        return;
      }
      flash(err instanceof Error ? err.message : 'Operation failed', 'err');
    }
  };

  const handleConfirmReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    setReauthBusy(true);
    try {
      const res = await adminFetch<{ reauthToken: string }>('/api/admin/reauth', {
        method: 'POST',
        body: JSON.stringify({ password: reauthPassword }),
      });
      currentAdminReauthToken = res.reauthToken;
      setReauthPassword('');
      setReauthOpen(false);
      const retry = pendingReauthAction;
      setPendingReauthAction(null);
      if (retry) {
        await retry();
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Re-authentication failed', 'err');
    } finally {
      setReauthBusy(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="min-h-screen bg-[#111319] text-white flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading MIS Operations Console...</p>
      </div>
    );
  }

  if (!adminToken) {
    return (
      <div className="min-h-screen bg-[#111319] text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#181C25] border border-[#2A2F3D] rounded-3xl p-7 space-y-6">
          <div className="flex items-center justify-between">
            <TradeDerivLogo variant="dark" size="sm" />
            <button
              type="button"
              onClick={onReturnToSite}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Trader Site
            </button>
          </div>

          <div>
            <h1 className="font-display text-xl font-bold">
              {bootstrapped ? 'Owner MIS Sign In' : 'First-Run Owner Bootstrap'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {bootstrapped
                ? 'Authorized platform administrators only.'
                : 'Initialize the primary TradeDeriv platform owner account.'}
            </p>
          </div>

          {notice && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold ${
                notice.type === 'err' ? 'bg-[#FF444F]/20 text-[#FF444F]' : 'bg-[#00A878]/20 text-[#00A878]'
              }`}
            >
              {notice.msg}
            </div>
          )}

          <form onSubmit={handleBootstrapOrLogin} className="space-y-4">
            {!bootstrapped && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Owner Name</label>
                <input
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Owner Email</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={authBusy}
              className="w-full py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-sm cursor-pointer"
            >
              {authBusy ? 'Authenticating...' : bootstrapped ? 'Sign In to MIS' : 'Create Owner Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<any> }> = [
    { id: 'overview', label: 'MIS Overview', icon: LayoutDashboard },
    { id: 'commissions', label: 'Commissions & Markup', icon: DollarSign },
    { id: 'users', label: 'Users CRUD', icon: Users },
    { id: 'accounts', label: 'Connected Deriv', icon: Link2 },
    { id: 'strategies', label: 'Bot Strategies', icon: Bot },
    { id: 'orders', label: 'Orders Oversight', icon: Activity },
    { id: 'cashier', label: 'Cashier Logs', icon: Wallet },
    { id: 'settings', label: 'Global Settings', icon: Settings },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'logs', label: 'Audit & Email Logs', icon: FileText },
    { id: 'security', label: 'Security & Diagnostics', icon: Shield },
  ];

  const kpis = overview?.kpis || {};

  return (
    <div className="min-h-screen bg-[#111319] text-white flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#151820] border-r border-[#2A2F3D] flex flex-col transform transition-transform lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-[#2A2F3D] flex items-center justify-between">
          <TradeDerivLogo variant="dark" size="sm" />
          <button type="button" onClick={() => setMobileMenuOpen(false)} className="lg:hidden p-1 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  tab === item.id ? 'bg-[#FF444F] text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#2A2F3D] space-y-2">
          <button
            type="button"
            onClick={onReturnToSite}
            className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Trader Site
          </button>
          <button
            type="button"
            onClick={handleSignOutOwner}
            className="w-full py-2.5 px-3 rounded-xl bg-[#FF444F]/10 hover:bg-[#FF444F]/20 text-[#FF444F] text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Sign Out Owner
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="px-5 py-3.5 bg-[#151820] border-b border-[#2A2F3D] flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 rounded-lg bg-white/5">
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="font-display text-base font-bold">
              {navItems.find((n) => n.id === tab)?.label}
            </h1>
          </div>
          <button
            type="button"
            onClick={loadAllAdminData}
            className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh MIS
          </button>
        </header>

        {notice && (
          <div className="mx-6 mt-4">
            <div
              className={`p-3 rounded-xl text-xs font-semibold ${
                notice.type === 'err' ? 'bg-[#FF444F]/20 text-[#FF444F]' : 'bg-[#00A878]/20 text-[#00A878]'
              }`}
            >
              {notice.msg}
            </div>
          </div>
        )}

        <main className="p-5 sm:p-6 space-y-6">
          {/* 1. Overview */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Traders', val: kpis.totalUsers ?? 0 },
                  { label: 'Real / Demo Accounts', val: `${kpis.realAccounts ?? 0} / ${kpis.demoAccounts ?? 0}` },
                  { label: 'Gross Order Volume', val: `$${Number(kpis.grossVolume || 0).toFixed(2)}` },
                  { label: 'Total Deposits / Withdrawals', val: `$${Number(kpis.totalDeposits || 0).toFixed(0)} / $${Number(kpis.totalWithdrawals || 0).toFixed(0)}` },
                ].map((c) => (
                  <div key={c.label} className="p-4 rounded-2xl bg-[#181C25] border border-[#2A2F3D]">
                    <p className="text-xs text-slate-400">{c.label}</p>
                    <p className="font-mono-num text-xl font-bold mt-1">{c.val}</p>
                  </div>
                ))}
              </div>

              <div className="p-5 rounded-2xl bg-[#181C25] border border-[#2A2F3D] space-y-2 text-xs">
                <h2 className="font-display text-sm font-bold mb-2">Deriv Cluster Diagnostics</h2>
                <p>WebSocket Status: <strong>{kpis.derivDiagnostics?.connected ? 'Connected' : 'Fallback Active'}</strong></p>
                <p>Endpoint: <span className="font-mono-num text-slate-400">{kpis.derivDiagnostics?.endpoint || 'wss://ws.derivws.com'}</span></p>
                <p>Active Subscriptions: <strong className="font-mono-num">{kpis.derivDiagnostics?.subscribedSymbols?.length || 0}</strong></p>
              </div>
            </div>
          )}

          {/* 2. Commissions & App Markup */}
          {tab === 'commissions' && commData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-[#181C25] border border-[#2A2F3D]">
                  <p className="text-xs text-slate-400">Live Deriv App Markup (USD)</p>
                  <p className="font-mono-num text-2xl font-bold text-[#00A878] mt-1">
                    ${Number(commData.markupStatistics?.total_app_markup_usd || 0).toFixed(2)}
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-[#181C25] border border-[#2A2F3D]">
                  <p className="text-xs text-slate-400">Estimated Platform Commission ({commData.config?.markupPercentage}%)</p>
                  <p className="font-mono-num text-2xl font-bold mt-1">${commData.estimatedAffiliateUsd?.toFixed(2)}</p>
                </div>
                <div className="p-5 rounded-2xl bg-[#181C25] border border-[#2A2F3D]">
                  <p className="text-xs text-slate-400">Diagnostics</p>
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="flex items-center gap-1.5">
                      {commData.diagnostics?.domainVerified ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#00A878]" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      Redirect URI {commData.diagnostics?.domainVerified ? 'Verified' : 'Pending Owner Token'}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#00A878]" />
                      Markup: {commData.config?.markupPercentage}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-4">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs"
                />
                <button
                  type="button"
                  onClick={loadAllAdminData}
                  className="px-4 py-2 rounded-full bg-[#FF444F] text-xs font-bold cursor-pointer"
                >
                  Apply Date Filter
                </button>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await adminFetch('/api/admin/commissions/config', {
                      method: 'PUT',
                      body: JSON.stringify({
                        derivAppId,
                        markupPercentage: Number(markupPct),
                        affiliateLink,
                        affiliateTierRate: Number(affiliateTier),
                        ownerAdminToken: ownerAdminToken || undefined,
                      }),
                    });
                    setOwnerAdminToken('');
                    await loadAllAdminData();
                    flash('Commission & Deriv App ID settings saved');
                  } catch (err) {
                    flash(err instanceof Error ? err.message : 'Save failed', 'err');
                  }
                }}
                className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Deriv App ID</label>
                  <input
                    type="text"
                    value={derivAppId}
                    onChange={(e) => setDerivAppId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">App Markup %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={markupPct}
                    onChange={(e) => setMarkupPct(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">IB / Affiliate Tracking Link</label>
                  <input
                    type="text"
                    value={affiliateLink}
                    onChange={(e) => setAffiliateLink(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Owner Read+Admin Token (Encrypted Vault)</label>
                  <input
                    type="password"
                    placeholder={commData.config?.hasOwnerToken ? '•••••••• (Configured)' : 'Paste Deriv Read+Admin Token'}
                    value={ownerAdminToken}
                    onChange={(e) => setOwnerAdminToken(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" className="px-6 py-2.5 rounded-full bg-[#00A878] text-xs font-bold cursor-pointer">
                    Save Markup & Affiliate Config
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 3. Users CRUD */}
          {tab === 'users' && (
            <div className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await adminFetch('/api/admin/users', {
                      method: 'POST',
                      body: JSON.stringify({
                        email: newUserEmail,
                        full_name: newUserName,
                        virtual_workspace_balance: Number(newUserBal),
                      }),
                    });
                    setNewUserEmail('');
                    setNewUserName('');
                    await loadAllAdminData();
                    flash('Trader user created');
                  } catch (err) {
                    flash(err instanceof Error ? err.message : 'Failed', 'err');
                  }
                }}
                className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3"
              >
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs"
                />
                <input
                  type="number"
                  placeholder="Virtual Balance"
                  value={newUserBal}
                  onChange={(e) => setNewUserBal(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num text-xs"
                />
                <button type="submit" className="px-4 py-2 rounded-full bg-[#FF444F] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Add User
                </button>
              </form>

              <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#2A2F3D] text-slate-400">
                      <th className="text-left px-4 py-3">User</th>
                      <th className="text-left px-4 py-3">Role / Status</th>
                      <th className="text-right px-4 py-3">Virtual Bal</th>
                      <th className="text-right px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A2F3D]">
                    {(overview?.users || []).map((u: any) => (
                      <tr key={u.id}>
                        <td className="px-4 py-3">
                          <p className="font-bold">{u.full_name}</p>
                          <p className="text-slate-400">{u.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          {u.role} ·{' '}
                          <span className={u.status === 'active' ? 'text-[#00A878]' : 'text-[#FF444F]'}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={userBalances[u.id] ?? String(Number(u.virtual_workspace_balance ?? 0).toFixed(2))}
                              onChange={(e) =>
                                setUserBalances((prev) => ({ ...prev, [u.id]: e.target.value }))
                              }
                              className="w-28 px-2.5 py-1.5 rounded-lg bg-[#111319] border border-[#2A2F3D] font-mono-num text-right text-xs"
                            />
                            <button
                              type="button"
                              disabled={busyAction === `user-${u.id}`}
                                onClick={async () => {
                                  const val = Number(userBalances[u.id] ?? u.virtual_workspace_balance);
                                  if (Number.isNaN(val) || val < 0) {
                                    flash('Enter a valid non-negative balance', 'err');
                                    return;
                                  }
                                  setBusyAction(`user-${u.id}`);
                                  await runWithReauth(async () => {
                                    await adminFetch(`/api/admin/users/${u.id}/virtual-balance`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ balance: val }),
                                    });
                                    await loadAllAdminData();
                                    flash(`Saved DB demo balance ($${val.toFixed(2)}) for ${u.email}`);
                                  });
                                  setBusyAction(null);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-[#00A878]/20 hover:bg-[#00A878]/30 text-[#00A878] font-semibold cursor-pointer whitespace-nowrap"
                              >
                                {busyAction === `user-${u.id}` ? 'Saving...' : 'Save DB Balance'}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() =>
                                runWithReauth(async () => {
                                  await adminFetch(`/api/admin/users/${u.id}/status`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ status: u.status === 'active' ? 'suspended' : 'active' }),
                                  });
                                  await loadAllAdminData();
                                  flash(`Updated user status for ${u.email}`);
                                })
                              }
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer"
                          >
                            {u.status === 'active' ? 'Suspend' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await adminFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                                loadAllAdminData();
                              } catch (err) {
                                flash(err instanceof Error ? err.message : 'Cannot delete', 'err');
                              }
                            }}
                            className="p-1 text-[#FF444F] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. Connected Deriv Accounts */}
          {tab === 'accounts' && (
            <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2A2F3D] text-slate-400">
                    <th className="text-left px-4 py-3">Account</th>
                    <th className="text-left px-4 py-3">Owner</th>
                    <th className="text-right px-4 py-3">DB Balance (Real & Demo)</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2F3D]">
                  {(overview?.connectedAccounts || []).map((a: any) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-mono-num font-bold">{a.deriv_login_id || a.deriv_account_id}</p>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              a.is_virtual
                                ? 'bg-slate-700/60 text-slate-300'
                                : 'bg-[#FF444F]/20 text-[#FF444F]'
                            }`}
                          >
                            {a.is_virtual ? 'DEMO' : 'REAL'}
                          </span>
                          {a.balance_locked_by_admin && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                              DB Locked
                            </span>
                          )}
                        </div>
                        <p className="text-slate-400 mt-0.5">
                          {a.account_type} · {a.currency} · {a.status}
                        </p>
                      </td>
                      <td className="px-4 py-3">{a.user_email}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={accountBalances[a.id] ?? String(Number(a.last_known_balance ?? a.balance ?? 0).toFixed(2))}
                            onChange={(e) =>
                              setAccountBalances((prev) => ({ ...prev, [a.id]: e.target.value }))
                            }
                            className="w-28 px-2.5 py-1.5 rounded-lg bg-[#111319] border border-[#2A2F3D] font-mono-num text-right text-xs"
                          />
                          <span className="text-slate-400 font-mono-num text-[11px]">{a.currency || 'USD'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={busyAction === `save-${a.id}`}
                          onClick={async () => {
                            const val = Number(accountBalances[a.id] ?? a.balance);
                            if (Number.isNaN(val) || val < 0) {
                              flash('Enter a valid non-negative balance', 'err');
                              return;
                            }
                            setBusyAction(`save-${a.id}`);
                            await runWithReauth(async () => {
                              await adminFetch(`/api/admin/connected-accounts/${a.id}/balance`, {
                                method: 'PATCH',
                                body: JSON.stringify({ balance: val }),
                              });
                              await loadAllAdminData();
                              flash(
                                `Saved & DB Locked ${a.deriv_login_id || a.deriv_account_id} (${val.toFixed(2)} ${a.currency})`
                              );
                            });
                            setBusyAction(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-[#00A878]/20 hover:bg-[#00A878]/30 text-[#00A878] font-semibold cursor-pointer"
                        >
                          {busyAction === `save-${a.id}` ? 'Saving...' : 'Save DB Balance'}
                        </button>
                        <button
                          type="button"
                          disabled={busyAction === `sync-${a.id}`}
                          onClick={async () => {
                            setBusyAction(`sync-${a.id}`);
                            try {
                              await adminFetch(`/api/admin/connected-accounts/${a.id}/sync`, { method: 'POST' });
                              await loadAllAdminData();
                              flash(`Unlocked & synced live balance for ${a.deriv_login_id || a.deriv_account_id}`);
                            } catch (err) {
                              flash(err instanceof Error ? err.message : 'Sync failed', 'err');
                            } finally {
                              setBusyAction(null);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer"
                        >
                          {busyAction === `sync-${a.id}` ? 'Syncing...' : 'Sync Live'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await adminFetch(`/api/admin/connected-accounts/${a.id}/revoke`, { method: 'POST' });
                            loadAllAdminData();
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-[#FF444F]/15 hover:bg-[#FF444F]/25 text-[#FF444F] cursor-pointer"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 5. Bot Strategies CRUD */}
          {tab === 'strategies' && (
            <div className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await adminFetch('/api/admin/strategies', {
                    method: 'POST',
                    body: JSON.stringify({
                      name: newStratName,
                      symbol: newStratSymbol,
                      contract_type: newStratType,
                      description: newStratDesc || 'MIS configured automated bot strategy',
                    }),
                  });
                  setNewStratName('');
                  setNewStratDesc('');
                  loadAllAdminData();
                  flash('Bot strategy published');
                }}
                className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3"
              >
                <input
                  type="text"
                  required
                  placeholder="Strategy Name"
                  value={newStratName}
                  onChange={(e) => setNewStratName(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs"
                />
                <input
                  type="text"
                  placeholder="Symbol (1HZ100V)"
                  value={newStratSymbol}
                  onChange={(e) => setNewStratSymbol(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num text-xs"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={newStratDesc}
                  onChange={(e) => setNewStratDesc(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs"
                />
                <button type="submit" className="px-4 py-2 rounded-full bg-[#00A878] text-xs font-bold cursor-pointer">
                  Publish Strategy
                </button>
              </form>

              <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#2A2F3D] text-slate-400">
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">Symbol / Type</th>
                      <th className="text-right px-4 py-3">Win Rate</th>
                      <th className="text-right px-4 py-3">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A2F3D]">
                    {(overview?.strategies || []).map((s: any) => (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-bold">{s.name}</td>
                        <td className="px-4 py-3 font-mono-num">{s.symbol} · {s.contract_type}</td>
                        <td className="px-4 py-3 text-right font-mono-num text-[#00A878]">{s.win_rate_est}%</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              await adminFetch(`/api/admin/strategies/${s.id}`, { method: 'DELETE' });
                              loadAllAdminData();
                            }}
                            className="p-1 text-[#FF444F] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. Orders Oversight */}
          {tab === 'orders' && (
            <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2A2F3D] text-slate-400">
                    <th className="text-left px-4 py-3">Order</th>
                    <th className="text-left px-4 py-3">Trader</th>
                    <th className="text-right px-4 py-3">Stake</th>
                    <th className="text-right px-4 py-3">P/L</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2F3D]">
                  {(overview?.orders || []).map((o: any) => (
                    <tr key={o.id}>
                      <td className="px-4 py-3">
                        <strong>#{o.id} {o.symbol}</strong> ({o.side} · {o.status})
                      </td>
                      <td className="px-4 py-3">{o.user_email}</td>
                      <td className="px-4 py-3 text-right font-mono-num">${o.stake}</td>
                      <td className={`px-4 py-3 text-right font-mono-num font-bold ${o.pnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                        {Number(o.pnl).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {o.status === 'OPEN' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await adminFetch(`/api/admin/orders/${o.id}/close`, { method: 'POST' });
                              loadAllAdminData();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#FF444F]/15 text-[#FF444F] cursor-pointer"
                          >
                            Force Close
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            await adminFetch(`/api/admin/orders/${o.id}`, { method: 'DELETE' });
                            loadAllAdminData();
                          }}
                          className="p-1 text-slate-400 hover:text-[#FF444F] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 7. Cashier Logs */}
          {tab === 'cashier' && (
            <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2A2F3D] text-slate-400">
                    <th className="text-left px-4 py-3">Ref</th>
                    <th className="text-left px-4 py-3">Trader</th>
                    <th className="text-left px-4 py-3">Type / Method</th>
                    <th className="text-right px-4 py-3">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2F3D]">
                  {cashierLogs.map((tx: any) => (
                    <tr key={tx.id}>
                      <td className="px-4 py-3 font-mono-num">{tx.reference_id}</td>
                      <td className="px-4 py-3">{tx.user_email}</td>
                      <td className="px-4 py-3">{tx.tx_type} · {tx.method}</td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold">
                        {tx.amount} {tx.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 8. Global Settings & Branding */}
          {tab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await adminFetch('/api/admin/settings/branding', {
                    method: 'PUT',
                    body: JSON.stringify({ appName, supportEmail }),
                  });
                  await adminFetch('/api/admin/settings/global', {
                    method: 'PUT',
                    body: JSON.stringify({ kesRate: Number(kesRate), tickerText, adminPrivateSlug: adminSlug }),
                  });
                  flash('Branding & Global settings updated');
                }}
                className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-5 space-y-4"
              >
                <h2 className="font-display text-sm font-bold">Platform Branding & Global Config</h2>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Brand Name</label>
                  <input
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">USD → KSH Rate</label>
                  <input
                    type="number"
                    step="0.1"
                    value={kesRate}
                    onChange={(e) => setKesRate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Private Admin Slug</label>
                  <input
                    type="text"
                    value={adminSlug}
                    onChange={(e) => setAdminSlug(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Top Marquee Ticker</label>
                  <input
                    type="text"
                    value={tickerText}
                    onChange={(e) => setTickerText(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                  />
                </div>
                <button type="submit" className="px-6 py-2.5 rounded-full bg-[#FF444F] text-xs font-bold cursor-pointer">
                  Save Settings
                </button>
              </form>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await runWithReauth(async () => {
                    await adminFetch('/api/admin/settings/admin-credentials', {
                      method: 'PUT',
                      body: JSON.stringify({ email: newAdminEmail || undefined, password: newAdminPassword || undefined }),
                    });
                    setNewAdminPassword('');
                    flash('Owner credentials updated');
                  });
                }}
                className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-5 space-y-4"
              >
                <h2 className="font-display text-sm font-bold">Owner Credentials</h2>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">New Owner Email (optional)</label>
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">New Password (optional)</label>
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                  />
                </div>
                <button type="submit" className="px-6 py-2.5 rounded-full bg-[#00A878] text-xs font-bold cursor-pointer">
                  Update Credentials
                </button>
              </form>
            </div>
          )}

          {/* 9. Announcements */}
          {tab === 'announcements' && (
            <div className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await adminFetch('/api/admin/announcements', {
                    method: 'POST',
                    body: JSON.stringify({ title: annTitle, message: annMsg }),
                  });
                  setAnnTitle('');
                  setAnnMsg('');
                  loadAllAdminData();
                  flash('Announcement broadcasted');
                }}
                className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-4 flex flex-wrap gap-3"
              >
                <input
                  type="text"
                  required
                  placeholder="Announcement Title"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="Broadcast Message"
                  value={annMsg}
                  onChange={(e) => setAnnMsg(e.target.value)}
                  className="flex-[2] min-w-[240px] px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs"
                />
                <button type="submit" className="px-5 py-2 rounded-full bg-[#FF444F] text-xs font-bold cursor-pointer">
                  Publish
                </button>
              </form>

              <div className="space-y-2">
                {(overview?.announcements || []).map((a: any) => (
                  <div key={a.id} className="p-4 rounded-2xl bg-[#181C25] border border-[#2A2F3D] flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">{a.title}</p>
                      <p className="text-xs text-slate-400">{a.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await adminFetch(`/api/admin/announcements/${a.id}`, { method: 'DELETE' });
                        loadAllAdminData();
                      }}
                      className="p-2 text-[#FF444F] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 10. Audit & Email Logs */}
          {tab === 'logs' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-4 space-y-2">
                <h2 className="font-display text-sm font-bold mb-2">Admin Audit Trail</h2>
                {(overview?.auditLogs || []).slice(0, 20).map((l: any) => (
                  <div key={l.id} className="py-2 border-b border-[#2A2F3D] last:border-0 text-xs flex justify-between">
                    <span>{l.action} ({l.target_type} #{l.target_id})</span>
                    <span className="text-slate-400">{l.created_at}</span>
                  </div>
                ))}
              </div>

              <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-4 space-y-2">
                <h2 className="font-display text-sm font-bold mb-2">Brevo Email Dispatch Logs</h2>
                {(overview?.emailLogs || []).slice(0, 20).map((e: any) => (
                  <div key={e.id} className="py-2 border-b border-[#2A2F3D] last:border-0 text-xs flex justify-between">
                    <span>{e.recipient_email} · {e.template}</span>
                    <span className="text-[#00A878]">{e.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 11. Security & Diagnostics */}
          {tab === 'security' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Real-time server health, Deriv WebSocket relay telemetry, and security audit logs (zero secrets exposed).
                </p>
                <button
                  type="button"
                  onClick={loadDiagnostics}
                  disabled={diagLoading}
                  className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${diagLoading ? 'animate-spin' : ''}`} /> Refresh Diagnostics
                </button>
              </div>

              {diagnostics && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="p-4 rounded-2xl bg-[#181C25] border border-[#2A2F3D]">
                      <p className="text-xs text-slate-400">PostgreSQL Health</p>
                      <p className={`font-mono tabular-nums text-lg font-bold mt-1 ${diagnostics.database?.ok ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                        {diagnostics.database?.ok ? 'ONLINE' : 'ERROR'} ({diagnostics.database?.latencyMs ?? 0}ms)
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-[#181C25] border border-[#2A2F3D]">
                      <p className="text-xs text-slate-400">Deriv WS Relay</p>
                      <p className={`font-mono tabular-nums text-lg font-bold mt-1 ${diagnostics.deriv?.connected ? 'text-[#00A878]' : 'text-amber-400'}`}>
                        {diagnostics.deriv?.connected ? 'CONNECTED' : 'RECONNECTING'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        Attempts: {diagnostics.deriv?.reconnectAttempts ?? 0} · Symbols: {diagnostics.deriv?.subscribedSymbols?.length ?? 0}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-[#181C25] border border-[#2A2F3D]">
                      <p className="text-xs text-slate-400">Server Integrations</p>
                      <p className="text-xs mt-1.5 font-mono">
                        Gemini AI: <strong className={diagnostics.environment?.geminiConfigured ? 'text-[#00A878]' : 'text-amber-400'}>{diagnostics.environment?.geminiConfigured ? 'Configured' : 'Missing Key'}</strong>
                      </p>
                      <p className="text-xs font-mono">
                        Brevo Mail: <strong className={diagnostics.environment?.brevoConfigured ? 'text-[#00A878]' : 'text-slate-400'}>{diagnostics.environment?.brevoConfigured ? 'Configured' : 'Not Set'}</strong>
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-[#181C25] border border-[#2A2F3D]">
                      <p className="text-xs text-slate-400">Runtime Environment</p>
                      <p className="font-mono text-sm font-bold mt-1">{diagnostics.environment?.nodeEnv || 'production'}</p>
                      <p className="text-[11px] text-slate-400 font-mono">Deriv App ID: {diagnostics.environment?.derivAppId}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-4 space-y-2">
                      <h2 className="font-display text-sm font-bold mb-2">Admin Login Attempts & Rate-Limit Log</h2>
                      <div className="max-h-72 overflow-y-auto divide-y divide-[#2A2F3D] text-xs">
                        {(diagnostics.loginAttempts || []).map((a: any) => (
                          <div key={a.id} className="py-2 flex items-center justify-between gap-2">
                            <div>
                              <span className={a.success ? 'text-[#00A878] font-bold' : 'text-[#FF444F] font-bold'}>
                                {a.success ? 'SUCCESS' : 'BLOCKED/FAIL'}
                              </span>{' '}
                              · {a.email}
                              <p className="text-[11px] text-slate-400">{a.reason} · IP {a.ip_address}</p>
                            </div>
                            <span className="font-mono text-[11px] text-slate-400">
                              {new Date(a.created_at).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-4 space-y-2">
                      <h2 className="font-display text-sm font-bold mb-2">System Error & Upstream Logs</h2>
                      <div className="max-h-72 overflow-y-auto divide-y divide-[#2A2F3D] text-xs">
                        {(diagnostics.errorLogs || []).length === 0 ? (
                          <p className="text-slate-400 py-4 text-center">No system errors recorded.</p>
                        ) : (
                          (diagnostics.errorLogs || []).map((e: any) => (
                            <div key={e.id} className="py-2 flex items-center justify-between gap-2">
                              <div>
                                <span className="font-bold text-[#FF444F]">[{e.source}]</span> {e.message}
                              </div>
                              <span className="font-mono text-[11px] text-slate-400 shrink-0">
                                {new Date(e.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Sensitive Admin Operation Re-Authentication Modal */}
      {reauthOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#FF444F]" /> Confirm Owner Password
              </h3>
              <button
                type="button"
                onClick={() => {
                  setReauthOpen(false);
                  setPendingReauthAction(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Sensitive operations (editing balances, suspending users, or rotating owner credentials) require password re-verification valid for 10 minutes.
            </p>
            <form onSubmit={handleConfirmReauth} className="space-y-3">
              <input
                type="password"
                required
                autoFocus
                placeholder="Current Owner Password"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
              />
              <button
                type="submit"
                disabled={reauthBusy}
                className="w-full py-2.5 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold cursor-pointer"
              >
                {reauthBusy ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
