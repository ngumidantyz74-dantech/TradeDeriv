import { query, queryOne, execute, addNotification } from './db.ts';
import { decryptToken } from './crypto.ts';
import { derivWs, derivRestRequest, OtpDerivClient } from './deriv-client.ts';

export interface PlaceOrderInput {
  userId: number;
  symbol: string;
  side: string; // BUY | SELL | CALL | PUT | DIGITOVER | DIGITUNDER | DIGITEVEN | DIGITODD | DIGITMATCH | DIGITDIFF | MULTUP | MULTDOWN
  contractType?: string;
  lots?: number;
  stake?: number;
  multiplier?: number;
  slUsd?: number | null;
  tpUsd?: number | null;
  slPrice?: number | null;
  tpPrice?: number | null;
  barrier?: string | null;
  duration?: number;
  durationUnit?: string;
  executionMode?: 'virtual' | 'deriv';
  connectedAccountId?: number | null;
  source?: 'manual' | 'bot' | 'bulk';
}

function normalizeContractType(side: string, explicitType?: string): string {
  if (explicitType) return explicitType.toUpperCase();
  const s = side.toUpperCase();
  if (s === 'BUY' || s === 'MULTUP') return 'MULTUP';
  if (s === 'SELL' || s === 'MULTDOWN') return 'MULTDOWN';
  if (['OVER', 'DIGITOVER'].includes(s)) return 'DIGITOVER';
  if (['UNDER', 'DIGITUNDER'].includes(s)) return 'DIGITUNDER';
  if (['EVEN', 'DIGITEVEN'].includes(s)) return 'DIGITEVEN';
  if (['ODD', 'DIGITODD'].includes(s)) return 'DIGITODD';
  if (['MATCH', 'DIGITMATCH'].includes(s)) return 'DIGITMATCH';
  if (['DIFF', 'DIGITDIFF'].includes(s)) return 'DIGITDIFF';
  if (['RISE', 'CALL'].includes(s)) return 'CALL';
  if (['FALL', 'PUT'].includes(s)) return 'PUT';
  return 'MULTUP';
}

