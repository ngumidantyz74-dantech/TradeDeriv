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
const INSTRUMENTS_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedInstrumentRows: any[] | null = null;
let instrumentsCachedAt = 0;

export function invalidateInstrumentsCache(): void {
  cachedInstrumentRows = null;
  instrumentsCachedAt = 0;
}

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

router.get('/market/instruments', async (_req, res) => {
  const ticks = derivWs.getAllLatestTicks();

  if (pool) {
    try {
      await ensureDatabaseSchema();

      // Attempt non-blocking live active_symbols refresh at most every 30 minutes
      if (Date.now() - lastSymbolsSync > 30 * 60 * 1000) {
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
            invalidateInstrumentsCache();
          })
          .catch(() => {
            // Curated DB catalog already covers 75+ instruments
          });
      }

      if (!cachedInstrumentRows || Date.now() - instrumentsCachedAt > INSTRUMENTS_CACHE_TTL_MS) {
        cachedInstrumentRows = await query<any>(
          `SELECT m.symbol, m.display_name, m.category, m.market, m.submarket, m.pip_size, m.spread,
                  c.price, c.change_pct
           FROM market_instruments m
           LEFT JOIN market_data_cache c ON m.symbol = c.symbol
           WHERE m.is_active = TRUE
           ORDER BY m.category, m.display_name
           LIMIT 250`
        );
        instrumentsCachedAt = Date.now();
      }
      const rows = cachedInstrumentRows;

      const instruments = rows
        .map((r) => {
          const live = ticks[r.symbol];
          const price = live?.quote ?? r.price ?? 1000;
          const spread = r.spread || 0.15;
          const liveSpark = derivWs.getSparkline(r.symbol, 24);
          const sparkline = liveSpark.length >= 2 ? liveSpark : [price];
          const changePct = liveSpark.length >= 2 ? derivWs.getChangePct(r.symbol) : r.change_pct ?? 0;
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
            change_pct: changePct,
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
    const sparkline = derivWs.getSparkline(inst.symbol, 24);
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
      change_pct: derivWs.getChangePct(inst.symbol),
      sparkline: sparkline.length ? sparkline : [price],
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
    marketClosed: derivWs.isMarketClosed(symbol),
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
  const quote = String(req.query.quote || 'all').toUpperCase();
  const q = String(req.query.q || '').trim().toLowerCase();

  let items = derivWs.getAllExchangeTickRates();

  if (quote && quote !== 'ALL') {
    items = items.filter((i) => i.quote.toUpperCase() === quote);
  }
  if (q) {
    items = items.filter((i) => i.pair.toLowerCase().includes(q) || i.base.toLowerCase().includes(q));
  }
  if (filter === 'gainers') {
    items = [...items].sort((a, b) => b.change24h - a.change24h);
  } else if (filter === 'losers') {
    items = [...items].sort((a, b) => a.change24h - b.change24h);
  } else if (filter === 'all') {
    // Preserve catalog order
  } else {
    items = [...items].sort((a, b) => b.volume24hM - a.volume24hM);
  }

  res.json({ pairs: items });
});

router.get('/exchange/orders', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const mode = req.query.accountMode === 'real' ? 'real' : 'demo';
  const rows = await query<any>(
    `SELECT id, tx_type, method, account_from, account_to, amount, currency, reference_id, status, account_mode, metadata_json, created_at
     FROM cashier_transactions
     WHERE user_id = $1 AND tx_type IN ('exchange', 'exchange_limit') AND COALESCE(account_mode, 'demo') = $2
     ORDER BY id DESC LIMIT 40`,
    [req.user!.id, mode]
  );
  res.json({
    orders: rows.map((r) => {
      let meta: any = {};
      try {
        meta = JSON.parse(r.metadata_json || '{}');
      } catch {
        meta = {};
      }
      return {
        id: r.id,
        tx_type: r.tx_type,
        method: r.method,
        pair: meta.pair || `${r.account_to}/${r.account_from}`,
        side: meta.side || (String(r.method || '').includes('SELL') ? 'SELL' : 'BUY'),
        orderType: meta.orderType || (r.tx_type === 'exchange_limit' ? 'limit' : 'market'),
        price: Number(meta.price || 0),
        amount: Number(r.amount || 0),
        currency: r.currency,
        reference_id: r.reference_id,
        status: r.status,
        created_at: r.created_at,
      };
    }),
  });
});

router.post('/exchange/order', requireDb, requireAuth, async (req: AuthRequest, res) => {
  if (req.user!.role === 'owner' || req.user!.role === 'admin') {
    res.status(403).json({ error: 'Owner / Admin MIS accounts are not trading wallets.' });
    return;
  }
  const { pair, side = 'BUY', amount, orderType = 'market', limitPrice, accountMode } = req.body || {};
  const isReal = accountMode === 'real';
  const amt = Number(amount);
  if (!pair || !Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: 'Valid pair and positive amount are required' });
    return;
  }

  const normalizedSide = String(side).toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
  const normalizedOrderType = String(orderType).toLowerCase() === 'limit' ? 'limit' : 'market';

  const livePair = derivWs.getAllExchangeTickRates().find((p) => p.pair === pair);
  const pairMeta = EXCHANGE_PAIRS_CATALOG.find((p) => p.pair === pair);
  if (!livePair && !pairMeta) {
    res.status(400).json({ error: 'Unsupported trading pair' });
    return;
  }

  const marketPrice = Number(livePair?.price || pairMeta?.price || 1);
  const parsedLimit = Number(limitPrice);
  if (normalizedOrderType === 'limit' && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
    res.status(400).json({ error: 'Valid limit price is required' });
    return;
  }
  const execPrice = normalizedOrderType === 'limit' ? parsedLimit : marketPrice;
  const shouldRestAsLimit =
    normalizedOrderType === 'limit' &&
    ((normalizedSide === 'BUY' && parsedLimit < marketPrice * 0.9999) ||
      (normalizedSide === 'SELL' && parsedLimit > marketPrice * 1.0001));

  const [baseCoin, quoteCoin] = String(pair).split('/');

  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query<any>(
      `SELECT status, COALESCE(trading_suspended, FALSE) as trading_suspended,
              exchange_balances_json, real_exchange_balances_json,
              virtual_workspace_balance, real_wallets_json, demo_wallets_json
       FROM users WHERE id = $1 FOR UPDATE`,
      [req.user!.id]
    );
    const user = userRes.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.status !== 'active' || user.trading_suspended) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Trading is currently suspended on this account.' });
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

    if (normalizedSide === 'BUY') {
      if (quoteAvail + 1e-12 < amt) {
        await client.query('ROLLBACK');
        res.status(400).json({
          error: `Insufficient ${isReal ? 'Real' : 'Demo'} ${quoteCoin} Spot balance (${quoteAvail.toFixed(
            quoteCoin === 'USDT' || quoteCoin === 'USDC' ? 2 : 8
          )} available). Add funds from your Deriv wallet first.`,
        });
        return;
      }
      ex[quoteCoin] = Number(Math.max(0, quoteAvail - amt).toFixed(8));
      if (!shouldRestAsLimit) {
        const received = amt / (execPrice || 1);
        ex[baseCoin] = Number((baseAvail + received).toFixed(8));
      }
    } else {
      if (baseAvail + 1e-12 < amt) {
        await client.query('ROLLBACK');
        res.status(400).json({
          error: `Insufficient ${isReal ? 'Real' : 'Demo'} ${baseCoin} Spot balance (${baseAvail.toFixed(8)} available)`,
        });
        return;
      }
      ex[baseCoin] = Number(Math.max(0, baseAvail - amt).toFixed(8));
      if (!shouldRestAsLimit) {
        ex[quoteCoin] = Number((quoteAvail + amt * execPrice).toFixed(8));
      }
    }

    if (isReal) {
      realWallets.exchange_usdt = Number((ex.USDT || 0).toFixed(2));
      await client.query(
        'UPDATE users SET real_exchange_balances_json = $1, real_wallets_json = $2, updated_at = NOW() WHERE id = $3',
        [JSON.stringify(ex), JSON.stringify(realWallets), req.user!.id]
      );
    } else {
      demoWallets.exchange_usdt = Number((ex.USDT || 0).toFixed(2));
      await client.query(
        'UPDATE users SET exchange_balances_json = $1, demo_wallets_json = $2, updated_at = NOW() WHERE id = $3',
        [JSON.stringify(ex), JSON.stringify(demoWallets), req.user!.id]
      );
    }

    const ref = `${shouldRestAsLimit ? 'EXL' : 'EX'}-${randomId(4).toUpperCase()}`;
    const orderRowRes = await client.query(
      `INSERT INTO cashier_transactions (user_id, tx_type, method, provider, account_from, account_to, amount, currency, reference_id, status, account_mode, metadata_json)
       VALUES ($1, $2, $3, 'deriv_exchange', $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, reference_id, status, created_at`,
      [
        req.user!.id,
        shouldRestAsLimit ? 'exchange_limit' : 'exchange',
        `${normalizedOrderType.toUpperCase()} ${normalizedSide}`,
        normalizedSide === 'BUY' ? quoteCoin : baseCoin,
        normalizedSide === 'BUY' ? baseCoin : quoteCoin,
        amt,
        normalizedSide === 'BUY' ? quoteCoin : baseCoin,
        ref,
        shouldRestAsLimit ? 'open' : 'completed',
        isReal ? 'real' : 'demo',
        JSON.stringify({ pair, side: normalizedSide, orderType: normalizedOrderType, price: execPrice, accountMode: isReal ? 'real' : 'demo' }),
      ]
    );

    await client.query('COMMIT');

    derivWs.emitUserEvent(req.user!.id, 'balance_updated', {
      mode: isReal ? 'real' : 'demo',
      real_wallets: realWallets,
      realWallets,
      demo_wallets: demoWallets,
      demoWallets,
      real_exchange_balances: isReal ? ex : undefined,
      exchange_balances: !isReal ? ex : undefined,
    });

    await addNotification(
      req.user!.id,
      shouldRestAsLimit ? 'Limit Order Placed' : 'Exchange Order Filled',
      `[${isReal ? 'REAL' : 'DEMO'}] ${normalizedSide} ${amt} ${normalizedSide === 'BUY' ? quoteCoin : baseCoin} on ${pair} @ ${execPrice}`,
      'exchange'
    );

    res.json({
      ok: true,
      order: orderRowRes.rows[0],
      exchangeBalances: ex,
      reference: ref,
      status: shouldRestAsLimit ? 'open' : 'completed',
      accountMode: isReal ? 'real' : 'demo',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err instanceof Error ? err.message : 'Exchange order failed' });
  } finally {
    client.release();
  }
});

