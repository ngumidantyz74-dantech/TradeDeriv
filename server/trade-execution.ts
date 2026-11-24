import { query, queryOne, execute, addNotification, logSystemError, getCachedSetting } from './db.ts';
import { decryptToken } from './crypto.ts';
import { derivWs, derivRestRequest, OtpDerivClient, getActiveDerivAppId } from './deriv-client.ts';

function extractDerivOtpWsUrl(otpResp: any): string {
  const raw = String(
    otpResp?.url ||
      otpResp?.ws_url ||
      otpResp?.data?.url ||
      otpResp?.data?.ws_url ||
      otpResp?.otp ||
      otpResp?.data?.otp ||
      ''
  ).trim();
  if (!raw) return '';
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return raw;
  return `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(getActiveDerivAppId())}&otp=${encodeURIComponent(raw)}`;
}

export interface PlaceOrderInput {
  userId: number;
  symbol: string;
  side: string;
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
  strategyKey?: string;
  timeframe?: string;
  accountMode?: 'demo' | 'real';
  notes?: string;
  idempotencyKey?: string;
  growthRate?: number;
  isAnalyserSynced?: boolean;
}

const recentOrderLocks = new Map<string, number>();

function normalizeContractType(side: string, explicitType?: string): string {
  const s = String(explicitType || side || '').toUpperCase().trim();
  if (s === 'BUY' || s === 'MULTUP') return 'MULTUP';
  if (s === 'SELL' || s === 'MULTDOWN') return 'MULTDOWN';
  if (['ACCU', 'ACCUMULATOR', 'ACCUMULATORS'].includes(s)) return 'ACCU';
  if (['OVER', 'DIGITOVER'].includes(s)) return 'DIGITOVER';
  if (['UNDER', 'DIGITUNDER'].includes(s)) return 'DIGITUNDER';
  if (['EVEN', 'DIGITEVEN'].includes(s)) return 'DIGITEVEN';
  if (['ODD', 'DIGITODD'].includes(s)) return 'DIGITODD';
  if (['MATCH', 'DIGITMATCH'].includes(s)) return 'DIGITMATCH';
  if (['DIFF', 'DIGITDIFF'].includes(s)) return 'DIGITDIFF';
  if (['RISE', 'CALL'].includes(s)) return 'CALL';
  if (['FALL', 'PUT'].includes(s)) return 'PUT';
  return s || 'MULTUP';
}

function parseDerivDuration(raw?: string): { duration: number; unit: string } | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d+)([tsmhd])$/i);
  if (!m) return null;
  return { duration: Number(m[1]), unit: m[2].toLowerCase() };
}

function durationToSeconds(duration: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 't') return duration * 2;
  if (u === 's') return duration;
  if (u === 'm') return duration * 60;
  if (u === 'h') return duration * 3600;
  if (u === 'd') return duration * 86400;
  return duration;
}

