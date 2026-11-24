import type { ConnectedAccount, OrderRecord, TickData, UserProfile } from '../types';

export function computeLiveOrderMetrics(
  order: OrderRecord,
  ticks: Record<string, TickData>
): { currentPrice: number; pnl: number; isLive: boolean } {
  const entry = Number(order.entry_price || 0);
  const storedCur = Number(order.current_price || entry || 0);
  const storedPnl = Number(order.pnl || 0);
  const symTick = ticks[order.symbol];
  const ct = String(order.contract_type || '').toUpperCase();
  const isMult = ['MULTUP', 'MULTDOWN', 'BUY', 'SELL'].includes(ct);

  if (order.status === 'OPEN') {
    if (ct === 'ACCU') {
      const growthRate = Math.min(0.05, Math.max(0.01, Number(order.barrier || 0.02)));
      const elapsedTicks = Math.max(1, Math.floor((Date.now() - new Date(order.opened_at).getTime()) / 1500));
      const accrued = Number((Number(order.stake || 0) * (Math.pow(1 + growthRate, Math.min(45, elapsedTicks)) - 1)).toFixed(2));
      return {
        currentPrice: symTick && Number.isFinite(symTick.quote) ? symTick.quote : storedCur,
        pnl: Math.max(storedPnl, accrued),
        isLive: Boolean(symTick),
      };
    }

    if (symTick && Number.isFinite(symTick.quote) && symTick.quote > 0 && entry > 0) {
      if (isMult) {
        const isUp = ct === 'MULTUP' || String(order.side || '').toUpperCase() === 'BUY';
        const pctDiff = (symTick.quote - entry) / entry;
        const directional = isUp ? pctDiff : -pctDiff;
        const stake = Number(order.stake || 0);
        const mult = Number(order.multiplier || 100);
        const livePnl = Number(Math.max(-stake, directional * stake * mult).toFixed(2));
        return {
          currentPrice: symTick.quote,
          pnl: livePnl,
          isLive: symTick.source === 'deriv_ws' || symTick.source === 'live_pulse',
        };
      }
      return {
        currentPrice: symTick.quote,
        pnl: storedPnl,
        isLive: symTick.source === 'deriv_ws' || symTick.source === 'live_pulse',
      };
    }
  }

  return {
    currentPrice: storedCur,
    pnl: storedPnl,
    isLive: false,
  };
}

export type TradingScope = 'options' | 'cfd';
export type CfdBucket = 'mt5_standard' | 'mt5_gold';

export function isCfdConnectedAccount(
  acc?: { platform?: string | null; account_type?: string | null } | null
): boolean {
  if (!acc) return false;
  const p = String(acc.platform || '').toLowerCase();
  const t = String(acc.account_type || '').toLowerCase();
  return (
    p.includes('mt5') ||
    p.includes('cfd') ||
    p === 'ctrader' ||
    t.includes('cfd') ||
    t.includes('standard') ||
    t.includes('gold') ||
    t.includes('swap') ||
    t.includes('zero') ||
    t.includes('fin') ||
    t.includes('ctrader')
  );
}

export function getCfdAccountBucket(
  acc?: { platform?: string | null; account_type?: string | null } | null
): CfdBucket {
  if (!acc) return 'mt5_standard';
  const p = String(acc.platform || '').toLowerCase();
  const t = String(acc.account_type || '').toLowerCase();
  if (
    p.includes('gold') ||
    p.includes('swap') ||
    p === 'ctrader' ||
    t.includes('gold') ||
    t.includes('swap') ||
    t.includes('ctrader')
  ) {
    return 'mt5_gold';
  }
  return 'mt5_standard';
}

export interface CanonicalBalances {
  optionsBal: number;
  mt5StdBal: number;
  mt5GoldBal: number;
  cfdsTotalBal: number;
  exchangeUsdt: number;
  totalPortfolioUsd: number;
  activeTradingBalance: number;
}

