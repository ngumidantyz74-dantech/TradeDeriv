import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.ts';
import { CURATED_DERIV_INSTRUMENTS, SEEDED_BOT_STRATEGIES } from './catalog.ts';
import { hashPasswordArgon2id } from './password-hash.ts';
import { randomId } from './crypto.ts';

function isNonLocalDatabase(connectionString: string): boolean {
  if (!connectionString) return false;
  try {
    const normalized = connectionString.replace(/^postgres(ql)?:\/\//i, 'http://');
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1';
  } catch {
    return !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
  }
}

function sanitizeConnectionStringForPg(connectionString: string): string {
  if (!connectionString) return connectionString;
  try {
    const u = new URL(connectionString);
    if (u.searchParams.has('sslmode')) {
      u.searchParams.delete('sslmode');
    }
    if (u.searchParams.has('uselibpqcompat')) {
      u.searchParams.delete('uselibpqcompat');
    }
    return u.toString();
  } catch {
    return connectionString.replace(/([?&])(sslmode|uselibpqcompat)=[^&]*(&|$)/gi, '$1').replace(/[?&]$/, '');
  }
}

export const databaseConfigured = Boolean(config.databaseUrl);
const nonLocalDb = isNonLocalDatabase(config.databaseUrl);

export const pool: Pool | null = databaseConfigured
  ? new Pool({
      connectionString: nonLocalDb ? sanitizeConnectionStringForPg(config.databaseUrl) : config.databaseUrl,
      ssl: nonLocalDb ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 15,
    })
  : null;

if (pool) {
  pool.on('error', (err) => {
    console.error('PostgreSQL pool idle client error:', err.message);
  });
}

let schemaPromise: Promise<void> | null = null;
const settingsCache = new Map<string, unknown>();

export function getCachedSetting<T>(key: string, fallback: T): T {
  if (settingsCache.has(key)) {
    return settingsCache.get(key) as T;
  }
  return fallback;
}

export async function query<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }
  const res = await pool.query<T>(sql, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }
  const res = await pool.query(sql, params);
  return { rowCount: res.rowCount ?? 0 };
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
}