export async function getDecryptedAccountToken(
  connectedAccountId: number,
  userId: number
): Promise<{
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

const ORDER_SELECT_COLS =
  'id, user_id, connected_account_id, deriv_contract_id, execution_mode, source, symbol, side, contract_type, lots, stake, multiplier, entry_price, current_price, exit_price, sl_price, tp_price, sl_usd, tp_usd, barrier, duration, duration_unit, payout, pnl, status, strategy_key, timeframe, account_mode, notes, opened_at, closed_at';

async function checkUserRiskLimits(userId: number, stake: number, source: string): Promise<void> {
  if (source === 'bulk') return;
  const risk = await queryOne<{
    daily_loss_limit_usd: number;
    max_exposure_usd: number;
    max_consecutive_losses: number;
    cooldown_minutes: number;
    cooldown_until: string | null;
    enforce_limits: boolean;
  }>(
    'SELECT daily_loss_limit_usd, max_exposure_usd, max_consecutive_losses, cooldown_minutes, cooldown_until, enforce_limits FROM risk_settings WHERE user_id = $1',
    [userId]
  );

  if (!risk || !risk.enforce_limits) return;

  if (risk.cooldown_until && new Date(risk.cooldown_until).getTime() > Date.now()) {
    const minsLeft = Math.ceil((new Date(risk.cooldown_until).getTime() - Date.now()) / 60000);
    throw new Error(`Risk cooldown active for ${minsLeft} more minute(s) after consecutive losses.`);
  }

  const todayPnlRow = await queryOne<{ daily_pnl: number }>(
    `SELECT COALESCE(SUM(pnl), 0) as daily_pnl
     FROM virtual_orders
     WHERE user_id = $1 AND status = 'CLOSED' AND closed_at >= CURRENT_DATE`,
    [userId]
  );
  const dailyPnl = Number(todayPnlRow?.daily_pnl || 0);
  if (dailyPnl <= -Math.abs(Number(risk.daily_loss_limit_usd || 150))) {
    throw new Error(
      `Daily loss limit reached ($${Math.abs(dailyPnl).toFixed(2)} / $${Number(risk.daily_loss_limit_usd).toFixed(2)}). Trading paused by Risk Centre.`
    );
  }

  const exposureRow = await queryOne<{ open_stake: number }>(
    `SELECT COALESCE(SUM(stake), 0) as open_stake
     FROM virtual_orders
     WHERE user_id = $1 AND status = 'OPEN'`,
    [userId]
  );
  const currentExposure = Number(exposureRow?.open_stake || 0);
  if (currentExposure + stake > Number(risk.max_exposure_usd || 500)) {
    throw new Error(
      `Max exposure limit ($${Number(risk.max_exposure_usd).toFixed(2)}) would be exceeded ($${(currentExposure + stake).toFixed(2)}).`
    );
  }
}

async function evaluateConsecutiveLossCooldown(userId: number): Promise<void> {
  try {
    const risk = await queryOne<{
      max_consecutive_losses: number;
      cooldown_minutes: number;
      enforce_limits: boolean;
    }>('SELECT max_consecutive_losses, cooldown_minutes, enforce_limits FROM risk_settings WHERE user_id = $1', [userId]);
    if (!risk || !risk.enforce_limits || risk.max_consecutive_losses <= 0) return;

    const recent = await query<{ pnl: number }>(
      `SELECT pnl FROM virtual_orders WHERE user_id = $1 AND status = 'CLOSED' ORDER BY closed_at DESC LIMIT $2`,
      [userId, risk.max_consecutive_losses]
    );
    if (recent.length >= risk.max_consecutive_losses && recent.every((r) => Number(r.pnl) < 0)) {
      const mins = Math.max(1, Number(risk.cooldown_minutes || 30));
      await execute(
        `UPDATE risk_settings SET cooldown_until = NOW() + ($1 || ' minutes')::interval, updated_at = NOW() WHERE user_id = $2`,
        [String(mins), userId]
      );
      await addNotification(
        userId,
        'Risk Cooldown Triggered',
        `Paused new manual orders for ${mins} minutes after ${risk.max_consecutive_losses} consecutive losses.`,
        'risk'
      );
    }
  } catch {
    // ignore risk evaluation failure
  }
}

export async function placeUnifiedOrder(input: PlaceOrderInput): Promise<any> {
  const dedupeKey =
    input.idempotencyKey ||
    `${input.userId}:${input.symbol}:${input.side}:${input.contractType || ''}:${input.stake || ''}:${input.lots || ''}`;
  const now = Date.now();
  const prevLock = recentOrderLocks.get(dedupeKey);
  if (input.source === 'manual' && prevLock && now - prevLock < 1800) {
    throw new Error('Duplicate order submission prevented. Please wait a moment before clicking again.');
  }
  recentOrderLocks.set(dedupeKey, now);
  if (recentOrderLocks.size > 500) {
    for (const [k, ts] of recentOrderLocks.entries()) {
      if (now - ts > 10000) recentOrderLocks.delete(k);
    }
  }

  const user = await queryOne<{
    id: number;
    role: string;
    status: string;
    trading_suspended: boolean;
    virtual_workspace_balance: number;
    real_wallets_json: string;
  }>('SELECT id, role, status, COALESCE(trading_suspended, FALSE) as trading_suspended, virtual_workspace_balance, real_wallets_json FROM users WHERE id = $1', [input.userId]);
  if (!user) throw new Error('User not found');
  if (user.role === 'owner' || user.role === 'admin') {
    throw new Error('Owner / Admin MIS accounts are for administration only, not trading.');
  }
  if (user.status !== 'active') {
    throw new Error(`Account is currently ${user.status}. Contact support.`);
  }
  if (user.trading_suspended) {
    throw new Error('Trading is currently frozen on your account by Administrator controls.');
  }

  const tick = await derivWs.getLiveQuote(input.symbol);
  const entryPrice = tick?.quote || 1000.0;
  const pipSize = tick?.pipSize || 0.01;

  const lots = Number(Math.max(0.01, Math.min(100, input.lots ?? (input.stake ? input.stake / 100 : 0.02))).toFixed(2));
  const stake = Number(Math.max(0.5, input.stake ?? lots * 100).toFixed(2));
  const multiplier = Number(input.multiplier || 100);
  const contractType = normalizeContractType(input.side, input.contractType);
  const duration = Number(input.duration || 5);
  const durationUnit = input.durationUnit || 't';

  if (input.source !== 'bot') {
    await checkUserRiskLimits(input.userId, stake, input.source || 'manual');
  }

  // Digital contracts do not support price SL/TP on Deriv; Multipliers and ACCU range limits do
  const isAccu = contractType === 'ACCU';
  const growthRate = isAccu ? Math.min(0.05, Math.max(0.01, Number(input.growthRate ?? 0.02))) : 0;
  const supportsLimits = contractType === 'MULTUP' || contractType === 'MULTDOWN';
  let slUsd =
    (supportsLimits || isAccu) && input.slUsd !== undefined && input.slUsd !== null ? Math.abs(Number(input.slUsd)) : null;
  let tpUsd =
    (supportsLimits || isAccu) && input.tpUsd !== undefined && input.tpUsd !== null ? Math.abs(Number(input.tpUsd)) : null;
  let slPrice = supportsLimits ? input.slPrice ?? null : null;
  let tpPrice = supportsLimits ? input.tpPrice ?? null : null;

  const dec = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;
  const isUp = ['MULTUP', 'CALL', 'DIGITOVER', 'DIGITEVEN', 'DIGITMATCH', 'BUY', 'ACCU'].includes(contractType);
  if (isAccu) {
    const rangePct = Math.max(0.00035, 0.0012 - (growthRate - 0.01) * 0.016);
    slPrice = Number((entryPrice * (1 - rangePct)).toFixed(dec));
    tpPrice = Number((entryPrice * (1 + rangePct)).toFixed(dec));
    if (!tpUsd) tpUsd = Number((stake * 1.8).toFixed(2));
  } else if (supportsLimits) {
    if (slUsd && !slPrice) {
      const pctMove = Math.min(0.45, slUsd / Math.max(1, stake * multiplier));
      slPrice = Number((entryPrice * (isUp ? 1 - pctMove : 1 + pctMove)).toFixed(dec));
    }
    if (tpUsd && !tpPrice) {
      const pctMove = Math.min(0.95, tpUsd / Math.max(1, stake * multiplier));
      tpPrice = Number((entryPrice * (isUp ? 1 + pctMove : 1 - pctMove)).toFixed(dec));
    }
    if (slPrice && !slUsd) {
      slUsd = Number(((Math.abs(entryPrice - slPrice) / entryPrice) * stake * multiplier).toFixed(2));
    }
    if (tpPrice && !tpUsd) {
      tpUsd = Number(((Math.abs(tpPrice - entryPrice) / entryPrice) * stake * multiplier).toFixed(2));
    }
  }

  let derivContractId: string | null = null;
  let actualMode: 'virtual' | 'deriv' = 'virtual';
  let actualPayout = 0;
  let accountMode: 'demo' | 'real' = input.accountMode === 'real' ? 'real' : 'demo';

  const engineCfg = getCachedSetting<{
    botWinRatePct?: number;
    analyserWinRatePct?: number;
    accuWinRatePct?: number;
    manualOptionsWinRatePct?: number;
    siteSettlementForLockedReal?: boolean;
  }>('trading_engine', {
    botWinRatePct: 76,
    analyserWinRatePct: 82,
    accuWinRatePct: 78,
    manualOptionsWinRatePct: 68,
    siteSettlementForLockedReal: true,
  });

  const explicitDeriv = input.executionMode === 'deriv';
  const targetIsVirtual = accountMode === 'demo';
  let resolvedConnectedAccountId: number | null = null;
  const userRealWallets = (() => {
    try {
      return { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0, ...JSON.parse(user.real_wallets_json || '{}') };
    } catch {
      return { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 };
    }
  })();

  if (explicitDeriv || input.connectedAccountId) {
    const requestedAcc = input.connectedAccountId
      ? await queryOne<{ id: number; is_virtual: boolean; balance_locked_by_admin: boolean; last_known_balance: number }>(
          "SELECT id, is_virtual, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin, last_known_balance FROM connected_accounts WHERE id = $1 AND user_id = $2 AND status = 'active'",
          [input.connectedAccountId, input.userId]
        )
      : await queryOne<{ id: number; is_virtual: boolean; balance_locked_by_admin: boolean; last_known_balance: number }>(
          "SELECT id, is_virtual, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin, last_known_balance FROM connected_accounts WHERE user_id = $1 AND is_virtual = $2 AND status = 'active' ORDER BY id ASC LIMIT 1",
          [input.userId, targetIsVirtual]
        );

    const matchingAcc = requestedAcc && Boolean(requestedAcc.is_virtual) === targetIsVirtual ? requestedAcc : null;
    const targetAccId = matchingAcc?.id;
    resolvedConnectedAccountId = targetAccId || null;

    // If Admin funded/locked this Real account OR DB Real wallet funds are used with siteSettlementForLockedReal enabled,
    // settle atomically on the local Real balance ledger rather than blocking when upstream Deriv account has $0.
    const adminFundedReal =
      accountMode === 'real' &&
      engineCfg.siteSettlementForLockedReal !== false &&
      (Boolean(matchingAcc?.balance_locked_by_admin) || Number(userRealWallets.options || 0) >= stake);

    if (adminFundedReal) {
      actualMode = 'virtual';
    } else if (!targetAccId) {
      if (explicitDeriv && !(accountMode === 'real' && Number(userRealWallets.options || 0) >= stake)) {
        throw new Error(
          `No active connected ${accountMode.toUpperCase()} Deriv account found. Link your Deriv account or fund your local wallet.`
        );
      }
    } else {
      const creds = await getDecryptedAccountToken(targetAccId, input.userId);
      if (!creds) {
        if (explicitDeriv && !(accountMode === 'real' && Number(userRealWallets.options || 0) >= stake)) {
          throw new Error('Deriv account authorization token is missing or revoked. Reconnect your Deriv account.');
        }
      } else {
        accountMode = creds.account.is_virtual ? 'demo' : 'real';
        try {
          const isOAuth2 = creds.token.startsWith('ory_at_') || creds.token.length > 40;
          const symbolField = isOAuth2 ? { underlying_symbol: input.symbol } : { symbol: input.symbol };

          let effectiveType = contractType;
          let effectiveMult = multiplier;
          let effectiveDuration = duration;
          let effectiveDurationUnit = durationUnit;

          try {
            const cfResp = await derivWs.request<{
              contracts_for?: {
                available?: Array<{
                  contract_type: string;
                  multiplier_range?: number[];
                  min_contract_duration?: string;
                  max_contract_duration?: string;
                }>;
              };
            }>({ contracts_for: input.symbol, currency: creds.account.currency }, 4500);

            const available = cfResp?.contracts_for?.available || [];

            if (effectiveType === 'MULTUP' || effectiveType === 'MULTDOWN') {
              const multContract = available.find((c) => c.contract_type === effectiveType);
              if (!multContract) {
                effectiveType = effectiveType === 'MULTUP' ? 'CALL' : 'PUT';
              } else if (multContract.multiplier_range && multContract.multiplier_range.length > 0) {
                if (!multContract.multiplier_range.includes(effectiveMult)) {
                  effectiveMult = multContract.multiplier_range.reduce((prev, curr) =>
                    Math.abs(curr - effectiveMult) < Math.abs(prev - effectiveMult) ? curr : prev
                  );
                }
              }
            }

            if (effectiveType !== 'MULTUP' && effectiveType !== 'MULTDOWN') {
              const matchingContracts = available.filter((c) => c.contract_type === effectiveType);
              const chosenContract =
                matchingContracts.find((c) => {
                  const minD = parseDerivDuration(c.min_contract_duration);
                  return minD && minD.unit === effectiveDurationUnit;
                }) || matchingContracts[0];

              if (chosenContract?.min_contract_duration) {
                const minD = parseDerivDuration(chosenContract.min_contract_duration);
                if (minD) {
                  const reqSecs = durationToSeconds(effectiveDuration, effectiveDurationUnit);
                  const minSecs = durationToSeconds(minD.duration, minD.unit);
                  if (reqSecs < minSecs || (effectiveDurationUnit === 't' && minD.unit !== 't')) {
                    effectiveDuration = minD.duration;
                    effectiveDurationUnit = minD.unit;
                  }
                }
              } else if (!input.symbol.startsWith('1HZ') && !input.symbol.startsWith('R_') && !input.symbol.startsWith('JD') && !input.symbol.startsWith('BOOM') && !input.symbol.startsWith('CRASH') && effectiveDurationUnit === 't') {
                effectiveDuration = 15;
                effectiveDurationUnit = 'm';
              }
            }
          } catch {
            if (
              effectiveType !== 'MULTUP' &&
              effectiveType !== 'MULTDOWN' &&
              !input.symbol.startsWith('1HZ') &&
              !input.symbol.startsWith('R_') &&
              effectiveDurationUnit === 't'
            ) {
              effectiveDuration = 15;
              effectiveDurationUnit = 'm';
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
            proposalPayload.duration = effectiveDuration;
            proposalPayload.duration_unit = effectiveDurationUnit;
            if (input.barrier !== undefined && input.barrier !== null && input.barrier !== '') {
              proposalPayload.barrier = String(input.barrier);
            }
          }

          let buyResult: any;
          if (isOAuth2) {
            const otpResp = await derivRestRequest<any>(
              `/trading/v1/options/accounts/${creds.account.deriv_login_id}/otp`,
              creds.token,
              { method: 'POST' }
            );
            const otpUrl = extractDerivOtpWsUrl(otpResp);
            if (!otpUrl) {
              throw new Error(
                `Failed to mint Deriv OTP trading socket (keys: ${Object.keys(otpResp || {}).join(', ') || 'empty'})`
              );
            }
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

            // Preserve admin-locked balance rather than overwriting with live Deriv balance
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
          } else if (explicitDeriv) {
            throw new Error('Deriv did not confirm a contract ID for this order.');
          }
          } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Deriv execution failed';
          await logSystemError('trade-execution', errMsg, 'error', {
            userId: input.userId,
            symbol: input.symbol,
            contractType,
            explicitDeriv,
          });
          const canFallbackToDbReal =
            accountMode === 'real' &&
            engineCfg.siteSettlementForLockedReal !== false &&
            Number(userRealWallets.options || 0) >= stake;
          if (explicitDeriv && !canFallbackToDbReal) {
            throw new Error(`Deriv rejected order: ${errMsg}`);
          }
          actualMode = 'virtual';
        }
      }
    }
  }

  if (actualMode === 'virtual') {
    if (accountMode === 'real') {
      const rw = { ...userRealWallets };
      const realAccRow = resolvedConnectedAccountId
        ? await queryOne<{ id: number; last_known_balance: number; balance_locked_by_admin: boolean }>(
            'SELECT id, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin FROM connected_accounts WHERE id = $1',
            [resolvedConnectedAccountId]
          )
        : await queryOne<{ id: number; last_known_balance: number; balance_locked_by_admin: boolean }>(
            "SELECT id, last_known_balance, COALESCE(balance_locked_by_admin, FALSE) as balance_locked_by_admin FROM connected_accounts WHERE user_id = $1 AND is_virtual = FALSE AND platform = 'deriv' AND status = 'active' ORDER BY id ASC LIMIT 1",
            [input.userId]
          );

      const availReal =
        realAccRow && realAccRow.balance_locked_by_admin
          ? Math.max(Number(realAccRow.last_known_balance || 0), Number(rw.options || 0))
          : Number(rw.options || 0);
      if (availReal < stake) {
        throw new Error(
          `Insufficient Real USD Wallet balance ($${availReal.toFixed(2)} available, $${stake.toFixed(2)} required). Deposit funds or connect a Real Deriv account.`
        );
      }
      const nextReal = Number((availReal - stake).toFixed(2));
      rw.options = nextReal;
      await execute('UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2', [
        JSON.stringify(rw),
        input.userId,
      ]);
      if (realAccRow) {
        await execute(
          'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
          [nextReal, realAccRow.id]
        );
        derivWs.emitUserEvent(input.userId, 'account_updated', {
          accountId: realAccRow.id,
          balance: nextReal,
        });
      }
      derivWs.emitUserEvent(input.userId, 'balance_updated', { real_wallets: rw, realWallets: rw });
    } else {
      accountMode = 'demo';
      if (user.virtual_workspace_balance < stake) {
        throw new Error(
          `Insufficient Demo balance ($${user.virtual_workspace_balance.toFixed(2)} available, $${stake.toFixed(2)} required)`
        );
      }
      const newBal = Number((user.virtual_workspace_balance - stake).toFixed(2));
      await execute('UPDATE users SET virtual_workspace_balance = $1, updated_at = NOW() WHERE id = $2', [
        newBal,
        input.userId,
      ]);
      derivWs.emitUserEvent(input.userId, 'balance_updated', { virtual_workspace_balance: newBal });
    }
  }

  const storedBarrier = isAccu ? String(growthRate) : input.barrier ?? null;
  const storedNotes = input.isAnalyserSynced
    ? `${input.notes ? `${input.notes} | ` : ''}analyser_sync`
    : input.notes || '';

  const created = await queryOne<any>(
    `INSERT INTO virtual_orders (
      user_id, connected_account_id, deriv_contract_id, execution_mode, source,
      symbol, side, contract_type, lots, stake, multiplier,
      entry_price, current_price, sl_price, tp_price, sl_usd, tp_usd,
      barrier, duration, duration_unit, payout, pnl, status,
      strategy_key, timeframe, account_mode, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'OPEN', $23, $24, $25, $26)
    RETURNING ${ORDER_SELECT_COLS}`,
    [
      input.userId,
      resolvedConnectedAccountId || null,
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
      storedBarrier,
      duration,
      durationUnit,
      actualPayout,
      0,
      input.strategyKey || '',
      input.timeframe || '',
      accountMode,
      storedNotes,
    ]
  );

  trackOpenMtmOrder(created);
  derivWs.emitUserEvent(input.userId, 'order_opened', created);

  if (
    actualMode === 'virtual' &&
    ['DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD', 'DIGITMATCH', 'DIGITDIFF', 'CALL', 'PUT'].includes(contractType)
  ) {
    const settleDelay =
      durationUnit.toLowerCase() === 't'
        ? Math.max(800, Math.min(12000, duration * 1000))
        : Math.max(1500, Math.min(120000, durationToSeconds(duration, durationUnit) * 1000));
    setTimeout(() => {
      settleVirtualDigitalOrder(Number(created.id)).catch(() => {});
    }, settleDelay);
  }

  return created;
}

function computeDigitalPayoutMult(contractType: string, barrier: number): number {
  switch (contractType) {
    case 'DIGITOVER':
      return Number((9.5 / Math.max(1, 9 - barrier)).toFixed(2));
    case 'DIGITUNDER':
      return Number((9.5 / Math.max(1, barrier)).toFixed(2));
    case 'DIGITEVEN':
    case 'DIGITODD':
    case 'CALL':
    case 'PUT':
      return 1.95;
    case 'DIGITMATCH':
      return 9.09;
    case 'DIGITDIFF':
      return 1.11;
    default:
      return 1.95;
  }
}

function adjustDigitForDesiredOutcome(
  price: number,
  pipSize: number,
  contractType: string,
  barrier: number,
  shouldWin: boolean
): number {
  const dec = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;
  const step = Math.pow(10, -dec);

  if (contractType === 'CALL') {
    return Number((price + (shouldWin ? Math.abs(step * 12) : -Math.abs(step * 12))).toFixed(dec));
  }
  if (contractType === 'PUT') {
    return Number((price + (shouldWin ? -Math.abs(step * 12) : Math.abs(step * 12))).toFixed(dec));
  }

  const candidateDigits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => {
    switch (contractType) {
      case 'DIGITOVER':
        return shouldWin ? d > barrier : d <= barrier;
      case 'DIGITUNDER':
        return shouldWin ? d < barrier : d >= barrier;
      case 'DIGITEVEN':
        return shouldWin ? d % 2 === 0 : d % 2 === 1;
      case 'DIGITODD':
        return shouldWin ? d % 2 === 1 : d % 2 === 0;
      case 'DIGITMATCH':
        return shouldWin ? d === barrier : d !== barrier;
      case 'DIGITDIFF':
        return shouldWin ? d !== barrier : d === barrier;
      default:
        return true;
    }
  });

  const picked = candidateDigits.length
    ? candidateDigits[Math.floor(Math.random() * candidateDigits.length)]
    : 5;
  const str = price.toFixed(dec);
  const replaced = `${str.slice(0, -1)}${picked}`;
  const parsed = Number(replaced);
  return Number.isFinite(parsed) ? parsed : price;
}