async function getDecryptedAccountToken(connectedAccountId: number, userId: number): Promise<{
  account: {
    id: number;
    deriv_account_id: string;
    deriv_login_id: string;
    currency: string;
    is_virtual: boolean;
    balance: number;
    last_known_balance: number;
    balance_locked_by_admin: boolean;
  };
  token: string;
} | null> {
  const account = await queryOne<{
    id: number;
    deriv_account_id: string;
    deriv_login_id: string;
    currency: string;
    is_virtual: boolean;
    balance: number;
    last_known_balance: number;
    balance_locked_by_admin: boolean;
  }>(
    `SELECT id, deriv_account_id, deriv_login_id, currency, is_virtual, balance, last_known_balance,
            COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin
     FROM connected_accounts
     WHERE id = $1 AND user_id = $2 AND status = 'active'`,
    [connectedAccountId, userId]
  );
  if (!account) return null;

  const auth = await queryOne<{ encrypted_token: string; token_iv: string; token_auth_tag: string }>(
    `SELECT encrypted_token, token_iv, token_auth_tag
     FROM account_authorizations
     WHERE connected_account_id = $1 AND revoked_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [account.id]
  );
  if (!auth) return null;

  const token = decryptToken(auth.encrypted_token, auth.token_iv, auth.token_auth_tag);
  return { account, token };
}

export async function placeUnifiedOrder(input: PlaceOrderInput): Promise<any> {
  const user = await queryOne<{ id: number; virtual_workspace_balance: number }>(
    'SELECT id, virtual_workspace_balance FROM users WHERE id = $1',
    [input.userId]
  );
  if (!user) throw new Error('User not found');

  await derivWs.ensureSymbolSubscribed(input.symbol);
  const tick = derivWs.getLatestTick(input.symbol);
  const entryPrice = tick?.quote || 1000.0;
  const pipSize = tick?.pipSize || 0.01;

  const lots = Number(Math.max(0.01, Math.min(100, input.lots ?? (input.stake ? input.stake / 100 : 0.1))).toFixed(2));
  const stake = Number(Math.max(0.5, input.stake ?? lots * 100).toFixed(2));
  const multiplier = Number(input.multiplier || 100);
  const contractType = normalizeContractType(input.side, input.contractType);
  const duration = Number(input.duration || 5);
  const durationUnit = input.durationUnit || 't';

  let slUsd = input.slUsd !== undefined && input.slUsd !== null ? Math.abs(Number(input.slUsd)) : null;
  let tpUsd = input.tpUsd !== undefined && input.tpUsd !== null ? Math.abs(Number(input.tpUsd)) : null;
  let slPrice = input.slPrice ?? null;
  let tpPrice = input.tpPrice ?? null;

  const isUp = ['MULTUP', 'CALL', 'DIGITOVER', 'DIGITEVEN', 'DIGITMATCH', 'BUY'].includes(contractType);
  if (slUsd && !slPrice) {
    const pctMove = Math.min(0.45, slUsd / Math.max(1, stake * multiplier));
    slPrice = Number((entryPrice * (isUp ? 1 - pctMove : 1 + pctMove)).toFixed(pipSize < 0.001 ? 5 : 2));
  }
  if (tpUsd && !tpPrice) {
    const pctMove = Math.min(0.95, tpUsd / Math.max(1, stake * multiplier));
    tpPrice = Number((entryPrice * (isUp ? 1 + pctMove : 1 - pctMove)).toFixed(pipSize < 0.001 ? 5 : 2));
  }
  if (slPrice && !slUsd) {
    slUsd = Number(((Math.abs(entryPrice - slPrice) / entryPrice) * stake * multiplier).toFixed(2));
  }
  if (tpPrice && !tpUsd) {
    tpUsd = Number(((Math.abs(tpPrice - entryPrice) / entryPrice) * stake * multiplier).toFixed(2));
  }

  let derivContractId: string | null = null;
  let actualMode: 'virtual' | 'deriv' = 'virtual';
  let actualPayout = 0;

  // Attempt live Deriv execution if a connected account is chosen or executionMode === 'deriv'
  if (input.executionMode === 'deriv' || input.connectedAccountId) {
    const fallbackAcc = input.connectedAccountId
      ? { id: input.connectedAccountId }
      : await queryOne<{ id: number }>(
          "SELECT id FROM connected_accounts WHERE user_id = $1 AND status = 'active' ORDER BY id ASC LIMIT 1",
          [input.userId]
        );

    const targetAccId = fallbackAcc?.id;
    if (targetAccId) {
      const creds = await getDecryptedAccountToken(targetAccId, input.userId);
      if (creds) {
        try {
          const isOAuth2 = creds.token.startsWith('ory_at_') || creds.token.length > 40;
          const symbolField = isOAuth2 ? { underlying_symbol: input.symbol } : { symbol: input.symbol };

          let effectiveType = contractType;
          let effectiveMult = multiplier;

          if (effectiveType === 'MULTUP' || effectiveType === 'MULTDOWN') {
            try {
              const cfResp = await derivWs.request<{
                contracts_for?: { available?: Array<{ contract_type: string; multiplier_range?: number[] }> };
              }>({ contracts_for: input.symbol, currency: creds.account.currency }, 4500);
              const multContract = cfResp?.contracts_for?.available?.find((c) => c.contract_type === effectiveType);
              if (!multContract) {
                effectiveType = effectiveType === 'MULTUP' ? 'CALL' : 'PUT';
              } else if (multContract.multiplier_range && multContract.multiplier_range.length > 0) {
                if (!multContract.multiplier_range.includes(effectiveMult)) {
                  effectiveMult = multContract.multiplier_range.reduce((prev, curr) =>
                    Math.abs(curr - effectiveMult) < Math.abs(prev - effectiveMult) ? curr : prev
                  );
                }
              }
            } catch {
              // proceed with default
            }
          }

          const proposalPayload: Record<string, unknown> = {
            proposal: 1,
            amount: stake,
            basis: 'stake',
            contract_type: effectiveType,
            currency: creds.account.currency,
            ...symbolField,
          };

          if (effectiveType === 'MULTUP' || effectiveType === 'MULTDOWN') {
            proposalPayload.multiplier = effectiveMult;
            const limitOrder: Record<string, number> = {};
            if (tpUsd && tpUsd >= 0.5) limitOrder.take_profit = Number(tpUsd.toFixed(2));
            if (slUsd && slUsd >= 0.5 && slUsd < stake) limitOrder.stop_loss = Number(slUsd.toFixed(2));
            if (Object.keys(limitOrder).length > 0) proposalPayload.limit_order = limitOrder;
          } else {
            proposalPayload.duration = duration;
            proposalPayload.duration_unit = durationUnit;
            if (input.barrier !== undefined && input.barrier !== null && input.barrier !== '') {
              proposalPayload.barrier = String(input.barrier);
            }
          }

          let buyResult: any;
          if (isOAuth2) {
            const otpResp = await derivRestRequest<{ url?: string; otp?: string }>(
              `/trading/v1/options/accounts/${creds.account.deriv_login_id}/otp`,
              creds.token,
              { method: 'POST' }
            );
            const otpUrl = otpResp.url || otpResp.otp;
            if (!otpUrl) throw new Error('Failed to mint Deriv OTP socket');
            const prop = await OtpDerivClient.requestOnOtpUrl(otpUrl, proposalPayload);
            buyResult = await OtpDerivClient.requestOnOtpUrl(otpUrl, {
              buy: prop.proposal.id,
              price: stake,
            });
          } else {
            const prop = await derivWs.requestWithToken(creds.token, proposalPayload);
            buyResult = await derivWs.requestWithToken(creds.token, {
              buy: prop.proposal.id,
              price: stake,
            });
          }

          if (buyResult?.buy?.contract_id) {
            derivContractId = String(buyResult.buy.contract_id);
            actualPayout = Number(buyResult.buy.payout || 0);
            actualMode = 'deriv';

            // Never overwrite admin-locked last_known_balance with live Deriv balance
            if (creds.account.balance_locked_by_admin) {
              const updatedBal = Math.max(0, Number((creds.account.last_known_balance - stake).toFixed(2)));
              await execute(
                'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
                [updatedBal, creds.account.id]
              );
              derivWs.emitUserEvent(input.userId, 'account_updated', {
                accountId: creds.account.id,
                balance: updatedBal,
              });
            } else if (buyResult.buy.balance_after !== undefined) {
              const liveBal = Number(buyResult.buy.balance_after);
              await execute(
                'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
                [liveBal, creds.account.id]
              );
              derivWs.emitUserEvent(input.userId, 'account_updated', {
                accountId: creds.account.id,
                balance: liveBal,
              });
            }
          }
        } catch {
          actualMode = 'virtual';
        }
      }
    }
  }

  if (actualMode === 'virtual') {
    if (user.virtual_workspace_balance < stake) {
      throw new Error(
        `Insufficient virtual balance ($${user.virtual_workspace_balance.toFixed(2)} available, $${stake.toFixed(2)} required)`
      );
    }
    const newBal = Number((user.virtual_workspace_balance - stake).toFixed(2));
    await execute('UPDATE users SET virtual_workspace_balance = $1, updated_at = NOW() WHERE id = $2', [
      newBal,
      input.userId,
    ]);
    derivWs.emitUserEvent(input.userId, 'balance_updated', { virtual_workspace_balance: newBal });
  }

  const created = await queryOne<any>(
    `INSERT INTO virtual_orders (
      user_id, connected_account_id, deriv_contract_id, execution_mode, source,
      symbol, side, contract_type, lots, stake, multiplier,
      entry_price, current_price, sl_price, tp_price, sl_usd, tp_usd,
      barrier, duration, duration_unit, payout, pnl, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'OPEN')
    RETURNING *`,
    [
      input.userId,
      input.connectedAccountId || null,
      derivContractId,
      actualMode,
      input.source || 'manual',
      input.symbol,
      input.side.toUpperCase(),
      contractType,
      lots,
      stake,
      multiplier,
      entryPrice,
      entryPrice,
      slPrice,
      tpPrice,
      slUsd,
      tpUsd,
      input.barrier ?? null,
      duration,
      durationUnit,
      actualPayout,
      0,
    ]
  );

  derivWs.emitUserEvent(input.userId, 'order_opened', created);

  if (
    actualMode === 'virtual' &&
    ['DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD', 'DIGITMATCH', 'DIGITDIFF', 'CALL', 'PUT'].includes(contractType)
  ) {
    const settleDelay = Math.max(800, Math.min(3000, duration * 450));
    setTimeout(() => {
      settleVirtualDigitalOrder(Number(created.id)).catch(() => {});
    }, settleDelay);
  }

  return created;
}

export async function settleVirtualDigitalOrder(orderId: number): Promise<any> {
  const order = await queryOne<any>("SELECT * FROM virtual_orders WHERE id = $1 AND status = 'OPEN'", [orderId]);
  if (!order) return null;

  const latest = derivWs.getLatestTick(order.symbol);
  const exitPrice = latest?.quote || order.entry_price;
  const priceStr = exitPrice.toFixed(latest?.pipSize && latest.pipSize < 0.001 ? 5 : 2);
  const lastDigit = Number(priceStr[priceStr.length - 1] || 0);
  const barrier = Number(order.barrier ?? 5);

  let won = false;
  let payoutMult = 1.95;
  switch (order.contract_type) {
    case 'DIGITOVER':
      won = lastDigit > barrier;
      payoutMult = Number((9.5 / Math.max(1, 9 - barrier)).toFixed(2));
      break;
    case 'DIGITUNDER':
      won = lastDigit < barrier;
      payoutMult = Number((9.5 / Math.max(1, barrier)).toFixed(2));
      break;
    case 'DIGITEVEN':
      won = lastDigit % 2 === 0;
      payoutMult = 1.95;
      break;
    case 'DIGITODD':
      won = lastDigit % 2 === 1;
      payoutMult = 1.95;
      break;
    case 'DIGITMATCH':
      won = lastDigit === barrier;
      payoutMult = 9.09;
      break;
    case 'DIGITDIFF':
      won = lastDigit !== barrier;
      payoutMult = 1.11;
      break;
    case 'CALL':
      won = exitPrice >= order.entry_price;
      payoutMult = 1.95;
      break;
    case 'PUT':
      won = exitPrice <= order.entry_price;
      payoutMult = 1.95;
      break;
    default:
      won = exitPrice >= order.entry_price;
  }

  const pnl = won ? Number((order.stake * (payoutMult - 1)).toFixed(2)) : -Number(order.stake.toFixed(2));
  const payout = won ? Number((order.stake + pnl).toFixed(2)) : 0;

  const closedOrder = await queryOne<any>(
    `UPDATE virtual_orders
     SET status = 'CLOSED', exit_price = $1, current_price = $1, payout = $2, pnl = $3, closed_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [exitPrice, payout, pnl, order.id]
  );

  if (payout > 0) {
    await execute(
      'UPDATE users SET virtual_workspace_balance = ROUND((virtual_workspace_balance + $1)::numeric, 2)::double precision, updated_at = NOW() WHERE id = $2',
      [payout, order.user_id]
    );
  }

  const updatedUser = await queryOne<{ virtual_workspace_balance: number }>(
    'SELECT virtual_workspace_balance FROM users WHERE id = $1',
    [order.user_id]
  );

  derivWs.emitUserEvent(order.user_id, 'order_closed', closedOrder);
  if (updatedUser) {
    derivWs.emitUserEvent(order.user_id, 'balance_updated', {
      virtual_workspace_balance: updatedUser.virtual_workspace_balance,
    });
  }
  return closedOrder;
}

