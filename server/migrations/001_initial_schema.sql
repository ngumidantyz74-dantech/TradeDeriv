-- 001_initial_schema.sql
-- Complete normalized Neon PostgreSQL schema for DERIV trading platform & independent Admin Console.

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'Kenya',
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  trading_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  locked_until TIMESTAMPTZ,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verification_token TEXT,
  reset_token TEXT,
  preferred_currency TEXT NOT NULL DEFAULT 'USD',
  preferred_language TEXT NOT NULL DEFAULT 'EN',
  display_theme TEXT NOT NULL DEFAULT 'light',
  virtual_workspace_balance DOUBLE PRECISION NOT NULL DEFAULT 10000.00,
  demo_wallets_json TEXT NOT NULL DEFAULT '{"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}',
  real_wallets_json TEXT NOT NULL DEFAULT '{"options":0,"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}',
  exchange_balances_json TEXT NOT NULL DEFAULT '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}',
  real_exchange_balances_json TEXT NOT NULL DEFAULT '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}',
  deriv_nickname TEXT DEFAULT '',
  deriv_client_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connected_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deriv_login_id TEXT NOT NULL,
  deriv_account_id TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'options',
  platform TEXT NOT NULL DEFAULT 'deriv',
  currency TEXT NOT NULL DEFAULT 'USD',
  is_virtual BOOLEAN NOT NULL DEFAULT TRUE,
  balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_known_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  balance_locked_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  scopes TEXT DEFAULT 'trade account_manage',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, deriv_login_id)
);

CREATE TABLE IF NOT EXISTS account_authorizations (
  id SERIAL PRIMARY KEY,
  connected_account_id INTEGER REFERENCES connected_accounts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  auth_type TEXT NOT NULL DEFAULT 'oauth2',
  encrypted_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_auth_tag TEXT NOT NULL,
  scopes TEXT DEFAULT 'trade account_manage',
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_instruments (
  symbol TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  market TEXT NOT NULL,
  submarket TEXT NOT NULL,
  pip_size DOUBLE PRECISION NOT NULL DEFAULT 0.01,
  min_stake DOUBLE PRECISION NOT NULL DEFAULT 0.35,
  max_stake DOUBLE PRECISION NOT NULL DEFAULT 50000,
  spread DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_data_cache (
  symbol TEXT PRIMARY KEY,
  price DOUBLE PRECISION NOT NULL,
  change_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  high_24h DOUBLE PRECISION NOT NULL DEFAULT 0,
  low_24h DOUBLE PRECISION NOT NULL DEFAULT 0,
  sparkline_json TEXT NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS virtual_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connected_account_id INTEGER REFERENCES connected_accounts(id) ON DELETE SET NULL,
  deriv_contract_id TEXT,
  execution_mode TEXT NOT NULL DEFAULT 'virtual',
  source TEXT NOT NULL DEFAULT 'manual',
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'MULTUP',
  lots DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  stake DOUBLE PRECISION NOT NULL DEFAULT 10.00,
  multiplier INTEGER NOT NULL DEFAULT 100,
  entry_price DOUBLE PRECISION NOT NULL,
  current_price DOUBLE PRECISION NOT NULL,
  exit_price DOUBLE PRECISION,
  sl_price DOUBLE PRECISION,
  tp_price DOUBLE PRECISION,
  sl_usd DOUBLE PRECISION,
  tp_usd DOUBLE PRECISION,
  barrier TEXT,
  duration INTEGER DEFAULT 5,
  duration_unit TEXT DEFAULT 't',
  payout DOUBLE PRECISION DEFAULT 0,
  pnl DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',
  strategy_key TEXT DEFAULT '',
  timeframe TEXT DEFAULT '',
  account_mode TEXT DEFAULT 'demo',
  notes TEXT DEFAULT '',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bot_strategies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'Free Bots',
  symbol TEXT NOT NULL DEFAULT '1HZ100V',
  contract_type TEXT NOT NULL DEFAULT 'DIGITOVER',
  description TEXT NOT NULL,
  win_rate_est DOUBLE PRECISION NOT NULL DEFAULT 72.0,
  rating DOUBLE PRECISION NOT NULL DEFAULT 4.8,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config_json TEXT NOT NULL,
  xml_template TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cashier_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tx_type TEXT NOT NULL,
  method TEXT NOT NULL,
  provider TEXT DEFAULT 'deriv',
  account_from TEXT,
  account_to TEXT,
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  fee DOUBLE PRECISION NOT NULL DEFAULT 0,
  reference_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  account_mode TEXT NOT NULL DEFAULT 'demo',
  metadata_json TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'system',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  provider_response TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS administrator_audit_logs (
  id SERIAL PRIMARY KEY,
  admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  previous_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  ip_address TEXT DEFAULT 'unknown',
  action_result TEXT NOT NULL DEFAULT 'success',
  details_json TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  ip_address TEXT DEFAULT 'unknown',
  details_json TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT DEFAULT 'unknown',
  success BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_error_logs (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  details_json TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  risk_per_trade_pct DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  daily_loss_limit_usd DOUBLE PRECISION NOT NULL DEFAULT 10.0,
  max_exposure_usd DOUBLE PRECISION NOT NULL DEFAULT 15.0,
  max_consecutive_losses INTEGER NOT NULL DEFAULT 3,
  cooldown_minutes INTEGER NOT NULL DEFAULT 30,
  cooldown_until TIMESTAMPTZ,
  enforce_limits BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_strategies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy_key TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  execution_mode TEXT NOT NULL DEFAULT 'paper',
  symbol TEXT NOT NULL DEFAULT '1HZ100V',
  timeframe TEXT NOT NULL DEFAULT '15m',
  config_json TEXT NOT NULL DEFAULT '{}',
  risk_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, strategy_key)
);

CREATE TABLE IF NOT EXISTS strategy_backtest_runs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy_key TEXT NOT NULL,
  symbol TEXT NOT NULL,
  granularity INTEGER NOT NULL DEFAULT 900,
  candle_count INTEGER NOT NULL DEFAULT 300,
  spread_cost_pct DOUBLE PRECISION NOT NULL DEFAULT 0.06,
  in_sample_json TEXT NOT NULL DEFAULT '{}',
  out_of_sample_json TEXT NOT NULL DEFAULT '{}',
  full_metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trading_journal_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES virtual_orders(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL DEFAULT 'BUY',
  strategy_key TEXT DEFAULT '',
  timeframe TEXT DEFAULT '15m',
  rationale TEXT NOT NULL DEFAULT '',
  emotions TEXT DEFAULT 'Calm & Objective',
  discipline_score INTEGER NOT NULL DEFAULT 8,
  lessons TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS smart_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'price_above',
  condition_json TEXT NOT NULL DEFAULT '{}',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_workspace_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  layout_json TEXT NOT NULL DEFAULT '{}',
  chart_drawings_json TEXT NOT NULL DEFAULT '{}',
  chart_indicators_json TEXT NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_virtual_orders_user_status ON virtual_orders (user_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_smart_alerts_user_status ON smart_alerts (user_id, status);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email_time ON admin_login_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_user_time ON trading_journal_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cashier_tx_user_time ON cashier_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON administrator_audit_logs (created_at DESC);