export async function creditSettledPayoutToUser(
  userId: number,
  accountMode: string,
  creditAmount: number,
  connectedAccountId?: number | null
): Promise<void> {
  if (creditAmount <= 0) return;
  if (accountMode === 'real') {
    const u = await queryOne<{ real_wallets_json: string }>('SELECT real_wallets_json FROM users WHERE id = $1', [
      userId,
    ]);
    const rw = (() => {
      try {
        return { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0, ...JSON.parse(u?.real_wallets_json || '{}') };
      } catch {
        return { options: 0, mt5_standard: 0, mt5_gold: 0, exchange_usdt: 0 };
      }
    })();
    rw.options = Number((Number(rw.options || 0) + creditAmount).toFixed(2));
    await execute('UPDATE users SET real_wallets_json = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(rw),
      userId,
    ]);
    const realAcc = connectedAccountId
      ? await queryOne<{ id: number }>('SELECT id FROM connected_accounts WHERE id = $1 AND is_virtual = FALSE', [connectedAccountId])
      : await queryOne<{ id: number }>(
          "SELECT id FROM connected_accounts WHERE user_id = $1 AND is_virtual = FALSE AND platform = 'deriv' AND status = 'active' ORDER BY id ASC LIMIT 1",
          [userId]
        );
    if (realAcc) {
      await execute(
        'UPDATE connected_accounts SET balance = $1, last_known_balance = $1, updated_at = NOW() WHERE id = $2',
        [rw.options, realAcc.id]
      );
      derivWs.emitUserEvent(userId, 'account_updated', { accountId: realAcc.id, balance: rw.options });
    }
    derivWs.emitUserEvent(userId, 'balance_updated', { real_wallets: rw, realWallets: rw });
  } else {
    await execute(
      'UPDATE users SET virtual_workspace_balance = ROUND((virtual_workspace_balance + $1)::numeric, 2)::double precision, updated_at = NOW() WHERE id = $2',
      [creditAmount, userId]
    );
    const updatedUser = await queryOne<{ virtual_workspace_balance: number }>(
      'SELECT virtual_workspace_balance FROM users WHERE id = $1',
      [userId]
    );
    if (updatedUser) {
      derivWs.emitUserEvent(userId, 'balance_updated', {
        virtual_workspace_balance: updatedUser.virtual_workspace_balance,
      });
    }
  }
}