async function runSchemaAndSeed(): Promise<void> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }

  const client = await pool.connect();
  try {
    await client.query(`
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
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        email_verification_token TEXT,
        reset_token TEXT,
        preferred_currency TEXT NOT NULL DEFAULT 'USD',
        preferred_language TEXT NOT NULL DEFAULT 'EN',
        display_theme TEXT NOT NULL DEFAULT 'light',
        virtual_workspace_balance DOUBLE PRECISION NOT NULL DEFAULT 10000.00,
        exchange_balances_json TEXT NOT NULL DEFAULT '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}',
        deriv_nickname TEXT DEFAULT '',
        deriv_client_id TEXT DEFAULT '',
        last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    `);

    // Idempotent column migrations for pre-existing tables
    await client.query(`
      ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS deriv_login_id TEXT;
      ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS deriv_account_id TEXT;
      ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS balance_locked_by_admin BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS last_known_balance DOUBLE PRECISION NOT NULL DEFAULT 0;
      ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS balance DOUBLE PRECISION NOT NULL DEFAULT 0;
      ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS scopes TEXT DEFAULT 'trade account_manage';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS virtual_workspace_balance DOUBLE PRECISION NOT NULL DEFAULT 10000.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS exchange_balances_json TEXT NOT NULL DEFAULT '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS real_wallets_json TEXT NOT NULL DEFAULT '{"options":0,"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_wallets_json TEXT NOT NULL DEFAULT '{"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS real_exchange_balances_json TEXT NOT NULL DEFAULT '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deriv_nickname TEXT DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deriv_client_id TEXT DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
      UPDATE users SET last_login_at = COALESCE(last_login_at, updated_at, created_at, NOW()) WHERE last_login_at IS NULL;
      ALTER TABLE virtual_orders ADD COLUMN IF NOT EXISTS strategy_key TEXT DEFAULT '';
      ALTER TABLE virtual_orders ADD COLUMN IF NOT EXISTS timeframe TEXT DEFAULT '';
      ALTER TABLE virtual_orders ADD COLUMN IF NOT EXISTS account_mode TEXT DEFAULT 'demo';
      ALTER TABLE virtual_orders ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
      ALTER TABLE cashier_transactions ADD COLUMN IF NOT EXISTS account_mode TEXT NOT NULL DEFAULT 'demo';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trading_suspended BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
      ALTER TABLE administrator_audit_logs ADD COLUMN IF NOT EXISTS previous_value TEXT DEFAULT '';
      ALTER TABLE administrator_audit_logs ADD COLUMN IF NOT EXISTS new_value TEXT DEFAULT '';
      ALTER TABLE administrator_audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT DEFAULT 'unknown';
      ALTER TABLE administrator_audit_logs ADD COLUMN IF NOT EXISTS action_result TEXT NOT NULL DEFAULT 'success';
    `);

    // Auto-heal misclassified DOT.../VR... demo Deriv accounts from earlier OAuth saves
    await client.query(`
      UPDATE connected_accounts
      SET is_virtual = TRUE,
          account_type = CASE WHEN account_type = 'Real Options' THEN 'Demo Options' ELSE account_type END,
          updated_at = NOW()
      WHERE is_virtual = FALSE
        AND (
          UPPER(COALESCE(deriv_login_id, '')) LIKE 'DOT%'
          OR UPPER(COALESCE(deriv_login_id, '')) LIKE 'VR%'
          OR LOWER(COALESCE(account_type, '')) LIKE '%demo%'
        );
    `);

    await client.query(`
      UPDATE connected_accounts
      SET deriv_login_id = deriv_account_id
      WHERE deriv_login_id IS NULL AND deriv_account_id IS NOT NULL;

      UPDATE connected_accounts
      SET deriv_account_id = deriv_login_id
      WHERE deriv_account_id IS NULL AND deriv_login_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_connected_accounts_user_login
      ON connected_accounts (user_id, deriv_login_id);

      CREATE INDEX IF NOT EXISTS idx_virtual_orders_user_status ON virtual_orders (user_id, status, opened_at DESC);
      CREATE INDEX IF NOT EXISTS idx_smart_alerts_user_status ON smart_alerts (user_id, status);
      CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email_time ON admin_login_attempts (email, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_journal_user_time ON trading_journal_entries (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cashier_tx_user_time ON cashier_transactions (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON administrator_audit_logs (created_at DESC);

      ALTER TABLE risk_settings ALTER COLUMN risk_per_trade_pct SET DEFAULT 2.0;
      ALTER TABLE risk_settings ALTER COLUMN daily_loss_limit_usd SET DEFAULT 10.0;
      ALTER TABLE risk_settings ALTER COLUMN max_exposure_usd SET DEFAULT 15.0;
      ALTER TABLE risk_settings ALTER COLUMN max_consecutive_losses SET DEFAULT 3;

      UPDATE risk_settings
      SET risk_per_trade_pct = 2.0,
          daily_loss_limit_usd = 10.0,
          max_exposure_usd = 15.0,
          max_consecutive_losses = 3,
          updated_at = NOW()
      WHERE risk_per_trade_pct = 1.5
        AND daily_loss_limit_usd = 150.0
        AND max_exposure_usd = 500.0
        AND max_consecutive_losses = 4;
    `);

    // Seed roles
    await client.query(
      `INSERT INTO roles (name, description) VALUES
        ('user', 'Standard trader account'),
        ('admin', 'Platform administrator'),
        ('owner', 'Platform owner with MIS & commission access')
       ON CONFLICT (name) DO NOTHING`
    );

    // Seed curated Deriv instruments
    for (const inst of CURATED_DERIV_INSTRUMENTS) {
      await client.query(
        `INSERT INTO market_instruments (symbol, display_name, category, market, submarket, pip_size, spread)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (symbol) DO NOTHING`,
        [inst.symbol, inst.display_name, inst.category, inst.market, inst.submarket, inst.pip_size, inst.spread]
      );

      const spark: number[] = [];
      let p = inst.base_price;
      for (let i = 0; i < 24; i++) {
        const drift = Math.sin(i * 0.7 + inst.symbol.length) * 0.0025 * inst.base_price;
        p = Number((inst.base_price + drift).toFixed(inst.pip_size < 0.001 ? 5 : 2));
        spark.push(p);
      }
      const chg = Number((((spark[spark.length - 1] - spark[0]) / (spark[0] || 1)) * 100).toFixed(2));
      await client.query(
        `INSERT INTO market_data_cache (symbol, price, change_pct, high_24h, low_24h, sparkline_json)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (symbol) DO NOTHING`,
        [inst.symbol, spark[spark.length - 1], chg, Math.max(...spark), Math.min(...spark), JSON.stringify(spark)]
      );
    }

    // Seed bot strategies
    for (const s of SEEDED_BOT_STRATEGIES) {
      await client.query(
        `INSERT INTO bot_strategies (name, slug, category, symbol, contract_type, description, win_rate_est, rating, is_premium, config_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (slug) DO NOTHING`,
        [
          s.name,
          s.slug,
          s.category,
          s.symbol,
          s.contract_type,
          s.description,
          s.win_rate_est,
          s.rating,
          Boolean(s.is_premium),
          JSON.stringify(s.config),
        ]
      );
    }

    // Seed default settings
    const defaultSettings: Array<[string, Record<string, unknown>]> = [
      [
        'branding',
        {
          appName: 'DERIV',
          supportEmail: 'support@deriv.com',
          supportPhone: '+254 700 000 000',
          tagline: 'Trading for Anyone Anywhere Anytime',
          heroTitle: 'Trading for',
          heroSubtitle: 'Anyone Anywhere Anytime',
          heroDescription: 'Widest range of products, markets, platforms with 24/7 customer support.',
        },
      ],
      [
        'global',
        {
          kesRate: 130.0,
          tickerText:
            'BTC/USD +2.18% · Volatility 100 (1s) Live · XAU/USD $3,735.00 · Instant M-Pesa & Crypto Cashier · Zero-Delay Deriv Bot Engine Active',
          maintenanceMode: false,
          allowRegistration: true,
          defaultVirtualBalance: 10000.0,
          adminPrivateSlug: config.adminPrivateSlug,
          derivAppId: config.derivAppId,
        },
      ],
      [
        'commissions',
        {
          derivAppId: config.derivAppId,
          markupPercentage: 3.0,
          affiliateLink: 'https://t.deriv.link?t=FSDRTFVTSKPA',
          affiliateCode: 'VNMH2VHBRTFN',
          affiliateToken: 'FSDRTFVTSKPA',
          affiliateTierRate: 30.0,
          hasOwnerToken: false,
        },
      ],
      [
        'trading_engine',
        {
          botWinRatePct: 76,
          analyserWinRatePct: 82,
          accuWinRatePct: 78,
          manualOptionsWinRatePct: 68,
          siteSettlementForLockedReal: true,
          liveMicroTickEnabled: true,
        },
      ],
      [
        'announcements',
        {
          items: [
            {
              id: 'ann-1',
              title: 'New Crash/Boom & 1s Volatility Liquidity',
              message: 'Trade spikes with Rise/Fall, Over/Under, Accumulators, and Multipliers directly on Deriv.',
              severity: 'info',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
    ];

    for (const [key, value] of defaultSettings) {
      await client.query(
        `INSERT INTO application_settings (key, value_json) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(value)]
      );
    }

    // Populate in-memory settings cache & auto-heal invalid or placeholder '1089' derivAppIds when a real App ID is configured
    const isValidAppId = (v: unknown) =>
      typeof v === 'string' && /^[A-Za-z0-9_-]{2,64}$/.test(v.trim());

    const cachedRows = await client.query<{ key: string; value_json: string }>(
      'SELECT key, value_json FROM application_settings'
    );
    const parsedMap = new Map<string, any>();
    for (const row of cachedRows.rows) {
      try {
        parsedMap.set(row.key, JSON.parse(row.value_json));
      } catch {
        // ignore invalid JSON
      }
    }

    const envAppId = isValidAppId(config.derivAppId) ? String(config.derivAppId).trim() : '1089';
    const globalAppId = isValidAppId(parsedMap.get('global')?.derivAppId)
      ? String(parsedMap.get('global').derivAppId).trim()
      : '';
    const commAppId = isValidAppId(parsedMap.get('commissions')?.derivAppId)
      ? String(parsedMap.get('commissions').derivAppId).trim()
      : '';
    const preferredAppId =
      [commAppId, globalAppId, envAppId].find((id) => isValidAppId(id) && id !== '1089') ||
      [commAppId, globalAppId, envAppId].find(isValidAppId) ||
      '1089';

    for (const [key, parsed] of parsedMap.entries()) {
      if (key === 'branding' && parsed && typeof parsed === 'object') {
        let bChanged = false;
        if (parsed.appName === 'TradeDeriv' || !parsed.appName) {
          parsed.appName = 'DERIV';
          bChanged = true;
        }
        if (parsed.supportEmail === 'support@tradederiv.app' || !parsed.supportEmail) {
          parsed.supportEmail = 'support@deriv.com';
          bChanged = true;
        }
        if (!parsed.heroTitle) {
          parsed.heroTitle = 'Trading for';
          bChanged = true;
        }
        if (!parsed.heroSubtitle) {
          parsed.heroSubtitle = 'Anyone Anywhere Anytime';
          bChanged = true;
        }
        if (!parsed.heroDescription) {
          parsed.heroDescription = 'Widest range of products, markets, platforms with 24/7 customer support.';
          bChanged = true;
        }
        if (bChanged) {
          await client.query(
            'UPDATE application_settings SET value_json = $1, updated_at = NOW() WHERE key = $2',
            [JSON.stringify(parsed), key]
          );
        }
      }
      if ((key === 'global' || key === 'commissions') && parsed && typeof parsed === 'object') {
        let changed = false;
        const currentId = typeof parsed.derivAppId === 'string' ? parsed.derivAppId.trim() : '';
        const shouldHeal =
          !isValidAppId(currentId) || (currentId === '1089' && preferredAppId !== '1089');
        if (shouldHeal) {
          parsed.derivAppId = preferredAppId;
          changed = true;
        }
        if (key === 'commissions') {
          const curLink = typeof parsed.affiliateLink === 'string' ? parsed.affiliateLink.trim() : '';
          if (!curLink || curLink === 'https://track.deriv.com/_tradederiv_ib/') {
            parsed.affiliateLink = 'https://t.deriv.link?t=FSDRTFVTSKPA';
            changed = true;
          }
          if (!parsed.affiliateCode) {
            parsed.affiliateCode = 'VNMH2VHBRTFN';
            changed = true;
          }
          if (!parsed.affiliateToken) {
            parsed.affiliateToken = 'FSDRTFVTSKPA';
            changed = true;
          }
          if (!parsed.affiliateTierRate) {
            parsed.affiliateTierRate = 30.0;
            changed = true;
          }
        }
        if (changed) {
          await client.query(
            'UPDATE application_settings SET value_json = $1, updated_at = NOW() WHERE key = $2',
            [JSON.stringify(parsed), key]
          );
        }
      }
      settingsCache.set(key, parsed);
    }

    // Optional env-var Owner bootstrap when ADMIN_EMAIL and ADMIN_PASSWORD are provided
    if (config.adminBootstrapEmail && config.adminBootstrapPassword.length >= 8) {
      const existingOwner = await client.query("SELECT id FROM users WHERE role IN ('admin', 'owner') LIMIT 1");
      if (existingOwner.rows.length === 0) {
        const hash = await hashPasswordArgon2id(config.adminBootstrapPassword);
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO users (email, password_hash, full_name, role, status, email_verified, virtual_workspace_balance, deriv_client_id)
           VALUES ($1, $2, $3, 'owner', 'active', TRUE, 100000.00, $4)
           ON CONFLICT (email) DO NOTHING
           RETURNING id`,
          [config.adminBootstrapEmail, hash, config.adminBootstrapFullName || 'Platform Owner', `OWNER-${randomId(3).toUpperCase()}`]
        );
        if (inserted.rows[0]?.id) {
          await client.query(
            `INSERT INTO administrator_audit_logs (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address, action_result, details_json)
             VALUES ($1, 'owner_env_bootstrap', 'users', $2, '', $3, 'system', 'success', $4)`,
            [
              inserted.rows[0].id,
              String(inserted.rows[0].id),
              config.adminBootstrapEmail,
              JSON.stringify({ email: config.adminBootstrapEmail, via: 'env_bootstrap' }),
            ]
          );
        }
      }
    }
  } finally {
    client.release();
  }
}

export async function ensureDatabaseSchema(): Promise<void> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!schemaPromise) {
    schemaPromise = runSchemaAndSeed().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

export async function requireDb(_req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!pool) {
    res.status(503).json({ error: 'PostgreSQL DATABASE_URL is not configured on the server.' });
    return;
  }
  try {
    await ensureDatabaseSchema();
    next();
  } catch (err) {
    console.error('Database availability check failed:', err);
    res.status(503).json({
      error: 'Database temporarily unavailable (Neon wakeup or connection error). Please retry.',
    });
  }
}

export async function checkDatabaseHealth(): Promise<{
  ok: boolean;
  configured: boolean;
  connected: boolean;
  latencyMs: number;
}> {
  if (!pool) {
    return { ok: false, configured: false, connected: false, latencyMs: 0 };
  }
  const t0 = Date.now();
  try {
    await ensureDatabaseSchema();
    await pool.query('SELECT 1');
    return { ok: true, configured: true, connected: true, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false, configured: true, connected: false, latencyMs: Date.now() - t0 };
  }
}

export async function getSetting<T = Record<string, unknown>>(key: string, fallback: T): Promise<T> {
  if (!pool) return getCachedSetting(key, fallback);
  try {
    const row = await queryOne<{ value_json: string }>('SELECT value_json FROM application_settings WHERE key = $1', [
      key,
    ]);
    if (!row) return fallback;
    const parsed = JSON.parse(row.value_json) as T;
    settingsCache.set(key, parsed);
    return parsed;
  } catch {
    return getCachedSetting(key, fallback);
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  settingsCache.set(key, value);
  await execute(
    `INSERT INTO application_settings (key, value_json, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

export async function addNotification(userId: number, title: string, message: string, category = 'system'): Promise<void> {
  if (!pool) return;
  await execute(
    'INSERT INTO notifications (user_id, title, message, category) VALUES ($1, $2, $3, $4)',
    [userId, title, message, category]
  );
}

export async function logSecurityEvent(
  userId: number | null,
  eventType: string,
  ipAddress = 'unknown',
  details: Record<string, unknown> = {}
): Promise<void> {
  if (!pool) return;
  await execute(
    'INSERT INTO security_logs (user_id, event_type, ip_address, details_json) VALUES ($1, $2, $3, $4)',
    [userId, eventType, ipAddress, JSON.stringify(details)]
  );
}

export async function logAdminAction(
  adminUserId: number | null,
  action: string,
  targetType: string,
  targetId = '',
  details: Record<string, unknown> = {},
  meta?: {
    previousValue?: string;
    newValue?: string;
    ipAddress?: string;
    actionResult?: 'success' | 'denied' | 'error';
  }
): Promise<void> {
  if (!pool) return;
  const prevVal = meta?.previousValue ?? (details.previousValue !== undefined ? String(details.previousValue) : '');
  const nextVal = meta?.newValue ?? (details.newValue !== undefined ? String(details.newValue) : '');
  const ip = meta?.ipAddress ?? (details.ipAddress !== undefined ? String(details.ipAddress) : 'unknown');
  const result = meta?.actionResult ?? 'success';
  await execute(
    `INSERT INTO administrator_audit_logs
      (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address, action_result, details_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [adminUserId, action, targetType, targetId, prevVal, nextVal, ip, result, JSON.stringify(details)]
  );
}

export async function logSystemError(
  source: string,
  message: string,
  severity: 'warn' | 'error' | 'critical' = 'error',
  details: Record<string, unknown> = {}
): Promise<void> {
  if (!pool) return;
  try {
    await execute(
      'INSERT INTO system_error_logs (source, severity, message, details_json) VALUES ($1, $2, $3, $4)',
      [source, severity, message.slice(0, 500), JSON.stringify(details)]
    );
  } catch {
    // avoid recursive error loops if DB is down
  }
}

