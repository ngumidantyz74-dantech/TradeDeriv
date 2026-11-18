export type NavTab =
  | 'home'
  | 'cfds'
  | 'exchange'
  | 'options'
  | 'portfolio'
  | 'profile'
  | 'mt5-tv'
  | 'bot-builder'
  | 'trading-bots'
  | 'market-analyser'
  | 'bulk-trader'
  | 'risk-calc'
  | 'copy-trading'
  | 'reports'
  | 'notifications'
  | 'learning-hub';

export interface UserProfile {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  country: string;
  role: string;
  status: string;
  email_verified: boolean;
  preferred_currency: string;
  preferred_language: string;
  display_theme: 'light' | 'dark';
  virtual_workspace_balance: number;
  exchange_balances: Record<string, number>;
  deriv_nickname: string;
  deriv_client_id: string;
  created_at: string;
}

export interface ConnectedAccount {
  id: number;
  deriv_login_id?: string;
  deriv_account_id: string;
  account_type: string;
  platform: string;
  currency: string;
  is_virtual: number | boolean;
  balance: number;
  last_known_balance: number;
  balance_locked_by_admin?: boolean;
  status: string;
  scopes: string;
  updated_at?: string;
}

export interface MarketInstrument {
  symbol: string;
  display_name: string;
  category: 'Synthetic' | 'Forex' | 'Crypto' | 'Metals/Cmd' | 'Indices';
  market: string;
  submarket: string;
  pip_size: number;
  price: number;
  bid: number;
  ask: number;
  spread: number;
  change_pct: number;
  sparkline: number[];
}

export interface TickData {
  symbol: string;
  quote: number;
  bid: number;
  ask: number;
  epoch: number;
  pipSize: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface OrderRecord {
  id: number;
  user_id: number;
  connected_account_id: number | null;
  deriv_contract_id: string | null;
  execution_mode: 'virtual' | 'deriv';
  source: 'manual' | 'bot' | 'bulk';
  symbol: string;
  side: string;
  contract_type: string;
  lots: number;
  stake: number;
  multiplier: number;
  entry_price: number;
  current_price: number;
  exit_price: number | null;
  sl_price: number | null;
  tp_price: number | null;
  sl_usd: number | null;
  tp_usd: number | null;
  barrier: string | null;
  duration: number;
  duration_unit: string;
  payout: number;
  pnl: number;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  closed_at: string | null;
}

export interface BotStrategy {
  id: number;
  name: string;
  slug: string;
  category: string;
  symbol: string;
  contract_type: string;
  description: string;
  win_rate_est: number;
  rating: number;
  is_premium: number;
  is_active: number;
  config: {
    stake?: number;
    barrier?: string;
    duration?: number;
    duration_unit?: string;
    multiplier?: number;
    martingale?: number;
    takeProfit?: number;
    stopLoss?: number;
    maxTrades?: number;
  };
}

export interface BotTelemetry {
  running: boolean;
  strategyName: string;
  symbol: string;
  contractType: string;
  baseStake: number;
  currentStake: number;
  martingaleStep: number;
  martingaleFactor: number;
  takeProfit: number;
  stopLoss: number;
  maxTrades: number;
  tickCount: number;
  tradesPlaced: number;
  wins: number;
  losses: number;
  realizedPnl: number;
  startedAt: string;
  lastSignal: string;
  recentPrices: number[];
}

export interface ExchangePair {
  pair: string;
  base: string;
  quote: string;
  price: number;
  change24h: number;
  volume24hM: number;
  color: string;
  sparkline: number[];
}

export interface CashierTransaction {
  id: number;
  tx_type: string;
  method: string;
  provider: string;
  account_from: string | null;
  account_to: string | null;
  amount: number;
  currency: string;
  fee: number;
  reference_id: string;
  status: string;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  category: string;
  is_read: number;
  created_at: string;
}

export interface PublicSettings {
  branding: {
    appName?: string;
    supportEmail?: string;
    supportPhone?: string;
    tagline?: string;
  };
  global: {
    kesRate?: number;
    tickerText?: string;
    maintenanceMode?: boolean;
    allowRegistration?: boolean;
    defaultVirtualBalance?: number;
    adminPrivateSlug?: string;
  };
  announcements: Array<{
    id: string;
    title: string;
    message: string;
    severity: string;
    createdAt: string;
  }>;
}