export async function settleVirtualDigitalOrder(orderId: number): Promise<any> {
  const order = await queryOne<any>(
    `SELECT ${ORDER_SELECT_COLS} FROM virtual_orders WHERE id = $1 AND status = 'OPEN'`,
    [orderId]
  );
  if (!order) return null;

  const latest = await derivWs.getLiveQuote(order.symbol);
  let exitPrice = latest?.quote || order.entry_price;
  const pipSize = latest?.pipSize || 0.01;
  const barrier = Number(order.barrier ?? 5);

  const engineCfg = getCachedSetting<{
    botWinRatePct?: number;
    analyserWinRatePct?: number;
    manualOptionsWinRatePct?: number;
  }>('trading_engine', {
    botWinRatePct: 76,
    analyserWinRatePct: 82,
    manualOptionsWinRatePct: 68,
  });

  const isAnalyserSynced = String(order.notes || '').includes('analyser_sync');
  const targetWinPct = isAnalyserSynced
    ? Number(engineCfg.analyserWinRatePct ?? 82)
    : order.source === 'bot'
      ? Number(engineCfg.botWinRatePct ?? 76)
      : Number(engineCfg.manualOptionsWinRatePct ?? 68);

  const shouldWin = Math.random() * 100 < Math.min(96, Math.max(5, targetWinPct));
  const baseForExit =
    order.contract_type === 'CALL' || order.contract_type === 'PUT' ? Number(order.entry_price || exitPrice) : exitPrice;
  exitPrice = adjustDigitForDesiredOutcome(baseForExit, pipSize, order.contract_type, barrier, shouldWin);

  const payoutMult = computeDigitalPayoutMult(order.contract_type, barrier);
  const pnl = shouldWin ? Number((order.stake * (payoutMult - 1)).toFixed(2)) : -Number(order.stake.toFixed(2));
  const payout = shouldWin ? Number((order.stake + pnl).toFixed(2)) : 0;

  const closedOrder = await queryOne<any>(
    `UPDATE virtual_orders
     SET status = 'CLOSED', exit_price = $1, current_price = $1, payout = $2, pnl = $3, closed_at = NOW()
     WHERE id = $4
     RETURNING ${ORDER_SELECT_COLS}`,
    [exitPrice, payout, pnl, order.id]
  );

  await creditSettledPayoutToUser(order.user_id, order.account_mode, payout, order.connected_account_id);

  untrackOpenMtmOrder(order.id);
  derivWs.emitUserEvent(order.user_id, 'order_closed', closedOrder);
  if (pnl < 0) {
    await evaluateConsecutiveLossCooldown(order.user_id);
  }
  return closedOrder;
}

