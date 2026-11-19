import type { ConnectedAccount, OrderRecord, TickData, UserProfile } from '../types';

export function computeLiveOrderMetrics(
  order: OrderRecord,
  ticks: Record<string, TickData>
): { currentPrice: number; pnl: number; isLive: boolean } {
  const entry = Number(order.entry_price || 0);
  const storedCur = Number(order.current_price || entry || 0);
  const storedPnl = Number(order.pnl || 0);
  const symTick = ticks[order.symbol];
  const isMult = ['MULTUP', 'MULTDOWN', 'BUY', 'SELL'].includes(String(order.contract_type || '').toUpperCase());

  if (order.status === 'OPEN' && symTick && Number.isFinite(symTick.quote) && symTick.quote > 0 && entry > 0) {
    if (isMult) {
      const isUp = String(order.contract_type || '').toUpperCase() === 'MULTUP' || String(order.side || '').toUpperCase() === 'BUY';
      const pctDiff = (symTick.quote - entry) / entry;
      const directional = isUp ? pctDiff : -pctDiff;
      const stake = Number(order.stake || 0);
      const mult = Number(order.multiplier || 100);
      const livePnl = Number(Math.max(-stake, directional * stake * mult).toFixed(2));
      return {
        currentPrice: symTick.quote,
        pnl: livePnl,
        isLive: symTick.source === 'deriv_ws' || symTick.source === 'sync_stream',
      };
    }
    return {
      currentPrice: symTick.quote,
      pnl: storedPnl,
      isLive: symTick.source === 'deriv_ws' || symTick.source === 'sync_stream',
    };
  }

  return {
    currentPrice: storedCur,
    pnl: storedPnl,
    isLive: false,
  };
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
  activeConnectedAccount: ConnectedAccount | null
): CanonicalBalances {
  const realOptionsAcc = accounts.find(
    (a) => !a.is_virtual && a.status === 'active' && (a.platform === 'deriv' || !a.platform)
  );
  const demoOptionsAcc = accounts.find(
    (a) => Boolean(a.is_virtual) && a.status === 'active' && (a.platform === 'deriv' || !a.platform)
  );

  const mt5StdAcc = accounts.find(
    (a) =>
      a.status === 'active' &&
      a.platform?.includes('mt5') &&
      !String(a.account_type || '').toLowerCase().includes('gold') &&
      (accountMode === 'demo' ? Boolean(a.is_virtual) : !a.is_virtual)
  );
  const mt5GoldAcc = accounts.find(
    (a) =>
      a.status === 'active' &&
      a.platform?.includes('mt5') &&
      String(a.account_type || '').toLowerCase().includes('gold') &&
      (accountMode === 'demo' ? Boolean(a.is_virtual) : !a.is_virtual)
  );

  // When Admin edits Real Balance, users.real_wallets.options AND real deriv connected_accounts are synced.
  // Always honor real_wallets.options if admin-locked or if no active deriv options account exists.
  const optionsBal =
    accountMode === 'real'
      ? realOptionsAcc?.balance_locked_by_admin || !realOptionsAcc
        ? Number(user?.real_wallets?.options ?? realOptionsAcc?.balance ?? 0)
        : Number(realOptionsAcc.balance ?? user?.real_wallets?.options ?? 0)
      : Number(user?.virtual_workspace_balance ?? demoOptionsAcc?.balance ?? 10000);

  const mt5StdBal =
    accountMode === 'real'
      ? mt5StdAcc?.balance_locked_by_admin || !mt5StdAcc
        ? Number(user?.real_wallets?.mt5_standard ?? mt5StdAcc?.balance ?? 0)
        : Number(mt5StdAcc.balance ?? user?.real_wallets?.mt5_standard ?? 0)
      : Number(user?.demo_wallets?.mt5_standard ?? mt5StdAcc?.balance ?? 0);

  const mt5GoldBal =
    accountMode === 'real'
      ? mt5GoldAcc?.balance_locked_by_admin || !mt5GoldAcc
        ? Number(user?.real_wallets?.mt5_gold ?? mt5GoldAcc?.balance ?? 0)
        : Number(mt5GoldAcc.balance ?? user?.real_wallets?.mt5_gold ?? 0)
      : Number(user?.demo_wallets?.mt5_gold ?? mt5GoldAcc?.balance ?? 0);

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

  const activeTradingBalance =
    accountMode === 'real'
      ? activeConnectedAccount && !activeConnectedAccount.is_virtual && !activeConnectedAccount.balance_locked_by_admin
        ? Number(activeConnectedAccount.balance ?? optionsBal)
        : optionsBal
      : optionsBal;

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
