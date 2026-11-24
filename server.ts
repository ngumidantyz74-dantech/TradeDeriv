import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';

import { config } from './server/config.ts';
import {
  pool,
  query,
  ensureDatabaseSchema,
  checkDatabaseHealth,
  requireDb,
  getSetting,
  getCachedSetting,
} from './server/db.ts';
import { derivWs } from './server/deriv-client.ts';
import { startMtmPositionMonitor } from './server/trade-execution.ts';

import authRoutes from './server/routes/auth.ts';
import derivRoutes, { handleDerivOAuthCallback } from './server/routes/deriv.ts';
import cashierRoutes from './server/routes/cashier.ts';
import marketRoutes from './server/routes/market.ts';
import ordersRoutes from './server/routes/orders.ts';
import adminRoutes from './server/routes/admin.ts';
import intelligenceRoutes, { evaluateSmartAlertsForTick } from './server/routes/intelligence.ts';

async function bootstrapServer() {
  // Non-blocking Neon schema wakeup so Render binds PORT immediately and health checks stay responsive
  if (pool) {
    ensureDatabaseSchema().catch((err) => {
      console.error('Initial PostgreSQL schema wakeup deferred (will retry on request):', err.message);
    });
  } else {
    console.warn('DATABASE_URL is not configured. Database-backed routes will return 503 until set.');
  }

  derivWs.startMarketFeed();
  startMtmPositionMonitor();

  const app = express();
  app.set('trust proxy', 1);
  const server = http.createServer(app);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '4mb' }));

  // Health & Public Settings
  app.get('/api/health', async (_req, res) => {
    const database = await checkDatabaseHealth();
    res.json({
      ok: true,
      status: 'ok',
      service: 'DERIV',
      database,
      deriv: derivWs.getDiagnostics(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/settings/public', async (_req, res) => {
    const defaultGlobal = {
      kesRate: 130.0,
      tickerText: 'DERIV Live Markets · Synthetics, Forex, Crypto & Metals',
      maintenanceMode: false,
      allowRegistration: true,
      defaultVirtualBalance: 10000,
      adminPrivateSlug: config.adminPrivateSlug,
    };
    const defaultPartner = {
      referralLink: 'https://t.deriv.link?t=FSDRTFVTSKPA',
      referralCode: 'VNMH2VHBRTFN',
      affiliateTierRate: 30.0,
    };

    if (pool) {
      try {
        await ensureDatabaseSchema();
        const [branding, global, announcements, comm] = await Promise.all([
          getSetting('branding', { appName: 'DERIV' }),
          getSetting('global', defaultGlobal),
          getSetting<{ items?: any[] }>('announcements', { items: [] }),
          getSetting<any>('commissions', {}),
        ]);
        res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
        res.json({
          branding,
          global,
          announcements: announcements.items || [],
          partner: {
            referralLink: comm?.affiliateLink || defaultPartner.referralLink,
            referralCode: comm?.affiliateCode || defaultPartner.referralCode,
            affiliateTierRate: Number(comm?.affiliateTierRate ?? defaultPartner.affiliateTierRate),
          },
        });
        return;
      } catch {
        // Fallback to cached/default settings if Neon is waking up
      }
    }

    const branding = getCachedSetting('branding', { appName: 'DERIV' });
    const global = getCachedSetting('global', defaultGlobal);
    const announcements = getCachedSetting<{ items?: any[] }>('announcements', { items: [] });
    const comm = getCachedSetting<any>('commissions', {});
    res.json({
      branding,
      global,
      announcements: announcements.items || [],
      partner: {
        referralLink: comm?.affiliateLink || defaultPartner.referralLink,
        referralCode: comm?.affiliateCode || defaultPartner.referralCode,
        affiliateTierRate: Number(comm?.affiliateTierRate ?? defaultPartner.affiliateTierRate),
      },
    });
  });

  // API Routers
  app.use('/api', authRoutes);
  app.use('/api', derivRoutes);
  app.use('/api', cashierRoutes);
  app.use('/api', marketRoutes);
  app.use('/api', ordersRoutes);
  app.use('/api', adminRoutes);
  app.use('/api', intelligenceRoutes);

  // Root /callback alias for Deriv OAuth redirect URIs
  app.get(['/callback', '/callback/'], requireDb, handleDerivOAuthCallback);

  // Realtime WebSocket /ws
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clientSubscriptions = new Map<WebSocket, { userId: number | null; symbols: Set<string> }>();

  wss.on('connection', (socket, req) => {
    let userId: number | null = null;
    try {
      const url = new URL(req.url || '/ws', 'http://localhost');
      const token = url.searchParams.get('token');
      if (token) {
        const decoded = jwt.verify(token, config.jwtSecret) as { id: number };
        userId = decoded.id;
      }
    } catch {
      userId = null;
    }

    const state = {
      userId,
      symbols: new Set<string>(['1HZ100V', '1HZ15V', '1HZ10V', '1HZ25V', '1HZ75V', 'R_100', 'cryBTCUSD']),
    };
    clientSubscriptions.set(socket, state);

    // Ensure all active open positions for this user stream live ticks immediately
    if (userId && pool) {
      query<{ symbol: string }>(
        "SELECT DISTINCT symbol FROM virtual_orders WHERE user_id = $1 AND status = 'OPEN'",
        [userId]
      )
        .then((rows) => {
          for (const r of rows) {
            if (r.symbol) {
              state.symbols.add(r.symbol);
              derivWs.ensureSymbolSubscribed(r.symbol).catch(() => {});
            }
          }
        })
        .catch(() => {});
    }

    // Send initial price snapshot
    socket.send(JSON.stringify({ type: 'ticks_snapshot', ticks: derivWs.getAllLatestTicks() }));

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          }
          return;
        }
        if (msg.type === 'subscribe' && msg.symbol) {
          const sym = String(msg.symbol);
          state.symbols.add(sym);
          derivWs.ensureSymbolSubscribed(sym).catch(() => {});
          const latest = derivWs.getLatestTick(sym);
          if (latest && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'tick', tick: latest }));
          }
        }
        if (msg.type === 'subscribe_many' && Array.isArray(msg.symbols)) {
          for (const rawSym of msg.symbols) {
            const sym = String(rawSym || '').trim();
            if (!sym) continue;
            state.symbols.add(sym);
            derivWs.ensureSymbolSubscribed(sym).catch(() => {});
          }
        }
        if (msg.type === 'unsubscribe' && msg.symbol) {
          state.symbols.delete(String(msg.symbol));
        }
      } catch {
        // ignore invalid frames
      }
    });

    socket.on('close', () => {
      clientSubscriptions.delete(socket);
    });
  });

  derivWs.onTick((tick) => {
    evaluateSmartAlertsForTick(tick).catch(() => {});
    const payload = JSON.stringify({ type: 'tick', tick });
    for (const [sock, state] of clientSubscriptions.entries()) {
      if (sock.readyState === WebSocket.OPEN && state.symbols.has(tick.symbol)) {
        sock.send(payload);
      }
    }
  });

  derivWs.onExchangeTick((pairs) => {
    const payload = JSON.stringify({ type: 'exchange_ticks', pairs });
    for (const [sock] of clientSubscriptions.entries()) {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(payload);
      }
    }
  });

  derivWs.onUserEvent((targetUserId, event, data) => {
    const payload = JSON.stringify({ type: event, data });
    for (const [sock, state] of clientSubscriptions.entries()) {
      if (sock.readyState === WebSocket.OPEN && state.userId === targetUserId) {
        sock.send(payload);
      }
    }
  });

  // Production static SPA build vs Development Vite Middleware
  const distPath = path.resolve(process.cwd(), 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  if (config.nodeEnv === 'production' && fs.existsSync(distIndexPath)) {
    app.use('/api', (_req, res) => {
      res.status(404).json({ error: 'API endpoint not found' });
    });

    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`TradeDeriv server running on http://0.0.0.0:${config.port} (${config.nodeEnv})`);
  });
}

bootstrapServer().catch((err) => {
  console.error('Failed to start TradeDeriv server:', err);
  process.exit(1);
});
