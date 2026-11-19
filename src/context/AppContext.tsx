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
} from '../types';
import { apiFetch, getStoredToken, setStoredToken } from '../lib/api';

interface AppContextValue {
  token: string | null;
  user: UserProfile | null;
  accounts: ConnectedAccount[];
  accountMode: 'real' | 'demo';
  setAccountMode: (m: 'real' | 'demo') => void;
  activeConnectedAccount: ConnectedAccount | null;
  setActiveConnectedAccountId: (id: number | null) => void;
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
  ticks: Record<string, TickData>;
  wsConnected: boolean;
  lastDerivTickAt: number | null;
  instruments: MarketInstrument[];
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
  registerLogoTap: () => void;
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
  const [activeConnectedAccountId, setActiveConnectedAccountId] = useState<number | null>(null);
  const [currencyDisplay, setCurrencyDisplay] = useState<'USD' | 'KSH'>(() => {
    return (localStorage.getItem('td_currency') as 'USD' | 'KSH') || 'USD';
  });
  const [hideBalances, setHideBalances] = useState<boolean>(() => localStorage.getItem('td_hide_bal') === '1');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('td_theme') as 'light' | 'dark') || 'light';
  });
  const [activeTab, setActiveTabState] = useState<NavTab>('home');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('1HZ100V');
  const [ticks, setTicks] = useState<Record<string, TickData>>({});
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lastDerivTickAt, setLastDerivTickAt] = useState<number | null>(null);
  const [instruments, setInstruments] = useState<MarketInstrument[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferences>({});
  const [adminGateOpen, setAdminGateOpen] = useState<boolean>(false);
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    branding: { appName: 'TradeDeriv' },
    global: { kesRate: 130.0, tickerText: 'TradeDeriv Live Markets', adminPrivateSlug: 'pf-ops-9482' },
    announcements: [],
  });
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const tapCountRef = useRef<number>(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetLogoTaps = useCallback(() => {
    tapCountRef.current = 0;
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  }, []);

  const setActiveTab = useCallback(
    (t: NavTab) => {
      resetLogoTaps();
      setActiveTabState(t);
    },
    [resetLogoTaps]
  );

  // Hidden 30-tap gesture within 2.5s rolling timeout to open Owner MIS Portal (zero visible hints)
  const registerLogoTap = useCallback(() => {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }
    tapCountRef.current += 1;
    if (tapCountRef.current >= 30) {
      resetLogoTaps();
      setAdminGateOpen(true);
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
      tapTimerRef.current = null;
    }, 2500);
  }, [resetLogoTaps]);

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
    localStorage.setItem('td_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('td_currency', currencyDisplay);
  }, [currencyDisplay]);

  useEffect(() => {
    localStorage.setItem('td_hide_bal', hideBalances ? '1' : '0');
  }, [hideBalances]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const fetchPublicData = useCallback(async () => {
    try {
      const [settingsRes, instRes] = await Promise.all([
        apiFetch<PublicSettings>('/api/settings/public', { skipAuth: true }),
        apiFetch<{ instruments: MarketInstrument[] }>('/api/market/instruments', { skipAuth: true }),
      ]);
      setPublicSettings(settingsRes);
      setInstruments(instRes.instruments || []);
    } catch {
      // ignore initial error
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

  const loginWithToken = useCallback(
    async (jwt: string) => {
      setStoredToken(jwt);
      setToken(jwt);
      await refreshAll();
    },
    [refreshAll]
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    setAccounts([]);
    setOrders([]);
    setWorkspacePreferences({});
    setActiveTab('home');
  }, [setActiveTab]);

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
          showToast('Signed in via Deriv OAuth2', 'success');
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
          showToast('Deriv account synced successfully', 'success');
        });
      } else if (event.data?.type === 'DERIV_OAUTH_ERROR') {
        showToast(event.data.error || 'Deriv OAuth cancelled', 'error');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loginWithToken, setActiveTab, showToast]);

  useEffect(() => {
    fetchPublicData();
    refreshAll();
  }, [fetchPublicData, refreshAll]);

  // Connect to /ws for realtime ticks & user order/balance/alert events
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: 'subscribe', symbol: selectedSymbol }));
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'ticks_snapshot' && msg.ticks) {
          setTicks((prev) => ({ ...prev, ...msg.ticks }));
          setLastDerivTickAt(Date.now());
        } else if (msg.type === 'tick' && msg.tick) {
          setTicks((prev) => ({ ...prev, [msg.tick.symbol]: msg.tick }));
          setLastDerivTickAt(Date.now());
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
        } else if (msg.type === 'order_updated' && msg.data) {
          setOrders((prev) =>
            prev.map((o) =>
              o.id === msg.data.id
                ? {
                    ...o,
                    current_price:
                      msg.data.current_price !== undefined ? Number(msg.data.current_price) : o.current_price,
                    pnl: msg.data.pnl !== undefined ? Number(msg.data.pnl) : o.pnl,
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

    return () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }, [token, refreshAccounts, showToast]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && selectedSymbol) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', symbol: selectedSymbol }));
    }
  }, [selectedSymbol]);

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
        showToast(err instanceof Error ? err.message : 'Unable to launch Deriv OAuth2', 'error');
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
        return '••••••';
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

  const modeAccounts = accounts.filter((a) =>
    accountMode === 'demo' ? Boolean(a.is_virtual) : !a.is_virtual
  );
  const activeConnectedAccount =
    modeAccounts.find((a) => a.id === activeConnectedAccountId) ||
    modeAccounts.find((a) => a.status === 'active') ||
    null;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <AppContext.Provider
      value={{
        token,
        user,
        accounts,
        accountMode,
        setAccountMode,
        activeConnectedAccount,
        setActiveConnectedAccountId,
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
        ticks,
        wsConnected,
        lastDerivTickAt,
        instruments,
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
        registerLogoTap,
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
