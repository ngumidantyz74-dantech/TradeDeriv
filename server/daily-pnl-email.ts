import { pool, query, queryOne } from './db.ts';
import { sendTransactionalEmail } from './email-service.ts';

interface DailyOrderRow {
  id: number;
  user_id: number;
  account_mode: string | null;
  execution_mode: string;
  symbol: string;
  contract_type: string;
  side: string;
  barrier: string | null;
  stake: number;
  payout: number | null;
  entry_price: number;
  exit_price: number | null;
  pnl: number;
  status: string;
  source: string;
  opened_at: string;
  closed_at: string | null;
}

interface ActiveTraderRow {
  id: number;
  email: string;
  full_name: string;
}

let schedulerStarted = false;
let digestRunInProgress = false;

function getDigestTimezone(): string {
  return process.env.DAILY_PNL_TIMEZONE || 'Africa/Nairobi';
}

function getLocalClockParts(now: Date, timeZone: string): { dateStr: string; hour: number; minute: number } {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const map = new Map(parts.map((p) => [p.type, p.value]));
    const year = map.get('year') || String(now.getUTCFullYear());
    const month = map.get('month') || String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = map.get('day') || String(now.getUTCDate()).padStart(2, '0');
    const rawHour = Number(map.get('hour') ?? now.getUTCHours());
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = Number(map.get('minute') ?? now.getUTCMinutes());
    return {
      dateStr: `${year}-${month}-${day}`,
      hour,
      minute,
    };
  } catch {
    return {
      dateStr: now.toISOString().slice(0, 10),
      hour: now.getUTCHours(),
      minute: now.getUTCMinutes(),
    };
  }
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function summarizeOrders(rows: DailyOrderRow[]) {
  let totalRuns = rows.length;
  let closedCount = 0;
  let openCount = 0;
  let wins = 0;
  let losses = 0;
  let totalStake = 0;
  let totalPayout = 0;
  let netPnl = 0;

  for (const r of rows) {
    const stake = Number(r.stake || 0);
    const pnl = Number(r.pnl || 0);
    totalStake += stake;
    netPnl += pnl;
    if (String(r.status).toUpperCase() === 'CLOSED') {
      closedCount += 1;
      if (pnl > 0) {
        wins += 1;
        totalPayout += Number(r.payout || stake + pnl);
      } else if (pnl < 0) {
        losses += 1;
      } else {
        totalPayout += stake;
      }
    } else {
      openCount += 1;
    }
  }

  const settled = wins + losses;
  const winRate = settled > 0 ? Number(((wins / settled) * 100).toFixed(1)) : 0;
  return {
    totalRuns,
    closedCount,
    openCount,
    wins,
    losses,
    winRate,
    totalStake: Number(totalStake.toFixed(2)),
    totalPayout: Number(totalPayout.toFixed(2)),
    netPnl: Number(netPnl.toFixed(2)),
  };
}

function formatMoney(val: number, signed = false): string {
  const num = Number(val || 0);
  const abs = Math.abs(num).toFixed(2);
  if (signed) {
    return num >= 0 ? `+$${abs}` : `-$${abs}`;
  }
  return `$${abs}`;
}

function formatTimeInTz(iso: string | null, timeZone: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString().slice(11, 19);
  }
}

