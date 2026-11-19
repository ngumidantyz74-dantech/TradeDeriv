import { Router } from 'express';
import {
  pool,
  query,
  queryOne,
  execute,
  ensureDatabaseSchema,
  requireDb,
  addNotification,
} from '../db.ts';
import { CURATED_DERIV_INSTRUMENTS, CURATED_ORDER_RANK, EXCHANGE_PAIRS_CATALOG } from '../catalog.ts';
import { derivWs } from '../deriv-client.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { randomId } from '../crypto.ts';

const router = Router();

let lastSymbolsSync = 0;

router.get('/market/instruments', async (_req, res) => {
  const ticks = derivWs.getAllLatestTicks();

  if (pool) {
    try {
      await ensureDatabaseSchema();

      // Attempt non-blocking live active_symbols refresh every 10 minutes
      if (Date.now() - lastSymbolsSync > 10 * 60 * 1000) {
        lastSymbolsSync = Date.now();
        derivWs
          .request<{ active_symbols?: Array<any> }>({ active_symbols: 'brief' }, 4500)
          .then(async (resp) => {
            if (!resp?.active_symbols?.length) return;
            for (const s of resp.active_symbols) {
              const m = String(s.market || '');
              const cat =
                m === 'synthetic_index'
                  ? 'Synthetic'
                  : m === 'forex'
                    ? 'Forex'
                    : m === 'cryptocurrency'
                      ? 'Crypto'
                      : m === 'commodities'
                        ? 'Metals/Cmd'
                        : 'Indices';
              await execute(
                `INSERT INTO market_instruments (symbol, display_name, category, market, submarket, pip_size, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())
                 ON CONFLICT (symbol) DO UPDATE SET
                   display_name = EXCLUDED.display_name,
                   market = EXCLUDED.market,
                   submarket = EXCLUDED.submarket,
                   pip_size = EXCLUDED.pip_size,
                   updated_at = NOW()`,
                [s.symbol, s.display_name, cat, m, s.submarket || '', Number(s.pip || 0.01)]
              );
            }
          })
          .catch(() => {
            // Curated DB catalog already covers 75+ instruments
          });
      }

      const rows = await query<any>(
        `SELECT m.*, c.price, c.change_pct, c.sparkline_json
         FROM market_instruments m
         LEFT JOIN market_data_cache c ON m.symbol = c.symbol
         WHERE m.is_active = TRUE
         ORDER BY m.category, m.display_name`
      );

      const instruments = rows
        .map((r) => {
          const live = ticks[r.symbol];
          const price = live?.quote ?? r.price ?? 1000;
          const spread = r.spread || 0.15;
          let sparkline: number[] = [];
          try {
            sparkline = JSON.parse(r.sparkline_json || '[]');
          } catch {
            sparkline = [];
          }
          return {
            symbol: r.symbol,
            display_name: r.display_name,
            category: r.category,
            market: r.market,
            submarket: r.submarket,
            pip_size: r.pip_size,
            price,
            bid: live?.bid ?? Number((price - spread / 2).toFixed(r.pip_size < 0.001 ? 5 : 2)),
            ask: live?.ask ?? Number((price + spread / 2).toFixed(r.pip_size < 0.001 ? 5 : 2)),
            spread,
            change_pct: r.change_pct ?? 0,
            sparkline,
          };
        })
        .sort((a, b) => {
          const rankA = CURATED_ORDER_RANK.get(a.symbol) ?? 10000;
          const rankB = CURATED_ORDER_RANK.get(b.symbol) ?? 10000;
          if (rankA !== rankB) return rankA - rankB;
          return a.display_name.localeCompare(b.display_name);
        });

      res.json({ instruments });
      return;
    } catch {
      // Fall through to in-memory curated catalog if DB is still waking up
    }
  }

  const instruments = CURATED_DERIV_INSTRUMENTS.map((inst) => {
    const live = ticks[inst.symbol];
    const price = live?.quote ?? inst.base_price;
    return {
      symbol: inst.symbol,
      display_name: inst.display_name,
      category: inst.category,
      market: inst.market,
      submarket: inst.submarket,
      pip_size: inst.pip_size,
      price,
      bid: live?.bid ?? Number((price - inst.spread / 2).toFixed(inst.pip_size < 0.001 ? 5 : 2)),
      ask: live?.ask ?? Number((price + inst.spread / 2).toFixed(inst.pip_size < 0.001 ? 5 : 2)),
      spread: inst.spread,
      change_pct: 0,
      sparkline: [price],
    };
  });
  res.json({ instruments });
});

router.get('/market/candles', async (req, res) => {
  const symbol = String(req.query.symbol || '1HZ100V');
  const granularity = Number(req.query.granularity || 60);
  const count = Math.min(500, Math.max(20, Number(req.query.count || 120)));

  const detailed = await derivWs.fetchCandlesDetailed(symbol, granularity, count);
  const tick = derivWs.getLatestTick(symbol);
  res.json({
    symbol,
    granularity,
    candles: detailed.candles,
    source: detailed.source,
    error: detailed.error || null,
    lastUpdated: detailed.lastUpdated,
    latestTick: tick,
  });
});