router.post('/exchange/orders/:id/cancel', requireDb, requireAuth, async (req: AuthRequest, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isFinite(orderId) || orderId <= 0 || !pool) {
    res.status(400).json({ error: 'Invalid order id' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txRes = await client.query<any>(
      `SELECT id, user_id, tx_type, account_from, amount, currency, status, account_mode, metadata_json
       FROM cashier_transactions
       WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [orderId, req.user!.id]
    );
    const tx = txRes.rows[0];
    if (!tx || tx.tx_type !== 'exchange_limit' || tx.status !== 'open') {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Open limit order not found' });
      return;
    }

    const isReal = tx.account_mode === 'real';
    const userRes = await client.query<any>(
      'SELECT exchange_balances_json, real_exchange_balances_json, real_wallets_json, demo_wallets_json FROM users WHERE id = $1 FOR UPDATE',
      [req.user!.id]
    );
    const user = userRes.rows[0];
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

    const refundCoin = String(tx.currency || tx.account_from || 'USDT');
    ex[refundCoin] = Number((Number(ex[refundCoin] || 0) + Number(tx.amount || 0)).toFixed(8));

    if (isReal) {
      realWallets.exchange_usdt = Number((ex.USDT || 0).toFixed(2));
      await client.query(
        'UPDATE users SET real_exchange_balances_json = $1, real_wallets_json = $2, updated_at = NOW() WHERE id = $3',
        [JSON.stringify(ex), JSON.stringify(realWallets), req.user!.id]
      );
    } else {
      demoWallets.exchange_usdt = Number((ex.USDT || 0).toFixed(2));
      await client.query(
        'UPDATE users SET exchange_balances_json = $1, demo_wallets_json = $2, updated_at = NOW() WHERE id = $3',
        [JSON.stringify(ex), JSON.stringify(demoWallets), req.user!.id]
      );
    }

    await client.query(`UPDATE cashier_transactions SET status = 'cancelled' WHERE id = $1`, [orderId]);
    await client.query('COMMIT');

    derivWs.emitUserEvent(req.user!.id, 'balance_updated', {
      mode: isReal ? 'real' : 'demo',
      real_wallets: realWallets,
      realWallets,
      demo_wallets: demoWallets,
      demoWallets,
      real_exchange_balances: isReal ? ex : undefined,
      exchange_balances: !isReal ? ex : undefined,
    });

    res.json({ ok: true, exchangeBalances: ex });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err instanceof Error ? err.message : 'Cancel failed' });
  } finally {
    client.release();
  }
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
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 30)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const rows = await query(
    'SELECT id, user_id, title, message, category, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3',
    [req.user!.id, limit, offset]
  );
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