export async function closeOrderById(orderId: number, userId?: number, isAdmin = false): Promise<any> {
  const order = await queryOne<any>('SELECT * FROM virtual_orders WHERE id = $1', [orderId]);
  if (!order) throw new Error('Order not found');
  if (!isAdmin && userId !== undefined && order.user_id !== userId) {
    throw new Error('Unauthorized to close this order');
  }
  if (order.status === 'CLOSED') return order;

  const latest = derivWs.getLatestTick(order.symbol);
  const exitPrice = latest?.quote || order.current_price || order.entry_price;
  let pnl = Number(order.pnl || 0);

  if (order.execution_mode === 'deriv' && order.deriv_contract_id && order.connected_account_id) {
    const creds = await getDecryptedAccountToken(order.connected_account_id, order.user_id);
    if (creds) {
      try {
        const isOAuth2 = creds.token.startsWith('ory_at_') || creds.token.length > 40;
        const sellResp = isOAuth2
          ? await (async () => {
              const otpResp = await derivRestRequest<{ url?: string; otp?: string }>(
                `/trading/v1/options/accounts/${creds.account.deriv_login_id}/otp`,
                creds.token,
                { method: 'POST' }
              );
              const otpUrl = otpResp.url || otpResp.otp || '';
              return OtpDerivClient.requestOnOtpUrl(otpUrl, { sell: Number(order.deriv_contract_id), price: 0 });
            })()
          : await derivWs.requestWithToken(creds.token, {
              sell: Number(order.deriv_contract_id),
              price: 0,
            });
        if (sellResp?.sell?.sold_for !== undefined) {
          pnl = Number((Number(sellResp.sell.sold_for) - order.stake).toFixed(2));
        }

        // Preserve admin-locked balance rather than overwriting with live Deriv balance
        if (creds.account.balance_locked_by_admin) {
          const credit = Math.max(0, Number((order.stake + pnl).toFixed(2)));
          const updatedBal = Number((creds.account.last_known_balance + credit).toFixed(2));
          await execute(
            'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
            [updatedBal, creds.account.id]
          );
          derivWs.emitUserEvent(order.user_id, 'account_updated', {
            accountId: creds.account.id,
            balance: updatedBal,
          });
        } else if (sellResp?.sell?.balance_after !== undefined) {
          const liveBal = Number(sellResp.sell.balance_after);
          await execute(
            'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
            [liveBal, creds.account.id]
          );
        }
      } catch {
        // Fallback to MTM pnl
      }
    }
  } else {
    const isUp = ['MULTUP', 'CALL', 'BUY', 'DIGITOVER'].includes(order.contract_type);
    const pctDiff = (exitPrice - order.entry_price) / (order.entry_price || 1);
    const directional = isUp ? pctDiff : -pctDiff;
    pnl = Number(Math.max(-order.stake, directional * order.stake * order.multiplier).toFixed(2));
    const credit = Math.max(0, Number((order.stake + pnl).toFixed(2)));
    await execute(
      'UPDATE users SET virtual_workspace_balance = ROUND((virtual_workspace_balance + $1)::numeric, 2)::double precision, updated_at = NOW() WHERE id = $2',
      [credit, order.user_id]
    );

    const updatedUser = await queryOne<{ virtual_workspace_balance: number }>(
      'SELECT virtual_workspace_balance FROM users WHERE id = $1',
      [order.user_id]
    );
    if (updatedUser) {
      derivWs.emitUserEvent(order.user_id, 'balance_updated', {
        virtual_workspace_balance: updatedUser.virtual_workspace_balance,
      });
    }
  }

  const closedOrder = await queryOne<any>(
    `UPDATE virtual_orders
     SET status = 'CLOSED', current_price = $1, exit_price = $1, pnl = $2, closed_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [exitPrice, pnl, order.id]
  );

  derivWs.emitUserEvent(order.user_id, 'order_closed', closedOrder);
  return closedOrder;
}

export async function bulkCloseOrders(
  userId: number,
  filter: 'all' | 'profitable' | 'losing' | 'buy' | 'sell' | 'over' | 'under' | 'bot'
): Promise<{ closedCount: number; closedOrders: any[] }> {
  const openOrders = await query<any>(
    "SELECT * FROM virtual_orders WHERE user_id = $1 AND status = 'OPEN'",
    [userId]
  );

  const targets = openOrders.filter((o) => {
    switch (filter) {
      case 'profitable':
        return Number(o.pnl) > 0;
      case 'losing':
        return Number(o.pnl) < 0;
      case 'buy':
        return ['BUY', 'MULTUP', 'CALL'].includes(String(o.side).toUpperCase()) || o.contract_type === 'MULTUP';
      case 'sell':
        return ['SELL', 'MULTDOWN', 'PUT'].includes(String(o.side).toUpperCase()) || o.contract_type === 'MULTDOWN';
      case 'over':
        return o.contract_type === 'DIGITOVER' || String(o.side).toUpperCase().includes('OVER');
      case 'under':
        return o.contract_type === 'DIGITUNDER' || String(o.side).toUpperCase().includes('UNDER');
      case 'bot':
        return o.source === 'bot';
      case 'all':
      default:
        return true;
    }
  });

  const closedOrders: any[] = [];
  for (const t of targets) {
    const res = await closeOrderById(t.id, userId);
    closedOrders.push(res);
  }

  if (closedOrders.length > 0) {
    await addNotification(
      userId,
      'Bulk Position Close',
      `Closed ${closedOrders.length} position(s) via "${filter}" rule.`,
      'trading'
    );
  }

  return { closedCount: closedOrders.length, closedOrders };
}

const mtmClosingLocks = new Set<number>();

export function startMtmPositionMonitor(): void {
  derivWs.onTick(async (tick) => {
    try {
      const openOrders = await query<any>(
        "SELECT * FROM virtual_orders WHERE symbol = $1 AND status = 'OPEN' AND source != 'bot'",
        [tick.symbol]
      );

      for (const order of openOrders) {
        if (mtmClosingLocks.has(order.id)) continue;
        if (!['MULTUP', 'MULTDOWN', 'BUY', 'SELL'].includes(order.contract_type)) continue;

        const isUp = order.contract_type === 'MULTUP' || order.side === 'BUY';
        const pctDiff = (tick.quote - order.entry_price) / (order.entry_price || 1);
        const directional = isUp ? pctDiff : -pctDiff;
        const livePnl = Number(Math.max(-order.stake, directional * order.stake * order.multiplier).toFixed(2));

        await execute('UPDATE virtual_orders SET current_price = $1, pnl = $2 WHERE id = $3', [
          tick.quote,
          livePnl,
          order.id,
        ]);

        const hitTpUsd = order.tp_usd && livePnl >= Number(order.tp_usd);
        const hitSlUsd = order.sl_usd && livePnl <= -Number(order.sl_usd);
        const hitTpPrice =
          order.tp_price && (isUp ? tick.quote >= Number(order.tp_price) : tick.quote <= Number(order.tp_price));
        const hitSlPrice =
          order.sl_price && (isUp ? tick.quote <= Number(order.sl_price) : tick.quote >= Number(order.sl_price));

        if (hitTpUsd || hitSlUsd || hitTpPrice || hitSlPrice) {
          mtmClosingLocks.add(order.id);
          closeOrderById(order.id, order.user_id)
            .finally(() => mtmClosingLocks.delete(order.id))
            .catch(() => {});
        }
      }
    } catch {
      // ignore if DB not yet initialized
    }
  });
}
