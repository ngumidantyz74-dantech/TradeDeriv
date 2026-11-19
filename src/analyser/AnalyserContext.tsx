import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '../lib/api';

export interface AnalyserQuote {
  instrument: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  provenance: string;
  utcTimestamp: string;
  ageSeconds: number;
  isStale: boolean;
}

export interface AnalyserSetupData {
  instrument: string;
  displayName: string;
  assetClass: 'commodity' | 'forex';
  timeframe: string;
  direction: 'BUY' | 'SELL' | 'WAIT';
  setupType: string;
  strategyName: string;
  entryPrice: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskReward: number;
  spread: number;
  atr: number;
  rsi14: number;
  ema20: number;
  ema50: number;
  ema200: number;
  macdHistogram: number;
  trendBias: 'bullish' | 'bearish' | 'neutral';
  mtfAlignment: Array<{ timeframe: string; bias: 'bullish' | 'bearish' | 'neutral'; rsi14: number }>;
  supportLevels: number[];
  resistanceLevels: number[];
  fibLevels: Array<{ ratio: string; price: number }>;
  liquidityEvents: Array<{ time: number; type: string; price: number; description: string }>;
  qualityScore: number;
  qualityScoreDisclaimer: string;
  lifecycleStatus: string;
  blockedReason: string | null;
  feedSource: string;
  feedProvenance: string;
  feedTimestamp: string;
  isFeedStale: boolean;
  invalidationConditions: string[];
  qualificationReasons: string[];
}

interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
}

interface AnalyserContextValue {
  user: AuthUser | null;
  loadingAuth: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  feedHealth: {
    status: string;
    lastPollUtc?: string | null;
    lastSuccessUtc?: string | null;
    providers?: string[];
    freshInstruments?: number;
    totalInstruments?: number;
    sampleLatencyMs?: number;
  } | null;
  quotes: Record<string, AnalyserQuote>;
  instruments: Array<{ instrument: string; displayName: string; assetClass: string; decimals: number }>;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  notify: (message: string, type?: 'success' | 'error' | 'info') => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshFeedStatus: () => Promise<void>;
}

const AnalyserContext = createContext<AnalyserContextValue | undefined>(undefined);

export const AnalyserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('td_theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [feedHealth, setFeedHealth] = useState<AnalyserContextValue['feedHealth']>(null);
  const [quotes, setQuotes] = useState<Record<string, AnalyserQuote>>({});
  const [instruments, setInstruments] = useState<AnalyserContextValue['instruments']>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('td_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const refreshAuth = useCallback(async () => {
    if (!getStoredToken()) {
      setUser(null);
      setLoadingAuth(false);
      return;
    }
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  const refreshFeedStatus = useCallback(async () => {
    try {
      const res = await apiFetch<{
        health: any;
        quotes: AnalyserQuote[];
        instruments: any[];
      }>('/api/analyser/feed/status', { skipAuth: true });
      setFeedHealth(res.health || null);
      const qMap: Record<string, AnalyserQuote> = {};
      for (const q of res.quotes || []) qMap[q.instrument] = q;
      setQuotes(qMap);
      setInstruments(res.instruments || []);
    } catch {
      // keep previous state
    }
  }, []);

  useEffect(() => {
    refreshAuth();
    refreshFeedStatus();
    const t = setInterval(refreshFeedStatus, 5000);
    return () => clearInterval(t);
  }, [refreshAuth, refreshFeedStatus]);

  const login = async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    notify('Signed in to AI Market Analyser', 'success');
  };

  const register = async (email: string, password: string, fullName: string) => {
    const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ email, password, fullName }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    notify('Account created in AI Market Analyser', 'success');
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    notify('Signed out', 'info');
  };

  return (
    <AnalyserContext.Provider
      value={{
        user,
        loadingAuth,
        theme,
        toggleTheme,
        feedHealth,
        quotes,
        instruments,
        toast,
        notify,
        login,
        register,
        logout,
        refreshFeedStatus,
      }}
    >
      {children}
    </AnalyserContext.Provider>
  );
};

export function useAnalyser() {
  const ctx = useContext(AnalyserContext);
  if (!ctx) throw new Error('useAnalyser must be used inside AnalyserProvider');
  return ctx;
}