function buildDailyPnlHtml(params: {
  traderName: string;
  dateStr: string;
  timeZone: string;
  orders: DailyOrderRow[];
}): string {
  const { traderName, dateStr, timeZone, orders } = params;
  const realOrders = orders.filter(
    (o) => (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) === 'real'
  );
  const demoOrders = orders.filter(
    (o) => (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) !== 'real'
  );

  const combined = summarizeOrders(orders);
  const realStats = summarizeOrders(realOrders);
  const demoStats = summarizeOrders(demoOrders);

  const bySymbol = new Map<string, { runs: number; wins: number; losses: number; stake: number; pnl: number }>();
  for (const o of orders) {
    const curr = bySymbol.get(o.symbol) || { runs: 0, wins: 0, losses: 0, stake: 0, pnl: 0 };
    curr.runs += 1;
    curr.stake += Number(o.stake || 0);
    const p = Number(o.pnl || 0);
    curr.pnl += p;
    if (String(o.status).toUpperCase() === 'CLOSED') {
      if (p > 0) curr.wins += 1;
      else if (p < 0) curr.losses += 1;
    }
    bySymbol.set(o.symbol, curr);
  }

  const symbolRowsHtml = Array.from(bySymbol.entries())
    .map(([sym, s]) => {
      const color = s.pnl >= 0 ? '#00A878' : '#FF444F';
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">${escapeHtml(sym)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#334155;">${s.runs}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#334155;">${s.wins}W / ${s.losses}L</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#334155;">${formatMoney(s.stake)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:${color};">${formatMoney(s.pnl, true)}</td>
      </tr>`;
    })
    .join('');

  const recentLedger = orders.slice(0, 40);
  const ledgerRowsHtml = recentLedger
    .map((o) => {
      const mode = (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')).toUpperCase();
      const pnl = Number(o.pnl || 0);
      const pnlColor = pnl >= 0 ? '#00A878' : '#FF444F';
      const entry = Number(o.entry_price || 0).toFixed(2);
      const exit = o.exit_price !== null && o.exit_price !== undefined ? Number(o.exit_price).toFixed(2) : '-';
      return `<tr>
        <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;">${escapeHtml(formatTimeInTz(o.closed_at || o.opened_at, timeZone))}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-size:11px;font-weight:700;color:${mode === 'REAL' ? '#0f766e' : '#b45309'};">${mode}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:600;color:#0f172a;">${escapeHtml(o.symbol)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155;">${escapeHtml(o.contract_type)}${o.barrier ? ` (${escapeHtml(o.barrier)})` : ''}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;text-align:right;color:#334155;">${formatMoney(o.stake)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-size:11px;text-align:right;color:#64748b;">${entry} → ${exit}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;text-align:right;font-weight:700;color:${pnlColor};">${formatMoney(pnl, true)}</td>
      </tr>`;
    })
    .join('');

  const renderModeCard = (label: string, accent: string, stats: ReturnType<typeof summarizeOrders>) => {
    const netColor = stats.netPnl >= 0 ? '#00A878' : '#FF444F';
    return `<td style="width:50%;vertical-align:top;padding:6px;">
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#f8fafc;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:${accent};margin-bottom:6px;">${label}</div>
        <div style="font-size:20px;font-weight:700;color:${netColor};margin-bottom:8px;">${formatMoney(stats.netPnl, true)}</div>
        <div style="font-size:12px;color:#334155;line-height:1.6;">
          Trades: <strong>${stats.totalRuns}</strong> (${stats.wins} Won / ${stats.losses} Lost)<br/>
          Win Rate: <strong>${stats.winRate}%</strong><br/>
          Total Stake: <strong>${formatMoney(stats.totalStake)}</strong><br/>
          Total Payout: <strong>${formatMoney(stats.totalPayout)}</strong>
        </div>
      </div>
    </td>`;
  };

  const heroColor = combined.netPnl >= 0 ? '#00A878' : '#FF444F';
  const heroBg = combined.netPnl >= 0 ? '#ecfdf5' : '#fef2f2';

  return `<div style="font-family:Inter,Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #FF444F;padding-bottom:12px;margin-bottom:18px;">
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#FF444F;">DAILY 8:00 PM TRADING STATEMENT</div>
        <h2 style="margin:4px 0 0;font-size:20px;color:#0f172a;">Daily Profit &amp; Loss Summary — ${escapeHtml(dateStr)}</h2>
      </div>
    </div>

    <p style="margin:0 0 16px;font-size:14px;color:#334155;">Hello ${escapeHtml(traderName)}, here is your complete end-of-day trading performance breakdown for <strong>${escapeHtml(dateStr)}</strong> (${escapeHtml(timeZone)}):</p>

    <div style="background:${heroBg};border:1px solid ${heroColor}33;border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:600;color:#475569;">COMBINED NET PROFIT / LOSS</div>
      <div style="font-size:28px;font-weight:800;color:${heroColor};margin-top:4px;">${formatMoney(combined.netPnl, true)} USD</div>
      <div style="font-size:12px;color:#475569;margin-top:6px;">
        Total Trades: <strong>${combined.totalRuns}</strong> &bull; Won: <strong>${combined.wins}</strong> &bull; Lost: <strong>${combined.losses}</strong> &bull; Win Rate: <strong>${combined.winRate}%</strong> &bull; Total Stake: <strong>${formatMoney(combined.totalStake)}</strong>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      <tr>
        ${renderModeCard('REAL ACCOUNT', '#0f766e', realStats)}
        ${renderModeCard('DEMO ACCOUNT', '#b45309', demoStats)}
      </tr>
    </table>

    <h3 style="margin:0 0 8px;font-size:14px;color:#0f172a;">Market Breakdown</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;">
      <thead>
        <tr style="background:#f8fafc;color:#475569;text-align:left;">
          <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;">Symbol</th>
          <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;text-align:right;">Trades</th>
          <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;text-align:right;">W / L</th>
          <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;text-align:right;">Stake</th>
          <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;text-align:right;">Net P/L</th>
        </tr>
      </thead>
      <tbody>${symbolRowsHtml}</tbody>
    </table>

    <h3 style="margin:0 0 8px;font-size:14px;color:#0f172a;">Trade Details (${recentLedger.length}${orders.length > recentLedger.length ? ` of ${orders.length}` : ''})</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:#f8fafc;color:#475569;text-align:left;font-size:11px;">
          <th style="padding:7px 8px;border-bottom:1px solid #cbd5e1;">Time</th>
          <th style="padding:7px 8px;border-bottom:1px solid #cbd5e1;">Account</th>
          <th style="padding:7px 8px;border-bottom:1px solid #cbd5e1;">Market</th>
          <th style="padding:7px 8px;border-bottom:1px solid #cbd5e1;">Contract</th>
          <th style="padding:7px 8px;border-bottom:1px solid #cbd5e1;text-align:right;">Stake</th>
          <th style="padding:7px 8px;border-bottom:1px solid #cbd5e1;text-align:right;">Spot</th>
          <th style="padding:7px 8px;border-bottom:1px solid #cbd5e1;text-align:right;">P/L</th>
        </tr>
      </thead>
      <tbody>${ledgerRowsHtml}</tbody>
    </table>

    <p style="margin:0;font-size:11px;color:#64748b;">Sent automatically at 8:00 PM (${escapeHtml(timeZone)}). Bot start/stop email alerts are disabled per your preferences.</p>
  </div>`;
}

export async function runDailyPnlDigestIfDue(forceSend = false): Promise<{ sent: number; skipped: number }> {
  if (!pool || digestRunInProgress) return { sent: 0, skipped: 0 };
  const timeZone = getDigestTimezone();
  const { dateStr, hour } = getLocalClockParts(new Date(), timeZone);

  if (!forceSend && hour !== 20) {
    return { sent: 0, skipped: 0 };
  }

  digestRunInProgress = true;
  let sent = 0;
  let skipped = 0;
  try {
    const activeTraders = await query<ActiveTraderRow>(
      `SELECT DISTINCT u.id, u.email, u.full_name
       FROM users u
       INNER JOIN virtual_orders o ON o.user_id = u.id
       WHERE u.role = 'user'
         AND u.status = 'active'
         AND u.email LIKE '%@%'
         AND u.email NOT LIKE '%.local'
         AND (
           (o.opened_at AT TIME ZONE $1)::date = $2::date
           OR (o.closed_at IS NOT NULL AND (o.closed_at AT TIME ZONE $1)::date = $2::date)
         )
       LIMIT 200`,
      [timeZone, dateStr]
    );

    for (const trader of activeTraders) {
      const cleanEmail = String(trader.email || '').trim();
      if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.endsWith('.local')) {
        skipped += 1;
        continue;
      }

      if (!forceSend) {
        const alreadySent = await queryOne<{ id: number }>(
          `SELECT id FROM email_logs
           WHERE template = 'daily_pnl_summary'
             AND recipient_email = $1
             AND (created_at AT TIME ZONE $2)::date = $3::date
           LIMIT 1`,
          [cleanEmail, timeZone, dateStr]
        );
        if (alreadySent) {
          skipped += 1;
          continue;
        }
      }

      const orders = await query<DailyOrderRow>(
        `SELECT id, user_id, account_mode, execution_mode, symbol, contract_type, side,
                barrier, stake, payout, entry_price, exit_price, pnl, status, source, opened_at, closed_at
         FROM virtual_orders
         WHERE user_id = $1
           AND (
             (opened_at AT TIME ZONE $2)::date = $3::date
             OR (closed_at IS NOT NULL AND (closed_at AT TIME ZONE $2)::date = $3::date)
           )
         ORDER BY COALESCE(closed_at, opened_at) DESC
         LIMIT 250`,
        [trader.id, timeZone, dateStr]
      );

      if (orders.length === 0) {
        skipped += 1;
        continue;
      }

      const combined = summarizeOrders(orders);
      const subject = `Daily Trading Summary (${dateStr}): ${formatMoney(combined.netPnl, true)} USD`;
      const htmlContent = buildDailyPnlHtml({
        traderName: trader.full_name || 'Trader',
        dateStr,
        timeZone,
        orders,
      });

      const res = await sendTransactionalEmail({
        to: cleanEmail,
        toName: trader.full_name || cleanEmail,
        template: 'daily_pnl_summary',
        subject,
        htmlContent,
      });
      if (res.delivered || res.status === 'queued_local') {
        sent += 1;
      } else {
        skipped += 1;
      }
    }
  } catch (err) {
    console.error('[DailyPnlEmail] Digest cycle failed:', err instanceof Error ? err.message : err);
  } finally {
    digestRunInProgress = false;
  }

  return { sent, skipped };
}

export function startDailyPnlEmailScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setTimeout(() => {
    runDailyPnlDigestIfDue().catch(() => {});
  }, 15_000);

  setInterval(() => {
    runDailyPnlDigestIfDue().catch(() => {});
  }, 60_000);
}