export function getCanonicalBalances(
  user: UserProfile | null,
  accounts: ConnectedAccount[],
  accountMode: 'real' | 'demo',
  activeConnectedAccount: ConnectedAccount | null,
  tradingScope: TradingScope = 'options',
  activeCfdBucket: CfdBucket = 'mt5_standard'
): CanonicalBalances {
  const isModeAccount = (a: ConnectedAccount) =>
    a.status === 'active' && (accountMode === 'demo' ? Boolean(a.is_virtual) : !a.is_virtual);

  const modeAccounts = accounts.filter(isModeAccount);
  const optionsAcc = modeAccounts.find((a) => !isCfdConnectedAccount(a));
  const cfdModeAccounts = modeAccounts.filter((a) => isCfdConnectedAccount(a));
  const stdAccs = cfdModeAccounts.filter((a) => getCfdAccountBucket(a) === 'mt5_standard');
  const goldAccs = cfdModeAccounts.filter((a) => getCfdAccountBucket(a) === 'mt5_gold');

  // When Admin edits Real Balance, users.real_wallets.options AND real deriv connected_accounts are synced.
  // Always honor real_wallets.options if admin-locked or if no active deriv options account exists.
  const optionsBal =
    accountMode === 'real'
      ? optionsAcc?.balance_locked_by_admin || !optionsAcc
        ? Number(user?.real_wallets?.options ?? optionsAcc?.balance ?? 0)
        : Number(optionsAcc.balance ?? user?.real_wallets?.options ?? 0)
      : Number(user?.virtual_workspace_balance ?? optionsAcc?.balance ?? 10000);

  const walletStd =
    accountMode === 'real'
      ? Number(user?.real_wallets?.mt5_standard ?? 0)
      : Number(user?.demo_wallets?.mt5_standard ?? 0);
  const stdSum = Number(stdAccs.reduce((sum, a) => sum + Number(a.balance ?? 0), 0).toFixed(2));
  const stdLocked = stdAccs.some((a) => a.balance_locked_by_admin);
  const mt5StdBal =
    stdAccs.length > 0
      ? stdSum === 0 && !stdLocked && walletStd > 0
        ? walletStd
        : stdSum
      : walletStd;

  const walletGold =
    accountMode === 'real'
      ? Number(user?.real_wallets?.mt5_gold ?? 0)
      : Number(user?.demo_wallets?.mt5_gold ?? 0);
  const goldSum = Number(goldAccs.reduce((sum, a) => sum + Number(a.balance ?? 0), 0).toFixed(2));
  const goldLocked = goldAccs.some((a) => a.balance_locked_by_admin);
  const mt5GoldBal =
    goldAccs.length > 0
      ? goldSum === 0 && !goldLocked && walletGold > 0
        ? walletGold
        : goldSum
      : walletGold;

  const cfdsTotalBal = Number((mt5StdBal + mt5GoldBal).toFixed(2));

  const spotBalances =
    accountMode === 'real'
      ? user?.real_exchange_balances || { USDT: Number(user?.real_wallets?.exchange_usdt ?? 0), USDC: 0, BTC: 0, ETH: 0 }
      : user?.exchange_balances || { USDT: Number(user?.demo_wallets?.exchange_usdt ?? 0), USDC: 0, BTC: 0, ETH: 0 };

  const exchangeUsdt = Number(
    (
      Number(spotBalances.USDT || 0) +
      Number(spotBalances.USDC || 0) +
      Number(spotBalances.BTC || 0) * 91450 +
      Number(spotBalances.ETH || 0) * 3180
    ).toFixed(2)
  );

  const totalPortfolioUsd = Number((optionsBal + cfdsTotalBal + exchangeUsdt).toFixed(2));

  let activeTradingBalance: number;
  if (tradingScope === 'cfd') {
    const activeIsModeCfd =
      activeConnectedAccount &&
      activeConnectedAccount.status === 'active' &&
      (accountMode === 'demo' ? Boolean(activeConnectedAccount.is_virtual) : !activeConnectedAccount.is_virtual) &&
      isCfdConnectedAccount(activeConnectedAccount);

    if (activeIsModeCfd && activeConnectedAccount) {
      const bucket = getCfdAccountBucket(activeConnectedAccount);
      const bucketWallet = bucket === 'mt5_gold' ? walletGold : walletStd;
      const bucketAccSum = bucket === 'mt5_gold' ? goldSum : stdSum;
      const accBal = Number(activeConnectedAccount.balance ?? 0);
      activeTradingBalance =
        bucketAccSum === 0 && !activeConnectedAccount.balance_locked_by_admin && bucketWallet > 0
          ? bucketWallet
          : accBal;
    } else {
      activeTradingBalance = activeCfdBucket === 'mt5_gold' ? mt5GoldBal : mt5StdBal;
    }
  } else {
    activeTradingBalance =
      accountMode === 'real'
        ? activeConnectedAccount &&
          !activeConnectedAccount.is_virtual &&
          !isCfdConnectedAccount(activeConnectedAccount) &&
          !activeConnectedAccount.balance_locked_by_admin
          ? Number(activeConnectedAccount.balance ?? optionsBal)
          : optionsBal
        : optionsBal;
  }

  return {
    optionsBal,
    mt5StdBal,
    mt5GoldBal,
    cfdsTotalBal,
    exchangeUsdt,
    totalPortfolioUsd,
    activeTradingBalance,
  };
}
