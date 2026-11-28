export type NavTab =
  | 'home'
  | 'cfds'
  | 'exchange'
  | 'options'
  | 'portfolio'
  | 'profile'
  | 'mt5-tv'
  | 'smart-trader'
  | 'bot-builder'
  | 'trading-bots'
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
  trading_suspended?: boolean;
  email_verified: boolean;
  preferred_currency: string;
  preferred_language: string;
  display_theme: 'light' | 'dark';
  virtual_workspace_balance: number;
  real_wallets?: {
    main_usd?: number;
    options: number;
    mt5_standard: number;
    mt5_gold: number;
    exchange_usdt: number;
    db_locked?: boolean;
  };
  demo_wallets?: {
    main_usd?: number;
    options?: number;
    mt5_standard: number;
    mt5_gold: number;
    exchange_usdt: number;
    db_locked?: boolean;
  };
  exchange_balances: Record<string, number>;
  real_exchange_balances?: Record<string, number>;
  deriv_nickname: string;
  deriv_client_id: string;
  last_login_at?: string;
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
  last_login_at?: string;
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
  source?: 'deriv_ws' | 'live_pulse' | 'cached';
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume?: number;
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
  strategy_key?: string;
  timeframe?: string;
  account_mode?: 'real' | 'demo';
  wallet_bucket?: 'options' | 'mt5_standard' | 'mt5_gold';
  notes?: string;
}

export interface WorkspacePreferences {
  layout?: {
    showKpis?: boolean;
    showAccounts?: boolean;
    showQuickTools?: boolean;
    showHighlights?: boolean;
  };
  chartDrawings?: Record<
    string,
    {
      hLines?: number[];
      trendLines?: Array<{ id: string; t1: number; p1: number; t2: number; p2: number }>;
      fibs?: Array<{ id: string; low: number; high: number; mode: 'retracement' | 'extension' }>;
    }
  >;
  chartIndicators?: {
    chartMode?: 'candles' | 'line' | 'area';
    ema9?: boolean;
    ema20?: boolean;
    ema50?: boolean;
    ema200?: boolean;
    sma20?: boolean;
    sma50?: boolean;
    bb?: boolean;
    psar?: boolean;
    vwap?: boolean;
    smc?: boolean;
    rsi14?: boolean;
    macd?: boolean;
    stochastic?: boolean;
    atr14?: boolean;
    adx14?: boolean;
  };
}

export interface JournalEntry {
  id: number;
  user_id: number;
  order_id: number | null;
  symbol: string;
  side: string;
  strategy_key: string;
  timeframe: string;
  rationale: string;
  emotions: string;
  discipline_score: number;
  lessons: string;
  image_url: string;
  tags_json: string;
  order_pnl?: number | null;
  order_entry_price?: number | null;
  order_exit_price?: number | null;
  order_status?: string | null;
  created_at: string;
}

export interface SmartAlert {
  id: number;
  user_id: number;
  symbol: string;
  alert_type: 'price_above' | 'price_below';
  condition_json: string;
  message: string;
  status: 'active' | 'triggered' | 'paused';
  triggered_at: string | null;
  created_at: string;
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

export interface BotJournalEntry {
  id: string;
  time: string;
  type: 'info' | 'stake' | 'bought' | 'profit' | 'loss' | 'warning' | 'session_profit' | 'error';
  text: string;
}

export interface BotTelemetry {
  running: boolean;
  runId?: string;
  runState?: 'idle' | 'buying' | 'bought' | 'won' | 'lost';
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
  accountMode?: 'real' | 'demo';
  executionSpeed?: 'fast' | 'normal';
  strategyType?: string;
  growthRate?: number;
  analyserSync?: boolean;
  quantumPredictionId?: string | null;
  quantumExpiresAt?: string | null;
  journal?: BotJournalEntry[];
}

export interface QuantumPrediction {
  prediction_id: string;
  user_id?: number;
  instrument: string;
  contract_type: string;
  predicted_condition: string;
  barrier: string;
  duration: number;
  duration_unit: string;
  stake: number;
  probability: number;
  loss_risk_score: number;
  spot_price: number;
  generated_at: string;
  expires_at: string;
  validity_status: 'VALID' | 'INVALID';
  executed_count?: number;
  signature_hmac?: string;
  rationale?: string;
  remainingSeconds: number;
}

export interface AnalyserSignalResult {
  symbol: string;
  displayName: string;
  contractType: string;
  side: string;
  barrier: string;
  duration: number;
  durationUnit: string;
  growthRate: number;
  confidence: number;
  direction: 'BULLISH' | 'BEARISH' | 'DIGIT_EDGE';
  reason: string;
  lastDigit: number;
  evenPct: number;
  oddPct: number;
  risePct: number;
  fallPct: number;
  over2Pct: number;
  under7Pct: number;
  rsi14: number;
  price: number;
  updatedAt: string;
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
    heroTitle?: string;
    heroSubtitle?: string;
    heroDescription?: string;
  };
  global: {
    kesRate?: number;
    tickerText?: string;
    maintenanceMode?: boolean;
    allowRegistration?: boolean;
    defaultVirtualBalance?: number;
    adminPrivateSlug?: string;
    derivAppId?: string;
  };
  announcements: Array<{
    id: string;
    title: string;
    message: string;
    severity: string;
    createdAt: string;
  }>;
  partner?: {
    referralLink?: string;
    referralCode?: string;
    affiliateTierRate?: number;
  };
}
