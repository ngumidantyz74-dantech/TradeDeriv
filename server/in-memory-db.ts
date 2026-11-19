import { CURATED_DERIV_INSTRUMENTS, SEEDED_BOT_STRATEGIES } from './catalog.ts';
import { config } from './config.ts';

type Row = Record<string, any>;

interface TableStore {
  rows: Row[];
  seq: number;
}

class InMemoryPgStore {
  private tables = new Map<string, TableStore>();
  private initialized = false;

  private getTable(name: string): TableStore {
    let t = this.tables.get(name);
    if (!t) {
      t = { rows: [], seq: 1 };
      this.tables.set(name, t);
    }
    return t;
  }

  private insertRow(tableName: string, data: Row): Row {
    const t = this.getTable(tableName);
    const now = new Date().toISOString();
    const row: Row = {
      ...(data.id === undefined && tableName !== 'market_instruments' && tableName !== 'market_data_cache' && tableName !== 'application_settings' && tableName !== 'risk_settings' && tableName !== 'user_workspace_preferences'
        ? { id: t.seq++ }
        : {}),
      created_at: now,
      updated_at: now,
      ...data,
    };
    t.rows.push(row);
    return { ...row };
  }

  public initSeed(): void {
    if (this.initialized) return;
    this.initialized = true;

    const tableNames = [
      'roles',
      'users',
      'connected_accounts',
      'account_authorizations',
      'market_instruments',
      'market_data_cache',
      'virtual_orders',
      'bot_strategies',
      'cashier_transactions',
      'watchlists',
      'notifications',
      'email_logs',
      'application_settings',
      'administrator_audit_logs',
      'security_logs',
      'admin_login_attempts',
      'system_error_logs',
      'risk_settings',
      'user_strategies',
      'strategy_backtest_runs',
      'trading_journal_entries',
      'smart_alerts',
      'user_workspace_preferences',
      'bot_definitions',
      'bot_runs',
      'bot_execution_logs',
      'analyser_signals',
      'mt5_bridge_connections',
      'mt5_bridge_orders',
      'market_feed_snapshots',
      'chart_layouts',
    ];
    for (const name of tableNames) this.getTable(name);

    this.insertRow('roles', { name: 'user', description: 'Standard trader account' });
    this.insertRow('roles', { name: 'admin', description: 'Platform administrator' });
    this.insertRow('roles', { name: 'owner', description: 'Platform owner with MIS & commission access' });

    for (const inst of CURATED_DERIV_INSTRUMENTS) {
      this.insertRow('market_instruments', {
        symbol: inst.symbol,
        display_name: inst.display_name,
        category: inst.category,
        market: inst.market,
        submarket: inst.submarket,
        pip_size: inst.pip_size,
        min_stake: 0.35,
        max_stake: 50000,
        spread: inst.spread,
        is_active: true,
      });

      const spark: number[] = [];
      for (let i = 0; i < 24; i++) {
        const drift = Math.sin(i * 0.7 + inst.symbol.length) * 0.0025 * inst.base_price;
        spark.push(Number((inst.base_price + drift).toFixed(inst.pip_size < 0.001 ? 5 : 2)));
      }
      const chg = Number((((spark[spark.length - 1] - spark[0]) / (spark[0] || 1)) * 100).toFixed(2));
      this.insertRow('market_data_cache', {
        symbol: inst.symbol,
        price: spark[spark.length - 1],
        change_pct: chg,
        high_24h: Math.max(...spark),
        low_24h: Math.min(...spark),
        sparkline_json: JSON.stringify(spark),
      });
    }

    for (const s of SEEDED_BOT_STRATEGIES) {
      this.insertRow('bot_strategies', {
        name: s.name,
        slug: s.slug,
        category: s.category,
        symbol: s.symbol,
        contract_type: s.contract_type,
        description: s.description,
        win_rate_est: s.win_rate_est,
        rating: s.rating,
        is_premium: Boolean(s.is_premium),
        is_active: true,
        config_json: JSON.stringify(s.config),
        xml_template: '',
      });
    }

    const defaults: Array<[string, Record<string, unknown>]> = [
      [
        'branding',
        {
          appName: 'TradeDeriv',
          supportEmail: 'support@tradederiv.app',
          supportPhone: '+254 700 000 000',
          tagline: 'Trading for Anyone Anywhere Anytime',
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
        'announcements',
        {
          items: [
            {
              id: 'ann-1',
              title: 'New Crash/Boom & 1s Volatility Liquidity',
              message: 'Trade spikes with Rise/Fall, Over/Under, and Multipliers directly on TradeDeriv.',
              severity: 'info',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
    ];
    for (const [key, val] of defaults) {
      this.insertRow('application_settings', {
        key,
        value_json: JSON.stringify(val),
      });
    }
  }

  public async executeQuery(rawSql: string, params: unknown[] = []): Promise<{ rows: any[]; rowCount: number }> {
    this.initSeed();
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    const upper = sql.toUpperCase();

    if (upper === 'SELECT 1' || upper === 'BEGIN' || upper === 'COMMIT' || upper === 'ROLLBACK') {
      return { rows: upper === 'SELECT 1' ? [{ '?column?': 1 }] : [], rowCount: 0 };
    }

    // 1. application_settings
    if (sql.includes('FROM application_settings WHERE key = $1')) {
      const row = this.getTable('application_settings').rows.find((r) => r.key === params[0]);
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('FROM application_settings')) {
      return {
        rows: this.getTable('application_settings').rows.map((r) => ({ ...r })),
        rowCount: this.getTable('application_settings').rows.length,
      };
    }
    if (upper.startsWith('INSERT INTO APPLICATION_SETTINGS')) {
      const [key, valueJson] = params as [string, string];
      const tbl = this.getTable('application_settings');
      const existing = tbl.rows.find((r) => r.key === key);
      if (existing) {
        if (upper.includes('DO UPDATE')) {
          existing.value_json = valueJson;
          existing.updated_at = new Date().toISOString();
        }
      } else {
        this.insertRow('application_settings', { key, value_json: valueJson });
      }
      return { rows: [], rowCount: 1 };
    }

    // 2. market_instruments & market_data_cache
    if (sql.includes('FROM market_instruments m LEFT JOIN market_data_cache c')) {
      const cacheMap = new Map(this.getTable('market_data_cache').rows.map((c) => [c.symbol, c]));
      const rows = this.getTable('market_instruments')
        .rows.filter((m) => m.is_active !== false)
        .map((m): Row => {
          const c = cacheMap.get(m.symbol);
          return {
            ...m,
            price: c?.price ?? 1000,
            change_pct: c?.change_pct ?? 0,
            sparkline_json: c?.sparkline_json ?? '[]',
          };
        })
        .sort((a, b) => a.category.localeCompare(b.category) || a.display_name.localeCompare(b.display_name));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM market_instruments WHERE symbol = $1')) {
      const r = this.getTable('market_instruments').rows.find((x) => x.symbol === params[0]);
      return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
    }
    if (sql.includes('FROM market_data_cache WHERE symbol = $1')) {
      const r = this.getTable('market_data_cache').rows.find((x) => x.symbol === params[0]);
      return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
    }
    if (upper.startsWith('INSERT INTO MARKET_INSTRUMENTS')) {
      const [symbol, display_name, category, market, submarket, pip_size] = params as any[];
      const tbl = this.getTable('market_instruments');
      const ex = tbl.rows.find((r) => r.symbol === symbol);
      if (ex) {
        ex.display_name = display_name;
        ex.market = market;
        ex.submarket = submarket;
        ex.pip_size = pip_size;
        ex.updated_at = new Date().toISOString();
      } else {
        this.insertRow('market_instruments', {
          symbol,
          display_name,
          category,
          market,
          submarket,
          pip_size,
          min_stake: 0.35,
          max_stake: 50000,
          spread: 0.15,
          is_active: true,
        });
      }
      return { rows: [], rowCount: 1 };
    }

    // 3. users
    if (upper.startsWith('INSERT INTO USERS')) {
      if (sql.includes("'owner'")) {
        const [email, password_hash, full_name, deriv_client_id] = params as any[];
        const row = this.insertRow('users', {
          email: String(email).toLowerCase(),
          password_hash,
          full_name,
          phone: '',
          country: 'Kenya',
          role: 'owner',
          status: 'active',
          email_verified: true,
          email_verification_token: null,
          reset_token: null,
          preferred_currency: 'USD',
          preferred_language: 'EN',
          display_theme: 'light',
          virtual_workspace_balance: 100000.0,
          exchange_balances_json: '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}',
          real_wallets_json: '{"options":0,"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}',
          demo_wallets_json: '{"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}',
          real_exchange_balances_json: '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}',
          deriv_nickname: '',
          deriv_client_id,
        });
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes('deriv_nickname')) {
        const [email, password_hash, full_name, phone, country, virtual_workspace_balance, deriv_nickname, deriv_client_id] =
          params as any[];
        const row = this.insertRow('users', {
          email: String(email).toLowerCase(),
          password_hash,
          full_name,
          phone: phone || '',
          country: country || 'Kenya',
          role: 'user',
          status: 'active',
          email_verified: true,
          email_verification_token: null,
          reset_token: null,
          preferred_currency: 'USD',
          preferred_language: 'EN',
          display_theme: 'light',
          virtual_workspace_balance: Number(virtual_workspace_balance ?? 10000),
          exchange_balances_json: '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}',
          real_wallets_json: '{"options":0,"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}',
          demo_wallets_json: '{"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}',
          real_exchange_balances_json: '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}',
          deriv_nickname: deriv_nickname || '',
          deriv_client_id: deriv_client_id || '',
        });
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes('email_verification_token')) {
        const [email, password_hash, full_name, phone, country, email_verification_token, virtual_workspace_balance, deriv_client_id] =
          params as any[];
        const row = this.insertRow('users', {
          email: String(email).toLowerCase(),
          password_hash,
          full_name,
          phone: phone || '',
          country: country || 'Kenya',
          role: 'user',
          status: 'active',
          email_verified: false,
          email_verification_token,
          reset_token: null,
          preferred_currency: 'USD',
          preferred_language: 'EN',
          display_theme: 'light',
          virtual_workspace_balance: Number(virtual_workspace_balance ?? 10000),
          exchange_balances_json: '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}',
          real_wallets_json: '{"options":0,"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}',
          demo_wallets_json: '{"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}',
          real_exchange_balances_json: '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}',
          deriv_nickname: '',
          deriv_client_id: deriv_client_id || '',
        });
        return { rows: [row], rowCount: 1 };
      }
      // admin create user
      const [email, password_hash, full_name, role, virtual_workspace_balance, deriv_client_id] = params as any[];
      const tbl = this.getTable('users');
      if (tbl.rows.some((u) => u.email === String(email).toLowerCase())) {
        throw new Error('duplicate key value violates unique constraint "users_email_key"');
      }
      const row = this.insertRow('users', {
        email: String(email).toLowerCase(),
        password_hash,
        full_name,
        phone: '',
        country: 'Kenya',
        role: role || 'user',
        status: 'active',
        email_verified: true,
        email_verification_token: null,
        reset_token: null,
        preferred_currency: 'USD',
        preferred_language: 'EN',
        display_theme: 'light',
        virtual_workspace_balance: Number(virtual_workspace_balance ?? 10000),
        exchange_balances_json: '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}',
        real_wallets_json: '{"options":0,"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}',
        demo_wallets_json: '{"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}',
        real_exchange_balances_json: '{"USDT":0,"USDC":0,"BTC":0,"ETH":0,"LTC":0,"DOGE":0,"XRP":0,"SOL":0,"ADA":0,"TRX":0}',
        deriv_nickname: '',
        deriv_client_id: deriv_client_id || '',
      });
      return { rows: [row], rowCount: 1 };
    }

    if (sql.includes('FROM users') && upper.startsWith('SELECT')) {
      const users = this.getTable('users').rows;
      if (sql.includes('COUNT(*)::int as c FROM users')) {
        const c = users.filter((u) => !['owner', 'admin'].includes(u.role)).length;
        return { rows: [{ c }], rowCount: 1 };
      }
      if (sql.includes("WHERE role IN ('admin', 'owner') LIMIT 1")) {
        const r = users.find((u) => ['admin', 'owner'].includes(u.role));
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes("WHERE email = $1 AND role IN ('admin', 'owner')")) {
        const r = users.find((u) => u.email === String(params[0]).toLowerCase() && ['admin', 'owner'].includes(u.role));
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes("WHERE id = $1 AND role NOT IN ('owner', 'admin')")) {
        const r = users.find((u) => u.id === Number(params[0]) && !['owner', 'admin'].includes(u.role));
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes("WHERE LOWER(email) = $1 AND role NOT IN ('owner', 'admin')")) {
        const r = users.find((u) => u.email.toLowerCase() === String(params[0]).toLowerCase() && !['owner', 'admin'].includes(u.role));
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes("WHERE LOWER(email) = $1 AND role IN ('owner', 'admin')")) {
        const r = users.find((u) => u.email.toLowerCase() === String(params[0]).toLowerCase() && ['owner', 'admin'].includes(u.role));
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('WHERE email = $1')) {
        const r = users.find((u) => u.email === String(params[0]).toLowerCase());
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('WHERE id = $1')) {
        const r = users.find((u) => u.id === Number(params[0]));
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('WHERE email_verification_token = $1')) {
        const r = users.find((u) => u.email_verification_token === params[0]);
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('WHERE reset_token = $1')) {
        const r = users.find((u) => u.reset_token === params[0]);
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes("WHERE role NOT IN ('owner', 'admin')")) {
        const list = users.filter((u) => !['owner', 'admin'].includes(u.role)).sort((a, b) => b.id - a.id);
        return { rows: list.map((u) => ({ ...u })), rowCount: list.length };
      }
    }

    if (upper.startsWith('UPDATE USERS SET')) {
      const users = this.getTable('users').rows;
      const targetId = Number(params[params.length - 1]);
      const u = users.find((x) => x.id === targetId);
      if (!u) return { rows: [], rowCount: 0 };

      if (sql.includes('email_verified = TRUE')) {
        u.email_verified = true;
        u.email_verification_token = null;
      } else if (sql.includes('reset_token = $1') && sql.includes('password_hash = $1') === false) {
        u.reset_token = params[0];
      } else if (sql.includes('password_hash = $1, reset_token = NULL')) {
        u.password_hash = params[0];
        u.reset_token = null;
      } else if (sql.includes('password_hash = $1')) {
        u.password_hash = params[0];
      } else if (sql.includes('email = $1')) {
        u.email = String(params[0]).toLowerCase();
      } else if (sql.includes('full_name = $1')) {
        u.full_name = params[0];
      } else if (sql.includes('role = $1')) {
        u.role = params[0];
      } else if (sql.includes("status = 'closed'")) {
        u.status = 'closed';
      } else if (sql.includes('status = $1')) {
        u.status = params[0];
      } else if (sql.includes('real_exchange_balances_json = $1, real_wallets_json = $2')) {
        u.real_exchange_balances_json = params[0];
        u.real_wallets_json = params[1];
      } else if (sql.includes('real_wallets_json = $1, real_exchange_balances_json = $2')) {
        u.real_wallets_json = params[0];
        u.real_exchange_balances_json = params[1];
      } else if (sql.includes('exchange_balances_json = $1, demo_wallets_json = $2')) {
        u.exchange_balances_json = params[0];
        u.demo_wallets_json = params[1];
      } else if (sql.includes('virtual_workspace_balance = $1, demo_wallets_json = $2, exchange_balances_json = $3')) {
        u.virtual_workspace_balance = Number(params[0]);
        u.demo_wallets_json = params[1];
        u.exchange_balances_json = params[2];
      } else if (sql.includes('virtual_workspace_balance = 10000.00')) {
        u.virtual_workspace_balance = 10000.0;
        u.demo_wallets_json = '{"mt5_standard":0,"mt5_gold":0,"exchange_usdt":0}';
      } else if (sql.includes('virtual_workspace_balance = ROUND((virtual_workspace_balance - $1)')) {
        u.virtual_workspace_balance = Number((Number(u.virtual_workspace_balance) - Number(params[0])).toFixed(2));
      } else if (sql.includes('virtual_workspace_balance = ROUND((virtual_workspace_balance + $1)')) {
        u.virtual_workspace_balance = Number((Number(u.virtual_workspace_balance) + Number(params[0])).toFixed(2));
      } else if (sql.includes('virtual_workspace_balance = $1')) {
        u.virtual_workspace_balance = Number(params[0]);
      } else if (sql.includes('real_wallets_json = $1')) {
        u.real_wallets_json = params[0];
      } else if (sql.includes('preferred_currency = COALESCE')) {
        const [full_name, phone, country, preferred_currency, preferred_language, display_theme] = params as any[];
        if (full_name !== null && full_name !== undefined) u.full_name = full_name;
        if (phone !== null && phone !== undefined) u.phone = phone;
        if (country !== null && country !== undefined) u.country = country;
        if (preferred_currency !== null && preferred_currency !== undefined) u.preferred_currency = preferred_currency;
        if (preferred_language !== null && preferred_language !== undefined) u.preferred_language = preferred_language;
        if (display_theme !== null && display_theme !== undefined) u.display_theme = display_theme;
      } else if (sql.includes('deriv_nickname = COALESCE')) {
        const [full_name, phone, country, deriv_nickname, deriv_client_id] = params as any[];
        if (full_name) u.full_name = full_name;
        if (phone) u.phone = phone;
        if (country) u.country = country;
        if (deriv_nickname) u.deriv_nickname = deriv_nickname;
        if (deriv_client_id) u.deriv_client_id = deriv_client_id;
      } else if (sql.includes('virtual_workspace_balance = COALESCE')) {
        const [full_name, phone, country, role, status, vwb] = params as any[];
        if (full_name !== null && full_name !== undefined) u.full_name = full_name;
        if (phone !== null && phone !== undefined) u.phone = phone;
        if (country !== null && country !== undefined) u.country = country;
        if (role !== null && role !== undefined) u.role = role;
        if (status !== null && status !== undefined) u.status = status;
        if (vwb !== null && vwb !== undefined) u.virtual_workspace_balance = Number(vwb);
      }
      u.updated_at = new Date().toISOString();
      return { rows: [{ ...u }], rowCount: 1 };
    }

    if (upper.startsWith('DELETE FROM USERS WHERE ID = $1')) {
      const tbl = this.getTable('users');
      const before = tbl.rows.length;
      tbl.rows = tbl.rows.filter((u) => u.id !== Number(params[0]));
      return { rows: [], rowCount: before - tbl.rows.length };
    }

    // 4. connected_accounts
    if (upper.startsWith('INSERT INTO CONNECTED_ACCOUNTS')) {
      const tbl = this.getTable('connected_accounts');
      if (sql.includes('ON CONFLICT (user_id, deriv_login_id)')) {
        const isAdminConnect = !sql.includes('scopes');
        if (isAdminConnect) {
          const [user_id, deriv_login_id, account_type, currency, is_virtual, balance] = params as any[];
          const ex = tbl.rows.find((a) => a.user_id === Number(user_id) && a.deriv_login_id === deriv_login_id);
          if (ex) {
            ex.account_type = account_type;
            ex.currency = currency;
            ex.is_virtual = Boolean(is_virtual);
            if (!ex.balance_locked_by_admin) {
              ex.balance = Number(balance);
              ex.last_known_balance = Number(balance);
            }
            ex.status = 'active';
            ex.updated_at = new Date().toISOString();
            return { rows: [{ ...ex }], rowCount: 1 };
          }
          const created = this.insertRow('connected_accounts', {
            user_id: Number(user_id),
            deriv_login_id,
            deriv_account_id: deriv_login_id,
            account_type,
            platform: 'deriv',
            currency,
            is_virtual: Boolean(is_virtual),
            balance: Number(balance),
            last_known_balance: Number(balance),
            balance_locked_by_admin: false,
            status: 'active',
            scopes: 'read trade',
          });
          return { rows: [created], rowCount: 1 };
        }
        const [user_id, deriv_login_id, account_type, platform, currency, is_virtual, balance, scopes, preserve] =
          params as any[];
        const ex = tbl.rows.find((a) => a.user_id === Number(user_id) && a.deriv_login_id === deriv_login_id);
        if (ex) {
          ex.account_type = account_type;
          ex.platform = platform;
          ex.currency = currency;
          ex.is_virtual = Boolean(is_virtual);
          if (!ex.balance_locked_by_admin && !preserve) {
            ex.balance = Number(balance);
            ex.last_known_balance = Number(balance);
          }
          ex.status = 'active';
          ex.scopes = scopes;
          ex.updated_at = new Date().toISOString();
          return { rows: [{ ...ex }], rowCount: 1 };
        }
        const created = this.insertRow('connected_accounts', {
          user_id: Number(user_id),
          deriv_login_id,
          deriv_account_id: deriv_login_id,
          account_type,
          platform,
          currency,
          is_virtual: Boolean(is_virtual),
          balance: Number(balance),
          last_known_balance: Number(balance),
          balance_locked_by_admin: false,
          status: 'active',
          scopes,
        });
        return { rows: [created], rowCount: 1 };
      }

      const [user_id, deriv_login_id, account_type, platform, currency, is_virtual, balance] = params as any[];
      const created = this.insertRow('connected_accounts', {
        user_id: Number(user_id),
        deriv_login_id,
        deriv_account_id: deriv_login_id,
        account_type,
        platform,
        currency,
        is_virtual: Boolean(is_virtual),
        balance: Number(balance),
        last_known_balance: Number(balance),
        balance_locked_by_admin: false,
        status: 'active',
        scopes: 'trade account_manage',
      });
      return { rows: [created], rowCount: 1 };
    }

    if (sql.includes('FROM connected_accounts') && upper.startsWith('SELECT')) {
      const accs = this.getTable('connected_accounts').rows;
      const users = this.getTable('users').rows;
      if (sql.includes('COUNT(*)::int as c FROM connected_accounts')) {
        const wantVirt = sql.includes('is_virtual = TRUE');
        const c = accs.filter((a) => {
          const u = users.find((usr) => usr.id === a.user_id);
          return a.is_virtual === wantVirt && a.status === 'active' && u && !['owner', 'admin'].includes(u.role);
        }).length;
        return { rows: [{ c }], rowCount: 1 };
      }
      if (sql.includes('COUNT(*)::text as c FROM connected_accounts')) {
        const c = accs.filter((a) => a.user_id === Number(params[0])).length;
        return { rows: [{ c: String(c) }], rowCount: 1 };
      }
      if (sql.includes('ANY($1::text[])')) {
        const ids = (params[0] as string[]) || [];
        const match = accs.find((a) => {
          const u = users.find((usr) => usr.id === a.user_id);
          return ids.includes(a.deriv_login_id) && u && !['owner', 'admin'].includes(u.role);
        });
        return { rows: match ? [{ user_id: match.user_id }] : [], rowCount: match ? 1 : 0 };
      }
      if (sql.includes('JOIN users u ON ca.user_id = u.id')) {
        const rows = accs
          .map((a) => {
            const u = users.find((usr) => usr.id === a.user_id);
            if (!u || ['owner', 'admin'].includes(u.role)) return null;
            return { ...a, balance: a.last_known_balance, user_email: u.email, user_name: u.full_name };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.id - a.id);
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('WHERE user_id = $1 AND deriv_login_id = $2')) {
        const r = accs.find((a) => a.user_id === Number(params[0]) && a.deriv_login_id === params[1]);
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('WHERE id = $1 AND user_id = $2')) {
        const r = accs.find(
          (a) => a.id === Number(params[0]) && a.user_id === Number(params[1]) && (!sql.includes("status = 'active'") || a.status === 'active')
        );
        return { rows: r ? [{ ...r, balance: r.last_known_balance }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('WHERE user_id = $1 AND is_virtual = $2')) {
        const rows = accs
          .filter((a) => a.user_id === Number(params[0]) && a.is_virtual === Boolean(params[1]) && a.status === 'active')
          .map((a) => ({ ...a, balance: a.last_known_balance }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("WHERE user_id = $1 AND is_virtual = FALSE AND platform = 'deriv' AND status = 'active'")) {
        const rows = accs
          .filter((a) => a.user_id === Number(params[0]) && !a.is_virtual && a.platform === 'deriv' && a.status === 'active')
          .map((a) => ({ ...a, balance: a.last_known_balance }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("WHERE user_id = $1 AND is_virtual = FALSE AND platform = 'deriv'")) {
        const rows = accs
          .filter((a) => a.user_id === Number(params[0]) && !a.is_virtual && a.platform === 'deriv')
          .map((a) => ({ ...a, balance: a.last_known_balance }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('WHERE user_id = $1')) {
        const rows = accs
          .filter((a) => a.user_id === Number(params[0]) && (!sql.includes("status = 'active'") || a.status === 'active'))
          .map((a) => ({ ...a, balance: a.last_known_balance }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('WHERE id = $1')) {
        const r = accs.find((a) => a.id === Number(params[0]));
        return { rows: r ? [{ ...r, balance: r.last_known_balance }] : [], rowCount: r ? 1 : 0 };
      }
    }

    if (upper.startsWith('UPDATE CONNECTED_ACCOUNTS SET')) {
      const accs = this.getTable('connected_accounts').rows;
      if (sql.includes('WHERE id = ( SELECT id FROM connected_accounts')) {
        const amt = Number(params[0]);
        const uid = Number(params[1]);
        const target = accs.find((a) => a.user_id === uid && !a.is_virtual && a.platform === 'deriv' && a.status === 'active');
        if (target) {
          target.balance = Number((Number(target.balance) + amt).toFixed(2));
          target.last_known_balance = Number((Number(target.last_known_balance) + amt).toFixed(2));
          target.updated_at = new Date().toISOString();
          return { rows: [{ ...target }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('WHERE user_id = $1 AND is_virtual = TRUE')) {
        const uid = Number(params[0]);
        for (const a of accs.filter((x) => x.user_id === uid && x.is_virtual)) {
          a.balance = a.platform === 'deriv' ? 10000.0 : 0;
          a.last_known_balance = a.balance;
          a.updated_at = new Date().toISOString();
        }
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('WHERE user_id = $2 AND is_virtual = TRUE')) {
        const bal = Number(params[0]);
        const uid = Number(params[1]);
        for (const a of accs.filter((x) => x.user_id === uid && x.is_virtual)) {
          a.balance = bal;
          a.last_known_balance = bal;
          a.balance_locked_by_admin = true;
          a.updated_at = new Date().toISOString();
        }
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("WHERE user_id = $2 AND is_virtual = FALSE AND platform = 'deriv'")) {
        const bal = Number(params[0]);
        const uid = Number(params[1]);
        for (const a of accs.filter((x) => x.user_id === uid && !x.is_virtual && x.platform === 'deriv')) {
          a.balance = bal;
          a.last_known_balance = bal;
          a.balance_locked_by_admin = true;
          a.updated_at = new Date().toISOString();
        }
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('balance_locked_by_admin = TRUE') && sql.includes('WHERE id = $3')) {
        const [bal, cur, id] = params as any[];
        const a = accs.find((x) => x.id === Number(id));
        if (!a) return { rows: [], rowCount: 0 };
        a.balance = Number(bal);
        a.last_known_balance = Number(bal);
        if (cur) a.currency = cur;
        a.balance_locked_by_admin = true;
        a.updated_at = new Date().toISOString();
        return { rows: [{ ...a }], rowCount: 1 };
      }
      if (sql.includes('balance_locked_by_admin = FALSE') && sql.includes('SET balance = $1')) {
        const [bal, id] = params as any[];
        const a = accs.find((x) => x.id === Number(id));
        if (!a) return { rows: [], rowCount: 0 };
        a.balance = Number(bal);
        a.last_known_balance = Number(bal);
        a.balance_locked_by_admin = false;
        a.updated_at = new Date().toISOString();
        return { rows: [{ ...a }], rowCount: 1 };
      }
      if (sql.includes('balance_locked_by_admin = FALSE')) {
        const a = accs.find((x) => x.id === Number(params[0]));
        if (a) {
          a.balance_locked_by_admin = false;
          a.updated_at = new Date().toISOString();
        }
        return { rows: [], rowCount: a ? 1 : 0 };
      }
      if (sql.includes("status = 'disconnected'") || sql.includes("status = 'revoked'")) {
        const status = sql.includes("'disconnected'") ? 'disconnected' : 'revoked';
        const id = Number(params[0]);
        const uid = params[1] !== undefined ? Number(params[1]) : null;
        const a = accs.find((x) => x.id === id && (uid === null || x.user_id === uid));
        if (a) {
          a.status = status;
          a.updated_at = new Date().toISOString();
        }
        return { rows: [], rowCount: a ? 1 : 0 };
      }
      if (sql.includes('SET balance = $1, last_known_balance = $1')) {
        const a = accs.find((x) => x.id === Number(params[1]));
        if (a && (!sql.includes('balance_locked_by_admin, FALSE) = FALSE') || !a.balance_locked_by_admin)) {
          a.balance = Number(params[0]);
          a.last_known_balance = Number(params[0]);
          a.updated_at = new Date().toISOString();
        }
        return { rows: [], rowCount: a ? 1 : 0 };
      }
    }

    if (upper.startsWith('DELETE FROM CONNECTED_ACCOUNTS WHERE ID = $1')) {
      const tbl = this.getTable('connected_accounts');
      const before = tbl.rows.length;
      tbl.rows = tbl.rows.filter((a) => a.id !== Number(params[0]));
      return { rows: [], rowCount: before - tbl.rows.length };
    }

    // 5. account_authorizations
    if (upper.startsWith('INSERT INTO ACCOUNT_AUTHORIZATIONS')) {
      if (sql.includes("'owner_markup'")) {
        const [user_id, encrypted_token, token_iv, token_auth_tag] = params as any[];
        const row = this.insertRow('account_authorizations', {
          connected_account_id: null,
          user_id: Number(user_id),
          auth_type: 'owner_markup',
          encrypted_token,
          token_iv,
          token_auth_tag,
          scopes: 'application_read read admin',
          revoked_at: null,
        });
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes("'pat'")) {
        const [connected_account_id, user_id, encrypted_token, token_iv, token_auth_tag] = params as any[];
        const row = this.insertRow('account_authorizations', {
          connected_account_id: Number(connected_account_id),
          user_id: Number(user_id),
          auth_type: 'pat',
          encrypted_token,
          token_iv,
          token_auth_tag,
          scopes: 'read trade',
          revoked_at: null,
        });
        return { rows: [row], rowCount: 1 };
      }
      const [connected_account_id, user_id, auth_type, encrypted_token, token_iv, token_auth_tag, scopes] =
        params as any[];
      const row = this.insertRow('account_authorizations', {
        connected_account_id: Number(connected_account_id),
        user_id: Number(user_id),
        auth_type,
        encrypted_token,
        token_iv,
        token_auth_tag,
        scopes,
        revoked_at: null,
      });
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('FROM account_authorizations') && upper.startsWith('SELECT')) {
      const rows = this.getTable('account_authorizations').rows;
      if (sql.includes("auth_type = 'owner_markup'")) {
        const found = [...rows].reverse().find((r) => r.auth_type === 'owner_markup' && !r.revoked_at);
        return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
      }
      if (sql.includes('WHERE connected_account_id = $1')) {
        const found = [...rows].reverse().find((r) => r.connected_account_id === Number(params[0]) && !r.revoked_at);
        return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
      }
      if (sql.includes('WHERE user_id = $1 AND revoked_at IS NULL')) {
        const found = [...rows].reverse().find((r) => r.user_id === Number(params[0]) && !r.revoked_at);
        return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
      }
      if (sql.includes('WHERE user_id = $1')) {
        const list = rows.filter((r) => r.user_id === Number(params[0])).sort((a, b) => b.id - a.id);
        return { rows: list.map((r) => ({ ...r })), rowCount: list.length };
      }
    }
    if (upper.startsWith('UPDATE ACCOUNT_AUTHORIZATIONS SET REVOKED_AT = NOW()')) {
      const now = new Date().toISOString();
      for (const r of this.getTable('account_authorizations').rows) {
        if (sql.includes("auth_type = 'owner_markup'") && r.auth_type === 'owner_markup') r.revoked_at = now;
        else if (sql.includes('WHERE id = $1 AND user_id = $2') && r.id === Number(params[0]) && r.user_id === Number(params[1])) r.revoked_at = now;
        else if (sql.includes('WHERE connected_account_id = $1 AND user_id = $2') && r.connected_account_id === Number(params[0]) && r.user_id === Number(params[1])) r.revoked_at = now;
        else if (sql.includes('WHERE connected_account_id = $1') && r.connected_account_id === Number(params[0])) r.revoked_at = now;
        else if (sql.includes('WHERE user_id = $1') && r.user_id === Number(params[0])) r.revoked_at = now;
      }
      return { rows: [], rowCount: 1 };
    }

    // 6. virtual_orders
    if (upper.startsWith('INSERT INTO VIRTUAL_ORDERS')) {
      const [
        user_id,
        connected_account_id,
        deriv_contract_id,
        execution_mode,
        source,
        symbol,
        side,
        contract_type,
        lots,
        stake,
        multiplier,
        entry_price,
        current_price,
        sl_price,
        tp_price,
        sl_usd,
        tp_usd,
        barrier,
        duration,
        duration_unit,
        payout,
        pnl,
        strategy_key,
        timeframe,
        account_mode,
        notes,
      ] = params as any[];
      const row = this.insertRow('virtual_orders', {
        user_id: Number(user_id),
        connected_account_id,
        deriv_contract_id,
        execution_mode,
        source,
        symbol,
        side,
        contract_type,
        lots: Number(lots),
        stake: Number(stake),
        multiplier: Number(multiplier),
        entry_price: Number(entry_price),
        current_price: Number(current_price),
        exit_price: null,
        sl_price,
        tp_price,
        sl_usd,
        tp_usd,
        barrier,
        duration: Number(duration),
        duration_unit,
        payout: Number(payout),
        pnl: Number(pnl),
        status: 'OPEN',
        opened_at: new Date().toISOString(),
        closed_at: null,
        strategy_key: strategy_key || '',
        timeframe: timeframe || '',
        account_mode: account_mode || 'demo',
        notes: notes || '',
      });
      return { rows: [row], rowCount: 1 };
    }

    if (sql.includes('FROM virtual_orders') && upper.startsWith('SELECT')) {
      const orders = this.getTable('virtual_orders').rows;
      const users = this.getTable('users').rows;
      const accs = this.getTable('connected_accounts').rows;

      if (sql.includes('SELECT DISTINCT symbol FROM virtual_orders')) {
        const syms = Array.from(new Set(orders.filter((o) => o.status === 'OPEN').map((o) => o.symbol)));
        return { rows: syms.map((symbol) => ({ symbol })), rowCount: syms.length };
      }
      if (sql.includes('COUNT(*)::int as "totalOrders"')) {
        const traderOrders = orders.filter((o) => {
          const u = users.find((usr) => usr.id === o.user_id);
          return u && !['owner', 'admin'].includes(u.role);
        });
        return {
          rows: [
            {
              totalOrders: traderOrders.length,
              openOrders: traderOrders.filter((o) => o.status === 'OPEN').length,
              grossVolume: traderOrders.reduce((s, o) => s + Number(o.stake || 0), 0),
              realizedPnl: traderOrders.filter((o) => o.status === 'CLOSED').reduce((s, o) => s + Number(o.pnl || 0), 0),
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("execution_mode, 'virtual') = 'deriv'")) {
        const derivOrders = orders.filter((o) => (o.execution_mode || 'virtual') === 'deriv');
        return {
          rows: [{ vol: derivOrders.reduce((s, o) => s + Number(o.stake || 0), 0), cnt: derivOrders.length }],
          rowCount: 1,
        };
      }
      if (sql.includes('COALESCE(SUM(pnl), 0) as daily_pnl')) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const daily_pnl = orders
          .filter((o) => o.user_id === Number(params[0]) && o.status === 'CLOSED' && new Date(o.closed_at || o.opened_at) >= todayStart)
          .reduce((s, o) => s + Number(o.pnl || 0), 0);
        return { rows: [{ daily_pnl }], rowCount: 1 };
      }
      if (sql.includes('COALESCE(SUM(stake), 0) as open_stake')) {
        const open = orders.filter((o) => o.user_id === Number(params[0]) && o.status === 'OPEN');
        return {
          rows: [{ open_stake: open.reduce((s, o) => s + Number(o.stake || 0), 0), open_count: open.length }],
          rowCount: 1,
        };
      }
      if (sql.includes('COUNT(*)::text as c FROM virtual_orders')) {
        const c = orders.filter(
          (o) => o.user_id === Number(params[0]) && o.symbol === params[1] && o.status === 'OPEN' && o.source === 'bot'
        ).length;
        return { rows: [{ c: String(c) }], rowCount: 1 };
      }
      if (sql.includes('JOIN users u ON vo.user_id = u.id')) {
        const rows = orders
          .map((o) => {
            const u = users.find((usr) => usr.id === o.user_id);
            if (!u || ['owner', 'admin'].includes(u.role)) return null;
            return { ...o, user_email: u.email };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.id - a.id);
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('LEFT JOIN connected_accounts ca ON vo.connected_account_id = ca.id')) {
        const rows = orders
          .filter((o) => o.user_id === Number(params[0]))
          .map((o): Row => {
            const ca = accs.find((a) => a.id === o.connected_account_id);
            return { ...o, acc_is_virtual: ca ? Boolean(ca.is_virtual) : true };
          })
          .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('SELECT id as transaction_id')) {
        const rows = orders
          .filter((o) => o.user_id === Number(params[0]))
          .sort((a, b) => b.id - a.id)
          .slice(0, 50)
          .map((o) => ({
            transaction_id: o.id,
            symbol: o.symbol,
            side: o.side,
            amount: o.stake,
            pnl: o.pnl,
            status: o.status,
            transaction_time: o.opened_at,
          }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("WHERE id = $1 AND status = 'OPEN'")) {
        const r = orders.find((o) => o.id === Number(params[0]) && o.status === 'OPEN');
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('WHERE id = $1 AND user_id = $2')) {
        const r = orders.find((o) => o.id === Number(params[0]) && o.user_id === Number(params[1]));
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('WHERE id = $1')) {
        const r = orders.find((o) => o.id === Number(params[0]));
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes("WHERE user_id = $1 AND symbol = $2 AND status = 'OPEN' AND source = 'bot'")) {
        const rows = orders.filter(
          (o) => o.user_id === Number(params[0]) && o.symbol === params[1] && o.status === 'OPEN' && o.source === 'bot'
        );
        return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
      }
      if (sql.includes("WHERE symbol = $1 AND status = 'OPEN' AND source != 'bot'")) {
        const rows = orders.filter((o) => o.symbol === params[0] && o.status === 'OPEN' && o.source !== 'bot');
        return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
      }
      if (sql.includes("WHERE status = 'OPEN' AND contract_type IN")) {
        const rows = orders
          .filter((o) => o.status === 'OPEN' && ['MULTUP', 'MULTDOWN', 'BUY', 'SELL', 'ACCU'].includes(o.contract_type))
          .slice(0, 100);
        return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
      }
      if (sql.includes("WHERE user_id = $1 AND status = 'CLOSED' ORDER BY closed_at DESC")) {
        const rows = orders
          .filter((o) => o.user_id === Number(params[0]) && o.status === 'CLOSED')
          .sort((a, b) => new Date(b.closed_at || 0).getTime() - new Date(a.closed_at || 0).getTime())
          .slice(0, Number(params[1] || 10));
        return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
      }
      if (sql.includes("WHERE user_id = $1 AND status = 'OPEN'")) {
        const rows = orders.filter((o) => o.user_id === Number(params[0]) && o.status === 'OPEN');
        return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
      }
      if (sql.includes('WHERE user_id = $1')) {
        const rows = orders
          .filter((o) => o.user_id === Number(params[0]))
          .sort((a, b) => b.id - a.id)
          .slice(0, 200);
        return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
      }
    }

    if (upper.startsWith('UPDATE VIRTUAL_ORDERS SET')) {
      const orders = this.getTable('virtual_orders').rows;
      if (sql.includes('payout = $2, pnl = $3')) {
        const [exit_price, payout, pnl, id] = params as any[];
        const o = orders.find((x) => x.id === Number(id));
        if (o) {
          o.status = 'CLOSED';
          o.exit_price = Number(exit_price);
          o.current_price = Number(exit_price);
          o.payout = Number(payout);
          o.pnl = Number(pnl);
          o.closed_at = new Date().toISOString();
          return { rows: [{ ...o }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("status = 'CLOSED'")) {
        const [exit_price, pnl, id] = params as any[];
        const o = orders.find((x) => x.id === Number(id));
        if (o) {
          o.status = 'CLOSED';
          o.current_price = Number(exit_price);
          o.exit_price = Number(exit_price);
          o.pnl = Number(pnl);
          o.closed_at = new Date().toISOString();
          return { rows: [{ ...o }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('sl_price = $1')) {
        const [sl_price, tp_price, sl_usd, tp_usd, id, uid] = params as any[];
        const o = orders.find((x) => x.id === Number(id) && x.user_id === Number(uid));
        if (o) {
          o.sl_price = sl_price;
          o.tp_price = tp_price;
          o.sl_usd = sl_usd;
          o.tp_usd = tp_usd;
          return { rows: [{ ...o }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('current_price = $1, pnl = $2')) {
        const [current_price, pnl, id] = params as any[];
        const o = orders.find((x) => x.id === Number(id));
        if (o) {
          o.current_price = Number(current_price);
          o.pnl = Number(pnl);
        }
        return { rows: [], rowCount: o ? 1 : 0 };
      }
    }

    if (upper.startsWith('DELETE FROM VIRTUAL_ORDERS WHERE ID = $1')) {
      const tbl = this.getTable('virtual_orders');
      const before = tbl.rows.length;
      tbl.rows = tbl.rows.filter((o) => o.id !== Number(params[0]));
      return { rows: [], rowCount: before - tbl.rows.length };
    }

    // 7. bot_strategies
    if (sql.includes('FROM bot_strategies') && upper.startsWith('SELECT')) {
      const rows = this.getTable('bot_strategies')
        .rows.filter((s) => !sql.includes('is_active = TRUE') || s.is_active)
        .sort((a, b) => b.id - a.id);
      return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
    }
    if (upper.startsWith('INSERT INTO BOT_STRATEGIES')) {
      const [name, slug, category, symbol, contract_type, description, win_rate_est, rating, is_premium, config_json] =
        params as any[];
      const row = this.insertRow('bot_strategies', {
        name,
        slug,
        category,
        symbol,
        contract_type,
        description,
        win_rate_est: Number(win_rate_est),
        rating: Number(rating),
        is_premium: Boolean(is_premium),
        is_active: true,
        config_json,
        xml_template: '',
      });
      return { rows: [row], rowCount: 1 };
    }
    if (upper.startsWith('UPDATE BOT_STRATEGIES SET')) {
      const [name, category, symbol, contract_type, description, win_rate_est, rating, is_premium, is_active, config_json, id] =
        params as any[];
      const s = this.getTable('bot_strategies').rows.find((x) => x.id === Number(id));
      if (!s) return { rows: [], rowCount: 0 };
      if (name !== null && name !== undefined) s.name = name;
      if (category !== null && category !== undefined) s.category = category;
      if (symbol !== null && symbol !== undefined) s.symbol = symbol;
      if (contract_type !== null && contract_type !== undefined) s.contract_type = contract_type;
      if (description !== null && description !== undefined) s.description = description;
      if (win_rate_est !== null && win_rate_est !== undefined) s.win_rate_est = Number(win_rate_est);
      if (rating !== null && rating !== undefined) s.rating = Number(rating);
      if (is_premium !== null && is_premium !== undefined) s.is_premium = Boolean(is_premium);
      if (is_active !== null && is_active !== undefined) s.is_active = Boolean(is_active);
      if (config_json !== null && config_json !== undefined) s.config_json = config_json;
      s.updated_at = new Date().toISOString();
      return { rows: [{ ...s }], rowCount: 1 };
    }
    if (upper.startsWith('DELETE FROM BOT_STRATEGIES WHERE ID = $1')) {
      const tbl = this.getTable('bot_strategies');
      const before = tbl.rows.length;
      tbl.rows = tbl.rows.filter((x) => x.id !== Number(params[0]));
      return { rows: [], rowCount: before - tbl.rows.length };
    }

    // 8. cashier_transactions
    if (upper.startsWith('INSERT INTO CASHIER_TRANSACTIONS')) {
      if (sql.includes("'exchange'")) {
        const [user_id, method, account_from, account_to, amount, currency, reference_id, account_mode, metadata_json] =
          params as any[];
        const row = this.insertRow('cashier_transactions', {
          user_id: Number(user_id),
          tx_type: 'exchange',
          method,
          provider: 'deriv_exchange',
          account_from,
          account_to,
          amount: Number(amount),
          currency,
          fee: 0,
          reference_id,
          status: 'completed',
          account_mode,
          metadata_json,
        });
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes("'deposit'")) {
        const [user_id, method, provider, account_to, amount, currency, reference_id, account_mode, metadata_json] =
          params as any[];
        const row = this.insertRow('cashier_transactions', {
          user_id: Number(user_id),
          tx_type: 'deposit',
          method,
          provider,
          account_from: null,
          account_to,
          amount: Number(amount),
          currency,
          fee: 0,
          reference_id,
          status: 'completed',
          account_mode,
          metadata_json,
        });
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes("'Payment Agent (M-Pesa)'")) {
        const [user_id, account_to, amount, currency, reference_id, account_mode] = params as any[];
        const row = this.insertRow('cashier_transactions', {
          user_id: Number(user_id),
          tx_type: 'withdrawal',
          method: 'Payment Agent (M-Pesa)',
          provider: 'paymentagent',
          account_from: 'USD Wallet',
          account_to,
          amount: Number(amount),
          currency,
          fee: 0,
          reference_id,
          status: 'completed',
          account_mode,
          metadata_json: '{}',
        });
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes("'withdrawal'")) {
        const [user_id, method, amount, currency, reference_id, account_mode, metadata_json] = params as any[];
        const row = this.insertRow('cashier_transactions', {
          user_id: Number(user_id),
          tx_type: 'withdrawal',
          method,
          provider: 'deriv',
          account_from: 'USD Wallet',
          account_to: null,
          amount: Number(amount),
          currency,
          fee: 0,
          reference_id,
          status: 'completed',
          account_mode,
          metadata_json,
        });
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes("'transfer'")) {
        const [user_id, account_from, account_to, amount, currency, reference_id, account_mode, fee, idempotency_key] = params as any[];
        const row = this.insertRow('cashier_transactions', {
          user_id: Number(user_id),
          tx_type: 'transfer',
          method: 'Internal Platform Transfer',
          provider: 'deriv',
          account_from,
          account_to,
          amount: Number(amount),
          currency,
          fee: Number(fee || 0),
          reference_id,
          status: 'completed',
          account_mode,
          idempotency_key: idempotency_key || '',
          metadata_json: '{}',
        });
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes("'p2p'")) {
        const [user_id, method, account_to, amount, reference_id, account_mode, metadata_json] = params as any[];
        const row = this.insertRow('cashier_transactions', {
          user_id: Number(user_id),
          tx_type: 'p2p',
          method,
          provider: 'deriv_p2p',
          account_from: null,
          account_to,
          amount: Number(amount),
          currency: 'USD',
          fee: 0,
          reference_id,
          status: 'completed',
          account_mode,
          metadata_json,
        });
        return { rows: [row], rowCount: 1 };
      }
    }
    if (sql.includes('FROM cashier_transactions') && upper.startsWith('SELECT')) {
      const txs = this.getTable('cashier_transactions').rows;
      const users = this.getTable('users').rows;
      if (sql.includes('WHERE user_id = $1 AND idempotency_key = $2')) {
        const row = txs.find((t) => t.user_id === Number(params[0]) && t.idempotency_key === params[1]);
        return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes('SUM(CASE WHEN ct.tx_type')) {
        const traderTxs = txs.filter((t) => {
          const u = users.find((usr) => usr.id === t.user_id);
          return u && !['owner', 'admin'].includes(u.role);
        });
        return {
          rows: [
            {
              totalDeposits: traderTxs.filter((t) => t.tx_type === 'deposit').reduce((s, t) => s + Number(t.amount || 0), 0),
              totalWithdrawals: traderTxs.filter((t) => t.tx_type === 'withdrawal').reduce((s, t) => s + Number(t.amount || 0), 0),
              totalTransfers: traderTxs.filter((t) => t.tx_type === 'transfer').reduce((s, t) => s + Number(t.amount || 0), 0),
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes('JOIN users u ON ct.user_id = u.id')) {
        const rows = txs
          .filter((t) => {
            const u = users.find((usr) => usr.id === t.user_id);
            if (!u || ['owner', 'admin'].includes(u.role)) return false;
            if (sql.includes('ct.tx_type = $1')) return t.tx_type === params[0];
            return true;
          })
          .map((t): Row => {
            const u = users.find((usr) => usr.id === t.user_id)!;
            return { ...t, user_email: u.email };
          })
          .sort((a, b) => b.id - a.id);
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('WHERE user_id = $1')) {
        const uid = Number(params[0]);
        let rows = txs.filter((t) => t.user_id === uid);
        if (sql.includes('tx_type = $2')) {
          rows = rows.filter((t) => t.tx_type === params[1]);
          if (sql.includes("COALESCE(account_mode, 'demo') = $3")) {
            rows = rows.filter((t) => (t.account_mode || 'demo') === params[2]);
          }
        } else if (sql.includes("COALESCE(account_mode, 'demo') = $2")) {
          rows = rows.filter((t) => (t.account_mode || 'demo') === params[1]);
        }
        rows = rows.sort((a, b) => b.id - a.id).slice(0, 100);
        return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
      }
    }

    // 9. watchlists
    if (sql.includes('FROM watchlists WHERE user_id = $1')) {
      const rows = this.getTable('watchlists')
        .rows.filter((w) => w.user_id === Number(params[0]))
        .sort((a, b) => b.id - a.id);
      return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
    }
    if (upper.startsWith('INSERT INTO WATCHLISTS')) {
      const [user_id, symbol] = params as [number, string];
      const tbl = this.getTable('watchlists');
      if (!tbl.rows.some((w) => w.user_id === Number(user_id) && w.symbol === symbol)) {
        this.insertRow('watchlists', { user_id: Number(user_id), symbol });
      }
      return { rows: [], rowCount: 1 };
    }
    if (upper.startsWith('DELETE FROM WATCHLISTS')) {
      const tbl = this.getTable('watchlists');
      const before = tbl.rows.length;
      tbl.rows = tbl.rows.filter((w) => !(w.user_id === Number(params[0]) && w.symbol === params[1]));
      return { rows: [], rowCount: before - tbl.rows.length };
    }

    // 10. notifications
    if (upper.startsWith('INSERT INTO NOTIFICATIONS')) {
      const [user_id, title, message, category] = params as any[];
      this.insertRow('notifications', { user_id: Number(user_id), title, message, category, is_read: false });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM notifications WHERE user_id = $1')) {
      const rows = this.getTable('notifications')
        .rows.filter((n) => n.user_id === Number(params[0]))
        .sort((a, b) => b.id - a.id)
        .slice(0, 50);
      return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
    }
    if (upper.startsWith('UPDATE NOTIFICATIONS SET IS_READ = TRUE')) {
      for (const n of this.getTable('notifications').rows) {
        if (sql.includes('WHERE id = $1 AND user_id = $2')) {
          if (n.id === Number(params[0]) && n.user_id === Number(params[1])) n.is_read = true;
        } else if (n.user_id === Number(params[0])) {
          n.is_read = true;
        }
      }
      return { rows: [], rowCount: 1 };
    }

    // 11. logs
    if (upper.startsWith('INSERT INTO EMAIL_LOGS')) {
      const [recipient_email, template, subject, status, provider_response] = params as any[];
      this.insertRow('email_logs', { recipient_email, template, subject, status, provider_response });
      return { rows: [], rowCount: 1 };
    }
    if (upper.startsWith('INSERT INTO SECURITY_LOGS')) {
      const [user_id, event_type, ip_address, details_json] = params as any[];
      this.insertRow('security_logs', { user_id, event_type, ip_address, details_json });
      return { rows: [], rowCount: 1 };
    }
    if (upper.startsWith('INSERT INTO ADMINISTRATOR_AUDIT_LOGS')) {
      const [admin_user_id, action, target_type, target_id, details_json] = params as any[];
      this.insertRow('administrator_audit_logs', { admin_user_id, action, target_type, target_id, details_json });
      return { rows: [], rowCount: 1 };
    }
    if (upper.startsWith('INSERT INTO SYSTEM_ERROR_LOGS')) {
      const [source, severity, message, details_json] = params as any[];
      this.insertRow('system_error_logs', { source, severity, message, details_json });
      return { rows: [], rowCount: 1 };
    }
    if (upper.startsWith('INSERT INTO ADMIN_LOGIN_ATTEMPTS')) {
      const [email, ip_address, reason] = params as any[];
      const success = sql.includes(', TRUE,');
      this.insertRow('admin_login_attempts', { email, ip_address, success, reason });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM admin_login_attempts WHERE success = FALSE')) {
      const cutoff = Date.now() - 15 * 60 * 1000;
      const cnt = this.getTable('admin_login_attempts').rows.filter(
        (r) => !r.success && new Date(r.created_at).getTime() > cutoff && (r.email === params[0] || r.ip_address === params[1])
      ).length;
      return { rows: [{ cnt }], rowCount: 1 };
    }
    if (sql.includes('FROM admin_login_attempts ORDER BY')) {
      const rows = [...this.getTable('admin_login_attempts').rows].sort((a, b) => b.id - a.id).slice(0, 50);
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM system_error_logs ORDER BY')) {
      const rows = [...this.getTable('system_error_logs').rows].sort((a, b) => b.id - a.id).slice(0, 50);
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM security_logs ORDER BY')) {
      const rows = [...this.getTable('security_logs').rows].sort((a, b) => b.id - a.id).slice(0, 50);
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM administrator_audit_logs ORDER BY')) {
      const rows = [...this.getTable('administrator_audit_logs').rows].sort((a, b) => b.id - a.id).slice(0, 100);
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('FROM email_logs ORDER BY')) {
      const rows = [...this.getTable('email_logs').rows].sort((a, b) => b.id - a.id).slice(0, 100);
      return { rows, rowCount: rows.length };
    }

    // 12. risk_settings
    if (sql.includes('FROM risk_settings WHERE user_id = $1')) {
      const r = this.getTable('risk_settings').rows.find((x) => x.user_id === Number(params[0]));
      return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
    }
    if (upper.startsWith('INSERT INTO RISK_SETTINGS')) {
      const tbl = this.getTable('risk_settings');
      const uid = Number(params[0]);
      const ex = tbl.rows.find((x) => x.user_id === uid);
      if (params.length === 1) {
        if (!ex) {
          this.insertRow('risk_settings', {
            user_id: uid,
            risk_per_trade_pct: 2.0,
            daily_loss_limit_usd: 10.0,
            max_exposure_usd: 15.0,
            max_consecutive_losses: 3,
            cooldown_minutes: 30,
            cooldown_until: null,
            enforce_limits: true,
          });
        }
        return { rows: [], rowCount: 1 };
      }
      const [, risk_per_trade_pct, daily_loss_limit_usd, max_exposure_usd, max_consecutive_losses, cooldown_minutes, enforce_limits] =
        params as any[];
      if (ex) {
        ex.risk_per_trade_pct = Number(risk_per_trade_pct);
        ex.daily_loss_limit_usd = Number(daily_loss_limit_usd);
        ex.max_exposure_usd = Number(max_exposure_usd);
        ex.max_consecutive_losses = Number(max_consecutive_losses);
        ex.cooldown_minutes = Number(cooldown_minutes);
        ex.enforce_limits = Boolean(enforce_limits);
        ex.updated_at = new Date().toISOString();
        return { rows: [{ ...ex }], rowCount: 1 };
      }
      const created = this.insertRow('risk_settings', {
        user_id: uid,
        risk_per_trade_pct: Number(risk_per_trade_pct),
        daily_loss_limit_usd: Number(daily_loss_limit_usd),
        max_exposure_usd: Number(max_exposure_usd),
        max_consecutive_losses: Number(max_consecutive_losses),
        cooldown_minutes: Number(cooldown_minutes),
        cooldown_until: null,
        enforce_limits: Boolean(enforce_limits),
      });
      return { rows: [created], rowCount: 1 };
    }
    if (upper.startsWith('UPDATE RISK_SETTINGS SET COOLDOWN_UNTIL = NULL')) {
      const r = this.getTable('risk_settings').rows.find((x) => x.user_id === Number(params[0]));
      if (r) r.cooldown_until = null;
      return { rows: [], rowCount: r ? 1 : 0 };
    }
    if (upper.startsWith('UPDATE RISK_SETTINGS SET COOLDOWN_UNTIL = NOW()')) {
      const mins = Number(params[0]);
      const r = this.getTable('risk_settings').rows.find((x) => x.user_id === Number(params[1]));
      if (r) r.cooldown_until = new Date(Date.now() + mins * 60000).toISOString();
      return { rows: [], rowCount: r ? 1 : 0 };
    }

    // 13. user_strategies & strategy_backtest_runs
    if (sql.includes('FROM user_strategies WHERE user_id = $1')) {
      const rows = this.getTable('user_strategies')
        .rows.filter((s) => s.user_id === Number(params[0]))
        .sort((a, b) => a.id - b.id);
      return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
    }
    if (upper.startsWith('INSERT INTO USER_STRATEGIES')) {
      const [user_id, strategy_key, name, enabled, execution_mode, symbol, timeframe, config_json, risk_json] =
        params as any[];
      const tbl = this.getTable('user_strategies');
      const ex = tbl.rows.find((s) => s.user_id === Number(user_id) && s.strategy_key === strategy_key);
      if (ex) {
        ex.name = name;
        ex.enabled = Boolean(enabled);
        ex.execution_mode = execution_mode;
        ex.symbol = symbol;
        ex.timeframe = timeframe;
        ex.config_json = config_json;
        ex.risk_json = risk_json;
        ex.updated_at = new Date().toISOString();
        return { rows: [{ ...ex }], rowCount: 1 };
      }
      const created = this.insertRow('user_strategies', {
        user_id: Number(user_id),
        strategy_key,
        name,
        enabled: Boolean(enabled),
        execution_mode,
        symbol,
        timeframe,
        config_json,
        risk_json,
      });
      return { rows: [created], rowCount: 1 };
    }
    if (upper.startsWith('INSERT INTO STRATEGY_BACKTEST_RUNS')) {
      const [user_id, strategy_key, symbol, granularity, candle_count, spread_cost_pct, in_sample_json, out_of_sample_json, full_metrics_json] =
        params as any[];
      const row = this.insertRow('strategy_backtest_runs', {
        user_id: Number(user_id),
        strategy_key,
        symbol,
        granularity: Number(granularity),
        candle_count: Number(candle_count),
        spread_cost_pct: Number(spread_cost_pct),
        in_sample_json,
        out_of_sample_json,
        full_metrics_json,
      });
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('FROM strategy_backtest_runs WHERE user_id = $1')) {
      const rows = this.getTable('strategy_backtest_runs')
        .rows.filter((r) => r.user_id === Number(params[0]))
        .sort((a, b) => b.id - a.id)
        .slice(0, 20);
      return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
    }

    // 14. trading_journal_entries
    if (sql.includes('FROM trading_journal_entries')) {
      const orders = this.getTable('virtual_orders').rows;
      const rows = this.getTable('trading_journal_entries')
        .rows.filter((j) => j.user_id === Number(params[0]))
        .map((j): Row => {
          const o = orders.find((x) => x.id === j.order_id);
          return {
            ...j,
            order_pnl: o?.pnl ?? null,
            order_entry_price: o?.entry_price ?? null,
            order_exit_price: o?.exit_price ?? null,
            order_status: o?.status ?? null,
          };
        })
        .sort((a, b) => b.id - a.id)
        .slice(0, 200);
      return { rows, rowCount: rows.length };
    }
    if (upper.startsWith('INSERT INTO TRADING_JOURNAL_ENTRIES')) {
      const [user_id, order_id, symbol, side, strategy_key, timeframe, rationale, emotions, discipline_score, lessons, image_url, tags_json] =
        params as any[];
      const row = this.insertRow('trading_journal_entries', {
        user_id: Number(user_id),
        order_id,
        symbol,
        side,
        strategy_key,
        timeframe,
        rationale,
        emotions,
        discipline_score: Number(discipline_score),
        lessons,
        image_url,
        tags_json,
      });
      return { rows: [row], rowCount: 1 };
    }
    if (upper.startsWith('UPDATE TRADING_JOURNAL_ENTRIES SET')) {
      const [rationale, emotions, discipline_score, lessons, image_url, tags_json, id, user_id] = params as any[];
      const j = this.getTable('trading_journal_entries').rows.find(
        (x) => x.id === Number(id) && x.user_id === Number(user_id)
      );
      if (!j) return { rows: [], rowCount: 0 };
      if (rationale !== null && rationale !== undefined) j.rationale = rationale;
      if (emotions !== null && emotions !== undefined) j.emotions = emotions;
      if (discipline_score !== null && discipline_score !== undefined) j.discipline_score = Number(discipline_score);
      if (lessons !== null && lessons !== undefined) j.lessons = lessons;
      if (image_url !== null && image_url !== undefined) j.image_url = image_url;
      if (tags_json !== null && tags_json !== undefined) j.tags_json = tags_json;
      j.updated_at = new Date().toISOString();
      return { rows: [{ ...j }], rowCount: 1 };
    }
    if (upper.startsWith('DELETE FROM TRADING_JOURNAL_ENTRIES')) {
      const tbl = this.getTable('trading_journal_entries');
      const before = tbl.rows.length;
      tbl.rows = tbl.rows.filter((x) => !(x.id === Number(params[0]) && x.user_id === Number(params[1])));
      return { rows: [], rowCount: before - tbl.rows.length };
    }

    // 15. smart_alerts
    if (sql.includes('FROM smart_alerts')) {
      const rows = this.getTable('smart_alerts').rows;
      if (sql.includes("WHERE symbol = $1 AND status = 'active'")) {
        return {
          rows: rows.filter((a) => a.symbol === params[0] && a.status === 'active').slice(0, 50).map((r) => ({ ...r })),
          rowCount: 1,
        };
      }
      const list = rows.filter((a) => a.user_id === Number(params[0])).sort((a, b) => b.id - a.id).slice(0, 100);
      return { rows: list.map((r) => ({ ...r })), rowCount: list.length };
    }
    if (upper.startsWith('INSERT INTO SMART_ALERTS')) {
      const [user_id, symbol, alert_type, condition_json, message] = params as any[];
      const row = this.insertRow('smart_alerts', {
        user_id: Number(user_id),
        symbol,
        alert_type,
        condition_json,
        message,
        status: 'active',
        triggered_at: null,
      });
      return { rows: [row], rowCount: 1 };
    }
    if (upper.startsWith('UPDATE SMART_ALERTS SET')) {
      const rows = this.getTable('smart_alerts').rows;
      if (sql.includes("status = 'triggered'")) {
        const a = rows.find((x) => x.id === Number(params[0]));
        if (a) {
          a.status = 'triggered';
          a.triggered_at = new Date().toISOString();
        }
        return { rows: a ? [{ ...a }] : [], rowCount: a ? 1 : 0 };
      }
      const a = rows.find((x) => x.id === Number(params[1]) && x.user_id === Number(params[2]));
      if (a) a.status = params[0];
      return { rows: a ? [{ ...a }] : [], rowCount: a ? 1 : 0 };
    }
    if (upper.startsWith('DELETE FROM SMART_ALERTS')) {
      const tbl = this.getTable('smart_alerts');
      const before = tbl.rows.length;
      tbl.rows = tbl.rows.filter((x) => !(x.id === Number(params[0]) && x.user_id === Number(params[1])));
      return { rows: [], rowCount: before - tbl.rows.length };
    }

    // 16. user_workspace_preferences
    if (sql.includes('FROM user_workspace_preferences WHERE user_id = $1')) {
      const r = this.getTable('user_workspace_preferences').rows.find((x) => x.user_id === Number(params[0]));
      return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
    }
    if (upper.startsWith('INSERT INTO USER_WORKSPACE_PREFERENCES')) {
      const [user_id, layout_json, chart_drawings_json, chart_indicators_json] = params as any[];
      const tbl = this.getTable('user_workspace_preferences');
      const ex = tbl.rows.find((x) => x.user_id === Number(user_id));
      if (ex) {
        ex.layout_json = layout_json;
        ex.chart_drawings_json = chart_drawings_json;
        ex.chart_indicators_json = chart_indicators_json;
        ex.updated_at = new Date().toISOString();
      } else {
        this.insertRow('user_workspace_preferences', {
          user_id: Number(user_id),
          layout_json,
          chart_drawings_json,
          chart_indicators_json,
        });
      }
      return { rows: [], rowCount: 1 };
    }

    // 17. bot_definitions
    if (sql.includes('FROM bot_definitions') && upper.startsWith('SELECT')) {
      const rows = this.getTable('bot_definitions').rows;
      if (sql.includes('WHERE id = $1 AND user_id = $2')) {
        const r = rows.find((x) => x.id === Number(params[0]) && x.user_id === Number(params[1]));
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('WHERE user_id = $1')) {
        const list = rows.filter((x) => x.user_id === Number(params[0])).sort((a, b) => b.id - a.id);
        return { rows: list.map((r) => ({ ...r })), rowCount: list.length };
      }
      const pub = rows.filter((x) => x.is_template || x.visibility === 'public').sort((a, b) => b.id - a.id);
      return { rows: pub.map((r) => ({ ...r })), rowCount: pub.length };
    }
    if (upper.startsWith('INSERT INTO BOT_DEFINITIONS')) {
      const [user_id, name, description, category, ast_json, xml_source, symbol, timeframe, contract_type, config_json, risk_json, demo_tested, is_template, visibility] =
        params as any[];
      const row = this.insertRow('bot_definitions', {
        user_id: Number(user_id),
        name,
        description: description || '',
        category: category || 'Custom',
        ast_json: ast_json || '{}',
        xml_source: xml_source || '',
        symbol: symbol || '1HZ100V',
        timeframe: timeframe || '1m',
        contract_type: contract_type || 'DIGITOVER',
        config_json: config_json || '{}',
        risk_json: risk_json || '{}',
        demo_tested: Boolean(demo_tested),
        is_template: Boolean(is_template),
        visibility: visibility || 'private',
      });
      return { rows: [row], rowCount: 1 };
    }
    if (upper.startsWith('UPDATE BOT_DEFINITIONS SET')) {
      const rows = this.getTable('bot_definitions').rows;
      if (sql.includes('SET demo_tested = TRUE')) {
        const r = rows.find((x) => x.id === Number(params[0]) && x.user_id === Number(params[1]));
        if (r) {
          r.demo_tested = true;
          r.updated_at = new Date().toISOString();
        }
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      const [name, description, category, ast_json, xml_source, symbol, timeframe, contract_type, config_json, risk_json, demo_tested, id, user_id] =
        params as any[];
      const r = rows.find((x) => x.id === Number(id) && x.user_id === Number(user_id));
      if (!r) return { rows: [], rowCount: 0 };
      r.name = name ?? r.name;
      r.description = description ?? r.description;
      r.category = category ?? r.category;
      r.ast_json = ast_json ?? r.ast_json;
      r.xml_source = xml_source ?? r.xml_source;
      r.symbol = symbol ?? r.symbol;
      r.timeframe = timeframe ?? r.timeframe;
      r.contract_type = contract_type ?? r.contract_type;
      r.config_json = config_json ?? r.config_json;
      r.risk_json = risk_json ?? r.risk_json;
      if (demo_tested !== undefined && demo_tested !== null) r.demo_tested = Boolean(demo_tested);
      r.updated_at = new Date().toISOString();
      return { rows: [{ ...r }], rowCount: 1 };
    }
    if (upper.startsWith('DELETE FROM BOT_DEFINITIONS')) {
      const tbl = this.getTable('bot_definitions');
      const before = tbl.rows.length;
      tbl.rows = tbl.rows.filter((x) => !(x.id === Number(params[0]) && x.user_id === Number(params[1])));
      return { rows: [], rowCount: before - tbl.rows.length };
    }

    // 18. bot_runs & bot_execution_logs
    if (sql.includes('FROM bot_runs') && upper.startsWith('SELECT')) {
      const rows = this.getTable('bot_runs').rows;
      if (sql.includes('WHERE user_id = $1')) {
        const list = rows.filter((r) => r.user_id === Number(params[0])).sort((a, b) => b.id - a.id).slice(0, 50);
        return { rows: list.map((r) => ({ ...r })), rowCount: list.length };
      }
      const all = [...rows].sort((a, b) => b.id - a.id).slice(0, 100);
      return { rows: all.map((r) => ({ ...r })), rowCount: all.length };
    }
    if (upper.startsWith('INSERT INTO BOT_RUNS')) {
      const [user_id, bot_definition_id, strategy_name, status, execution_mode, account_mode, symbol, current_stake, max_daily_loss, take_profit, stop_loss, last_signal] =
        params as any[];
      const row = this.insertRow('bot_runs', {
        user_id: Number(user_id),
        bot_definition_id: bot_definition_id || null,
        strategy_name,
        status: status || 'running',
        execution_mode: execution_mode || 'virtual',
        account_mode: account_mode || 'demo',
        symbol: symbol || '1HZ100V',
        trades_count: 0,
        wins: 0,
        losses: 0,
        realized_pnl: 0,
        current_stake: Number(current_stake || 1),
        martingale_step: 0,
        max_daily_loss: Number(max_daily_loss || 50),
        take_profit: Number(take_profit || 25),
        stop_loss: Number(stop_loss || 50),
        cooldown_until: null,
        kill_switched: false,
        last_signal: last_signal || '',
        started_at: new Date().toISOString(),
        paused_at: null,
        stopped_at: null,
      });
      return { rows: [row], rowCount: 1 };
    }
    if (upper.startsWith('UPDATE BOT_RUNS SET')) {
      const rows = this.getTable('bot_runs').rows;
      if (sql.includes('kill_switched = TRUE')) {
        for (const r of rows) {
          if (r.status === 'running' || r.status === 'paused') {
            r.status = 'stopped';
            r.kill_switched = true;
            r.last_signal = String(params[0] || 'Global Emergency Kill Switch');
            r.stopped_at = new Date().toISOString();
            r.updated_at = new Date().toISOString();
          }
        }
        return { rows: [], rowCount: 1 };
      }
      const id = Number(params[params.length - 1]);
      const r = rows.find((x) => x.id === id);
      if (r) {
        if (sql.includes("status = 'paused'")) {
          r.status = 'paused';
          r.paused_at = new Date().toISOString();
          r.last_signal = String(params[0] || 'Paused');
        } else if (sql.includes("status = 'running'")) {
          r.status = 'running';
          r.paused_at = null;
          r.last_signal = String(params[0] || 'Resumed');
        } else if (sql.includes("status = 'stopped'")) {
          r.status = 'stopped';
          r.stopped_at = new Date().toISOString();
          r.last_signal = String(params[0] || 'Stopped');
        } else if (params.length >= 7) {
          const [trades_count, wins, losses, realized_pnl, current_stake, martingale_step, last_signal] = params as any[];
          r.trades_count = Number(trades_count);
          r.wins = Number(wins);
          r.losses = Number(losses);
          r.realized_pnl = Number(realized_pnl);
          r.current_stake = Number(current_stake);
          r.martingale_step = Number(martingale_step);
          r.last_signal = String(last_signal || '');
        }
        r.updated_at = new Date().toISOString();
      }
      return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
    }
    if (sql.includes('FROM bot_execution_logs') && upper.startsWith('SELECT')) {
      const rows = this.getTable('bot_execution_logs')
        .rows.filter((l) => l.user_id === Number(params[0]))
        .sort((a, b) => b.id - a.id)
        .slice(0, 120);
      return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
    }
    if (upper.startsWith('INSERT INTO BOT_EXECUTION_LOGS')) {
      const [user_id, bot_run_id, level, event_type, message, details_json] = params as any[];
      const row = this.insertRow('bot_execution_logs', {
        user_id: Number(user_id),
        bot_run_id: bot_run_id || null,
        level: level || 'info',
        event_type: event_type || 'tick',
        message,
        details_json: details_json || '{}',
      });
      return { rows: [row], rowCount: 1 };
    }

    // 19. analyser_signals
    if (sql.includes('FROM analyser_signals') && upper.startsWith('SELECT')) {
      const rows = this.getTable('analyser_signals').rows;
      if (sql.includes('WHERE id = $1')) {
        const r = rows.find((x) => x.id === Number(params[0]));
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('WHERE instrument = $1')) {
        const list = rows.filter((x) => x.instrument === params[0]).sort((a, b) => b.id - a.id).slice(0, 50);
        return { rows: list.map((r) => ({ ...r })), rowCount: list.length };
      }
      const all = [...rows].sort((a, b) => b.id - a.id).slice(0, 100);
      return { rows: all.map((r) => ({ ...r })), rowCount: all.length };
    }
    if (upper.startsWith('INSERT INTO ANALYSER_SIGNALS')) {
      const [
        instrument,
        display_name,
        timeframe,
        direction,
        setup_type,
        strategy_name,
        entry_price,
        entry_zone_low,
        entry_zone_high,
        stop_loss,
        tp1,
        tp2,
        tp3,
        risk_reward,
        spread,
        atr,
        quality_score,
        lifecycle_status,
        feed_source,
        feed_timestamp,
        invalidation_reason,
        reasons_json,
        snapshot_json,
      ] = params as any[];
      const row = this.insertRow('analyser_signals', {
        instrument,
        display_name,
        timeframe,
        direction,
        setup_type,
        strategy_name,
        entry_price: Number(entry_price),
        entry_zone_low: Number(entry_zone_low),
        entry_zone_high: Number(entry_zone_high),
        stop_loss: Number(stop_loss),
        tp1: Number(tp1),
        tp2: Number(tp2),
        tp3: Number(tp3),
        risk_reward: Number(risk_reward),
        spread: Number(spread),
        atr: Number(atr),
        quality_score: Number(quality_score),
        lifecycle_status: lifecycle_status || 'Forming',
        feed_source,
        feed_timestamp: feed_timestamp || new Date().toISOString(),
        invalidation_reason: invalidation_reason || '',
        reasons_json: reasons_json || '[]',
        snapshot_json: snapshot_json || '{}',
      });
      return { rows: [row], rowCount: 1 };
    }
    if (upper.startsWith('UPDATE ANALYSER_SIGNALS SET')) {
      const [lifecycle_status, invalidation_reason, id] = params as any[];
      const r = this.getTable('analyser_signals').rows.find((x) => x.id === Number(id));
      if (r) {
        r.lifecycle_status = lifecycle_status;
        if (invalidation_reason !== undefined && invalidation_reason !== null) {
          r.invalidation_reason = invalidation_reason;
        }
        r.updated_at = new Date().toISOString();
      }
      return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
    }

    // 20. mt5_bridge_connections & mt5_bridge_orders
    if (sql.includes('FROM mt5_bridge_connections') && upper.startsWith('SELECT')) {
      const rows = this.getTable('mt5_bridge_connections').rows;
      if (sql.includes('WHERE api_key_hash = $1')) {
        const r = rows.find((x) => x.api_key_hash === params[0]);
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('WHERE user_id = $1')) {
        const list = rows.filter((x) => x.user_id === Number(params[0])).sort((a, b) => b.id - a.id);
        return { rows: list.map((r) => ({ ...r })), rowCount: list.length };
      }
      return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
    }
    if (upper.startsWith('INSERT INTO MT5_BRIDGE_CONNECTIONS')) {
      const [user_id, bridge_name, account_login, server_name, broker_name, api_key_hash, encrypted_secret, status, symbols_json] =
        params as any[];
      const row = this.insertRow('mt5_bridge_connections', {
        user_id: Number(user_id),
        bridge_name,
        account_login: account_login || '',
        server_name: server_name || '',
        broker_name: broker_name || '',
        api_key_hash,
        encrypted_secret: encrypted_secret || '',
        status: status || 'pending',
        last_heartbeat_at: null,
        account_balance: 0,
        account_equity: 0,
        margin_free: 0,
        symbols_json: symbols_json || '["XAUUSD","EURUSD","GBPUSD","USDJPY"]',
      });
      return { rows: [row], rowCount: 1 };
    }
    if (upper.startsWith('UPDATE MT5_BRIDGE_CONNECTIONS SET')) {
      const [status, account_login, server_name, broker_name, account_balance, account_equity, margin_free, id] = params as any[];
      const r = this.getTable('mt5_bridge_connections').rows.find((x) => x.id === Number(id));
      if (r) {
        r.status = status || 'connected';
        if (account_login) r.account_login = account_login;
        if (server_name) r.server_name = server_name;
        if (broker_name) r.broker_name = broker_name;
        if (account_balance !== undefined) r.account_balance = Number(account_balance);
        if (account_equity !== undefined) r.account_equity = Number(account_equity);
        if (margin_free !== undefined) r.margin_free = Number(margin_free);
        r.last_heartbeat_at = new Date().toISOString();
        r.updated_at = new Date().toISOString();
      }
      return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
    }
    if (upper.startsWith('DELETE FROM MT5_BRIDGE_CONNECTIONS')) {
      const tbl = this.getTable('mt5_bridge_connections');
      const before = tbl.rows.length;
      tbl.rows = tbl.rows.filter((x) => !(x.id === Number(params[0]) && x.user_id === Number(params[1])));
      return { rows: [], rowCount: before - tbl.rows.length };
    }
    if (sql.includes('FROM mt5_bridge_orders') && upper.startsWith('SELECT')) {
      const rows = this.getTable('mt5_bridge_orders').rows;
      if (sql.includes("WHERE bridge_id = $1 AND status = 'queued'")) {
        const list = rows.filter((x) => x.bridge_id === Number(params[0]) && x.status === 'queued').sort((a, b) => a.id - b.id);
        return { rows: list.map((r) => ({ ...r })), rowCount: list.length };
      }
      if (sql.includes('WHERE user_id = $1')) {
        const list = rows.filter((x) => x.user_id === Number(params[0])).sort((a, b) => b.id - a.id).slice(0, 100);
        return { rows: list.map((r) => ({ ...r })), rowCount: list.length };
      }
      return { rows: [...rows].sort((a, b) => b.id - a.id).slice(0, 100), rowCount: rows.length };
    }
    if (upper.startsWith('INSERT INTO MT5_BRIDGE_ORDERS')) {
      const [bridge_id, user_id, signal_id, symbol, side, volume_lots, requested_price, stop_loss, take_profit, status, execution_mode, error_message] =
        params as any[];
      const row = this.insertRow('mt5_bridge_orders', {
        bridge_id: bridge_id || null,
        user_id: Number(user_id),
        signal_id: signal_id || null,
        symbol,
        side,
        volume_lots: Number(volume_lots || 0.01),
        requested_price: Number(requested_price || 0),
        fill_price: null,
        stop_loss: stop_loss !== null && stop_loss !== undefined ? Number(stop_loss) : null,
        take_profit: take_profit !== null && take_profit !== undefined ? Number(take_profit) : null,
        status: status || 'queued',
        execution_mode: execution_mode || 'signal-only',
        external_ticket: '',
        error_message: error_message || '',
      });
      return { rows: [row], rowCount: 1 };
    }
    if (upper.startsWith('UPDATE MT5_BRIDGE_ORDERS SET')) {
      const [status, fill_price, external_ticket, error_message, id] = params as any[];
      const r = this.getTable('mt5_bridge_orders').rows.find((x) => x.id === Number(id));
      if (r) {
        r.status = status;
        if (fill_price !== undefined && fill_price !== null) r.fill_price = Number(fill_price);
        if (external_ticket !== undefined && external_ticket !== null) r.external_ticket = String(external_ticket);
        if (error_message !== undefined && error_message !== null) r.error_message = String(error_message);
        r.updated_at = new Date().toISOString();
      }
      return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
    }

    // 21. market_feed_snapshots
    if (upper.startsWith('INSERT INTO MARKET_FEED_SNAPSHOTS')) {
      const [provider_name, instrument, bid, ask, spread, mid, raw_timestamp, is_stale, metadata_json] = params as any[];
      const row = this.insertRow('market_feed_snapshots', {
        provider_name,
        instrument,
        bid: Number(bid),
        ask: Number(ask),
        spread: Number(spread),
        mid: Number(mid),
        raw_timestamp: raw_timestamp || new Date().toISOString(),
        is_stale: Boolean(is_stale),
        metadata_json: metadata_json || '{}',
        recorded_at: new Date().toISOString(),
      });
      const tbl = this.getTable('market_feed_snapshots');
      if (tbl.rows.length > 500) tbl.rows = tbl.rows.slice(-400);
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('FROM market_feed_snapshots') && upper.startsWith('SELECT')) {
      const rows = [...this.getTable('market_feed_snapshots').rows].sort((a, b) => b.id - a.id).slice(0, 60);
      return { rows, rowCount: rows.length };
    }

    // 22. chart_layouts
    if (sql.includes('FROM chart_layouts') && upper.startsWith('SELECT')) {
      const rows = this.getTable('chart_layouts')
        .rows.filter((x) => x.user_id === Number(params[0]))
        .sort((a, b) => b.id - a.id);
      return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
    }
    if (upper.startsWith('INSERT INTO CHART_LAYOUTS')) {
      const [user_id, name, symbol, timeframe, layout_json, is_default] = params as any[];
      const tbl = this.getTable('chart_layouts');
      const ex = tbl.rows.find((x) => x.user_id === Number(user_id) && x.name === name);
      if (ex) {
        ex.symbol = symbol;
        ex.timeframe = Number(timeframe);
        ex.layout_json = layout_json;
        ex.is_default = Boolean(is_default);
        ex.updated_at = new Date().toISOString();
        return { rows: [{ ...ex }], rowCount: 1 };
      }
      const row = this.insertRow('chart_layouts', {
        user_id: Number(user_id),
        name,
        symbol,
        timeframe: Number(timeframe),
        layout_json,
        is_default: Boolean(is_default),
      });
      return { rows: [row], rowCount: 1 };
    }
    if (upper.startsWith('DELETE FROM CHART_LAYOUTS')) {
      const tbl = this.getTable('chart_layouts');
      const before = tbl.rows.length;
      tbl.rows = tbl.rows.filter((x) => !(x.id === Number(params[0]) && x.user_id === Number(params[1])));
      return { rows: [], rowCount: before - tbl.rows.length };
    }

    return { rows: [], rowCount: 0 };
  }
}

export const inMemoryStore = new InMemoryPgStore();

export function createInMemoryPool() {
  return {
    query: (sql: string, params: unknown[] = []) => inMemoryStore.executeQuery(sql, params),
    connect: async () => ({
      query: (sql: string, params: unknown[] = []) => inMemoryStore.executeQuery(sql, params),
      release: () => {},
    }),
    on: () => {},
  };
}