export async function closeOrderById(orderId: number, userId?: number, isAdmin = false): Promise<any> {
  const order = await queryOne<any>(`SELECT ${ORDER_SELECT_COLS} FROM virtual_orders WHERE id = $1`, [orderId]);
  if (!order) throw new Error('Order not found');
  if (!isAdmin && userId !== undefined && order.user_id !== userId) {
    throw new Error('Unauthorized to close this order');
  }
  if (order.status === 'CLOSED') {
    untrackOpenMtmOrder(order.id);
    return order;
  }

  const latest = await derivWs.getLiveQuote(order.symbol);
  const exitPrice = latest?.quote || order.current_price || order.entry_price;
  let pnl = Number(order.pnl || 0);

  if (order.execution_mode === 'deriv' && order.deriv_contract_id && order.connected_account_id) {
    const creds = await getDecryptedAccountToken(order.connected_account_id, order.user_id);
    if (creds) {
      try {
        const isOAuth2 = creds.token.startsWith('ory_at_') || creds.token.length > 40;
        const sellResp = isOAuth2
          ? await (async () => {
              const otpResp = await derivRestRequest<any>(
                `/trading/v1/options/accounts/${creds.account.deriv_login_id}/otp`,
                creds.token,
                { method: 'POST' }
              );
              const otpUrl = extractDerivOtpWsUrl(otpResp);
              if (!otpUrl) throw new Error('Failed to mint Deriv OTP socket');
              return OtpDerivClient.requestOnOtpUrl(otpUrl, { sell: Number(order.deriv_contract_id), price: 0 });
            })()
          : await derivWs.requestWithToken(creds.token, {
              sell: Number(order.deriv_contract_id),
              price: 0,
            });
        if (sellResp?.sell?.sold_for !== undefined) {
          pnl = Number((Number(sellResp.sell.sold_for) - order.stake).toFixed(2));
        }

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
      } catch (err) {
        await logSystemError(
          'close-order',
          err instanceof Error ? err.message : 'Deriv sell failed',
          'warn',
          { orderId: order.id }
        );
      }
    }
  } else if (order.contract_type === 'ACCU') {
    const growthRate = Math.min(0.05, Math.max(0.01, Number(order.barrier || 0.02)));
    const elapsedTicks = Math.max(1, Math.floor((Date.now() - new Date(order.opened_at).getTime()) / 1500));
    const currentPnl = Number(order.pnl || 0);
    if (currentPnl < 0) {
      pnl = -Number(order.stake);
    } else {
      const accrued = Number((order.stake * (Math.pow(1 + growthRate, Math.min(40, elapsedTicks)) - 1)).toFixed(2));
      pnl = Math.max(currentPnl, accrued);
    }
    const credit = Math.max(0, Number((order.stake + pnl).toFixed(2)));
    await creditSettledPayoutToUser(order.user_id, order.account_mode, credit, order.connected_account_id);
  } else {
    const isUp = ['MULTUP', 'CALL', 'BUY', 'DIGITOVER'].includes(order.contract_type);
    const pctDiff = (exitPrice - order.entry_price) / (order.entry_price || 1);
    const directional = isUp ? pctDiff : -pctDiff;
    pnl = Number(Math.max(-order.stake, directional * order.stake * order.multiplier).toFixed(2));
    const credit = Math.max(0, Number((order.stake + pnl).toFixed(2)));
    await creditSettledPayoutToUser(order.user_id, order.account_mode, credit, order.connected_account_id);
  }

  const closedOrder = await queryOne<any>(
    `UPDATE virtual_orders
     SET status = 'CLOSED', current_price = $1, exit_price = $1, pnl = $2, closed_at = NOW()
     WHERE id = $3
     RETURNING ${ORDER_SELECT_COLS}`,
    [exitPrice, pnl, order.id]
  );

  untrackOpenMtmOrder(order.id);
  derivWs.emitUserEvent(order.user_id, 'order_closed', closedOrder);
  if (pnl < 0) {
    await evaluateConsecutiveLossCooldown(order.user_id);
  }
  return closedOrder;
}

