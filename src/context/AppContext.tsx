import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type {
  NavTab,
  UserProfile,
  ConnectedAccount,
  MarketInstrument,
  TickData,
  OrderRecord,
  NotificationItem,
  PublicSettings,
  WorkspacePreferences,
  ExchangePair,
  AnalyserSignalResult,
} from '../types';
import { apiFetch, getStoredToken, setStoredToken, getClientDerivAppId, setClientDerivAppId } from '../lib/api';
import {
  getCfdAccountBucket,
  isCfdConnectedAccount,
  isTradingModeDbLocked,
  type CfdBucket,
  type TradingScope,
} from '../lib/balances';

export interface TradeLaunchPreset {
  symbol?: string;
  contractType?: string;
  side?: string;
  barrier?: string;
  growthRate?: number;
  analyserSync?: boolean;
  strategyType?: string;
  stake?: number;
  duration?: number;
  durationUnit?: string;
  quantumPredictionId?: string;
  quantumExpiresAt?: string;
}

interface AppContextValue {
  token: string | null;
  user: UserProfile | null;
  accounts: ConnectedAccount[];
  accountMode: 'real' | 'demo';
  setAccountMode: (m: 'real' | 'demo') => void;
  tradingScope: TradingScope;
  setTradingScope: (s: TradingScope) => void;
  activeCfdBucket: CfdBucket;
  setActiveCfdBucket: (b: CfdBucket) => void;
  openCfdTrade: (opts?: { bucket?: CfdBucket; accountId?: number | null; symbol?: string }) => void;
  activeConnectedAccount: ConnectedAccount | null;
  setActiveConnectedAccountId: (id: number | null) => void;
  isDbLocked: boolean;
  currencyDisplay: 'USD' | 'KSH';
  setCurrencyDisplay: (c: 'USD' | 'KSH') => void;
  hideBalances: boolean;
  setHideBalances: (v: boolean) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  activeTab: NavTab;
  setActiveTab: (t: NavTab) => void;
  selectedSymbol: string;
  setSelectedSymbol: (s: string) => void;
  tradePreset: TradeLaunchPreset | null;
  setTradePreset: (p: TradeLaunchPreset | null) => void;
  ticks: Record<string, TickData>;
  wsConnected: boolean;
  lastDerivTickAt: number | null;
  instruments: MarketInstrument[];
  exchangePairs: ExchangePair[];
  analyserSignal: AnalyserSignalResult | null;
  refreshAnalyserSignal: (symbol?: string) => Promise<AnalyserSignalResult | null>;
  orders: OrderRecord[];
  watchlist: string[];
  notifications: NotificationItem[];
  unreadCount: number;
  publicSettings: PublicSettings;
  kesRate: number;
  loadingAuth: boolean;
  workspacePreferences: WorkspacePreferences;
  saveWorkspacePreferences: (patch: WorkspacePreferences) => Promise<void>;
  adminGateOpen: boolean;
  setAdminGateOpen: (v: boolean) => void;
  openAdminPortal: () => void;
  registerLogoTap: () => void;
  registerHomeTap: () => void;
  formatMoney: (usdAmount: number, opts?: { hideable?: boolean; currencyOverride?: string }) => string;
  refreshAll: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshAccounts: (sync?: boolean) => Promise<void>;
  toggleWatchlist: (symbol: string) => Promise<void>;
  markNotificationRead: (id: number | 'all') => Promise<void>;
  loginWithToken: (jwt: string) => Promise<void>;
  logout: () => void;
  launchDerivOAuth: (prompt?: 'login' | 'registration') => Promise<void>;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [accountMode, setAccountMode] = useState<'real' | 'demo'>('demo');
  const [tradingScope, setTradingScope] = useState<TradingScope>('options');
  const [activeCfdBucket, setActiveCfdBucket] = useState<CfdBucket>('mt5_standard');
  const [activeConnectedAccountId, setActiveConnectedAccountId] = useState<number | null>(null);
  const [currencyDisplay, setCurrencyDisplay] = useState<'USD' | 'KSH'>(() => {
    const saved = localStorage.getItem('td_currency_v2');
    return saved === 'KSH' ? 'KSH' : 'USD';
  });
  const [hideBalances, setHideBalances] = useState<boolean>(() => localStorage.getItem('td_hide_bal') === '1');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('td_theme_v2');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [activeTab, setActiveTabState] = useState<NavTab>('home');
  const activeTabRef = useRef<NavTab>('home');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('1HZ100V');
  const [tradePreset, setTradePreset] = useState<TradeLaunchPreset | null>(null);
  const [ticks, setTicks] = useState<Record<string, TickData>>({});
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lastDerivTickAt, setLastDerivTickAt] = useState<number | null>(null);
  const [instruments, setInstruments] = useState<MarketInstrument[]>([]);
  const [exchangePairs, setExchangePairs] = useState<ExchangePair[]>([]);
  const [analyserSignal, setAnalyserSignal] = useState<AnalyserSignalResult | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferences>({});
  const [adminGateOpen, setAdminGateOpen] = useState<boolean>(false);
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    branding: {
      appName: 'DERIV',
      heroTitle: 'Trading for',
      heroSubtitle: 'Anyone Anywhere Anytime',
      heroDescription: 'Widest range of products, markets, platforms with 24/7 customer support.',
    },
    global: {
      kesRate: 130.0,
      tickerText: 'DERIV Live Markets · Synthetics, Forex, Crypto & Metals',
      adminPrivateSlug: 'pf-ops-9482',
    },
    announcements: [],
    partner: {
      referralLink: 'https://t.deriv.link?t=FSDRTFVTSKPA',
      referralCode: 'VNMH2VHBRTFN',
      affiliateTierRate: 30.0,
    },
  });
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const directWsRef = useRef<WebSocket | null>(null);
  const directSubscribedRef = useRef<Set<string>>(new Set());
  const tapCountRef = useRef<number>(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeTapCountRef = useRef<number>(0);
  const homeTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDirectTickTsRef = useRef<Record<string, number>>({});

  const resetLogoTaps = useCallback(() => {
    tapCountRef.current = 0;
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  }, []);

  const resetHomeTaps = useCallback(() => {
    homeTapCountRef.current = 0;
    if (homeTapTimerRef.current) {
      clearTimeout(homeTapTimerRef.current);
      homeTapTimerRef.current = null;
    }
  }, []);

  const setActiveTab = useCallback(
    (t: NavTab) => {
      resetLogoTaps();
      if (t !== 'home') {
        resetHomeTaps();
      }
      if (t === 'cfds') {
        setTradingScope('cfd');
        setActiveConnectedAccountId(null);
      } else if (!(t === 'mt5-tv' && activeTabRef.current === 'mt5-tv')) {
        setTradingScope('options');
        setActiveConnectedAccountId(null);
      }
      activeTabRef.current = t;
      setActiveTabState(t);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [resetLogoTaps, resetHomeTaps]
  );

  const openCfdTrade = useCallback(
    (opts?: { bucket?: CfdBucket; accountId?: number | null; symbol?: string }) => {
      resetLogoTaps();
      resetHomeTaps();
      if (opts?.symbol) {
        setSelectedSymbol(opts.symbol);
      }
      setTradingScope('cfd');
      setActiveCfdBucket(opts?.bucket || 'mt5_standard');
      setActiveConnectedAccountId(opts?.accountId && opts.accountId > 0 ? opts.accountId : null);
      activeTabRef.current = 'mt5-tv';
      setActiveTabState('mt5-tv');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [resetLogoTaps, resetHomeTaps]
  );

  const openAdminPortal = useCallback(() => {
    window.location.hash = '#/admin_console';
    setAdminGateOpen(true);
  }, []);

  // 30-tap logo gesture within 2.5s rolling timeout to open Administrator Console
  const registerLogoTap = useCallback(() => {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }
    tapCountRef.current += 1;
    if (tapCountRef.current >= 30) {
      resetLogoTaps();
      window.location.hash = '#/admin_console';
      setAdminGateOpen(true);
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
      tapTimerRef.current = null;
    }, 2500);
  }, [resetLogoTaps]);

  // 30-tap Home icon gesture on the lower tabbar within 5s rolling timeout to open Administrator Console
  const registerHomeTap = useCallback(() => {
    if (homeTapTimerRef.current) {
      clearTimeout(homeTapTimerRef.current);
    }
    homeTapCountRef.current += 1;
    if (homeTapCountRef.current >= 30) {
      resetHomeTaps();
      window.location.hash = '#/admin_console';
      setAdminGateOpen(true);
      return;
    }
    homeTapTimerRef.current = setTimeout(() => {
      homeTapCountRef.current = 0;
      homeTapTimerRef.current = null;
    }, 5000);
  }, [resetHomeTaps]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3800);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('td_theme_v2', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('td_currency_v2', currencyDisplay);
  }, [currencyDisplay]);

  useEffect(() => {
    localStorage.setItem('td_hide_bal', hideBalances ? '1' : '0');
  }, [hideBalances]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const fetchPublicData = useCallback(async () => {
    try {
      const [settingsRes, instRes, exRes] = await Promise.all([
        apiFetch<PublicSettings>('/api/settings/public', { skipAuth: true }),
        apiFetch<{ instruments: MarketInstrument[] }>('/api/market/instruments', { skipAuth: true }),
        apiFetch<{ pairs: ExchangePair[] }>('/api/exchange/pairs?filter=trending', { skipAuth: true }),
      ]);
      if (settingsRes?.global?.derivAppId) {
        setClientDerivAppId(settingsRes.global.derivAppId);
      }
      setPublicSettings(settingsRes);
      setInstruments(instRes.instruments || []);
      setExchangePairs(exRes.pairs || []);
    } catch {
      // ignore initial error
    }
  }, []);

  const refreshAnalyserSignal = useCallback(async (symbol?: string): Promise<AnalyserSignalResult | null> => {
    try {
      const q = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
      const res = await apiFetch<{ signal: AnalyserSignalResult }>(`/api/intelligence/analyser-signal${q}`, {
        skipAuth: true,
      });
      if (res.signal) {
        setAnalyserSignal(res.signal);
        return res.signal;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    if (!getStoredToken()) return;
    try {
      const res = await apiFetch<{ orders: OrderRecord[] }>('/api/orders');
      setOrders(res.orders || []);
    } catch {
      // ignore
    }
  }, []);

  const refreshAccounts = useCallback(async (sync = false) => {
    if (!getStoredToken()) return;
    try {
      const res = await apiFetch<{ accounts: ConnectedAccount[] }>(`/api/deriv/accounts${sync ? '?sync=1' : ''}`);
      setAccounts(res.accounts || []);
    } catch {
      // ignore
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const jwt = getStoredToken();
    if (!jwt) {
      setUser(null);
      setLoadingAuth(false);
      return;
    }
    try {
      const [meRes, ordRes, wlRes, notifRes, prefRes] = await Promise.all([
        apiFetch<{ user: UserProfile; accounts: ConnectedAccount[] }>('/api/auth/me'),
        apiFetch<{ orders: OrderRecord[] }>('/api/orders'),
        apiFetch<{ symbols: string[] }>('/api/watchlists'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
        apiFetch<WorkspacePreferences>('/api/workspace/preferences').catch(() => ({} as WorkspacePreferences)),
      ]);
      setUser(meRes.user);
      setAccounts(meRes.accounts || []);
      setOrders(ordRes.orders || []);
      setWatchlist(wlRes.symbols || []);
      setNotifications(notifRes.notifications || []);
      setWorkspacePreferences(prefRes || {});
    } catch {
      setStoredToken(null);
      setToken(null);
      setUser(null);
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  const saveWorkspacePreferences = useCallback(async (patch: WorkspacePreferences) => {
    setWorkspacePreferences((prev) => ({
      layout: patch.layout !== undefined ? patch.layout : prev.layout,
      chartDrawings: patch.chartDrawings !== undefined ? patch.chartDrawings : prev.chartDrawings,
      chartIndicators: patch.chartIndicators !== undefined ? patch.chartIndicators : prev.chartIndicators,
    }));
    if (!getStoredToken()) return;
    try {
      await apiFetch('/api/workspace/preferences', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
    } catch {
      // ignore transient error
    }
  }, []);

  const clearLegacySessionCaches = useCallback(() => {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && (k.startsWith('td_bot_session_') || k === 'td_loaded_bot')) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // ignore storage errors
    }
  }, []);

  const loginWithToken = useCallback(
    async (jwt: string) => {
      clearLegacySessionCaches();
      setStoredToken(jwt);
      setToken(jwt);
      await refreshAll();
    },
    [clearLegacySessionCaches, refreshAll]
  );

  const logout = useCallback(() => {
    clearLegacySessionCaches();
    setStoredToken(null);
    setToken(null);
    setUser(null);
    setAccounts([]);
    setOrders([]);
    setWorkspacePreferences({});
    setTradingScope('options');
    setActiveCfdBucket('mt5_standard');
    setActiveConnectedAccountId(null);
    setActiveTab('home');
  }, [clearLegacySessionCaches, setActiveTab]);

  // Capture oauth_token in URL hash or query after Deriv OAuth2 redirect
  useEffect(() => {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const queryPart = hash.includes('oauth_token=')
      ? hash.split('?')[1] || ''
      : search.includes('oauth_token=')
        ? search.replace(/^\?/, '')
        : '';
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      const oauthToken = params.get('oauth_token');
      const tab = params.get('tab') as NavTab | null;
      if (oauthToken) {
        loginWithToken(oauthToken).then(() => {
          if (tab) setActiveTab(tab);
          window.history.replaceState({}, '', '/');
          showToast('Signed in via DERIV OAuth2', 'success');
        });
      }
    }
  }, [loginWithToken, setActiveTab, showToast]);

  // Listen for popup postMessage from /api/deriv/oauth/callback
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.token) {
        loginWithToken(event.data.token).then(() => {
          setActiveTab('home');
          showToast('DERIV account synced successfully', 'success');
        });
      } else if (event.data?.type === 'DERIV_OAUTH_ERROR') {
        showToast(event.data.error || 'DERIV OAuth cancelled', 'error');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loginWithToken, setActiveTab, showToast]);

  useEffect(() => {
    fetchPublicData();
    refreshAll();
    refreshAnalyserSignal();
  }, [fetchPublicData, refreshAll, refreshAnalyserSignal]);

  // Keep analyser signal live when working in analyser / bot builder / smart trader
  useEffect(() => {
    if (!['bot-builder', 'smart-trader', 'market-analyser', 'trading-bots'].includes(activeTab)) return;
    refreshAnalyserSignal(selectedSymbol);
    const id = setInterval(() => {
      refreshAnalyserSignal(selectedSymbol);
    }, 3500);
    return () => clearInterval(id);
  }, [activeTab, selectedSymbol, refreshAnalyserSignal]);

  const activeSymbolsSignature = [
    selectedSymbol,
    ...orders.filter((o) => o.status === 'OPEN').map((o) => o.symbol),
  ]
    .filter(Boolean)
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .sort()
    .join(',');
  const activeSymbolsRef = useRef(activeSymbolsSignature);
  activeSymbolsRef.current = activeSymbolsSignature;
  const instrumentsRef = useRef(instruments);
  instrumentsRef.current = instruments;

  // Connect to /ws with auto-reconnect & heartbeat for realtime ticks, exchange_ticks & order/balance/alert events
  useEffect(() => {
    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const sendSubscriptions = (socket: WebSocket | null) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const syms = activeSymbolsSignature.split(',').filter(Boolean);
      if (syms.length > 0) {
        socket.send(JSON.stringify({ type: 'subscribe_many', symbols: syms }));
      }
    };

    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        reconnectAttempt = 0;
        setWsConnected(true);
        sendSubscriptions(ws);
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!disposed) {
          const delay = Math.min(6000, 1500 * Math.pow(1.4, Math.min(4, reconnectAttempt++)));
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'ticks_snapshot' && msg.ticks) {
            setTicks((prev) => {
              const next = { ...prev };
              for (const [sym, incoming] of Object.entries(msg.ticks as Record<string, TickData>)) {
                const cur = next[sym];
                if (!cur || cur.source !== 'deriv_ws' || (incoming.source === 'deriv_ws' && incoming.epoch >= cur.epoch)) {
                  next[sym] = incoming;
                }
              }
              return next;
            });
            setLastDerivTickAt(Date.now());
          } else if (msg.type === 'tick' && msg.tick) {
            const sym = msg.tick.symbol;
            const lastDirectTs = lastDirectTickTsRef.current[sym] || 0;
            const derivFresh = Date.now() - lastDirectTs < 3000;
            setTicks((prev) => {
              if (derivFresh && msg.tick.source !== 'deriv_ws') {
                return prev;
              }
              return { ...prev, [sym]: msg.tick };
            });
            setLastDerivTickAt(Date.now());
          } else if (msg.type === 'exchange_ticks' && Array.isArray(msg.pairs)) {
            setExchangePairs(msg.pairs);
          } else if (msg.type === 'balance_updated' && msg.data) {
            setUser((prev) =>
              prev
                ? {
                    ...prev,
                    virtual_workspace_balance:
                      msg.data.virtual_workspace_balance !== undefined
                        ? Number(msg.data.virtual_workspace_balance)
                        : prev.virtual_workspace_balance,
                    real_wallets: msg.data.real_wallets ?? msg.data.realWallets ?? prev.real_wallets,
                    demo_wallets: msg.data.demo_wallets ?? msg.data.demoWallets ?? prev.demo_wallets,
                    exchange_balances: msg.data.exchange_balances ?? prev.exchange_balances,
                    real_exchange_balances: msg.data.real_exchange_balances ?? prev.real_exchange_balances,
                  }
                : prev
            );
            refreshAccounts(false);
          } else if (msg.type === 'order_opened' && msg.data) {
            setOrders((prev) => [msg.data, ...prev.filter((o) => o.id !== msg.data.id)]);
          } else if (msg.type === 'bot_order_opened' && msg.data?.order) {
            const ord = msg.data.order;
            setOrders((prev) => [ord, ...prev.filter((o) => o.id !== ord.id)]);
          } else if (msg.type === 'order_updated' && msg.data) {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === msg.data.id
                  ? {
                      ...o,
                      current_price:
                        msg.data.current_price !== undefined ? Number(msg.data.current_price) : o.current_price,
                      pnl: msg.data.pnl !== undefined ? Number(msg.data.pnl) : o.pnl,
                      sl_price: msg.data.sl_price !== undefined ? msg.data.sl_price : o.sl_price,
                      tp_price: msg.data.tp_price !== undefined ? msg.data.tp_price : o.tp_price,
                      sl_usd: msg.data.sl_usd !== undefined ? msg.data.sl_usd : o.sl_usd,
                      tp_usd: msg.data.tp_usd !== undefined ? msg.data.tp_usd : o.tp_usd,
                    }
                  : o
              )
            );
          } else if (msg.type === 'order_closed' && msg.data) {
            setOrders((prev) => prev.map((o) => (o.id === msg.data.id ? msg.data : o)));
          } else if (msg.type === 'account_updated') {
            refreshAccounts(false);
            apiFetch<{ user: UserProfile }>('/api/auth/me')
              .then((me) => {
                if (me?.user) setUser(me.user);
              })
              .catch(() => {});
          } else if (msg.type === 'alert_triggered' && msg.data) {
            showToast(`Alert: ${msg.data.symbol} @ ${msg.data.triggerPrice}`, 'info');
            apiFetch<{ notifications: NotificationItem[] }>('/api/notifications')
              .then((n) => setNotifications(n.notifications || []))
              .catch(() => {});
          }
        } catch {
          // ignore
        }
      };
    };

    connect();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connect();
        } else {
          sendSubscriptions(wsRef.current);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onVisibility);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, [token, refreshAccounts, showToast]);

  const modeAccounts = accounts.filter((a) =>
    accountMode === 'demo' ? Boolean(a.is_virtual) : !a.is_virtual
  );
  const activeConnectedAccount =
    tradingScope === 'cfd'
      ? (() => {
          const cfdModeAccs = modeAccounts.filter(
            (a) => a.status === 'active' && isCfdConnectedAccount(a)
          );
          const byId = activeConnectedAccountId
            ? cfdModeAccs.find((a) => a.id === activeConnectedAccountId)
            : undefined;
          if (byId) return byId;
          const bucketMatches = cfdModeAccs.filter(
            (a) => getCfdAccountBucket(a) === activeCfdBucket
          );
          const pool = bucketMatches.length > 0 ? bucketMatches : cfdModeAccs;
          return (
            pool.find((a) => Number(a.balance || 0) > 0) ||
            pool.find((a) => String(a.account_type || '').toLowerCase().includes('standard 3')) ||
            pool[0] ||
            null
          );
        })()
      : (() => {
          const optModeAccs = modeAccounts.filter(
            (a) => a.status === 'active' && !isCfdConnectedAccount(a)
          );
          const byId = activeConnectedAccountId
            ? optModeAccs.find((a) => a.id === activeConnectedAccountId)
            : undefined;
          return byId || optModeAccs[0] || null;
        })();

  const isDbLocked = isTradingModeDbLocked(user, accounts, accountMode, activeConnectedAccount);

  // Direct multiplexed browser Deriv WS live feed when synced/unlocked,
  // OR simulated mock tick generator when DB is locked by Admin
  useEffect(() => {
    if (isDbLocked) {
      try {
        directWsRef.current?.close();
      } catch {
        // ignore
      }
      directWsRef.current = null;
      directSubscribedRef.current.clear();

      const mockTimer = setInterval(() => {
        const syms = activeSymbolsRef.current.split(',').filter(Boolean);
        if (syms.length === 0) return;
        const nowEpoch = Math.floor(Date.now() / 1000);
        const instList = instrumentsRef.current;
        setTicks((prev) => {
          const next = { ...prev };
          for (const sym of syms) {
            const inst = instList.find((i) => i.symbol === sym);
            const cur = next[sym]?.quote ?? inst?.price ?? 1000;
            const pip = next[sym]?.pipSize ?? inst?.pip_size ?? 0.01;
            const dec = pip < 0.0001 ? 5 : pip < 0.001 ? 4 : pip < 0.01 ? 3 : 2;
            const step = Math.max(pip * 3, cur * 0.00018);
            const nextQuote = Number(Math.max(pip * 10, cur + (Math.random() - 0.5) * 2 * step).toFixed(dec));
            const spread = inst?.spread ?? pip * 10;
            next[sym] = {
              symbol: sym,
              quote: nextQuote,
              bid: Number((nextQuote - spread / 2).toFixed(dec)),
              ask: Number((nextQuote + spread / 2).toFixed(dec)),
              epoch: nowEpoch,
              pipSize: pip,
              source: 'live_pulse',
            };
          }
          return next;
        });
        setLastDerivTickAt(Date.now());
      }, 900);

      return () => clearInterval(mockTimer);
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const pushSubscriptions = (ws: WebSocket | null) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const baseTop = ['1HZ100V', '1HZ75V', '1HZ50V', '1HZ25V', '1HZ15V', '1HZ10V', 'R_100', 'cryBTCUSD'];
      const wanted = Array.from(new Set([...activeSymbolsSignature.split(',').filter(Boolean), ...baseTop]));
      for (const sym of wanted) {
        if (!directSubscribedRef.current.has(sym)) {
          directSubscribedRef.current.add(sym);
          ws.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
        }
      }
    };

    const connectDirect = () => {
      if (disposed) return;
      try {
        const ws = new WebSocket(
          `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(getClientDerivAppId())}&l=EN&brand=deriv`
        );
        directWsRef.current = ws;

        ws.onopen = () => {
          if (disposed) {
            ws.close();
            return;
          }
          directSubscribedRef.current.clear();
          pushSubscriptions(ws);
          if (pingTimer) clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ ping: 1 }));
            }
          }, 25000);
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.msg_type === 'tick' && msg.tick) {
              const t = msg.tick;
              const quote = Number(t.quote);
              const pipSize = Number(t.pip_size || 0.01);
              const epoch = Number(t.epoch || Math.floor(Date.now() / 1000));
              if (!Number.isFinite(quote)) return;
              const tickObj: TickData = {
                symbol: t.symbol,
                quote,
                bid: t.bid ? Number(t.bid) : quote,
                ask: t.ask ? Number(t.ask) : quote,
                epoch,
                pipSize,
                source: 'deriv_ws',
              };
              lastDirectTickTsRef.current[t.symbol] = Date.now();
              setTicks((prev) => ({ ...prev, [t.symbol]: tickObj }));
              setLastDerivTickAt(Date.now());
              setWsConnected(true);
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          directSubscribedRef.current.clear();
          if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
          }
          if (!disposed) {
            reconnectTimer = setTimeout(connectDirect, 3000);
          }
        };
      } catch {
        if (!disposed) {
          reconnectTimer = setTimeout(connectDirect, 4000);
        }
      }
    };

    connectDirect();
    return () => {
      disposed = true;
      directSubscribedRef.current.clear();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      try {
        directWsRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, [isDbLocked]);

  useEffect(() => {
    const syms = activeSymbolsSignature.split(',').filter(Boolean);
    if (syms.length === 0) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe_many', symbols: syms }));
    }
    if (directWsRef.current && directWsRef.current.readyState === WebSocket.OPEN) {
      for (const sym of syms) {
        if (!directSubscribedRef.current.has(sym)) {
          directSubscribedRef.current.add(sym);
          directWsRef.current.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
        }
      }
    }
  }, [activeSymbolsSignature]);

  const launchDerivOAuth = useCallback(
    async (prompt: 'login' | 'registration' = 'login') => {
      try {
        const origin = window.location.origin;
        const endpoint = token
          ? `/api/deriv/oauth-url?origin=${encodeURIComponent(origin)}`
          : `/api/deriv/oauth-url/public?prompt=${prompt}&origin=${encodeURIComponent(origin)}`;
        const { url } = await apiFetch<{ url: string }>(endpoint, { skipAuth: !token });
        if (window.self === window.top) {
          window.location.assign(url);
          return;
        }
        try {
          if (window.top) {
            window.top.location.href = url;
            return;
          }
        } catch {
          // cross-origin iframe fallback to popup
        }
        const popup = window.open(url, 'deriv_oauth', 'width=540,height=720');
        if (!popup) {
          window.location.assign(url);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Unable to launch DERIV OAuth2', 'error');
      }
    },
    [token, showToast]
  );

  const toggleWatchlist = useCallback(
    async (symbol: string) => {
      const exists = watchlist.includes(symbol);
      const res = exists
        ? await apiFetch<{ symbols: string[] }>(`/api/watchlists/${encodeURIComponent(symbol)}`, { method: 'DELETE' })
        : await apiFetch<{ symbols: string[] }>('/api/watchlists', {
            method: 'POST',
            body: JSON.stringify({ symbol }),
          });
      setWatchlist(res.symbols || []);
    },
    [watchlist]
  );

  const markNotificationRead = useCallback(async (id: number | 'all') => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) =>
      prev.map((n) => (id === 'all' || n.id === id ? { ...n, is_read: 1 } : n))
    );
  }, []);

  const kesRate = Number(publicSettings.global?.kesRate || 130.0);

  const formatMoney = useCallback(
    (usdAmount: number, opts?: { hideable?: boolean; currencyOverride?: string }) => {
      if (opts?.hideable && hideBalances) {
        return '*****';
      }
      if (opts?.currencyOverride && opts.currencyOverride !== 'USD') {
        return `${Number(usdAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${opts.currencyOverride}`;
      }
      if (currencyDisplay === 'KSH') {
        const ksh = usdAmount * kesRate;
        return `KSh ${ksh.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return `${usdAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    },
    [hideBalances, currencyDisplay, kesRate]
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <AppContext.Provider
      value={{
        token,
        user,
        accounts,
        accountMode,
        setAccountMode,
        tradingScope,
        setTradingScope,
        activeCfdBucket,
        setActiveCfdBucket,
        openCfdTrade,
        activeConnectedAccount,
        setActiveConnectedAccountId,
        isDbLocked,
        currencyDisplay,
        setCurrencyDisplay,
        hideBalances,
        setHideBalances,
        theme,
        toggleTheme,
        activeTab,
        setActiveTab,
        selectedSymbol,
        setSelectedSymbol,
        tradePreset,
        setTradePreset,
        ticks,
        wsConnected,
        lastDerivTickAt,
        instruments,
        exchangePairs,
        analyserSignal,
        refreshAnalyserSignal,
        orders,
        watchlist,
        notifications,
        unreadCount,
        publicSettings,
        kesRate,
        loadingAuth,
        workspacePreferences,
        saveWorkspacePreferences,
        adminGateOpen,
        setAdminGateOpen,
        openAdminPortal,
        registerLogoTap,
        registerHomeTap,
        formatMoney,
        refreshAll,
        refreshOrders,
        refreshAccounts,
        toggleWatchlist,
        markNotificationRead,
        loginWithToken,
        logout,
        launchDerivOAuth,
        toast,
        showToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
