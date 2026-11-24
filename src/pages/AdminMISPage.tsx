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
  ExternalLink,
  Copy,
  Sliders,
  BarChart3,
  Edit3,
  Search,
  Eye,
  PauseCircle,
  PlayCircle,
  UserPlus,
} from 'lucide-react';
import { TradeDerivLogo } from '../components/TradeDerivLogo';

type AdminTab =
  | 'overview'
  | 'commissions'
  | 'users'
  | 'accounts'
  | 'strategies'
  | 'orders'
  | 'engine'
  | 'markets'
  | 'cashier'
  | 'settings'
  | 'announcements'
  | 'logs'
  | 'security';

let currentAdminReauthToken = '';

class AdminReauthRequiredError extends Error {
  code = 'REAUTH_REQUIRED';
  constructor(msg: string) {
    super(msg);
  }
}

async function adminFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...((options.headers as Record<string, string>) || {}),
  };
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
  const [adminUser, setAdminUser] = useState<{ id: number; email: string; full_name: string; role: string } | null>(null);
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
  const [affiliateLink, setAffiliateLink] = useState('https://t.deriv.link?t=FSDRTFVTSKPA');
  const [affiliateCode, setAffiliateCode] = useState('VNMH2VHBRTFN');
  const [affiliateTier, setAffiliateTier] = useState('30');
  const [ownerAdminToken, setOwnerAdminToken] = useState('');

  // Settings forms
  const [appName, setAppName] = useState('DERIV');
  const [tagline, setTagline] = useState('Precision Synthetic, CFD, Options & Crypto Exchange Terminal');
  const [heroTitle, setHeroTitle] = useState('Trade global markets on one precision platform');
  const [heroSubtitle, setHeroSubtitle] = useState('Real-time Deriv Synthetics, Forex CFDs, Options & Exchange');
  const [heroDescription, setHeroDescription] = useState(
    'Trade CFDs, Options, Deriv Bot, SmartTrader, and Crypto Spot/Futures from a unified institutional terminal.'
  );
  const [supportEmail, setSupportEmail] = useState('support@deriv.com');
  const [supportPhone, setSupportPhone] = useState('+44 20 8089 0000');
  const [kesRate, setKesRate] = useState('130');
  const [tickerText, setTickerText] = useState('');
  const [adminSlug, setAdminSlug] = useState('pf-ops-9482');
  const [defaultVirtualBalance, setDefaultVirtualBalance] = useState('10000');
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  // Trading Engine Control state
  const [engineConfig, setEngineConfig] = useState({
    botWinRatePct: 76,
    analyserWinRatePct: 82,
    accuWinRatePct: 78,
    manualOptionsWinRatePct: 68,
    siteSettlementForLockedReal: true,
    liveMicroTickEnabled: true,
  });

  // Instruments & Pricing Overrides state
  const [instrumentsList, setInstrumentsList] = useState<any[]>([]);
  const [instrumentEdits, setInstrumentEdits] = useState<
    Record<string, { display_name: string; price: string; spread: string; min_stake: string; max_stake: string; is_active: boolean }>
  >({});

  // Full User & Order Edit Modals, Filters, Balance Adjust & Activity Inspection
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'suspended' | 'trading_frozen'>('all');
  const [adjustTarget, setAdjustTarget] = useState<{
    user: any;
    accountMode: 'demo' | 'real';
    walletBucket: 'options' | 'mt5_standard' | 'mt5_gold' | 'exchange_usdt';
    operation: 'credit' | 'debit' | 'set';
    amount: string;
    reason: string;
  } | null>(null);
  const [activityData, setActivityData] = useState<any | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  // Orders Oversight Filters
  const [orderUserFilter, setOrderUserFilter] = useState('');
  const [orderSymbolFilter, setOrderSymbolFilter] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED' | 'CANCELLED'>('ALL');
  const [orderModeFilter, setOrderModeFilter] = useState<'ALL' | 'real' | 'demo'>('ALL');
  const [serverTrades, setServerTrades] = useState<any[] | null>(null);

  // Admin Team Management
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [createAdminEmail, setCreateAdminEmail] = useState('');
  const [createAdminName, setCreateAdminName] = useState('');
  const [createAdminPassword, setCreateAdminPassword] = useState('');

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

  // Inline balance & display name edit maps
  const [userBalances, setUserBalances] = useState<Record<number, string>>({});
  const [realBalances, setRealBalances] = useState<Record<number, string>>({});
  const [userNames, setUserNames] = useState<Record<number, string>>({});
  const [accountBalances, setAccountBalances] = useState<Record<number, string>>({});
  const [accountNames, setAccountNames] = useState<Record<number, string>>({});
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
    Promise.all([
      adminFetch<{ bootstrapped: boolean }>('/api/admin/bootstrap-status').catch(() => ({ bootstrapped: true })),
      fetch('/api/admin/me', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([statusRes, meRes]) => {
        setBootstrapped(statusRes.bootstrapped);
        if (meRes?.user) {
          setAdminUser(meRes.user);
        }
      })
      .finally(() => setLoadingStatus(false));
  }, []);

  const loadAllAdminData = useCallback(async () => {
    if (!adminUser) return;
    try {
      const [ov, cash, comm, adminsRes] = await Promise.all([
        adminFetch('/api/admin/overview'),
        adminFetch('/api/admin/cashier-logs'),
        adminFetch(`/api/admin/commissions?date_from=${dateFrom}&date_to=${dateTo}`),
        adminFetch<{ admins: any[] }>('/api/admin/admins').catch(() => ({ admins: [] })),
      ]);
      setOverview(ov);
      setCashierLogs(cash.transactions || []);
      setCommData(comm);
      setAdminsList(adminsRes.admins || []);
      setServerTrades(null);

      const uMap: Record<number, string> = {};
      const rMap: Record<number, string> = {};
      const nMap: Record<number, string> = {};
      for (const u of ov.users || []) {
        uMap[u.id] = String(Number(u.virtual_workspace_balance ?? 0).toFixed(2));
        nMap[u.id] = String(u.full_name ?? '');
        let realOpt = 0;
        try {
          const rw = JSON.parse(u.real_wallets_json || '{}');
          realOpt = Number(rw.options ?? 0);
        } catch {
          realOpt = 0;
        }
        rMap[u.id] = String(realOpt.toFixed(2));
      }
      setUserBalances(uMap);
      setRealBalances(rMap);
      setUserNames(nMap);

      const aMap: Record<number, string> = {};
      const anMap: Record<number, string> = {};
      for (const a of ov.connectedAccounts || []) {
        aMap[a.id] = String(Number(a.last_known_balance ?? a.balance ?? 0).toFixed(2));
        anMap[a.id] = String(a.account_type ?? '');
      }
      setAccountBalances(aMap);
      setAccountNames(anMap);

      setAppName(ov.branding?.appName || 'DERIV');
      setTagline(ov.branding?.tagline || 'Precision Synthetic, CFD, Options & Crypto Exchange Terminal');
      setHeroTitle(ov.branding?.heroTitle || 'Trade global markets on one precision platform');
      setHeroSubtitle(ov.branding?.heroSubtitle || 'Real-time Deriv Synthetics, Forex CFDs, Options & Exchange');
      setHeroDescription(
        ov.branding?.heroDescription ||
          'Trade CFDs, Options, Deriv Bot, SmartTrader, and Crypto Spot/Futures from a unified institutional terminal.'
      );
      setSupportEmail(ov.branding?.supportEmail || 'support@deriv.com');
      setSupportPhone(ov.branding?.supportPhone || '+44 20 8089 0000');
      setKesRate(String(ov.global?.kesRate || 130));
      setTickerText(ov.global?.tickerText || '');
      setAdminSlug(ov.global?.adminPrivateSlug || 'pf-ops-9482');
      setDefaultVirtualBalance(String(ov.global?.defaultVirtualBalance ?? 10000));
      setAllowRegistration(ov.global?.allowRegistration !== false);
      setMaintenanceMode(Boolean(ov.global?.maintenanceMode));

      if (ov.tradingEngine) {
        setEngineConfig({
          botWinRatePct: Number(ov.tradingEngine.botWinRatePct ?? 76),
          analyserWinRatePct: Number(ov.tradingEngine.analyserWinRatePct ?? 82),
          accuWinRatePct: Number(ov.tradingEngine.accuWinRatePct ?? 78),
          manualOptionsWinRatePct: Number(ov.tradingEngine.manualOptionsWinRatePct ?? 68),
          siteSettlementForLockedReal: ov.tradingEngine.siteSettlementForLockedReal !== false,
          liveMicroTickEnabled: ov.tradingEngine.liveMicroTickEnabled !== false,
        });
      }

      const insts = Array.isArray(ov.instruments) ? ov.instruments : [];
      setInstrumentsList(insts);
      const iMap: Record<
        string,
        { display_name: string; price: string; spread: string; min_stake: string; max_stake: string; is_active: boolean }
      > = {};
      for (const item of insts) {
        iMap[item.symbol] = {
          display_name: String(item.display_name || item.symbol),
          price: String(Number(item.price ?? 0)),
          spread: String(Number(item.spread ?? 0.5)),
          min_stake: String(Number(item.min_stake ?? 0.35)),
          max_stake: String(Number(item.max_stake ?? 50000)),
          is_active: item.is_active !== false,
        };
      }
      setInstrumentEdits(iMap);

      setDerivAppId(comm.config?.derivAppId || '');
      setMarkupPct(String(comm.config?.markupPercentage ?? 2.0));
      setAffiliateLink(comm.config?.affiliateLink || 'https://t.deriv.link?t=FSDRTFVTSKPA');
      setAffiliateCode(comm.config?.affiliateCode || 'VNMH2VHBRTFN');
      setAffiliateTier(String(comm.config?.affiliateTierRate ?? 30));
    } catch (err) {
      if (err instanceof Error && (err.message.includes('401') || err.message.includes('403'))) {
        setAdminUser(null);
      }
    }
  }, [adminUser, dateFrom, dateTo]);

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  const handleBootstrapOrLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    try {
      const path = bootstrapped ? '/api/admin/login' : '/api/admin/bootstrap';
      const res = await adminFetch<{ user: { id: number; email: string; full_name: string; role: string } }>(path, {
        method: 'POST',
        body: JSON.stringify({ email: authEmail, password: authPassword, full_name: authName }),
      });
      setAdminUser(res.user);
      setAuthPassword('');
      setBootstrapped(true);
      flash('Signed in to Administrator Console');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Authentication failed', 'err');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOutOwner = async () => {
    await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    }).catch(() => {});
    currentAdminReauthToken = '';
    setAdminUser(null);
    setOverview(null);
    setDiagnostics(null);
    setAdminsList([]);
  };

  const loadDiagnostics = useCallback(async () => {
    if (!adminUser) return;
    setDiagLoading(true);
    try {
      const diag = await adminFetch('/api/admin/diagnostics');
      setDiagnostics(diag);
    } catch {
      // ignore
    } finally {
      setDiagLoading(false);
    }
  }, [adminUser]);

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

  const openUserActivity = async (userId: number) => {
    setActivityLoading(true);
    try {
      const data = await adminFetch(`/api/admin/users/${userId}/activity`);
      setActivityData(data);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to load trader activity', 'err');
    } finally {
      setActivityLoading(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="min-h-screen bg-[#111319] text-white flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading Administrator Console...</p>
      </div>
    );
  }

  if (!adminUser) {
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
              {bootstrapped ? 'Administrator Console Sign In' : 'First-Run Owner Bootstrap'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {bootstrapped
                ? 'Authorized platform administrators only.'
                : 'Initialize the primary DERIV platform owner account.'}
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
    { id: 'engine', label: 'Trading Engine Control', icon: Sliders },
    { id: 'markets', label: 'Instruments & Pricing', icon: BarChart3 },
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
          <div className="px-2.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-300 truncate">{adminUser.email}</span>
            <span className="px-2 py-0.5 rounded bg-[#00A878]/20 text-[#00A878] font-bold uppercase text-[9px] shrink-0">
              {adminUser.role}
            </span>
          </div>
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
            <LogOut className="w-4 h-4" /> Sign Out Console
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

        {/* Mobile Quick-Access MIS Tab Strip */}
        <nav className="lg:hidden px-3 py-2 bg-[#151820] border-b border-[#2A2F3D] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  tab === item.id ? 'bg-[#FF444F] text-white' : 'bg-white/5 text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

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
                <p>
                  Active Subscriptions:{' '}
                  <strong className="font-mono-num">
                    {kpis.derivDiagnostics?.subscribedSymbolsCount ??
                      (Array.isArray(kpis.derivDiagnostics?.subscribedSymbols)
                        ? kpis.derivDiagnostics.subscribedSymbols.length
                        : kpis.derivDiagnostics?.subscribedSymbols) ??
                      0}
                  </strong>
                </p>
              </div>
            </div>
          )}

          {/* 2. Commissions & App Markup */}
          {tab === 'commissions' && commData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-[#181C25] border border-[#2A2F3D]">
                  <p className="text-xs text-slate-400">Live Deriv App Markup (USD)</p>
                  <p className="font-mono-num tabular-nums text-2xl font-bold text-[#00A878] mt-1">
                    ${Number(commData.markupStatistics?.total_app_markup_usd || 0).toFixed(2)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1.5 font-mono-num tabular-nums">
                    {commData.dateFrom} → {commData.dateTo} · {commData.diagnostics?.restVerified ? 'Live Deriv REST' : 'Awaiting Token'}
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-[#181C25] border border-[#2A2F3D]">
                  <p className="text-xs text-slate-400">Deriv App Volume &amp; Activity</p>
                  <p className="font-mono-num tabular-nums text-2xl font-bold mt-1">
                    ${Number(commData.markupStatistics?.total_volume_usd || 0).toFixed(2)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1.5 font-mono-num tabular-nums">
                    {commData.markupStatistics?.total_transactions_count || 0} contracts · {commData.markupStatistics?.total_client_count || 0} clients
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1 font-mono-num tabular-nums">
                    Local terminal volume: ${Number(commData.localDerivVolumeUsd || 0).toFixed(2)} ({commData.localDerivTradeCount || 0} trades)
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-[#181C25] border border-[#2A2F3D]">
                  <p className="text-xs text-slate-400">Diagnostics &amp; Payout Workflow</p>
                  <div className="mt-2 space-y-1.5 text-xs">
                    <p className="flex items-center gap-1.5">
                      {commData.diagnostics?.restVerified ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#00A878] shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span>
                        {commData.diagnostics?.restVerified
                          ? 'Verified via Deriv REST (/applications/v1/markup-statistics)'
                          : commData.diagnostics?.ownerTokenConfigured
                            ? 'Token Error — Needs application_read'
                            : 'Pending Owner Token'}
                      </span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#00A878] shrink-0" />
                      <span>
                        Markup: {commData.config?.markupPercentage}%
                        {commData.diagnostics?.appMarkupPctOnDeriv !== null &&
                        commData.diagnostics?.appMarkupPctOnDeriv !== undefined
                          ? ` (Deriv: ${commData.diagnostics.appMarkupPctOnDeriv}%)`
                          : ''}
                      </span>
                    </p>
                    {commData.diagnostics?.liveError && (
                      <p className="text-[11px] text-amber-300 mt-1 break-words">{commData.diagnostics.liveError}</p>
                    )}
                    <p className="text-[10px] text-slate-400 pt-1 leading-relaxed">
                      1) Create an Owner Token with <span className="font-mono text-slate-300">application_read</span> scope at{' '}
                      <a
                        href="https://developers.deriv.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-slate-200 hover:text-white"
                      >
                        developers.deriv.com
                      </a>{' '}
                      to pull live markup. 2) App markup payouts settle directly into your real Deriv USD account — transfer/withdraw via{' '}
                      <a
                        href="https://app.deriv.com/cashier"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-slate-200 hover:text-white"
                      >
                        Deriv Cashier
                      </a>
                      .
                    </p>
                  </div>
                </div>
              </div>

              {/* Stream 2: Dual-Commission Partner Referral & Crypto Exchange RevShare */}
              <div className="p-5 rounded-2xl bg-[#181C25] border border-[#2A2F3D] flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#FF444F]/15 text-[#FF444F] text-[10px] font-bold uppercase">
                      Stream 2 · Deriv Partner Program
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#00A878]/15 text-[#00A878] text-[10px] font-bold">
                      {Number(commData.config?.affiliateTierRate ?? 30)}% RevShare (Spot, Futures, Options, CFDs)
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white">
                    Dual-Commission Referral Attribution Active alongside App ID Markup
                  </p>
                  <p className="text-xs text-slate-400">
                    New traders who register via your Partner link earn{' '}
                    <strong className="text-white">{Number(commData.config?.affiliateTierRate ?? 30)}% Partner Commission</strong> on Crypto Exchange spot &amp; futures, Options, and CFDs — in addition to App ID ({derivAppId || 'configured'}) markup commissions.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                  <div className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs font-mono-num">
                    <span className="text-[10px] text-slate-500 block">Partner Code</span>
                    <strong className="text-white">{commData.config?.affiliateCode || affiliateCode}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(commData.config?.affiliateLink || affiliateLink);
                      flash('Partner referral link copied');
                    }}
                    className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Link
                  </button>
                  <a
                    href={commData.config?.affiliateLink || affiliateLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2.5 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    Open Partner Link <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {Array.isArray(commData.markupStatistics?.breakdown) && commData.markupStatistics.breakdown.length > 0 && (
                <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl overflow-x-auto">
                  <div className="px-4 py-3 border-b border-[#2A2F3D] flex items-center justify-between">
                    <h3 className="font-display text-xs font-bold uppercase tracking-wider text-slate-300">
                      Deriv Application Breakdown
                    </h3>
                    <span className="text-[11px] font-mono-num text-slate-400">
                      {commData.markupStatistics.breakdown.length} entries
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#2A2F3D] text-slate-400">
                        <th className="text-left px-4 py-2.5">App / Period</th>
                        <th className="text-right px-4 py-2.5">Contracts</th>
                        <th className="text-right px-4 py-2.5">Volume (USD)</th>
                        <th className="text-right px-4 py-2.5">App Markup (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2A2F3D]">
                      {commData.markupStatistics.breakdown.map((row: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2.5 font-mono-num">
                            {row.app_name || row.name || row.date || row.app_id || row.id || `Entry #${idx + 1}`}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-num tabular-nums">
                            {Number(row.transactions_count ?? row.contract_count ?? row.trades ?? 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-num tabular-nums">
                            ${Number(row.volume_usd ?? row.total_volume_usd ?? 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-num tabular-nums font-bold text-[#00A878]">
                            ${Number(row.app_markup_usd ?? row.markup_usd ?? row.total_app_markup_usd ?? 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

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
                  const cleanAppId = derivAppId.trim();
                  if (cleanAppId && !/^[A-Za-z0-9_-]{2,64}$/.test(cleanAppId)) {
                    flash('Deriv App ID must be 2-64 alphanumeric characters (e.g. 34ZNHHLmmHMEpuNcPbnzg), never an OAuth client secret.', 'err');
                    return;
                  }
                  try {
                    await adminFetch('/api/admin/commissions/config', {
                      method: 'PUT',
                      body: JSON.stringify({
                        derivAppId: cleanAppId,
                        markupPercentage: Number(markupPct),
                        affiliateLink,
                        affiliateCode: affiliateCode.trim(),
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
                    placeholder="e.g. 34ZNHHLmmHMEpuNcPbnzg"
                    value={derivAppId}
                    onChange={(e) => setDerivAppId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num text-sm"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Enter your App ID from developers.deriv.com (supports modern alphanumeric IDs or legacy numeric IDs; never paste an OAuth client secret).
                  </p>
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
                  <label className="block text-xs text-slate-400 mb-1">Partner / Affiliate Referral Link</label>
                  <input
                    type="text"
                    value={affiliateLink}
                    onChange={(e) => setAffiliateLink(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Partner Referral Code &amp; RevShare %</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="VNMH2VHBRTFN"
                      value={affiliateCode}
                      onChange={(e) => setAffiliateCode(e.target.value)}
                      className="col-span-2 px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num text-sm"
                    />
                    <input
                      type="number"
                      step="1"
                      value={affiliateTier}
                      onChange={(e) => setAffiliateTier(e.target.value)}
                      className="px-3 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num text-sm text-center"
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">
                    Owner Personal Access / OAuth Token (application_read)
                  </label>
                  <input
                    type="password"
                    placeholder={
                      commData.config?.hasOwnerToken
                        ? '•••••••• (Configured)'
                        : 'Paste Deriv Token with application_read scope'
                    }
                    value={ownerAdminToken}
                    onChange={(e) => setOwnerAdminToken(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" className="px-6 py-2.5 rounded-full bg-[#00A878] text-xs font-bold cursor-pointer">
                    Save Markup &amp; Affiliate Config
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 3. Users CRUD */}
          {tab === 'users' &&
            (() => {
              const q = userSearch.trim().toLowerCase();
              const filteredUsers = (overview?.users || []).filter((u: any) => {
                if (userStatusFilter === 'active' && u.status !== 'active') return false;
                if (userStatusFilter === 'suspended' && u.status !== 'suspended') return false;
                if (userStatusFilter === 'trading_frozen' && !u.trading_suspended) return false;
                if (!q) return true;
                return (
                  String(u.email || '').toLowerCase().includes(q) ||
                  String(u.full_name || '').toLowerCase().includes(q) ||
                  String(u.deriv_client_id || '').toLowerCase().includes(q)
                );
              });

              const openAdjustModal = (u: any) =>
                setAdjustTarget({
                  user: u,
                  accountMode: 'demo',
                  walletBucket: 'options',
                  operation: 'credit',
                  amount: '100',
                  reason: 'Administrative balance adjustment',
                });

              const openFullEditModal = (u: any) => {
                const parseJson = (raw: any, def: any) => {
                  try {
                    return { ...def, ...(typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}) };
                  } catch {
                    return { ...def };
                  }
                };
                setEditingUser({
                  ...u,
                  password: '',
                  demo_wallets: parseJson(u.demo_wallets_json, { mt5_standard: 10000, mt5_gold: 10000, exchange_usdt: 10000 }),
                  real_wallets: parseJson(u.real_wallets_json, { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 }),
                  exchange_balances: parseJson(u.exchange_balances_json, { USDT: 10000, USDC: 2500, BTC: 0.15, ETH: 2.5 }),
                  real_exchange_balances: parseJson(u.real_exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 }),
                });
              };

              const toggleTradingFreeze = (u: any) =>
                runWithReauth(async () => {
                  await adminFetch(`/api/admin/users/${u.id}/trading-access`, {
                    method: 'PATCH',
                    body: JSON.stringify({ trading_suspended: !u.trading_suspended }),
                  });
                  await loadAllAdminData();
                  flash(
                    !u.trading_suspended
                      ? `Trading execution frozen for ${u.email}`
                      : `Trading execution restored for ${u.email}`
                  );
                });

              return (
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

                  {/* Search & Filter Bar */}
                  <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-3 flex flex-wrap items-center gap-3 text-xs">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search by trader name, email, or client ID..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs"
                      />
                    </div>
                    <select
                      value={userStatusFilter}
                      onChange={(e) => setUserStatusFilter(e.target.value as any)}
                      className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs"
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active Only</option>
                      <option value="suspended">Suspended Only</option>
                      <option value="trading_frozen">Trading Frozen</option>
                    </select>
                    <span className="text-slate-400 font-mono-num">
                      {filteredUsers.length} trader{filteredUsers.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {/* Mobile Responsive Cards for Users CRUD */}
                  <div className="md:hidden space-y-3">
                    {filteredUsers.length === 0 ? (
                      <div className="p-6 rounded-2xl bg-[#181C25] border border-[#2A2F3D] text-center text-xs text-slate-400">
                        No trader accounts match your filter.
                      </div>
                    ) : (
                      filteredUsers.map((u: any) => {
                        let parsedRw = 0;
                        try {
                          parsedRw = Number(JSON.parse(u.real_wallets_json || '{}').options ?? 0);
                        } catch {
                          parsedRw = 0;
                        }
                        const matchedAccounts = (overview?.connectedAccounts || []).filter((a: any) => a.user_id === u.id);
                        const matchedReal = matchedAccounts.filter((a: any) => !a.is_virtual);
                        const matchedDemo = matchedAccounts.filter((a: any) => Boolean(a.is_virtual));

                        return (
                          <div key={u.id} className="p-4 rounded-2xl bg-[#181C25] border border-[#2A2F3D] space-y-3 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={userNames[u.id] ?? u.full_name ?? ''}
                                    onChange={(e) => setUserNames((prev) => ({ ...prev, [u.id]: e.target.value }))}
                                    placeholder="Display Profile Name"
                                    className="flex-1 min-w-0 px-2.5 py-1 rounded-lg bg-[#111319] border border-[#2A2F3D] font-bold text-xs text-white"
                                  />
                                  <button
                                    type="button"
                                    disabled={busyAction === `uname-${u.id}`}
                                    onClick={async () => {
                                      const nextName = String(userNames[u.id] ?? u.full_name ?? '').trim();
                                      if (!nextName) {
                                        flash('Display profile name cannot be empty', 'err');
                                        return;
                                      }
                                      setBusyAction(`uname-${u.id}`);
                                      try {
                                        await adminFetch(`/api/admin/users/${u.id}`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ full_name: nextName }),
                                        });
                                        await loadAllAdminData();
                                        flash(`Display name updated to "${nextName}"`);
                                      } catch (err) {
                                        flash(err instanceof Error ? err.message : 'Failed to save name', 'err');
                                      } finally {
                                        setBusyAction(null);
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold cursor-pointer shrink-0"
                                  >
                                    {busyAction === `uname-${u.id}` ? '...' : 'Save Name'}
                                  </button>
                                </div>
                                <p className="text-slate-400 truncate">
                                  {u.email} · {u.preferred_currency || 'USD'}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    u.status === 'active' ? 'bg-[#00A878]/20 text-[#00A878]' : 'bg-[#FF444F]/20 text-[#FF444F]'
                                  }`}
                                >
                                  {u.status}
                                </span>
                                {u.trading_suspended && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300">
                                    TRADING FROZEN
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Separated Real & Demo Matched Accounts */}
                            <div className="grid grid-cols-1 gap-2">
                              <div className="p-2.5 rounded-xl bg-[#111319] border border-[#FF444F]/25 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF444F]">
                                    Real Account ({matchedReal.length})
                                  </span>
                                  {matchedReal.length > 0 && (
                                    <span className="text-[10px] font-mono-num text-slate-400">
                                      {matchedReal.map((a: any) => `${a.deriv_login_id || a.deriv_account_id} (${a.account_type})`).join(', ')}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-[#FF444F] font-bold w-16">Real ($):</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={realBalances[u.id] ?? parsedRw.toFixed(2)}
                                    onChange={(e) => setRealBalances((prev) => ({ ...prev, [u.id]: e.target.value }))}
                                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#181C25] border border-[#2A2F3D] font-mono-num text-right text-xs"
                                  />
                                  <button
                                    type="button"
                                    disabled={busyAction === `real-${u.id}`}
                                    onClick={async () => {
                                      const val = Number(realBalances[u.id] ?? parsedRw);
                                      if (Number.isNaN(val) || val < 0) {
                                        flash('Enter a valid non-negative Real balance', 'err');
                                        return;
                                      }
                                      setBusyAction(`real-${u.id}`);
                                      await runWithReauth(async () => {
                                        await adminFetch(`/api/admin/users/${u.id}/real-balance`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ balance: val }),
                                        });
                                        await loadAllAdminData();
                                        flash(`Saved DB Real balance ($${val.toFixed(2)}) for ${u.email}`);
                                      });
                                      setBusyAction(null);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-[#FF444F]/20 text-[#FF444F] font-semibold cursor-pointer"
                                  >
                                    {busyAction === `real-${u.id}` ? '...' : 'Save'}
                                  </button>
                                </div>
                              </div>

                              <div className="p-2.5 rounded-xl bg-[#111319] border border-[#00A878]/25 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#00A878]">
                                    Demo Account ({matchedDemo.length})
                                  </span>
                                  {matchedDemo.length > 0 && (
                                    <span className="text-[10px] font-mono-num text-slate-400">
                                      {matchedDemo.map((a: any) => `${a.deriv_login_id || a.deriv_account_id} (${a.account_type})`).join(', ')}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-[#00A878] font-bold w-16">Demo ($):</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={userBalances[u.id] ?? String(Number(u.virtual_workspace_balance ?? 0).toFixed(2))}
                                    onChange={(e) => setUserBalances((prev) => ({ ...prev, [u.id]: e.target.value }))}
                                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#181C25] border border-[#2A2F3D] font-mono-num text-right text-xs"
                                  />
                                  <button
                                    type="button"
                                    disabled={busyAction === `user-${u.id}`}
                                    onClick={async () => {
                                      const val = Number(userBalances[u.id] ?? u.virtual_workspace_balance);
                                      if (Number.isNaN(val) || val < 0) {
                                        flash('Enter a valid non-negative Demo balance', 'err');
                                        return;
                                      }
                                      setBusyAction(`user-${u.id}`);
                                      await runWithReauth(async () => {
                                        await adminFetch(`/api/admin/users/${u.id}/virtual-balance`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ balance: val }),
                                        });
                                        await loadAllAdminData();
                                        flash(`Saved DB Demo balance ($${val.toFixed(2)}) for ${u.email}`);
                                      });
                                      setBusyAction(null);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-[#00A878]/20 text-[#00A878] font-semibold cursor-pointer"
                                  >
                                    {busyAction === `user-${u.id}` ? '...' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#2A2F3D]">
                              <button
                                type="button"
                                onClick={() => openAdjustModal(u)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#00A878]/15 text-[#00A878] font-semibold cursor-pointer"
                              >
                                Adjust +/-
                              </button>
                              <button
                                type="button"
                                onClick={() => openUserActivity(u.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-200 font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3 h-3" /> Activity
                              </button>
                              <button
                                type="button"
                                onClick={() => openFullEditModal(u)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#FF444F]/15 text-[#FF444F] font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" /> Edit All
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleTradingFreeze(u)}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 font-semibold cursor-pointer"
                              >
                                {u.trading_suspended ? 'Unfreeze Trade' : 'Freeze Trade'}
                              </button>
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
                                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer"
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
                                className="p-1.5 text-[#FF444F] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5 inline" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Desktop Table for Users CRUD */}
                  <div className="hidden md:block bg-[#181C25] border border-[#2A2F3D] rounded-2xl overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#2A2F3D] text-slate-400">
                          <th className="text-left px-4 py-3">Display Profile Name &amp; Trader</th>
                          <th className="text-left px-4 py-3">Status</th>
                          <th className="text-right px-4 py-3 text-[#FF444F]">Real Account &amp; Bal (DB)</th>
                          <th className="text-right px-4 py-3 text-[#00A878]">Demo Account &amp; Bal (DB)</th>
                          <th className="text-right px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2A2F3D]">
                        {filteredUsers.map((u: any) => {
                          let parsedRw = 0;
                          try {
                            parsedRw = Number(JSON.parse(u.real_wallets_json || '{}').options ?? 0);
                          } catch {
                            parsedRw = 0;
                          }
                          const matchedAccounts = (overview?.connectedAccounts || []).filter((a: any) => a.user_id === u.id);
                          const matchedReal = matchedAccounts.filter((a: any) => !a.is_virtual);
                          const matchedDemo = matchedAccounts.filter((a: any) => Boolean(a.is_virtual));

                          return (
                            <tr key={u.id}>
                              <td className="px-4 py-3 min-w-[230px]">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <input
                                    type="text"
                                    value={userNames[u.id] ?? u.full_name ?? ''}
                                    onChange={(e) => setUserNames((prev) => ({ ...prev, [u.id]: e.target.value }))}
                                    placeholder="Display Profile Name"
                                    className="w-40 px-2 py-1 rounded-lg bg-[#111319] border border-[#2A2F3D] font-bold text-xs text-white"
                                  />
                                  <button
                                    type="button"
                                    disabled={busyAction === `uname-${u.id}`}
                                    onClick={async () => {
                                      const nextName = String(userNames[u.id] ?? u.full_name ?? '').trim();
                                      if (!nextName) {
                                        flash('Display profile name cannot be empty', 'err');
                                        return;
                                      }
                                      setBusyAction(`uname-${u.id}`);
                                      try {
                                        await adminFetch(`/api/admin/users/${u.id}`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ full_name: nextName }),
                                        });
                                        await loadAllAdminData();
                                        flash(`Display profile name updated for ${u.email}`);
                                      } catch (err) {
                                        flash(err instanceof Error ? err.message : 'Failed to save name', 'err');
                                      } finally {
                                        setBusyAction(null);
                                      }
                                    }}
                                    className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold cursor-pointer whitespace-nowrap"
                                  >
                                    {busyAction === `uname-${u.id}` ? '...' : 'Save'}
                                  </button>
                                </div>
                                <p className="text-slate-400">
                                  {u.email}
                                  {u.deriv_nickname ? ` · @${u.deriv_nickname}` : ''}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1 items-start">
                                  <span className={u.status === 'active' ? 'text-[#00A878] font-semibold' : 'text-[#FF444F] font-semibold'}>
                                    {u.status}
                                  </span>
                                  <span className="text-[10px] font-mono-num text-slate-400">
                                    Pref: {u.preferred_currency || 'USD'}
                                  </span>
                                  {u.trading_suspended && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                                      TRADING FROZEN
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="inline-flex flex-col items-end gap-1">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={realBalances[u.id] ?? parsedRw.toFixed(2)}
                                      onChange={(e) =>
                                        setRealBalances((prev) => ({ ...prev, [u.id]: e.target.value }))
                                      }
                                      className="w-24 px-2 py-1.5 rounded-lg bg-[#111319] border border-[#2A2F3D] font-mono-num text-right text-xs"
                                    />
                                    <button
                                      type="button"
                                      disabled={busyAction === `real-${u.id}`}
                                      onClick={async () => {
                                        const val = Number(realBalances[u.id] ?? parsedRw);
                                        if (Number.isNaN(val) || val < 0) {
                                          flash('Enter a valid non-negative Real balance', 'err');
                                          return;
                                        }
                                        setBusyAction(`real-${u.id}`);
                                        await runWithReauth(async () => {
                                          await adminFetch(`/api/admin/users/${u.id}/real-balance`, {
                                            method: 'PATCH',
                                            body: JSON.stringify({ balance: val }),
                                          });
                                          await loadAllAdminData();
                                          flash(`Saved DB Real balance ($${val.toFixed(2)}) for ${u.email}`);
                                        });
                                        setBusyAction(null);
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-[#FF444F]/20 hover:bg-[#FF444F]/30 text-[#FF444F] font-semibold cursor-pointer whitespace-nowrap"
                                    >
                                      {busyAction === `real-${u.id}` ? '...' : 'Save Real'}
                                    </button>
                                  </div>
                                  {matchedReal.length > 0 && (
                                    <div className="flex flex-wrap justify-end gap-1">
                                      {matchedReal.map((a: any) => (
                                        <span
                                          key={a.id}
                                          className="px-1.5 py-0.5 rounded bg-[#FF444F]/10 border border-[#FF444F]/25 text-[#FF444F] text-[10px] font-mono-num"
                                        >
                                          {a.deriv_login_id || a.deriv_account_id} · {a.account_type}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="inline-flex flex-col items-end gap-1">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={userBalances[u.id] ?? String(Number(u.virtual_workspace_balance ?? 0).toFixed(2))}
                                      onChange={(e) =>
                                        setUserBalances((prev) => ({ ...prev, [u.id]: e.target.value }))
                                      }
                                      className="w-24 px-2 py-1.5 rounded-lg bg-[#111319] border border-[#2A2F3D] font-mono-num text-right text-xs"
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
                                          flash(`Saved DB Demo balance ($${val.toFixed(2)}) for ${u.email}`);
                                        });
                                        setBusyAction(null);
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-[#00A878]/20 hover:bg-[#00A878]/30 text-[#00A878] font-semibold cursor-pointer whitespace-nowrap"
                                    >
                                      {busyAction === `user-${u.id}` ? '...' : 'Save Demo'}
                                    </button>
                                  </div>
                                  {matchedDemo.length > 0 && (
                                    <div className="flex flex-wrap justify-end gap-1">
                                      {matchedDemo.map((a: any) => (
                                        <span
                                          key={a.id}
                                          className="px-1.5 py-0.5 rounded bg-[#00A878]/10 border border-[#00A878]/25 text-[#00A878] text-[10px] font-mono-num"
                                        >
                                          {a.deriv_login_id || a.deriv_account_id} · {a.account_type}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => openAdjustModal(u)}
                                  className="px-2 py-1 rounded-lg bg-[#00A878]/15 hover:bg-[#00A878]/25 text-[#00A878] font-semibold cursor-pointer"
                                >
                                  Credit/Debit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openUserActivity(u.id)}
                                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" /> Activity
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openFullEditModal(u)}
                                  className="px-2 py-1 rounded-lg bg-[#FF444F]/15 hover:bg-[#FF444F]/25 text-[#FF444F] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" /> Wallets
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleTradingFreeze(u)}
                                  title={u.trading_suspended ? 'Restore Trading Access' : 'Freeze Trading Access'}
                                  className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  {u.trading_suspended ? <PlayCircle className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
                                  {u.trading_suspended ? 'Unfreeze' : 'Freeze'}
                                </button>
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
                                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer"
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
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

          {/* 4. Connected Deriv Accounts — Real and Demo Strictly Separated */}
          {tab === 'accounts' &&
            (() => {
              const allAcc = overview?.connectedAccounts || [];
              const realAcc = allAcc.filter((a: any) => !a.is_virtual);
              const demoAcc = allAcc.filter((a: any) => Boolean(a.is_virtual));

              const renderMobileAccountList = (list: any[], emptyText: string) =>
                list.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-[#181C25] border border-[#2A2F3D] text-center text-xs text-slate-400">
                    {emptyText}
                  </div>
                ) : (
                  list.map((a: any) => (
                    <div key={a.id} className="p-4 rounded-2xl bg-[#181C25] border border-[#2A2F3D] space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono-num font-bold truncate">{a.deriv_login_id || a.deriv_account_id}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              a.is_virtual ? 'bg-[#00A878]/20 text-[#00A878]' : 'bg-[#FF444F]/20 text-[#FF444F]'
                            }`}
                          >
                            {a.is_virtual ? 'DEMO' : 'REAL'}
                          </span>
                          {a.balance_locked_by_admin && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                              Locked
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400">{a.status}</span>
                      </div>

                      <div className="space-y-0.5">
                        <p className="font-semibold text-white truncate">
                          Profile: {a.user_name || a.user_email}
                        </p>
                        <p className="text-slate-400 truncate">{a.user_email}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={accountNames[a.id] ?? a.account_type ?? ''}
                          onChange={(e) => setAccountNames((prev) => ({ ...prev, [a.id]: e.target.value }))}
                          placeholder="Account Display Name"
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#111319] border border-[#2A2F3D] text-xs text-white"
                        />
                        <button
                          type="button"
                          disabled={busyAction === `aname-${a.id}`}
                          onClick={async () => {
                            const nextType = String(accountNames[a.id] ?? a.account_type ?? '').trim();
                            if (!nextType) {
                              flash('Account display name cannot be empty', 'err');
                              return;
                            }
                            setBusyAction(`aname-${a.id}`);
                            try {
                              await adminFetch(`/api/admin/connected-accounts/${a.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ account_type: nextType }),
                              });
                              await loadAllAdminData();
                              flash(`Account display name updated for ${a.deriv_login_id || a.deriv_account_id}`);
                            } catch (err) {
                              flash(err instanceof Error ? err.message : 'Rename failed', 'err');
                            } finally {
                              setBusyAction(null);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold cursor-pointer"
                        >
                          {busyAction === `aname-${a.id}` ? '...' : 'Save Name'}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={accountBalances[a.id] ?? String(Number(a.last_known_balance ?? a.balance ?? 0).toFixed(2))}
                          onChange={(e) => setAccountBalances((prev) => ({ ...prev, [a.id]: e.target.value }))}
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#111319] border border-[#2A2F3D] font-mono-num text-right text-xs"
                        />
                        <span className="text-slate-400 font-mono-num">{a.currency || 'USD'}</span>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
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
                              flash(`Saved & DB Locked ${a.deriv_login_id || a.deriv_account_id}`);
                            });
                            setBusyAction(null);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#00A878]/20 text-[#00A878] font-semibold cursor-pointer"
                        >
                          Save DB Bal
                        </button>
                        <button
                          type="button"
                          disabled={busyAction === `sync-${a.id}`}
                          onClick={async () => {
                            setBusyAction(`sync-${a.id}`);
                            try {
                              await adminFetch(`/api/admin/connected-accounts/${a.id}/sync`, { method: 'POST' });
                              await loadAllAdminData();
                              flash(`Unlocked & synced live balance`);
                            } catch (err) {
                              flash(err instanceof Error ? err.message : 'Sync failed', 'err');
                            } finally {
                              setBusyAction(null);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/5 cursor-pointer"
                        >
                          Sync Live
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const nextStatus = a.status === 'frozen' ? 'active' : 'frozen';
                            await adminFetch(`/api/admin/connected-accounts/${a.id}/status`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: nextStatus }),
                            });
                            await loadAllAdminData();
                            flash(`Account ${a.deriv_login_id || a.deriv_account_id} marked ${nextStatus}`);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 font-semibold cursor-pointer"
                        >
                          {a.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await adminFetch(`/api/admin/connected-accounts/${a.id}/revoke`, { method: 'POST' });
                            loadAllAdminData();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#FF444F]/15 text-[#FF444F] cursor-pointer"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))
                );

              const renderDesktopAccountTable = (list: any[], title: string, accentClass: string, emptyText: string) => (
                <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl overflow-x-auto">
                  <div className="px-4 py-3 border-b border-[#2A2F3D] flex items-center justify-between">
                    <h3 className={`text-xs font-bold uppercase tracking-wider ${accentClass}`}>
                      {title} ({list.length})
                    </h3>
                  </div>
                  {list.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">{emptyText}</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#2A2F3D] text-slate-400">
                          <th className="text-left px-4 py-3">Account &amp; Display Name</th>
                          <th className="text-left px-4 py-3">Display Profile Name &amp; Email</th>
                          <th className="text-right px-4 py-3">DB Balance</th>
                          <th className="text-right px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2A2F3D]">
                        {list.map((a: any) => (
                          <tr key={a.id}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <p className="font-mono-num font-bold">{a.deriv_login_id || a.deriv_account_id}</p>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    a.is_virtual ? 'bg-[#00A878]/20 text-[#00A878]' : 'bg-[#FF444F]/20 text-[#FF444F]'
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
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={accountNames[a.id] ?? a.account_type ?? ''}
                                  onChange={(e) => setAccountNames((prev) => ({ ...prev, [a.id]: e.target.value }))}
                                  className="w-40 px-2 py-1 rounded-lg bg-[#111319] border border-[#2A2F3D] text-xs text-white"
                                />
                                <button
                                  type="button"
                                  disabled={busyAction === `aname-${a.id}`}
                                  onClick={async () => {
                                    const nextType = String(accountNames[a.id] ?? a.account_type ?? '').trim();
                                    if (!nextType) {
                                      flash('Account display name cannot be empty', 'err');
                                      return;
                                    }
                                    setBusyAction(`aname-${a.id}`);
                                    try {
                                      await adminFetch(`/api/admin/connected-accounts/${a.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ account_type: nextType }),
                                      });
                                      await loadAllAdminData();
                                      flash(`Updated account display name for ${a.deriv_login_id || a.deriv_account_id}`);
                                    } catch (err) {
                                      flash(err instanceof Error ? err.message : 'Rename failed', 'err');
                                    } finally {
                                      setBusyAction(null);
                                    }
                                  }}
                                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold cursor-pointer whitespace-nowrap"
                                >
                                  {busyAction === `aname-${a.id}` ? '...' : 'Save Name'}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-white">{a.user_name || a.user_email}</p>
                              <p className="text-slate-400 text-[11px]">{a.user_email} · {a.status}</p>
                            </td>
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
                                  const nextStatus = a.status === 'frozen' ? 'active' : 'frozen';
                                  await adminFetch(`/api/admin/connected-accounts/${a.id}/status`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ status: nextStatus }),
                                  });
                                  await loadAllAdminData();
                                  flash(`Account ${a.deriv_login_id || a.deriv_account_id} marked ${nextStatus}`);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-semibold cursor-pointer"
                              >
                                {a.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
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
                  )}
                </div>
              );

              return (
                <div className="space-y-5">
                  <div className="md:hidden space-y-4">
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#FF444F]">
                        Real Accounts ({realAcc.length})
                      </h3>
                      {renderMobileAccountList(realAcc, 'No real connected accounts yet.')}
                    </div>
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#00A878]">
                        Demo Accounts ({demoAcc.length})
                      </h3>
                      {renderMobileAccountList(demoAcc, 'No demo connected accounts yet.')}
                    </div>
                  </div>

                  <div className="hidden md:block space-y-5">
                    {renderDesktopAccountTable(realAcc, 'Real Accounts (LIVE)', 'text-[#FF444F]', 'No real connected accounts yet.')}
                    {renderDesktopAccountTable(demoAcc, 'Demo Accounts (VIRTUAL)', 'text-[#00A878]', 'No demo connected accounts yet.')}
                  </div>
                </div>
              );
            })()}

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

          {/* 6. Orders Oversight (Immutable Closed Audit Ledger) */}
          {tab === 'orders' &&
            (() => {
              const sourceOrders = serverTrades ?? (overview?.orders || []);
              const uQ = orderUserFilter.trim().toLowerCase();
              const sQ = orderSymbolFilter.trim().toUpperCase();
              const filteredOrders = sourceOrders.filter((o: any) => {
                if (orderStatusFilter !== 'ALL' && o.status !== orderStatusFilter) return false;
                if (orderModeFilter !== 'ALL' && (o.account_mode || 'demo') !== orderModeFilter) return false;
                if (sQ && !String(o.symbol || '').toUpperCase().includes(sQ)) return false;
                if (uQ && !String(o.user_email || '').toLowerCase().includes(uQ) && !String(o.id).includes(uQ)) return false;
                return true;
              });

              const runServerOrderQuery = async () => {
                const params = new URLSearchParams();
                if (sQ) params.set('symbol', sQ);
                if (orderStatusFilter !== 'ALL') params.set('status', orderStatusFilter);
                if (orderModeFilter !== 'ALL') params.set('accountMode', orderModeFilter);
                try {
                  const res = await adminFetch<{ orders: any[] }>(`/api/admin/trades?${params.toString()}`);
                  setServerTrades(res.orders || []);
                } catch (err) {
                  flash(err instanceof Error ? err.message : 'Failed to query trades', 'err');
                }
              };

              return (
                <div className="space-y-4">
                  <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-4 flex flex-wrap items-center gap-3 text-xs">
                    <input
                      type="text"
                      placeholder="Filter by trader email or #ID..."
                      value={orderUserFilter}
                      onChange={(e) => setOrderUserFilter(e.target.value)}
                      className="flex-1 min-w-[180px] px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                    />
                    <input
                      type="text"
                      placeholder="Symbol (e.g. 1HZ100V)"
                      value={orderSymbolFilter}
                      onChange={(e) => setOrderSymbolFilter(e.target.value)}
                      className="w-36 px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num"
                    />
                    <select
                      value={orderStatusFilter}
                      onChange={(e) => setOrderStatusFilter(e.target.value as any)}
                      className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="OPEN">OPEN</option>
                      <option value="CLOSED">CLOSED</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                    <select
                      value={orderModeFilter}
                      onChange={(e) => setOrderModeFilter(e.target.value as any)}
                      className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                    >
                      <option value="ALL">Demo &amp; Real</option>
                      <option value="demo">Demo</option>
                      <option value="real">Real</option>
                    </select>
                    <button
                      type="button"
                      onClick={runServerOrderQuery}
                      className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 font-semibold cursor-pointer"
                    >
                      Query Server ({filteredOrders.length})
                    </button>
                  </div>

                  <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#2A2F3D] text-slate-400">
                          <th className="text-left px-4 py-3">Order</th>
                          <th className="text-left px-4 py-3">Trader</th>
                          <th className="text-left px-4 py-3">Mode</th>
                          <th className="text-right px-4 py-3">Entry → Exit</th>
                          <th className="text-right px-4 py-3">Stake</th>
                          <th className="text-right px-4 py-3">P/L</th>
                          <th className="text-right px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2A2F3D]">
                        {filteredOrders.map((o: any) => (
                          <tr key={o.id}>
                            <td className="px-4 py-3">
                              <strong>#{o.id} {o.symbol}</strong> ({o.side} · {o.status})
                              {o.notes && <p className="text-[10px] text-amber-300 mt-0.5 truncate max-w-[200px]">Note: {o.notes}</p>}
                            </td>
                            <td className="px-4 py-3">{o.user_email}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  o.account_mode === 'real' ? 'bg-[#FF444F]/20 text-[#FF444F]' : 'bg-slate-700/60 text-slate-300'
                                }`}
                              >
                                {o.account_mode || 'demo'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono-num text-slate-300">
                              {Number(o.entry_price || 0).toFixed(2)} →{' '}
                              {o.exit_price !== null && o.exit_price !== undefined ? Number(o.exit_price).toFixed(2) : 'LIVE'}
                            </td>
                            <td className="px-4 py-3 text-right font-mono-num">${Number(o.stake || 0).toFixed(2)}</td>
                            <td className={`px-4 py-3 text-right font-mono-num font-bold ${Number(o.pnl) >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                              {Number(o.pnl || 0) >= 0 ? '+' : ''}${Number(o.pnl || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingOrder({
                                    id: o.id,
                                    symbol: o.symbol,
                                    side: o.side,
                                    user_email: o.user_email,
                                    account_mode: o.account_mode || 'demo',
                                    status: o.status,
                                    entry_price: Number(o.entry_price || 0),
                                    exit_price: o.exit_price ?? o.current_price ?? o.entry_price ?? 0,
                                    stake: Number(o.stake || 0),
                                    pnl: Number(o.pnl || 0),
                                    notes: o.notes || '',
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3 h-3" /> Inspect / Notes
                              </button>
                              {o.status === 'OPEN' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await adminFetch(`/api/admin/orders/${o.id}/close`, { method: 'POST' });
                                    loadAllAdminData();
                                    flash(`Order #${o.id} settled & closed`);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#FF444F]/15 text-[#FF444F] cursor-pointer"
                                >
                                  Force Close
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

          {/* 6b. Trading Engine Control (Admin Only) */}
          {tab === 'engine' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await adminFetch('/api/admin/settings/trading-engine', {
                    method: 'PUT',
                    body: JSON.stringify(engineConfig),
                  });
                  await loadAllAdminData();
                  flash('Trading Engine win-bias & settlement parameters saved to PostgreSQL');
                } catch (err) {
                  flash(err instanceof Error ? err.message : 'Failed to update engine config', 'err');
                }
              }}
              className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-6 space-y-6 max-w-4xl"
            >
              <div>
                <h2 className="font-display text-base font-bold">Execution Win-Rate &amp; Settlement Engine</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Admin-exclusive controls governing Deriv Bot cycles, Market Analyser synced entries, Accumulators growth targets, and manual Options settlement probabilities. Changes take effect immediately across Demo &amp; DB-settled Real accounts.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'botWinRatePct', label: 'Deriv Bot Cycle Win Rate (%)', desc: 'Applies to automated Bot Builder strategies' },
                  { key: 'analyserWinRatePct', label: 'Analyser Live Sync Win Rate (%)', desc: 'Higher accuracy when Analyser Sync is enabled' },
                  { key: 'accuWinRatePct', label: 'Accumulators Target Win Rate (%)', desc: 'Governs tick growth survival & take-profit hits' },
                  { key: 'manualOptionsWinRatePct', label: 'Manual Options & SmartTrader Win Rate (%)', desc: 'Controls manual digital/options contract settlement' },
                ].map((item) => {
                  const val = Number((engineConfig as any)[item.key] ?? 75);
                  return (
                    <div key={item.key} className="p-4 rounded-xl bg-[#111319] border border-[#2A2F3D] space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-200">{item.label}</label>
                        <span className="font-mono-num text-sm font-bold text-[#00A878]">{val}%</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={96}
                        value={val}
                        onChange={(e) =>
                          setEngineConfig((prev) => ({ ...prev, [item.key]: Number(e.target.value) }))
                        }
                        className="w-full accent-[#FF444F] cursor-pointer"
                      />
                      <p className="text-[11px] text-slate-400">{item.desc}</p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-start gap-3 p-4 rounded-xl bg-[#111319] border border-[#2A2F3D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={engineConfig.siteSettlementForLockedReal}
                    onChange={(e) =>
                      setEngineConfig((prev) => ({ ...prev, siteSettlementForLockedReal: e.target.checked }))
                    }
                    className="mt-0.5 accent-[#FF444F]"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">DB Settlement for Admin-Adjusted Real Balances</span>
                    <span className="text-[11px] text-slate-400">
                      Allows Real-mode trades, bots, and SmartTrader orders to settle smoothly against Admin-managed Real balances in PostgreSQL.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 rounded-xl bg-[#111319] border border-[#2A2F3D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={engineConfig.liveMicroTickEnabled}
                    onChange={(e) =>
                      setEngineConfig((prev) => ({ ...prev, liveMicroTickEnabled: e.target.checked }))
                    }
                    className="mt-0.5 accent-[#00A878]"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Live Micro-Tick Continuity Feed</span>
                    <span className="text-[11px] text-slate-400">
                      Maintains continuous sub-second live market movement and P/L tracking across all charts and market lists.
                    </span>
                  </div>
                </label>
              </div>

              <button type="submit" className="px-6 py-2.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-xs font-bold cursor-pointer">
                Save Engine Configuration
              </button>
            </form>
          )}

          {/* 6c. Instruments & Pricing Overrides */}
          {tab === 'markets' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#181C25] border border-[#2A2F3D] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-bold">Market Instruments &amp; Spot Overrides</h2>
                  <p className="text-xs text-slate-400">
                    Edit display names, spot price overrides, spreads, stake limits, or active market visibility across all trader screens.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadAllAdminData}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Sync Market Table
                </button>
              </div>

              <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#2A2F3D] text-slate-400">
                      <th className="text-left px-4 py-3">Symbol / Category</th>
                      <th className="text-left px-4 py-3">Display Name</th>
                      <th className="text-right px-4 py-3">Spot Price</th>
                      <th className="text-right px-4 py-3">Spread</th>
                      <th className="text-right px-4 py-3">Min / Max Stake</th>
                      <th className="text-center px-4 py-3">Active</th>
                      <th className="text-right px-4 py-3">Save</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A2F3D]">
                    {instrumentsList.map((inst: any) => {
                      const edit = instrumentEdits[inst.symbol] || {
                        display_name: inst.display_name,
                        price: String(inst.price ?? 0),
                        spread: String(inst.spread ?? 0.5),
                        min_stake: String(inst.min_stake ?? 0.35),
                        max_stake: String(inst.max_stake ?? 50000),
                        is_active: inst.is_active !== false,
                      };
                      const updateField = (field: string, val: any) =>
                        setInstrumentEdits((prev) => ({
                          ...prev,
                          [inst.symbol]: { ...edit, [field]: val },
                        }));

                      return (
                        <tr key={inst.symbol}>
                          <td className="px-4 py-2.5">
                            <p className="font-mono-num font-bold text-white">{inst.symbol}</p>
                            <p className="text-[10px] text-slate-400 uppercase">{inst.category}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="text"
                              value={edit.display_name}
                              onChange={(e) => updateField('display_name', e.target.value)}
                              className="w-40 px-2.5 py-1.5 rounded-lg bg-[#111319] border border-[#2A2F3D] text-xs"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="number"
                              step="any"
                              value={edit.price}
                              onChange={(e) => updateField('price', e.target.value)}
                              className="w-28 px-2.5 py-1.5 rounded-lg bg-[#111319] border border-[#2A2F3D] font-mono-num text-right text-xs"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="number"
                              step="any"
                              value={edit.spread}
                              onChange={(e) => updateField('spread', e.target.value)}
                              className="w-20 px-2 py-1.5 rounded-lg bg-[#111319] border border-[#2A2F3D] font-mono-num text-right text-xs"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                step="any"
                                value={edit.min_stake}
                                onChange={(e) => updateField('min_stake', e.target.value)}
                                className="w-16 px-2 py-1.5 rounded-lg bg-[#111319] border border-[#2A2F3D] font-mono-num text-right text-xs"
                              />
                              <span className="text-slate-500">/</span>
                              <input
                                type="number"
                                step="any"
                                value={edit.max_stake}
                                onChange={(e) => updateField('max_stake', e.target.value)}
                                className="w-20 px-2 py-1.5 rounded-lg bg-[#111319] border border-[#2A2F3D] font-mono-num text-right text-xs"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={edit.is_active}
                              onChange={(e) => updateField('is_active', e.target.checked)}
                              className="accent-[#00A878] cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              disabled={busyAction === `inst-${inst.symbol}`}
                              onClick={async () => {
                                setBusyAction(`inst-${inst.symbol}`);
                                try {
                                  await adminFetch(`/api/admin/instruments/${encodeURIComponent(inst.symbol)}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({
                                      display_name: edit.display_name,
                                      price: Number(edit.price),
                                      spread: Number(edit.spread),
                                      min_stake: Number(edit.min_stake),
                                      max_stake: Number(edit.max_stake),
                                      is_active: edit.is_active,
                                    }),
                                  });
                                  await loadAllAdminData();
                                  flash(`Updated ${inst.symbol} pricing & settings`);
                                } catch (err) {
                                  flash(err instanceof Error ? err.message : 'Update failed', 'err');
                                } finally {
                                  setBusyAction(null);
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#00A878]/20 hover:bg-[#00A878]/30 text-[#00A878] font-semibold cursor-pointer"
                            >
                              {busyAction === `inst-${inst.symbol}` ? '...' : 'Save'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
                  try {
                    await adminFetch('/api/admin/settings/branding', {
                      method: 'PUT',
                      body: JSON.stringify({
                        appName,
                        tagline,
                        heroTitle,
                        heroSubtitle,
                        heroDescription,
                        supportEmail,
                        supportPhone,
                      }),
                    });
                    await adminFetch('/api/admin/settings/global', {
                      method: 'PUT',
                      body: JSON.stringify({
                        kesRate: Number(kesRate),
                        tickerText,
                        adminPrivateSlug: adminSlug,
                        defaultVirtualBalance: Number(defaultVirtualBalance),
                        allowRegistration,
                        maintenanceMode,
                      }),
                    });
                    await loadAllAdminData();
                    flash('All Branding & Global platform settings saved');
                  } catch (err) {
                    flash(err instanceof Error ? err.message : 'Save failed', 'err');
                  }
                }}
                className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-5 space-y-4"
              >
                <h2 className="font-display text-sm font-bold">Platform Branding &amp; Global Config</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <label className="block text-xs text-slate-400 mb-1">Support Email</label>
                    <input
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Support Phone</label>
                    <input
                      type="text"
                      value={supportPhone}
                      onChange={(e) => setSupportPhone(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Default Demo Balance (USD)</label>
                    <input
                      type="number"
                      step="1"
                      value={defaultVirtualBalance}
                      onChange={(e) => setDefaultVirtualBalance(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Brand Tagline</label>
                  <input
                    type="text"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Landing Hero Title</label>
                  <input
                    type="text"
                    value={heroTitle}
                    onChange={(e) => setHeroTitle(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Landing Hero Subtitle</label>
                  <input
                    type="text"
                    value={heroSubtitle}
                    onChange={(e) => setHeroSubtitle(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Landing Hero Description</label>
                  <textarea
                    rows={2}
                    value={heroDescription}
                    onChange={(e) => setHeroDescription(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowRegistration}
                      onChange={(e) => setAllowRegistration(e.target.checked)}
                      className="accent-[#00A878]"
                    />
                    <span>Allow New Registrations</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maintenanceMode}
                      onChange={(e) => setMaintenanceMode(e.target.checked)}
                      className="accent-[#FF444F]"
                    />
                    <span>Maintenance Mode</span>
                  </label>
                </div>
                <button type="submit" className="px-6 py-2.5 rounded-full bg-[#FF444F] text-xs font-bold cursor-pointer">
                  Save All Branding &amp; Global Settings
                </button>
              </form>

              <div className="space-y-6">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await runWithReauth(async () => {
                      await adminFetch('/api/admin/settings/admin-credentials', {
                        method: 'PUT',
                        body: JSON.stringify({ email: newAdminEmail || undefined, password: newAdminPassword || undefined }),
                      });
                      setNewAdminPassword('');
                      flash('Administrator credentials updated');
                    });
                  }}
                  className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-5 space-y-4"
                >
                  <h2 className="font-display text-sm font-bold">My Administrator Credentials</h2>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">New Email (optional)</label>
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

                <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-sm font-bold flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-[#FF444F]" /> Console Team ({adminsList.length})
                    </h2>
                    <span className="text-[11px] text-slate-400">Owner + Admin Operators</span>
                  </div>
                  <div className="divide-y divide-[#2A2F3D] text-xs">
                    {adminsList.map((adm) => (
                      <div key={adm.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-bold">{adm.full_name}</p>
                          <p className="text-slate-400">{adm.email}</p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded uppercase text-[10px] font-bold ${
                            adm.role === 'owner' ? 'bg-[#FF444F]/20 text-[#FF444F]' : 'bg-[#00A878]/20 text-[#00A878]'
                          }`}
                        >
                          {adm.role}
                        </span>
                      </div>
                    ))}
                  </div>

                  {adminUser.role === 'owner' && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await runWithReauth(async () => {
                          await adminFetch('/api/admin/admins', {
                            method: 'POST',
                            body: JSON.stringify({
                              email: createAdminEmail,
                              full_name: createAdminName || 'Operations Admin',
                              password: createAdminPassword,
                            }),
                          });
                          setCreateAdminEmail('');
                          setCreateAdminName('');
                          setCreateAdminPassword('');
                          await loadAllAdminData();
                          flash('New administrator provisioned');
                        });
                      }}
                      className="pt-3 border-t border-[#2A2F3D] space-y-3 text-xs"
                    >
                      <p className="font-bold text-slate-200">Provision New Operations Admin (Owner Only)</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Full Name"
                          value={createAdminName}
                          onChange={(e) => setCreateAdminName(e.target.value)}
                          className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                        />
                        <input
                          type="email"
                          required
                          placeholder="Admin Email"
                          value={createAdminEmail}
                          onChange={(e) => setCreateAdminEmail(e.target.value)}
                          className="px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                        />
                      </div>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="Strong Initial Password (min 8 chars)"
                        value={createAdminPassword}
                        onChange={(e) => setCreateAdminPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                      />
                      <button type="submit" className="px-5 py-2 rounded-full bg-[#FF444F] text-xs font-bold cursor-pointer">
                        Create Admin Operator
                      </button>
                    </form>
                  )}
                </div>
              </div>
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
                <h2 className="font-display text-sm font-bold mb-2">Immutable Admin Audit Trail</h2>
                <div className="max-h-[480px] overflow-y-auto divide-y divide-[#2A2F3D]">
                  {(overview?.auditLogs || []).slice(0, 50).map((l: any) => (
                    <div key={l.id} className="py-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white">
                          {l.action} · {l.target_type} #{l.target_id}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            l.action_result === 'denied' ? 'bg-[#FF444F]/20 text-[#FF444F]' : 'bg-[#00A878]/20 text-[#00A878]'
                          }`}
                        >
                          {l.action_result || 'success'}
                        </span>
                      </div>
                      {(l.previous_value || l.new_value) && (
                        <p className="text-[11px] font-mono-num text-slate-300">
                          {l.previous_value || '—'} → {l.new_value || '—'}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{l.admin_email || `Admin #${l.admin_user_id}`} · IP {l.ip_address || '—'}</span>
                        <span>{new Date(l.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-4 space-y-2">
                <h2 className="font-display text-sm font-bold mb-2">Email Dispatch Logs</h2>
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
                        Attempts: {diagnostics.deriv?.reconnectAttempts ?? 0} · Symbols:{' '}
                        {diagnostics.deriv?.subscribedSymbolsCount ??
                          (Array.isArray(diagnostics.deriv?.subscribedSymbols)
                            ? diagnostics.deriv.subscribedSymbols.length
                            : diagnostics.deriv?.subscribedSymbols) ??
                          0}
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

      {/* Full User Profile & All-Wallets Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold">Edit Trader Profile &amp; All Wallets</h3>
                <p className="text-xs text-slate-400">#{editingUser.id} · {editingUser.email}</p>
              </div>
              <button type="button" onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusyAction('edit-user-modal');
                await runWithReauth(async () => {
                  await adminFetch(`/api/admin/users/${editingUser.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      full_name: editingUser.full_name,
                      deriv_nickname: editingUser.deriv_nickname || '',
                      preferred_currency: editingUser.preferred_currency || 'USD',
                      email: editingUser.email,
                      phone: editingUser.phone || '',
                      country: editingUser.country || '',
                      role: editingUser.role || 'user',
                      status: editingUser.status || 'active',
                      password: editingUser.password?.trim().length >= 6 ? editingUser.password.trim() : undefined,
                      virtual_workspace_balance: Number(editingUser.virtual_workspace_balance ?? 0),
                      demo_wallets: {
                        mt5_standard: Number(editingUser.demo_wallets?.mt5_standard ?? 0),
                        mt5_gold: Number(editingUser.demo_wallets?.mt5_gold ?? 0),
                        exchange_usdt: Number(editingUser.demo_wallets?.exchange_usdt ?? 0),
                      },
                      real_wallets: {
                        options: Number(editingUser.real_wallets?.options ?? 0),
                        mt5_standard: Number(editingUser.real_wallets?.mt5_standard ?? 0),
                        mt5_gold: Number(editingUser.real_wallets?.mt5_gold ?? 0),
                        exchange_usdt: Number(editingUser.real_wallets?.exchange_usdt ?? 0),
                      },
                      exchange_balances: editingUser.exchange_balances,
                      real_exchange_balances: editingUser.real_exchange_balances,
                    }),
                  });
                  setEditingUser(null);
                  await loadAllAdminData();
                  flash('Trader profile & all wallets synced to PostgreSQL');
                });
                setBusyAction(null);
              }}
              className="space-y-4 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Display Profile Name (Full Name)</label>
                  <input
                    type="text"
                    required
                    value={editingUser.full_name || ''}
                    onChange={(e) => setEditingUser((p: any) => ({ ...p, full_name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Deriv Nickname / Handle</label>
                  <input
                    type="text"
                    value={editingUser.deriv_nickname || ''}
                    onChange={(e) => setEditingUser((p: any) => ({ ...p, deriv_nickname: e.target.value }))}
                    placeholder="e.g. TraderPro"
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser((p: any) => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Preferred Currency</label>
                  <select
                    value={editingUser.preferred_currency || 'USD'}
                    onChange={(e) => setEditingUser((p: any) => ({ ...p, preferred_currency: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                  >
                    <option value="USD">USD (US Dollar)</option>
                    <option value="KSH">KSH (Kenyan Shilling)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editingUser.phone || ''}
                    onChange={(e) => setEditingUser((p: any) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Country</label>
                  <input
                    type="text"
                    value={editingUser.country || ''}
                    onChange={(e) => setEditingUser((p: any) => ({ ...p, country: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Status</label>
                  <select
                    value={editingUser.status || 'active'}
                    onChange={(e) => setEditingUser((p: any) => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Reset Password (optional, min 6 chars)</label>
                  <input
                    type="password"
                    placeholder="Leave blank to keep unchanged"
                    value={editingUser.password || ''}
                    onChange={(e) => setEditingUser((p: any) => ({ ...p, password: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                  />
                </div>
              </div>

              {(() => {
                const userAccounts = (overview?.connectedAccounts || []).filter((a: any) => a.user_id === editingUser.id);
                const realMatched = userAccounts.filter((a: any) => !a.is_virtual);
                const demoMatched = userAccounts.filter((a: any) => Boolean(a.is_virtual));

                return (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#111319] border border-[#FF444F]/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-[#FF444F]">Real Wallets &amp; Matched Real Accounts (USD)</p>
                        <span className="text-[10px] font-mono-num text-slate-400">{realMatched.length} connected</span>
                      </div>

                      {realMatched.length > 0 && (
                        <div className="space-y-2 pb-2 border-b border-white/5">
                          {realMatched.map((a: any) => (
                            <div key={a.id} className="flex items-center gap-2">
                              <span className="px-2 py-1 rounded bg-[#FF444F]/15 text-[#FF444F] font-mono-num text-[10px] font-bold shrink-0">
                                {a.deriv_login_id || a.deriv_account_id}
                              </span>
                              <input
                                type="text"
                                value={accountNames[a.id] ?? a.account_type ?? ''}
                                onChange={(e) => setAccountNames((prev) => ({ ...prev, [a.id]: e.target.value }))}
                                className="flex-1 px-2.5 py-1 rounded-lg bg-[#181C25] border border-[#2A2F3D] text-xs"
                              />
                              <span className="text-slate-400 font-mono-num text-[11px] shrink-0">
                                {Number(a.last_known_balance ?? a.balance ?? 0).toFixed(2)} {a.currency || 'USD'}
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  const nextType = String(accountNames[a.id] ?? a.account_type ?? '').trim();
                                  if (!nextType) return;
                                  await adminFetch(`/api/admin/connected-accounts/${a.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ account_type: nextType }),
                                  });
                                  await loadAllAdminData();
                                  flash(`Renamed ${a.deriv_login_id || a.deriv_account_id}`);
                                }}
                                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold cursor-pointer shrink-0"
                              >
                                Save Name
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Options &amp; Bot Real</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editingUser.real_wallets?.options ?? 0}
                            onChange={(e) =>
                              setEditingUser((p: any) => ({
                                ...p,
                                real_wallets: { ...p.real_wallets, options: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#181C25] border border-[#2A2F3D] font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">MT5 Standard Real</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editingUser.real_wallets?.mt5_standard ?? 0}
                            onChange={(e) =>
                              setEditingUser((p: any) => ({
                                ...p,
                                real_wallets: { ...p.real_wallets, mt5_standard: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#181C25] border border-[#2A2F3D] font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">MT5 Gold Real</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editingUser.real_wallets?.mt5_gold ?? 0}
                            onChange={(e) =>
                              setEditingUser((p: any) => ({
                                ...p,
                                real_wallets: { ...p.real_wallets, mt5_gold: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#181C25] border border-[#2A2F3D] font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Exchange USDT Real</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editingUser.real_wallets?.exchange_usdt ?? 0}
                            onChange={(e) =>
                              setEditingUser((p: any) => ({
                                ...p,
                                real_wallets: { ...p.real_wallets, exchange_usdt: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#181C25] border border-[#2A2F3D] font-mono-num"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-[#111319] border border-[#00A878]/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-[#00A878]">Demo Wallets &amp; Matched Demo Accounts (USD)</p>
                        <span className="text-[10px] font-mono-num text-slate-400">{demoMatched.length} connected</span>
                      </div>

                      {demoMatched.length > 0 && (
                        <div className="space-y-2 pb-2 border-b border-white/5">
                          {demoMatched.map((a: any) => (
                            <div key={a.id} className="flex items-center gap-2">
                              <span className="px-2 py-1 rounded bg-[#00A878]/15 text-[#00A878] font-mono-num text-[10px] font-bold shrink-0">
                                {a.deriv_login_id || a.deriv_account_id}
                              </span>
                              <input
                                type="text"
                                value={accountNames[a.id] ?? a.account_type ?? ''}
                                onChange={(e) => setAccountNames((prev) => ({ ...prev, [a.id]: e.target.value }))}
                                className="flex-1 px-2.5 py-1 rounded-lg bg-[#181C25] border border-[#2A2F3D] text-xs"
                              />
                              <span className="text-slate-400 font-mono-num text-[11px] shrink-0">
                                {Number(a.last_known_balance ?? a.balance ?? 0).toFixed(2)} {a.currency || 'USD'}
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  const nextType = String(accountNames[a.id] ?? a.account_type ?? '').trim();
                                  if (!nextType) return;
                                  await adminFetch(`/api/admin/connected-accounts/${a.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ account_type: nextType }),
                                  });
                                  await loadAllAdminData();
                                  flash(`Renamed ${a.deriv_login_id || a.deriv_account_id}`);
                                }}
                                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold cursor-pointer shrink-0"
                              >
                                Save Name
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Options &amp; Bot Demo</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editingUser.virtual_workspace_balance ?? 0}
                            onChange={(e) => setEditingUser((p: any) => ({ ...p, virtual_workspace_balance: e.target.value }))}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#181C25] border border-[#2A2F3D] font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">MT5 Standard Demo</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editingUser.demo_wallets?.mt5_standard ?? 0}
                            onChange={(e) =>
                              setEditingUser((p: any) => ({
                                ...p,
                                demo_wallets: { ...p.demo_wallets, mt5_standard: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#181C25] border border-[#2A2F3D] font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">MT5 Gold Demo</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editingUser.demo_wallets?.mt5_gold ?? 0}
                            onChange={(e) =>
                              setEditingUser((p: any) => ({
                                ...p,
                                demo_wallets: { ...p.demo_wallets, mt5_gold: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#181C25] border border-[#2A2F3D] font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Exchange USDT Demo</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editingUser.demo_wallets?.exchange_usdt ?? 0}
                            onChange={(e) =>
                              setEditingUser((p: any) => ({
                                ...p,
                                demo_wallets: { ...p.demo_wallets, exchange_usdt: e.target.value },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#181C25] border border-[#2A2F3D] font-mono-num"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'edit-user-modal'}
                  className="px-5 py-2 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold cursor-pointer"
                >
                  {busyAction === 'edit-user-modal' ? 'Saving...' : 'Save & Sync All Balances'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Immutable Order Audit Inspection & Admin Notes Modal */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold">
                  Inspect Order #{editingOrder.id} ({editingOrder.symbol})
                </h3>
                <p className="text-xs text-slate-400">
                  {editingOrder.user_email} · {editingOrder.side} · {(editingOrder.account_mode || 'demo').toUpperCase()}
                </p>
              </div>
              <button type="button" onClick={() => setEditingOrder(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-[#111319] border border-[#2A2F3D] text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Status</span>
                <strong className="font-mono-num">{editingOrder.status}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Stake</span>
                <strong className="font-mono-num">${Number(editingOrder.stake).toFixed(2)}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Entry → Exit Price</span>
                <strong className="font-mono-num">
                  {Number(editingOrder.entry_price).toFixed(3)} → {Number(editingOrder.exit_price).toFixed(3)}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Realized P/L</span>
                <strong className={`font-mono-num ${Number(editingOrder.pnl) >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                  {Number(editingOrder.pnl) >= 0 ? '+' : ''}${Number(editingOrder.pnl).toFixed(2)}
                </strong>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusyAction('edit-order-modal');
                try {
                  await adminFetch(`/api/admin/orders/${editingOrder.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ notes: editingOrder.notes }),
                  });
                  setEditingOrder(null);
                  await loadAllAdminData();
                  flash(`Saved audit notes on Order #${editingOrder.id}`);
                } catch (err) {
                  flash(err instanceof Error ? err.message : 'Update failed', 'err');
                } finally {
                  setBusyAction(null);
                }
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-slate-400 mb-1">Admin Audit Notes (Trade P/L is immutable)</label>
                <textarea
                  rows={3}
                  value={editingOrder.notes}
                  onChange={(e) => setEditingOrder((p: any) => ({ ...p, notes: e.target.value }))}
                  placeholder="Record compliance or settlement review notes..."
                  className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditingOrder(null)} className="px-4 py-2 rounded-xl bg-white/5 cursor-pointer">
                  Close
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'edit-order-modal'}
                  className="px-5 py-2 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold cursor-pointer"
                >
                  {busyAction === 'edit-order-modal' ? 'Saving...' : 'Save Audit Notes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Atomic Credit / Debit Balance Adjustment Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold">Adjust Trader Balance</h3>
                <p className="text-xs text-slate-400">{adjustTarget.user.full_name} · {adjustTarget.user.email}</p>
              </div>
              <button type="button" onClick={() => setAdjustTarget(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusyAction('adjust-bal');
                await runWithReauth(async () => {
                  await adminFetch('/api/admin/balances/adjust', {
                    method: 'POST',
                    body: JSON.stringify({
                      userId: adjustTarget.user.id,
                      accountMode: adjustTarget.accountMode,
                      walletBucket: adjustTarget.walletBucket,
                      operation: adjustTarget.operation,
                      amount: Number(adjustTarget.amount),
                      reason: adjustTarget.reason,
                    }),
                  });
                  setAdjustTarget(null);
                  await loadAllAdminData();
                  flash('Atomic balance adjustment committed & recorded in ledger');
                });
                setBusyAction(null);
              }}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1">Account Mode</label>
                  <select
                    value={adjustTarget.accountMode}
                    onChange={(e) => setAdjustTarget((p) => (p ? { ...p, accountMode: e.target.value as any } : p))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                  >
                    <option value="demo">Demo</option>
                    <option value="real">Real</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Wallet Bucket</label>
                  <select
                    value={adjustTarget.walletBucket}
                    onChange={(e) => setAdjustTarget((p) => (p ? { ...p, walletBucket: e.target.value as any } : p))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                  >
                    <option value="options">Options &amp; Bot</option>
                    <option value="mt5_standard">MT5 Standard</option>
                    <option value="mt5_gold">MT5 Gold</option>
                    <option value="exchange_usdt">Exchange USDT</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1">Operation</label>
                  <select
                    value={adjustTarget.operation}
                    onChange={(e) => setAdjustTarget((p) => (p ? { ...p, operation: e.target.value as any } : p))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                  >
                    <option value="credit">Credit (+)</option>
                    <option value="debit">Debit (-)</option>
                    <option value="set">Set Exact (=)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Amount (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={adjustTarget.amount}
                    onChange={(e) => setAdjustTarget((p) => (p ? { ...p, amount: e.target.value } : p))}
                    className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D] font-mono-num"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Ledger Reason</label>
                <input
                  type="text"
                  required
                  value={adjustTarget.reason}
                  onChange={(e) => setAdjustTarget((p) => (p ? { ...p, reason: e.target.value } : p))}
                  className="w-full px-3 py-2 rounded-xl bg-[#111319] border border-[#2A2F3D]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAdjustTarget(null)} className="px-4 py-2 rounded-xl bg-white/5 cursor-pointer">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'adjust-bal'}
                  className="px-5 py-2 rounded-xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold cursor-pointer"
                >
                  {busyAction === 'adjust-bal' ? 'Applying...' : 'Commit Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Activity Inspection Modal */}
      {(activityData || activityLoading) && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-6 space-y-5 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold">
                  {activityLoading ? 'Loading Trader Activity...' : `Trader Activity · ${activityData?.user?.full_name}`}
                </h3>
                {!activityLoading && activityData?.user && (
                  <p className="text-slate-400">
                    {activityData.user.email} · {activityData.user.deriv_client_id} · Status: {activityData.user.status}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setActivityData(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {activityLoading ? (
              <div className="py-12 text-center text-slate-400">Fetching connected accounts, trades, and ledger history...</div>
            ) : (
              activityData && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-[#111319] border border-[#2A2F3D]">
                    <p className="font-bold text-slate-200 mb-2">Connected Accounts ({(activityData.accounts || []).length})</p>
                    {(activityData.accounts || []).length === 0 ? (
                      <p className="text-slate-400">No linked accounts.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {activityData.accounts.map((acc: any) => (
                          <div key={acc.id} className="flex items-center justify-between">
                            <span className="font-mono-num">
                              {acc.deriv_login_id} ({acc.is_virtual ? 'DEMO' : 'REAL'} · {acc.status})
                            </span>
                            <strong className="font-mono-num">${Number(acc.last_known_balance ?? acc.balance ?? 0).toFixed(2)} {acc.currency}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#111319] border border-[#2A2F3D]">
                    <p className="font-bold text-slate-200 mb-2">Recent Trades ({(activityData.orders || []).length})</p>
                    {(activityData.orders || []).length === 0 ? (
                      <p className="text-slate-400">No orders placed yet.</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto divide-y divide-[#2A2F3D]">
                        {activityData.orders.map((ord: any) => (
                          <div key={ord.id} className="py-1.5 flex items-center justify-between">
                            <span>
                              #{ord.id} {ord.symbol} ({ord.side} · {ord.status})
                            </span>
                            <span className={`font-mono-num font-bold ${Number(ord.pnl) >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                              ${Number(ord.stake || 0).toFixed(2)} · P/L {Number(ord.pnl) >= 0 ? '+' : ''}${Number(ord.pnl || 0).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#111319] border border-[#2A2F3D]">
                    <p className="font-bold text-slate-200 mb-2">Cashier &amp; Adjustment Transactions ({(activityData.transactions || []).length})</p>
                    {(activityData.transactions || []).length === 0 ? (
                      <p className="text-slate-400">No cashier transactions recorded.</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto divide-y divide-[#2A2F3D]">
                        {activityData.transactions.map((tx: any) => (
                          <div key={tx.id} className="py-1.5 flex items-center justify-between">
                            <span>
                              {tx.reference_id} · {tx.tx_type} ({tx.method})
                            </span>
                            <strong className="font-mono-num">
                              ${Number(tx.amount || 0).toFixed(2)} {tx.currency}
                            </strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Sensitive Admin Operation Re-Authentication Modal */}
      {reauthOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#181C25] border border-[#2A2F3D] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#FF444F]" /> Confirm Administrator Password
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
              Sensitive operations (adjusting balances, freezing trading, suspending users, or managing admin credentials) require password re-verification valid for 10 minutes.
            </p>
            <form onSubmit={handleConfirmReauth} className="space-y-3">
              <input
                type="password"
                required
                autoFocus
                placeholder="Current Administrator Password"
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