router.get('/market/digit-analysis', async (req, res) => {
  const symbol = String(req.query.symbol || '1HZ100V');
  const count = Math.min(500, Math.max(20, Number(req.query.count || 100)));

  const prices = await derivWs.fetchTickHistory(symbol, count);
  const tick = derivWs.getLatestTick(symbol);
  const decimals = tick && tick.pipSize < 0.0001 ? 5 : tick && tick.pipSize < 0.001 ? 4 : 2;

  const digitCounts = Array(10).fill(0);
  const digits: number[] = [];
  let rises = 0;
  let falls = 0;

  prices.forEach((p, idx) => {
    const str = p.toFixed(decimals);
    const d = Number(str[str.length - 1] || 0);
    digits.push(d);
    digitCounts[d] += 1;
    if (idx > 0) {
      if (p >= prices[idx - 1]) rises += 1;
      else falls += 1;
    }
  });

  const total = Math.max(1, digits.length);
  const distribution = digitCounts.map((c, digit) => ({
    digit,
    count: c,
    percentage: Number(((c / total) * 100).toFixed(1)),
  }));

  const evenCount = digits.filter((d) => d % 2 === 0).length;
  const oddCount = total - evenCount;

  // RSI(14)
  let gains = 0;
  let losses = 0;
  const period = Math.min(14, prices.length - 1);
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const rs = losses === 0 ? 100 : gains / losses;
  const rsi14 = Number((100 - 100 / (1 + rs)).toFixed(2));

  res.json({
    symbol,
    count: digits.length,
    latestPrice: prices[prices.length - 1],
    lastDigit: digits[digits.length - 1],
    recentDigits: digits.slice(-25),
    distribution,
    evenPct: Number(((evenCount / total) * 100).toFixed(1)),
    oddPct: Number(((oddCount / total) * 100).toFixed(1)),
    risePct: Number(((rises / Math.max(1, total - 1)) * 100).toFixed(1)),
    fallPct: Number(((falls / Math.max(1, total - 1)) * 100).toFixed(1)),
    rsi14,
  });
});

// Crypto Exchange pairs & orders
router.get('/exchange/pairs', (req, res) => {
  const filter = String(req.query.filter || 'trending').toLowerCase();
  const q = String(req.query.q || '').trim().toLowerCase();

  const ticks = derivWs.getAllLatestTicks();
  let items = EXCHANGE_PAIRS_CATALOG.map((p, idx) => {
    const liveSym = `cry${p.base}USD`;
    const live = ticks[liveSym];
    const price = p.quote === 'USDT' && live ? live.quote : p.price;
    const sparkline: number[] = [];
    for (let i = 0; i < 20; i++) {
      const wave = Math.sin(i * 0.6 + idx) * 0.012 + (p.change24h >= 0 ? i * 0.0008 : -i * 0.0008);
      sparkline.push(Number((price * (0.99 + wave)).toFixed(price < 0.01 ? 8 : 4)));
    }
    return {
      ...p,
      price,
      sparkline,
    };
  });

  if (q) {
    items = items.filter((i) => i.pair.toLowerCase().includes(q) || i.base.toLowerCase().includes(q));
  }
  if (filter === 'gainers') {
    items = [...items].sort((a, b) => b.change24h - a.change24h);
  } else if (filter === 'losers') {
    items = [...items].sort((a, b) => a.change24h - b.change24h);
  } else {
    items = [...items].sort((a, b) => b.volume24hM - a.volume24hM);
  }

  res.json({ pairs: items });
});