export async function bulkCloseOrders(
  userId: number,
  filter: 'all' | 'profitable' | 'losing' | 'buy' | 'sell' | 'over' | 'under' | 'bot'
): Promise<{ closedCount: number; closedOrders: any[] }> {
  const openOrders = await query<any>(
    `SELECT ${ORDER_SELECT_COLS} FROM virtual_orders WHERE user_id = $1 AND status = 'OPEN' LIMIT 200`,
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

export async function updateOrderLimits(
  orderId: number,
  userId: number,
  patch: { slPrice?: number | null; tpPrice?: number | null; slUsd?: number | null; tpUsd?: number | null }
): Promise<any> {
  const order = await queryOne<any>(
    `SELECT ${ORDER_SELECT_COLS} FROM virtual_orders WHERE id = $1 AND user_id = $2`,
    [orderId, userId]
  );
  if (!order) throw new Error('Order not found');
  if (order.status !== 'OPEN') throw new Error('Only open positions can update SL/TP');
  if (!['MULTUP', 'MULTDOWN', 'BUY', 'SELL'].includes(String(order.contract_type || '').toUpperCase())) {
    throw new Error('SL/TP price limits apply to Multiplier / CFD positions only');
  }

  const entryPrice = Number(order.entry_price || 1);
  const stake = Number(order.stake || 1);
  const multiplier = Number(order.multiplier || 100);
  const notional = Math.max(1, stake * multiplier);

  let nextSlPrice = patch.slPrice !== undefined ? patch.slPrice : order.sl_price;
  let nextTpPrice = patch.tpPrice !== undefined ? patch.tpPrice : order.tp_price;
  let nextSlUsd = patch.slUsd !== undefined ? patch.slUsd : order.sl_usd;
  let nextTpUsd = patch.tpUsd !== undefined ? patch.tpUsd : order.tp_usd;

  const isUp = order.contract_type === 'MULTUP' || order.side === 'BUY';

  if (patch.slPrice !== undefined) {
    if (patch.slPrice === null || Number(patch.slPrice) <= 0) {
      nextSlPrice = null;
      nextSlUsd = null;
    } else {
      nextSlPrice = Number(patch.slPrice);
      nextSlUsd = Number(((Math.abs(entryPrice - nextSlPrice) / entryPrice) * notional).toFixed(2));
    }
  } else if (patch.slUsd !== undefined) {
    if (patch.slUsd === null || Number(patch.slUsd) <= 0) {
      nextSlUsd = null;
      nextSlPrice = null;
    } else {
      nextSlUsd = Math.abs(Number(patch.slUsd));
      const pctMove = Math.min(0.45, nextSlUsd / notional);
      nextSlPrice = Number((entryPrice * (isUp ? 1 - pctMove : 1 + pctMove)).toFixed(4));
    }
  }

  if (patch.tpPrice !== undefined) {
    if (patch.tpPrice === null || Number(patch.tpPrice) <= 0) {
      nextTpPrice = null;
      nextTpUsd = null;
    } else {
      nextTpPrice = Number(patch.tpPrice);
      nextTpUsd = Number(((Math.abs(nextTpPrice - entryPrice) / entryPrice) * notional).toFixed(2));
    }
  } else if (patch.tpUsd !== undefined) {
    if (patch.tpUsd === null || Number(patch.tpUsd) <= 0) {
      nextTpUsd = null;
      nextTpPrice = null;
    } else {
      nextTpUsd = Math.abs(Number(patch.tpUsd));
      const pctMove = Math.min(0.95, nextTpUsd / notional);
      nextTpPrice = Number((entryPrice * (isUp ? 1 + pctMove : 1 - pctMove)).toFixed(4));
    }
  }

  const updated = await queryOne<any>(
    `UPDATE virtual_orders
     SET sl_price = $1, tp_price = $2, sl_usd = $3, tp_usd = $4
     WHERE id = $5 AND user_id = $6
     RETURNING ${ORDER_SELECT_COLS}`,
    [nextSlPrice, nextTpPrice, nextSlUsd, nextTpUsd, orderId, userId]
  );

  trackOpenMtmOrder(updated);
  derivWs.emitUserEvent(userId, 'order_updated', updated);
  return updated;
}

const mtmClosingLocks = new Set<number>();
const lastOrderEmitAt = new Map<number, number>();
const lastMtmPersistAt = new Map<number, number>();
const openMtmOrdersCache = new Map<number, any>();
let openMtmHydrated = false;
let openMtmLastSyncAt = 0;
let openMtmHydratePromise: Promise<void> | null = null;
let mtmSweepBusy = false;

const MTM_CONTRACT_TYPES = new Set(['MULTUP', 'MULTDOWN', 'BUY', 'SELL', 'ACCU']);

function trackOpenMtmOrder(order: any): void {
  if (!order || order.status !== 'OPEN') return;
  const ct = String(order.contract_type || '').toUpperCase();
  if (!MTM_CONTRACT_TYPES.has(ct)) return;
  openMtmOrdersCache.set(Number(order.id), { ...order });
}

export function untrackOpenMtmOrder(orderId: number): void {
  const id = Number(orderId);
  openMtmOrdersCache.delete(id);
  lastOrderEmitAt.delete(id);
  lastMtmPersistAt.delete(id);
}

export function invalidateOpenOrdersCache(): void {
  openMtmHydrated = false;
}

async function ensureOpenMtmCacheHydrated(force = false): Promise<void> {
  const now = Date.now();
  if (!force && openMtmHydrated && now - openMtmLastSyncAt < 120_000) {
    return;
  }
  if (openMtmHydratePromise) {
    return openMtmHydratePromise;
  }
  openMtmHydratePromise = (async () => {
    try {
      const rows = await query<any>(
        `SELECT ${ORDER_SELECT_COLS}
         FROM virtual_orders
         WHERE status = 'OPEN' AND contract_type IN ('MULTUP','MULTDOWN','BUY','SELL','ACCU')
         LIMIT 200`
      );
      openMtmOrdersCache.clear();
      for (const r of rows) {
        openMtmOrdersCache.set(Number(r.id), r);
      }
      openMtmHydrated = true;
      openMtmLastSyncAt = Date.now();
    } catch {
      // ignore while DB is waking up
    } finally {
      openMtmHydratePromise = null;
    }
  })();
  return openMtmHydratePromise;
}

async function evaluateMtmOrder(order: any, quotePrice: number): Promise<void> {
  if (mtmClosingLocks.has(order.id)) return;
  const ct = String(order.contract_type || '').toUpperCase();
  if (!MTM_CONTRACT_TYPES.has(ct)) return;
  const entry = Number(order.entry_price || 0);
  if (!(entry > 0) || !Number.isFinite(quotePrice)) return;

  if (ct === 'ACCU') {
    const growthRate = Math.min(0.05, Math.max(0.01, Number(order.barrier || 0.02)));
    const elapsedTicks = Math.max(1, Math.floor((Date.now() - new Date(order.opened_at).getTime()) / 1500));
    const engineCfg = getCachedSetting<{ accuWinRatePct?: number }>('trading_engine', { accuWinRatePct: 78 });
    const accuWinPct = Number(engineCfg.accuWinRatePct ?? 78);
    // Keep ACCU compounding profitably and only knock out occasionally based on calibrated accuWinRatePct
    const outOfRange =
      (order.sl_price && quotePrice <= Number(order.sl_price)) ||
      (order.tp_price && quotePrice >= Number(order.tp_price));
    const shouldKnockout = outOfRange && elapsedTicks >= 3 && Math.random() * 100 > accuWinPct;

    if (shouldKnockout) {
      mtmClosingLocks.add(order.id);
      untrackOpenMtmOrder(order.id);
      await execute('UPDATE virtual_orders SET current_price = $1, pnl = $2 WHERE id = $3', [
        quotePrice,
        -Number(order.stake),
        order.id,
      ]);
      closeOrderById(order.id, order.user_id)
        .then((closed) => {
          if (closed) {
            addNotification(
              order.user_id,
              `Accumulator Range Knocked Out (${order.symbol})`,
              `#${order.id} touched barrier @ ${quotePrice}.`,
              'trading'
            ).catch(() => {});
          }
        })
        .finally(() => mtmClosingLocks.delete(order.id))
        .catch(() => {});
      return;
    }

    const accruedPnl = Number((order.stake * (Math.pow(1 + growthRate, Math.min(45, elapsedTicks)) - 1)).toFixed(2));
    order.current_price = quotePrice;
    order.pnl = accruedPnl;

    const nowMs = Date.now();
    const prevPersist = lastMtmPersistAt.get(order.id) || 0;
    if (nowMs - prevPersist >= 4000) {
      lastMtmPersistAt.set(order.id, nowMs);
      execute('UPDATE virtual_orders SET current_price = $1, pnl = $2 WHERE id = $3', [
        quotePrice,
        accruedPnl,
        order.id,
      ]).catch(() => {});
    }

    const prevEmit = lastOrderEmitAt.get(order.id) || 0;
    if (nowMs - prevEmit >= 450) {
      lastOrderEmitAt.set(order.id, nowMs);
      derivWs.emitUserEvent(order.user_id, 'order_updated', {
        id: order.id,
        current_price: quotePrice,
        pnl: accruedPnl,
      });
    }

    if (order.tp_usd && Number(order.tp_usd) > 0 && accruedPnl >= Number(order.tp_usd)) {
      mtmClosingLocks.add(order.id);
      untrackOpenMtmOrder(order.id);
      closeOrderById(order.id, order.user_id)
        .then((closed) => {
          if (closed) {
            addNotification(
              order.user_id,
              `Accumulator Take Profit (${order.symbol})`,
              `#${order.id} locked in +$${Number(closed.pnl).toFixed(2)} profit.`,
              'trading'
            ).catch(() => {});
          }
        })
        .finally(() => mtmClosingLocks.delete(order.id))
        .catch(() => {});
    }
    return;
  }

  const isUp = ct === 'MULTUP' || order.side === 'BUY';
  const pctDiff = (quotePrice - entry) / entry;
  const directional = isUp ? pctDiff : -pctDiff;
  const livePnl = Number(Math.max(-Number(order.stake), directional * Number(order.stake) * Number(order.multiplier || 100)).toFixed(2));

  order.current_price = quotePrice;
  order.pnl = livePnl;

  const nowMs = Date.now();
  const prevPersist = lastMtmPersistAt.get(order.id) || 0;
  if (nowMs - prevPersist >= 4000) {
    lastMtmPersistAt.set(order.id, nowMs);
    execute('UPDATE virtual_orders SET current_price = $1, pnl = $2 WHERE id = $3', [
      quotePrice,
      livePnl,
      order.id,
    ]).catch(() => {});
  }

  const prevEmit = lastOrderEmitAt.get(order.id) || 0;
  if (nowMs - prevEmit >= 450) {
    lastOrderEmitAt.set(order.id, nowMs);
    derivWs.emitUserEvent(order.user_id, 'order_updated', {
      id: order.id,
      current_price: quotePrice,
      pnl: livePnl,
    });
  }

  const hitTpUsd = order.tp_usd && Number(order.tp_usd) > 0 && livePnl >= Number(order.tp_usd);
  const hitSlUsd = order.sl_usd && Number(order.sl_usd) > 0 && livePnl <= -Number(order.sl_usd);
  const hitTpPrice =
    order.tp_price &&
    Number(order.tp_price) > 0 &&
    (isUp ? quotePrice >= Number(order.tp_price) : quotePrice <= Number(order.tp_price));
  const hitSlPrice =
    order.sl_price &&
    Number(order.sl_price) > 0 &&
    (isUp ? quotePrice <= Number(order.sl_price) : quotePrice >= Number(order.sl_price));

  if (hitTpUsd || hitSlUsd || hitTpPrice || hitSlPrice) {
    mtmClosingLocks.add(order.id);
    untrackOpenMtmOrder(order.id);
    const reason = hitTpUsd || hitTpPrice ? 'Take Profit' : 'Stop Loss';
    closeOrderById(order.id, order.user_id)
      .then((closed) => {
        if (closed) {
          addNotification(
            order.user_id,
            `${reason} Triggered (${order.symbol})`,
            `Auto-closed #${order.id} ${order.side} ${order.symbol} @ ${quotePrice}. Realized P/L: ${Number(closed.pnl) >= 0 ? '+' : ''}$${Number(closed.pnl).toFixed(2)}.`,
            'trading'
          ).catch(() => {});
        }
      })
      .finally(() => mtmClosingLocks.delete(order.id))
      .catch(() => {});
  }
}

export function startMtmPositionMonitor(): void {
  // Initial one-time hydration after startup
  setTimeout(() => {
    ensureOpenMtmCacheHydrated(true).catch(() => {});
  }, 3000);

  derivWs.onTick((tick) => {
    if (tick.source !== 'deriv_ws' && tick.source !== 'live_pulse') return;
    if (openMtmOrdersCache.size === 0) return;
    for (const order of openMtmOrdersCache.values()) {
      if (order.symbol === tick.symbol && order.source !== 'bot') {
        evaluateMtmOrder(order, tick.quote).catch(() => {});
      }
    }
  });

  // Periodic sweep guarantees MTM + SL/TP checks stay alive with zero DB queries when no orders are open
  setInterval(async () => {
    if (mtmSweepBusy) return;
    mtmSweepBusy = true;
    try {
      await ensureOpenMtmCacheHydrated(false);
      if (openMtmOrdersCache.size === 0) return;
      for (const order of openMtmOrdersCache.values()) {
        await derivWs.ensureSymbolSubscribed(order.symbol);
        const t = derivWs.getLatestTick(order.symbol);
        if (t && (t.source === 'deriv_ws' || t.source === 'live_pulse')) {
          await evaluateMtmOrder(order, t.quote);
        }
      }
    } catch {
      // ignore if DB waking up
    } finally {
      mtmSweepBusy = false;
    }
  }, 1500);
}
