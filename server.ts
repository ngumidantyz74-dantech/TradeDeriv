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
  ensureDatabaseSchema,
  checkDatabaseHealth,
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
      service: 'TradeDeriv',
      database,
      deriv: derivWs.getDiagnostics(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/settings/public', async (_req, res) => {
    const defaultGlobal = {
      kesRate: 130.0,
      tickerText: 'TradeDeriv Live Markets · Synthetics, Forex, Crypto & Metals',
      maintenanceMode: false,
      allowRegistration: true,
      defaultVirtualBalance: 10000,
      adminPrivateSlug: config.adminPrivateSlug,
    };

    if (pool) {
      try {
        await ensureDatabaseSchema();
        const [branding, global, announcements] = await Promise.all([
          getSetting('branding', { appName: 'TradeDeriv' }),
          getSetting('global', defaultGlobal),
          getSetting<{ items?: any[] }>('announcements', { items: [] }),
        ]);
        res.json({
          branding,
          global,
          announcements: announcements.items || [],
        });
        return;
      } catch {
        // Fallback to cached/default settings if Neon is waking up
      }
    }

    const branding = getCachedSetting('branding', { appName: 'TradeDeriv' });
    const global = getCachedSetting('global', defaultGlobal);
    const announcements = getCachedSetting<{ items?: any[] }>('announcements', { items: [] });
    res.json({
      branding,
      global,
      announcements: announcements.items || [],
    });
  });

  // API Routers
  app.use('/api', authRoutes);
  app.use('/api', derivRoutes);
  app.use('/api', cashierRoutes);
  app.use('/api', marketRoutes);
  app.use('/api', ordersRoutes);
  app.use('/api', adminRoutes);

  // Root /callback alias for Deriv OAuth redirect URIs
  app.get(['/callback', '/callback/'], handleDerivOAuthCallback);

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
      symbols: new Set<string>(['1HZ100V', '1HZ15V', '1HZ10V', '1HZ25V', '1HZ75V', 'R_100']),
    };
    clientSubscriptions.set(socket, state);

    // Send initial price snapshot
    socket.send(JSON.stringify({ type: 'ticks_snapshot', ticks: derivWs.getAllLatestTicks() }));

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe' && msg.symbol) {
          state.symbols.add(String(msg.symbol));
          derivWs.ensureSymbolSubscribed(String(msg.symbol)).catch(() => {});
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
    const payload = JSON.stringify({ type: 'tick', tick });
    for (const [sock, state] of clientSubscriptions.entries()) {
      if (sock.readyState === WebSocket.OPEN && state.symbols.has(tick.symbol)) {
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
  if (config.nodeEnv === 'production') {
    app.use('/api', (_req, res) => {
      res.status(404).json({ error: 'API endpoint not found' });
    });

    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
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