router.post('/exchange/order', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const { pair, side = 'BUY', amount, orderType = 'market', limitPrice, accountMode } = req.body || {};
  const isReal = accountMode === 'real';
  const amt = Number(amount);
  if (!pair || Number.isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: 'Valid pair and amount are required' });
    return;
  }

  const pairMeta = EXCHANGE_PAIRS_CATALOG.find((p) => p.pair === pair);
  const price = Number(limitPrice || pairMeta?.price || 1);
  const [baseCoin, quoteCoin] = String(pair).split('/');

  const user = await queryOne<any>(
    'SELECT exchange_balances_json, real_exchange_balances_json, virtual_workspace_balance, real_wallets_json, demo_wallets_json FROM users WHERE id = $1',
    [req.user!.id]
  );
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const parseObj = (raw: string | null | undefined, fallback: Record<string, number>) => {
    try {
      return { ...fallback, ...(JSON.parse(raw || '{}') || {}) };
    } catch {
      return { ...fallback };
    }
  };

  const ex = isReal
    ? parseObj(user.real_exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 })
    : parseObj(user.exchange_balances_json, { USDT: 0, USDC: 0, BTC: 0, ETH: 0 });
  const realWallets = parseObj(user.real_wallets_json, { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });
  const demoWallets = parseObj(user.demo_wallets_json, { mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 });

  const quoteAvail = Number(ex[quoteCoin] ?? 0);
  const baseAvail = Number(ex[baseCoin] ?? 0);

  if (String(side).toUpperCase() === 'BUY') {
    if (quoteAvail >= amt) {
      ex[quoteCoin] = Number((quoteAvail - amt).toFixed(8));
    } else if (!isReal && (quoteCoin === 'USDT' || quoteCoin === 'USDC') && Number(user.virtual_workspace_balance) >= amt) {
      await execute(
        'UPDATE users SET virtual_workspace_balance = ROUND((virtual_workspace_balance - $1)::numeric, 2)::double precision, updated_at = NOW() WHERE id = $2',
        [amt, req.user!.id]
      );
    } else if (isReal && (quoteCoin === 'USDT' || quoteCoin === 'USDC') && Number(realWallets.options || 0) >= amt) {
      realWallets.options = Number((Number(realWallets.options || 0) - amt).toFixed(2));
    } else {
      res.status(400).json({ error: `Insufficient ${isReal ? 'Real' : 'Demo'} ${quoteCoin} balance` });
      return;
    }
    const received = amt / (price || 1);
    ex[baseCoin] = Number((baseAvail + received).toFixed(8));
  } else {
    if (baseAvail < amt) {
      res.status(400).json({ error: `Insufficient ${isReal ? 'Real' : 'Demo'} ${baseCoin} balance` });
      return;
    }
    ex[baseCoin] = Number((baseAvail - amt).toFixed(8));
    ex[quoteCoin] = Number((quoteAvail + amt * price).toFixed(8));
  }

  if (isReal) {
    realWallets.exchange_usdt = Number((ex.USDT || 0).toFixed(2));
    await execute(
      'UPDATE users SET real_exchange_balances_json = $1, real_wallets_json = $2, updated_at = NOW() WHERE id = $3',
      [JSON.stringify(ex), JSON.stringify(realWallets), req.user!.id]
    );
  } else {
    demoWallets.exchange_usdt = Number((ex.USDT || 0).toFixed(2));
    await execute(
      'UPDATE users SET exchange_balances_json = $1, demo_wallets_json = $2, updated_at = NOW() WHERE id = $3',
      [JSON.stringify(ex), JSON.stringify(demoWallets), req.user!.id]
    );
  }

  const ref = `EX-${randomId(4).toUpperCase()}`;
  await execute(
    `INSERT INTO cashier_transactions (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
     VALUES ($1, 'exchange', $2, 'deriv_exchange', $3, $4, $5, $6, $7, 'completed', $8, $9)`,
    [
      req.user!.id,
      `${String(orderType).toUpperCase()} ${String(side).toUpperCase()}`,
      quoteCoin,
      baseCoin,
      amt,
      quoteCoin,
      ref,
      isReal ? 'real' : 'demo',
      JSON.stringify({ pair, price, accountMode: isReal ? 'real' : 'demo' }),
    ]
  );

  await addNotification(req.user!.id, 'Exchange Order Filled', `[${isReal ? 'REAL' : 'DEMO'}] ${String(side).toUpperCase()} ${amt} ${pair} @ ${price}`, 'exchange');
  res.json({ ok: true, exchangeBalances: ex, reference: ref, accountMode: isReal ? 'real' : 'demo' });
});

// Watchlists
router.get('/watchlists', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const rows = await query<{ symbol: string; created_at: string }>(
    'SELECT symbol, created_at FROM watchlists WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user!.id]
  );
  res.json({ symbols: rows.map((r) => r.symbol), items: rows });
});

router.post('/watchlists', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const symbol = String(req.body?.symbol || '').trim();
  if (!symbol) {
    res.status(400).json({ error: 'Symbol is required' });
    return;
  }
  await execute('INSERT INTO watchlists (user_id, symbol) VALUES ($1, $2) ON CONFLICT (user_id, symbol) DO NOTHING', [
    req.user!.id,
    symbol,
  ]);
  const rows = await query<{ symbol: string }>('SELECT symbol FROM watchlists WHERE user_id = $1 ORDER BY created_at DESC', [
    req.user!.id,
  ]);
  res.json({ symbols: rows.map((r) => r.symbol) });
});

router.delete('/watchlists/:symbol', requireDb, requireAuth, async (req: AuthRequest, res) => {
  await execute('DELETE FROM watchlists WHERE user_id = $1 AND symbol = $2', [
    req.user!.id,
    String(req.params.symbol),
  ]);
  const rows = await query<{ symbol: string }>('SELECT symbol FROM watchlists WHERE user_id = $1 ORDER BY created_at DESC', [
    req.user!.id,
  ]);
  res.json({ symbols: rows.map((r) => r.symbol) });
});

// Notifications
router.get('/notifications', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const rows = await query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [req.user!.id]);
  res.json({ notifications: rows });
});

router.patch('/notifications/:id/read', requireDb, requireAuth, async (req: AuthRequest, res) => {
  if (req.params.id === 'all') {
    await execute('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user!.id]);
  } else {
    await execute('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [
      Number(req.params.id),
      req.user!.id,
    ]);
  }
  res.json({ ok: true });
});

export default router;
