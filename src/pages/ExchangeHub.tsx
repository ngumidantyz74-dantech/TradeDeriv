import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Plus,
  Send,
  ArrowLeftRight,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Search,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { getCanonicalBalances } from '../lib/balances';
import { SparklineSvg } from '../components/SparklineSvg';
import { CryptoCircleBadge, DxnCandlesGraphic } from '../components/DerivBadges';
import { TransferScreen, DepositSheet } from '../components/CashierFlows';
import type { ExchangePair } from '../types';

type QuoteCurrency = 'ETH' | 'BTC' | 'USDC' | 'USDT';
type MarketFilter = 'all' | 'trending' | 'gainers' | 'losers';

interface ExchangeOrderRow {
  id: number;
  pair: string;
  side: 'BUY' | 'SELL';
  orderType: 'market' | 'limit';
  price: number;
  amount: number;
  currency: string;
  reference_id: string;
  status: string;
  created_at: string;
}

const DEFAULT_PAIR_BY_QUOTE: Record<QuoteCurrency, string> = {
  USDT: 'BTC/USDT',
  USDC: 'BTC/USDC',
  BTC: 'TRX/BTC',
  ETH: 'LTC/ETH',
};

function formatPairPrice(price: number): string {
  if (!Number.isFinite(price)) return '0.00';
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(5);
  return price.toFixed(8);
}

function formatSpotBalance(val: number, coin: string): string {
  const num = Number(val || 0);
  if (coin === 'USDT' || coin === 'USDC') return num.toFixed(2);
  return num.toFixed(8);
}

function formatVolumeShort(volM: number): string {
  const v = Number(volM || 0);
  if (v >= 1) return `${v.toFixed(2)}M`;
  if (v >= 0.001) return `${(v * 1000).toFixed(2)}K`;
  return `${(v * 1_000_000).toFixed(2)}`;
}

function formatPreviewOut(val: number, coin: string): string {
  if (!Number.isFinite(val) || val <= 0) {
    if (coin === 'BTC') return '0.00000';
    if (coin === 'ETH' || coin === 'BNB' || coin === 'SOL' || coin === 'WBTC') return '0.0000';
    if (coin === 'LTC') return '0.000';
    if (coin === 'USDT' || coin === 'USDC') return '0.00';
    return '0';
  }
  if (val >= 100) return val.toFixed(2);
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.001) return val.toFixed(5);
  return val.toFixed(8);
}

export const ExchangeHub: React.FC = () => {
  const {
    user,
    accounts,
    accountMode,
    setAccountMode,
    exchangePairs,
    refreshAll,
    showToast,
    hideBalances,
  } = useApp();

  const [viewMode, setViewMode] = useState<'overview' | 'markets'>('overview');
  const [quoteFilter, setQuoteFilter] = useState<QuoteCurrency>('USDT');
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('');

  const [pairSheetOpen, setPairSheetOpen] = useState(false);
  const [sheetQuote, setSheetQuote] = useState<QuoteCurrency>('USDT');

  const [overviewFilter, setOverviewFilter] = useState<'trending' | 'gainers' | 'losers'>('trending');
  const [overviewSearch, setOverviewSearch] = useState('');

  const [marketsQuote, setMarketsQuote] = useState<'All' | QuoteCurrency>('All');
  const [quoteDropdownOpen, setQuoteDropdownOpen] = useState(false);
  const [marketsFilter, setMarketsFilter] = useState<MarketFilter>('trending');

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [orders, setOrders] = useState<ExchangeOrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [balancesSheetOpen, setBalancesSheetOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState('wallet-usd');
  const [transferTo, setTransferTo] = useState('wallet-usdt');
  const [depositOpen, setDepositOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const spotBalances = useMemo(() => {
    const raw =
      accountMode === 'real'
        ? user?.real_exchange_balances
        : user?.exchange_balances;
    return {
      USDT: Number(
        raw?.USDT ??
          (accountMode === 'real' ? user?.real_wallets?.exchange_usdt : user?.demo_wallets?.exchange_usdt) ??
          0
      ),
      USDC: Number(raw?.USDC ?? 0),
      BTC: Number(raw?.BTC ?? 0),
      ETH: Number(raw?.ETH ?? 0),
      ...(raw || {}),
    } as Record<string, number>;
  }, [accountMode, user?.demo_wallets?.exchange_usdt, user?.exchange_balances, user?.real_exchange_balances, user?.real_wallets?.exchange_usdt]);

  const canonical = useMemo(
    () => getCanonicalBalances(user, accounts, accountMode, null),
    [user, accounts, accountMode]
  );

  // Convert any held spot coin into USDT using live ticks
  const estimatedTotalUsdt = useMemo(() => {
    const findPrice = (pairName: string): number =>
      Number(exchangePairs.find((p) => p.pair === pairName)?.price || 0);
    const btcUsdt = findPrice('BTC/USDT') || 59563.8;
    const ethUsdt = findPrice('ETH/USDT') || 1680.23;

    let total = 0;
    for (const [coin, rawAmt] of Object.entries(spotBalances)) {
      const qty = Number(rawAmt || 0);
      if (qty <= 0) continue;
      if (coin === 'USDT' || coin === 'USDC') {
        total += qty;
      } else {
        const directUsdt = findPrice(`${coin}/USDT`);
        if (directUsdt > 0) {
          total += qty * directUsdt;
        } else {
          const viaBtc = findPrice(`${coin}/BTC`);
          const viaEth = findPrice(`${coin}/ETH`);
          if (viaBtc > 0) total += qty * viaBtc * btcUsdt;
          else if (viaEth > 0) total += qty * viaEth * ethUsdt;
        }
      }
    }
    return total;
  }, [spotBalances, exchangePairs]);

  const activePairObj: ExchangePair = useMemo(() => {
    const found = exchangePairs.find((p) => p.pair === selectedPair);
    if (found) return found;
    const [base = 'BTC', quote = 'USDT'] = selectedPair.split('/');
    return {
      pair: selectedPair,
      base,
      quote,
      price: 59563.8,
      change24h: -2.81,
      volume24hM: 13.55,
      color: '#F7931A',
      sparkline: [60900, 60650, 60120, 59840, 59563.8],
    };
  }, [exchangePairs, selectedPair]);

  const payCurrency = side === 'BUY' ? activePairObj.quote : activePairObj.base;
  const receiveCurrency = side === 'BUY' ? activePairObj.base : activePairObj.quote;
  const payBalance = Number(spotBalances[payCurrency] ?? 0);

  const amtNum = Number(amount || 0);
  const effectivePrice =
    orderType === 'limit' && Number(limitPrice) > 0 ? Number(limitPrice) : activePairObj.price;

  const previewOutNum =
    amtNum > 0
      ? side === 'BUY'
        ? amtNum / (effectivePrice || 1)
        : amtNum * effectivePrice
      : 0;

  const overviewPairs = useMemo(() => {
    let list = [...exchangePairs];
    const q = overviewSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => i.pair.toLowerCase().includes(q) || i.base.toLowerCase().includes(q));
    }
    if (overviewFilter === 'gainers') {
      list.sort((a, b) => b.change24h - a.change24h);
    } else if (overviewFilter === 'losers') {
      list.sort((a, b) => a.change24h - b.change24h);
    } else {
      list.sort((a, b) => b.volume24hM - a.volume24hM);
    }
    return q ? list : list.slice(0, 5);
  }, [exchangePairs, overviewFilter, overviewSearch]);

  const fullMarketsPairs = useMemo(() => {
    let list = [...exchangePairs];
    if (marketsQuote !== 'All') {
      list = list.filter((p) => p.quote === marketsQuote);
    }
    if (marketsFilter === 'gainers') {
      list.sort((a, b) => b.change24h - a.change24h);
    } else if (marketsFilter === 'losers') {
      list.sort((a, b) => a.change24h - b.change24h);
    } else if (marketsFilter === 'trending') {
      list.sort((a, b) => b.volume24hM - a.volume24hM);
    }
    return list;
  }, [exchangePairs, marketsQuote, marketsFilter]);

  const modalQuotePairs = useMemo(
    () => exchangePairs.filter((p) => p.quote === sheetQuote),
    [exchangePairs, sheetQuote]
  );

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoadingOrders(true);
    try {
      const res = await apiFetch<{ orders: ExchangeOrderRow[] }>(
        `/api/exchange/orders?accountMode=${accountMode}`
      );
      setOrders(res.orders || []);
    } catch {
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [accountMode, user]);

  useEffect(() => {
    if (advancedOpen) {
      fetchOrders();
    }
  }, [advancedOpen, fetchOrders]);

  const handleSelectQuoteTab = (coin: QuoteCurrency) => {
    setQuoteFilter(coin);
    const preferred = DEFAULT_PAIR_BY_QUOTE[coin];
    const match =
      exchangePairs.find((p) => p.pair === preferred) || exchangePairs.find((p) => p.quote === coin);
    if (match) {
      setSelectedPair(match.pair);
      setAmount('');
    }
  };

  const handlePercent = (pct: number) => {
    const decimals = payCurrency === 'USDT' || payCurrency === 'USDC' ? 2 : 8;
    const raw = (payBalance * pct) / 100;
    const floored = Math.floor(raw * 10 ** decimals) / 10 ** decimals;
    setAmount(floored > 0 ? floored.toFixed(decimals) : '');
  };

  const openAddFundsFlow = () => {
    setTransferFrom('wallet-usd');
    setTransferTo('wallet-usdt');
    setTransferOpen(true);
  };

  const openSendFlow = () => {
    setTransferFrom('wallet-usdt');
    setTransferTo('wallet-usd');
    setTransferOpen(true);
  };

  const handlePlaceOrder = async (customOrderType?: 'market' | 'limit') => {
    const activeType = customOrderType || 'market';
    if (!amtNum || amtNum <= 0) {
      showToast('Enter an amount to trade', 'error');
      return;
    }
    if (activeType === 'limit' && (!Number(limitPrice) || Number(limitPrice) <= 0)) {
      showToast('Enter a valid limit price', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{ status?: string }>('/api/exchange/order', {
        method: 'POST',
        body: JSON.stringify({
          pair: activePairObj.pair,
          side,
          amount: amtNum,
          orderType: activeType,
          limitPrice: activeType === 'limit' ? Number(limitPrice) : undefined,
          accountMode,
        }),
      });
      await refreshAll();
      if (advancedOpen) {
        await fetchOrders();
      }
      setAmount('');
      showToast(
        res.status === 'open'
          ? `Limit ${side} order placed on ${activePairObj.pair}`
          : `${side} order filled on ${activePairObj.pair}`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Exchange order failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      await apiFetch(`/api/exchange/orders/${orderId}/cancel`, { method: 'POST' });
      await refreshAll();
      await fetchOrders();
      showToast('Limit order cancelled and funds returned', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to cancel order', 'error');
    }
  };

  const heldNonZeroEntries = Object.entries(spotBalances).filter(([, v]) => Number(v) > 0);
  const priceUp = activePairObj.change24h >= 0;

  return (
    <div className="max-w-7xl mx-auto">
      {viewMode === 'markets' ? (
        /* Full Markets Screen matching screenshots 141640, 141644, 141647 */
        <div className="px-4 sm:px-8 pt-4 pb-8 max-w-5xl mx-auto">
          <button
            type="button"
            onClick={() => setViewMode('overview')}
            aria-label="Back to Exchange"
            className="w-9 h-9 rounded-full bg-[#F4F5F7] dark:bg-[#242833] hover:bg-slate-200 dark:hover:bg-[#2F3544] flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>

          <h1 className="font-display text-[26px] font-bold tracking-tight mt-4 mb-4 text-[#111319] dark:text-white">
            Markets
          </h1>

          {/* Quote Dropdown + Filter Pills */}
          <div className="relative flex items-center gap-2 overflow-x-auto no-scrollbar pb-3">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setQuoteDropdownOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#D0D5DD] dark:border-[#2A2F3D] bg-white dark:bg-[#181C25] text-[13px] font-medium cursor-pointer"
              >
                <span>{marketsQuote}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#667085]" />
              </button>
              {quoteDropdownOpen && (
                <div className="absolute left-0 top-10 z-30 w-28 rounded-xl bg-white dark:bg-[#1E222E] border border-slate-200 dark:border-white/10 shadow-lg py-1">
                  {(['All', 'USDT', 'USDC', 'BTC', 'ETH'] as const).map((qOpt) => (
                    <button
                      key={qOpt}
                      type="button"
                      onClick={() => {
                        setMarketsQuote(qOpt);
                        setQuoteDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-[13px] hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer ${
                        marketsQuote === qOpt ? 'font-bold text-[#FF444F]' : ''
                      }`}
                    >
                      {qOpt}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="w-px h-5 bg-slate-200 dark:bg-white/10 shrink-0 mx-0.5" />

            {(['all', 'trending', 'gainers', 'losers'] as const).map((f) => {
              const label = f.charAt(0).toUpperCase() + f.slice(1);
              const active = marketsFilter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setMarketsFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-[13px] font-medium border shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'border-[#111319] dark:border-white bg-white dark:bg-[#181C25] text-[#111319] dark:text-white font-semibold'
                      : 'border-[#EAECF0] dark:border-[#2A2F3D] text-[#475467] dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Markets Table */}
          <div className="mt-1">
            <div className="grid grid-cols-12 py-2 text-[11px] font-medium text-[#667085] dark:text-slate-400">
              <div className="col-span-5">Coin</div>
              <div className="col-span-4 text-center">24H chart</div>
              <div className="col-span-3 text-right">24H price</div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {fullMarketsPairs.map((p) => {
                const pos = p.change24h >= 0;
                return (
                  <button
                    key={p.pair}
                    type="button"
                    onClick={() => {
                      setSelectedPair(p.pair);
                      if (p.quote === 'ETH' || p.quote === 'BTC' || p.quote === 'USDC' || p.quote === 'USDT') {
                        setQuoteFilter(p.quote);
                      }
                      setViewMode('overview');
                    }}
                    className="w-full grid grid-cols-12 items-center py-3 hover:bg-slate-50 dark:hover:bg-white/5 text-left transition-colors cursor-pointer"
                  >
                    <div className="col-span-5 flex items-center gap-3 min-w-0">
                      <CryptoCircleBadge code={p.base} size="md" />
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-[#111319] dark:text-white truncate">{p.pair}</p>
                        <p className="text-[11px] text-[#667085] dark:text-slate-400">
                          Vol {formatVolumeShort(p.volume24hM)}
                        </p>
                      </div>
                    </div>

                    <div className="col-span-4 flex justify-center">
                      <SparklineSvg data={p.sparkline} positive={pos} width={112} height={30} />
                    </div>

                    <div className="col-span-3 text-right">
                      <p className="font-mono-num text-[13.5px] font-bold text-[#111319] dark:text-white">
                        {formatPairPrice(p.price)}
                      </p>
                      <p className={`font-mono-num text-[11.5px] font-medium ${pos ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                        {pos ? '+' : ''}
                        {p.change24h.toFixed(2)}%
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Main Exchange Overview matching screenshots 141546 - 141631 */
        <>
          {/* Dark Hero Section */}
          <section className="bg-[#171A21] text-white px-5 sm:px-8 pt-4 pb-7 rounded-b-[28px] lg:rounded-3xl lg:mx-6 lg:mt-6">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setBalancesSheetOpen(true)}
                className="inline-flex items-center gap-1.5 text-[13px] text-[#9BA3B0] hover:text-white cursor-pointer"
              >
                <span>Estimated total value</span>
                <ChevronRight className="w-3.5 h-3.5" />
                {accountMode === 'demo' && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 text-[10px] font-semibold">
                    Demo
                  </span>
                )}
              </button>

              {/* Desktop Real/Demo quick toggle without altering mobile screenshot look */}
              <div className="hidden lg:inline-flex items-center bg-[#232732] p-0.5 rounded-full">
                <button
                  type="button"
                  onClick={() => setAccountMode('real')}
                  className={`px-3.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                    accountMode === 'real' ? 'bg-[#383D4A] text-white' : 'text-[#8E95A2]'
                  }`}
                >
                  Real
                </button>
                <button
                  type="button"
                  onClick={() => setAccountMode('demo')}
                  className={`px-3.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                    accountMode === 'demo' ? 'bg-[#383D4A] text-white' : 'text-[#8E95A2]'
                  }`}
                >
                  Demo
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5 mt-1.5">
              <span className="font-mono-num text-[24px] sm:text-[28px] font-bold tracking-tight">
                {hideBalances ? '•••••• USDT' : `${estimatedTotalUsdt.toFixed(2)} USDT`}
              </span>
              <button
                type="button"
                aria-label="Refresh balance"
                onClick={async () => {
                  setRefreshing(true);
                  await refreshAll();
                  setRefreshing(false);
                }}
                className="p-1 rounded-full hover:bg-white/10 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 text-[#C7CDD6] ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Add funds / Send circular action buttons */}
            <div className="grid grid-cols-2 max-w-xs mx-auto lg:mx-0 mt-6">
              <button
                type="button"
                onClick={openAddFundsFlow}
                className="flex flex-col items-center gap-2 cursor-pointer group"
              >
                <span className="w-11 h-11 rounded-full bg-[#FF444F] group-hover:bg-[#E63946] flex items-center justify-center transition-colors shadow-sm">
                  <Plus className="w-5 h-5 text-white stroke-[2.2]" />
                </span>
                <span className="text-[12px] font-medium text-white">Add funds</span>
              </button>

              <button
                type="button"
                onClick={openSendFlow}
                className="flex flex-col items-center gap-2 cursor-pointer group"
              >
                <span className="w-11 h-11 rounded-full border border-white/25 group-hover:bg-white/10 flex items-center justify-center transition-colors">
                  <Send className="w-4 h-4 text-white" />
                </span>
                <span className="text-[12px] font-medium text-white">Send</span>
              </button>
            </div>
          </section>

          {/* Deriv Wallet Banner */}
          {canonical.mainUsdBal > 0 && (
            <div className="px-4 sm:px-8 mt-4">
              <button
                type="button"
                onClick={openAddFundsFlow}
                className="w-full p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-[#EAECF0] dark:border-[#2A2F3D] hover:border-slate-300 dark:hover:border-white/20 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
              >
                <div>
                  <p className="font-display text-[14.5px] font-bold text-[#111319] dark:text-white">
                    Your Deriv wallet has funds
                  </p>
                  <p className="text-[12.5px] text-[#667085] dark:text-slate-400 mt-0.5">
                    Add them to Deriv Exchange to start trading.
                  </p>
                </div>
                <span className="w-6 h-6 rounded-full bg-[#111319] dark:bg-white text-white dark:text-[#111319] flex items-center justify-center shrink-0">
                  <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </span>
              </button>
            </div>
          )}

          {/* Main Grid: Buy & Sell Crypto + DXN Banner + Markets */}
          <div className="px-4 sm:px-8 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Buy & Sell Crypto + DXN Banner */}
            <section className="lg:col-span-5">
              <h2 className="font-display text-[18px] font-bold text-[#111319] dark:text-white mb-3">
                Buy &amp; sell crypto
              </h2>

              <div className="bg-white dark:bg-[#181C25] rounded-3xl p-4 sm:p-5 border border-[#EAECF0] dark:border-[#2A2F3D] shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
                {/* Quote Currency Pills */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-4">
                  {(['ETH', 'BTC', 'USDC', 'USDT'] as const).map((coin) => {
                    const active = quoteFilter === coin;
                    return (
                      <button
                        key={coin}
                        type="button"
                        onClick={() => handleSelectQuoteTab(coin)}
                        className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-colors cursor-pointer shrink-0 ${
                          active
                            ? 'border-[#111319] dark:border-white bg-[#F2F4F7] dark:bg-white/10 text-[#111319] dark:text-white'
                            : 'border-[#EAECF0] dark:border-[#2A2F3D] bg-white dark:bg-transparent text-[#344054] dark:text-slate-300'
                        }`}
                      >
                        {coin}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Pair Button -> opens Crypto pairs modal */}
                <button
                  type="button"
                  onClick={() => {
                    setSheetQuote(quoteFilter);
                    setPairSheetOpen(true);
                  }}
                  className="w-full px-3.5 py-3 rounded-2xl bg-[#F4F5F7] dark:bg-[#111319] hover:bg-[#ECEEF2] dark:hover:bg-[#151923] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CryptoCircleBadge code={activePairObj.base} size="md" />
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-bold text-[#111319] dark:text-white leading-tight">
                        {activePairObj.pair}
                      </p>
                      <p className="text-[12px] text-[#667085] dark:text-slate-400 font-mono-num mt-0.5 flex items-center gap-1">
                        <span>
                          {formatPairPrice(activePairObj.price)} ({Math.abs(activePairObj.change24h).toFixed(2)}%)
                        </span>
                        <span
                          className={`text-[9px] leading-none ${priceUp ? 'text-[#00A878]' : 'text-[#FF444F]'}`}
                          aria-hidden="true"
                        >
                          {priceUp ? '▲' : '▼'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#475467] dark:text-slate-400 shrink-0" />
                </button>

                {/* Spot Balance Header + Amount Input Box */}
                <div className="mt-3 rounded-2xl border border-[#EAECF0] dark:border-[#2A2F3D] overflow-hidden">
                  <div className="bg-[#F4F5F7] dark:bg-[#1E222E] px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CryptoCircleBadge code={payCurrency} size="xs" />
                      <span className="text-[13px] text-[#667085] dark:text-slate-400 truncate">
                        {payCurrency} Spot balance
                      </span>
                    </div>
                    <span className="font-mono-num text-[13px] font-medium text-[#111319] dark:text-white shrink-0">
                      {hideBalances ? '••••' : formatSpotBalance(payBalance, payCurrency)}
                    </span>
                  </div>

                  <div className="bg-white dark:bg-[#181C25] px-3.5 py-3 flex items-center justify-between gap-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Amount"
                      className="w-full bg-transparent text-[15px] font-medium text-[#111319] dark:text-white placeholder-[#667085] outline-none font-mono-num"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSide((s) => (s === 'BUY' ? 'SELL' : 'BUY'));
                        setAmount('');
                      }}
                      title="Switch Buy / Sell"
                      className="px-3 py-1 rounded-full bg-white dark:bg-[#222631] border border-[#D0D5DD] dark:border-[#2A2F3D] text-[13px] font-semibold text-[#111319] dark:text-white flex items-center gap-1.5 shrink-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#292E3C]"
                    >
                      <span>{payCurrency}</span>
                      <ArrowLeftRight className="w-3 h-3 text-[#475467] dark:text-slate-300" />
                    </button>
                  </div>
                </div>

                {/* Conversion Estimate */}
                <p className="font-mono-num text-[12.5px] text-[#667085] dark:text-slate-400 mt-2.5 mb-3">
                  ≈ {formatPreviewOut(previewOutNum, receiveCurrency)} {receiveCurrency}
                </p>

                {/* Allocation Pills */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handlePercent(pct)}
                      className="py-1.5 rounded-full border border-[#EAECF0] dark:border-[#2A2F3D] hover:border-[#111319] dark:hover:border-white text-[13px] font-medium text-[#111319] dark:text-white cursor-pointer transition-colors"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>

                {/* Primary Buy / Sell CTA */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handlePlaceOrder('market')}
                  className={`w-full min-h-[44px] rounded-full text-white font-bold text-[15px] transition-colors cursor-pointer disabled:opacity-60 ${
                    side === 'BUY'
                      ? 'bg-[#00B37E] hover:bg-[#009E6F]'
                      : 'bg-[#FF444F] hover:bg-[#E63946]'
                  }`}
                >
                  {submitting ? 'Processing...' : side === 'BUY' ? 'Buy' : 'Sell'}
                </button>

                {/* Advanced Mode Row */}
                <button
                  type="button"
                  onClick={() => {
                    setLimitPrice(String(activePairObj.price));
                    setAdvancedOpen(true);
                  }}
                  className="w-full mt-4 pt-3.5 border-t border-[#EAECF0] dark:border-[#2A2F3D] flex items-center justify-between text-left cursor-pointer"
                >
                  <div>
                    <p className="text-[14px] font-bold text-[#111319] dark:text-white">Advanced mode</p>
                    <p className="text-[12px] text-[#667085] dark:text-slate-400">
                      Limit orders, order book, charts
                    </p>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-[#111319] dark:bg-white text-white dark:text-[#111319] flex items-center justify-center shrink-0">
                    <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                  </span>
                </button>
              </div>

              {/* DXN Banner Card matching screenshots */}
              <button
                type="button"
                onClick={() => {
                  setLimitPrice(String(activePairObj.price));
                  setAdvancedOpen(true);
                }}
                className="w-full mt-4 rounded-2xl bg-gradient-to-r from-[#2D0D13] via-[#1C0E13] to-[#121318] text-white p-4 border border-[#3A1E24] flex items-center justify-between gap-3 text-left cursor-pointer hover:border-[#FF444F]/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-[#FF444F] text-white text-[9.5px] font-black tracking-tight leading-none">
                      DXN
                    </span>
                    <h3 className="font-display text-[14.5px] font-bold text-white truncate">
                      Trade bigger, hold longer
                    </h3>
                  </div>
                  <p className="text-[11.5px] text-white/80 leading-snug mt-1.5">
                    Open positions worth up to 50x your balance, long or short. Hold as long as you like - no expiry.
                  </p>
                </div>
                <DxnCandlesGraphic />
              </button>
            </section>

            {/* Right Column: Markets Preview + View More */}
            <section className="lg:col-span-7 pb-6">
              <h2 className="font-display text-[18px] font-bold text-[#111319] dark:text-white mb-3">
                Markets
              </h2>

              <div className="relative mb-3.5">
                <Search className="w-4 h-4 text-[#667085] absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={overviewSearch}
                  onChange={(e) => setOverviewSearch(e.target.value)}
                  placeholder={`Search ${exchangePairs.length || 38} pairs`}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] text-[14px] text-[#111319] dark:text-white placeholder-[#667085] outline-none focus:ring-1 focus:ring-[#111319]/20 dark:focus:ring-white/20"
                />
              </div>

              <div className="flex items-center gap-2 mb-3">
                {(['trending', 'gainers', 'losers'] as const).map((f) => {
                  const label = f.charAt(0).toUpperCase() + f.slice(1);
                  const active = overviewFilter === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setOverviewFilter(f)}
                      className={`px-4 py-1.5 rounded-full text-[13px] font-medium border cursor-pointer transition-colors ${
                        active
                          ? 'border-[#111319] dark:border-white bg-white dark:bg-[#181C25] text-[#111319] dark:text-white font-semibold'
                          : 'border-[#EAECF0] dark:border-[#2A2F3D] text-[#475467] dark:text-slate-400'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div>
                <div className="grid grid-cols-12 py-2 text-[11px] font-medium text-[#667085] dark:text-slate-400">
                  <div className="col-span-5">Coin</div>
                  <div className="col-span-4 text-center">24H chart</div>
                  <div className="col-span-3 text-right">24H price</div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {overviewPairs.map((p) => {
                    const pos = p.change24h >= 0;
                    return (
                      <button
                        key={p.pair}
                        type="button"
                        onClick={() => {
                          setSelectedPair(p.pair);
                          if (p.quote === 'ETH' || p.quote === 'BTC' || p.quote === 'USDC' || p.quote === 'USDT') {
                            setQuoteFilter(p.quote);
                          }
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="w-full grid grid-cols-12 items-center py-3 hover:bg-slate-50 dark:hover:bg-white/5 text-left transition-colors cursor-pointer"
                      >
                        <div className="col-span-5 flex items-center gap-3 min-w-0">
                          <CryptoCircleBadge code={p.base} size="md" />
                          <div className="min-w-0">
                            <p className="text-[14px] font-bold text-[#111319] dark:text-white truncate">{p.pair}</p>
                            <p className="text-[11px] text-[#667085] dark:text-slate-400">
                              Vol {formatVolumeShort(p.volume24hM)}
                            </p>
                          </div>
                        </div>

                        <div className="col-span-4 flex justify-center">
                          <SparklineSvg data={p.sparkline} positive={pos} width={110} height={30} />
                        </div>

                        <div className="col-span-3 text-right">
                          <p className="font-mono-num text-[13.5px] font-bold text-[#111319] dark:text-white">
                            {formatPairPrice(p.price)}
                          </p>
                          <p className={`font-mono-num text-[11.5px] font-medium ${pos ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                            {pos ? '+' : ''}
                            {p.change24h.toFixed(2)}%
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setMarketsQuote('All');
                      setMarketsFilter('trending');
                      setViewMode('markets');
                    }}
                    className="inline-flex items-center gap-1 px-4 py-2 text-[13px] font-semibold text-[#111319] dark:text-white hover:opacity-75 cursor-pointer"
                  >
                    <span>View more</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {/* Crypto Pairs Bottom-Sheet Modal matching screenshots 141612 & 141615 */}
      {pairSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] flex items-end sm:items-center justify-center"
          onClick={() => setPairSheetOpen(false)}
        >
          <div
            className="w-full sm:max-w-lg bg-white dark:bg-[#181B22] text-[#111319] dark:text-white rounded-t-[26px] sm:rounded-[26px] px-5 pt-3 pb-7 max-h-[84vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/25 mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between mb-4">
              <span className="w-8 sm:block hidden" />
              <h2 className="font-display text-[17px] font-bold text-center flex-1">Crypto pairs</h2>
              <button
                type="button"
                onClick={() => setPairSheetOpen(false)}
                className="hidden sm:flex w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar shrink-0">
              {(['ETH', 'BTC', 'USDC', 'USDT'] as const).map((coin) => (
                <button
                  key={coin}
                  type="button"
                  onClick={() => setSheetQuote(coin)}
                  className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border cursor-pointer shrink-0 ${
                    sheetQuote === coin
                      ? 'border-[#111319] dark:border-white bg-[#F2F4F7] dark:bg-white/10'
                      : 'border-[#EAECF0] dark:border-[#2A2F3D] text-[#475467] dark:text-slate-400'
                  }`}
                >
                  {coin}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto space-y-2.5 pr-0.5">
              {modalQuotePairs.map((p) => {
                const isSelected = p.pair === selectedPair;
                return (
                  <button
                    key={p.pair}
                    type="button"
                    onClick={() => {
                      setSelectedPair(p.pair);
                      setQuoteFilter(sheetQuote);
                      setPairSheetOpen(false);
                    }}
                    className={`w-full px-4 py-3 rounded-2xl flex items-center justify-between text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-white dark:bg-[#242833] border-[1.5px] border-[#111319] dark:border-white'
                        : 'bg-[#F4F5F7] dark:bg-[#222631] hover:bg-[#ECEEF2] dark:hover:bg-[#292E3C] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CryptoCircleBadge code={p.base} size="md" />
                      <span className="text-[14.5px] font-semibold text-[#111319] dark:text-white">{p.pair}</span>
                    </div>
                    <span className="font-mono-num text-[12px] text-[#667085] dark:text-slate-400">
                      {formatPairPrice(p.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Estimated Total Value & Balances Breakdown Sheet */}
      {balancesSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center"
          onClick={() => setBalancesSheetOpen(false)}
        >
          <div
            className="w-full sm:max-w-lg bg-white dark:bg-[#181B22] text-[#111319] dark:text-white rounded-t-[26px] sm:rounded-[26px] px-5 pt-3 pb-7 max-h-[82vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/25 mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-display text-[17px] font-bold">Exchange Portfolio</h2>
                <p className="text-[12px] text-[#667085] dark:text-slate-400">
                  {accountMode === 'real' ? 'Real' : 'Demo'} Spot Balances
                </p>
              </div>
              <div className="inline-flex items-center bg-[#F4F5F7] dark:bg-[#232732] p-0.5 rounded-full">
                <button
                  type="button"
                  onClick={() => setAccountMode('real')}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                    accountMode === 'real' ? 'bg-[#171A21] text-white dark:bg-[#383D4A]' : 'text-[#667085]'
                  }`}
                >
                  Real
                </button>
                <button
                  type="button"
                  onClick={() => setAccountMode('demo')}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                    accountMode === 'demo' ? 'bg-[#171A21] text-white dark:bg-[#383D4A]' : 'text-[#667085]'
                  }`}
                >
                  Demo
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#171A21] text-white mb-4">
              <p className="text-[12px] text-[#9BA3B0]">Estimated total value</p>
              <p className="font-mono-num text-[22px] font-bold mt-0.5">
                {hideBalances ? '••••••' : `${estimatedTotalUsdt.toFixed(2)} USDT`}
              </p>
            </div>

            <div className="overflow-y-auto space-y-2 mb-4">
              {heldNonZeroEntries.length === 0 ? (
                <div className="py-8 text-center text-[13px] text-[#667085] dark:text-slate-400">
                  No crypto assets in Deriv Exchange yet. Transfer funds from your Deriv wallet to begin trading.
                </div>
              ) : (
                heldNonZeroEntries.map(([coin, val]) => (
                  <div
                    key={coin}
                    className="px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#222631] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <CryptoCircleBadge code={coin} size="sm" />
                      <span className="text-[14px] font-semibold">{coin}</span>
                    </div>
                    <span className="font-mono-num text-[14px] font-bold">
                      {hideBalances ? '••••' : formatSpotBalance(Number(val), coin)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setBalancesSheetOpen(false);
                openAddFundsFlow();
              }}
              className="w-full py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white text-[14px] font-bold cursor-pointer"
            >
              Add funds to Deriv Exchange
            </button>
          </div>
        </div>
      )}

      {/* Advanced Mode Modal (Chart + Order Book + Market/Limit + Open Orders) */}
      {advancedOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setAdvancedOpen(false)}
        >
          <div
            className="w-full sm:max-w-3xl bg-white dark:bg-[#181C25] text-[#111319] dark:text-white rounded-t-[26px] sm:rounded-3xl p-5 sm:p-6 border-t sm:border border-slate-200 dark:border-[#2A2F3D] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <CryptoCircleBadge code={activePairObj.base} size="md" />
                <div>
                  <h3 className="font-display text-lg font-bold">{activePairObj.pair} · Advanced Mode</h3>
                  <p className="text-xs font-mono-num text-[#667085] dark:text-slate-400">
                    {formatPairPrice(activePairObj.price)}{' '}
                    <span className={priceUp ? 'text-[#00A878]' : 'text-[#FF444F]'}>
                      ({priceUp ? '+' : ''}
                      {activePairObj.change24h.toFixed(2)}%)
                    </span>{' '}
                    · Vol {formatVolumeShort(activePairObj.volume24hM)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdvancedOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Chart Strip */}
            <div className="rounded-2xl bg-[#F4F5F7] dark:bg-[#111319] p-3 mb-4 flex items-center justify-between gap-4">
              <SparklineSvg
                data={activePairObj.sparkline}
                positive={priceUp}
                width={520}
                height={74}
                className="w-full h-[74px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Order Book (click price to prefill limit price) */}
              <div className="bg-[#F4F5F7] dark:bg-[#111319] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-[#667085] dark:text-slate-400">
                    Order Book ({activePairObj.pair})
                  </p>
                  <span className="text-[11px] text-[#667085]">Tap price</span>
                </div>
                <div className="space-y-1 text-xs font-mono-num">
                  {[1.004, 1.003, 1.002, 1.001].map((mult, i) => {
                    const pVal = activePairObj.price * mult;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setOrderType('limit');
                          setLimitPrice(formatPairPrice(pVal));
                        }}
                        className="w-full flex justify-between text-[#FF444F] hover:bg-black/5 dark:hover:bg-white/5 px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        <span>{formatPairPrice(pVal)}</span>
                        <span>{(14.2 * (4 - i)).toFixed(2)}</span>
                      </button>
                    );
                  })}
                  <div className="py-1.5 text-center font-bold border-y border-slate-200 dark:border-[#2A2F3D]">
                    {formatPairPrice(activePairObj.price)}
                  </div>
                  {[0.999, 0.998, 0.997, 0.996].map((mult, i) => {
                    const pVal = activePairObj.price * mult;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setOrderType('limit');
                          setLimitPrice(formatPairPrice(pVal));
                        }}
                        className="w-full flex justify-between text-[#00A878] hover:bg-black/5 dark:hover:bg-white/5 px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        <span>{formatPairPrice(pVal)}</span>
                        <span>{(16.8 * (i + 1)).toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Market / Limit Order Execution */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSide('BUY')}
                    className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${
                      side === 'BUY' ? 'bg-[#00B37E] text-white' : 'bg-[#F4F5F7] dark:bg-[#111319]'
                    }`}
                  >
                    Buy {activePairObj.base}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide('SELL')}
                    className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${
                      side === 'SELL' ? 'bg-[#FF444F] text-white' : 'bg-[#F4F5F7] dark:bg-[#111319]'
                    }`}
                  >
                    Sell {activePairObj.base}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderType('market')}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                      orderType === 'market'
                        ? 'bg-[#171A21] text-white dark:bg-white dark:text-[#111319]'
                        : 'bg-[#F4F5F7] dark:bg-[#111319]'
                    }`}
                  >
                    Market
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderType('limit');
                      if (!limitPrice) setLimitPrice(String(activePairObj.price));
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                      orderType === 'limit'
                        ? 'bg-[#171A21] text-white dark:bg-white dark:text-[#111319]'
                        : 'bg-[#F4F5F7] dark:bg-[#111319]'
                    }`}
                  >
                    Limit
                  </button>
                </div>

                {orderType === 'limit' && (
                  <div>
                    <label className="block text-xs text-[#667085] mb-1">
                      Limit Price ({activePairObj.quote})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm outline-none"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between text-xs text-[#667085] mb-1">
                    <span>Amount ({payCurrency})</span>
                    <span className="font-mono-num">
                      Avail: {formatSpotBalance(payBalance, payCurrency)}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm outline-none"
                  />
                  <p className="text-[11px] font-mono-num text-[#667085] mt-1">
                    ≈ {formatPreviewOut(previewOutNum, receiveCurrency)} {receiveCurrency}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handlePlaceOrder(orderType)}
                  className={`w-full py-3 rounded-full text-white text-sm font-bold cursor-pointer disabled:opacity-60 ${
                    side === 'BUY' ? 'bg-[#00B37E] hover:bg-[#009E6F]' : 'bg-[#FF444F] hover:bg-[#E63946]'
                  }`}
                >
                  {submitting
                    ? 'Submitting...'
                    : `Place ${orderType.toUpperCase()} ${side}`}
                </button>
              </div>
            </div>

            {/* Open Limit Orders & Recent Fills */}
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-[#2A2F3D]">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                  Open Limit Orders &amp; History ({accountMode.toUpperCase()})
                </h4>
                {loadingOrders && <span className="text-[11px] text-[#667085]">Loading...</span>}
              </div>

              {orders.length === 0 ? (
                <p className="text-xs text-[#667085] py-3">No exchange orders in this mode yet.</p>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {orders.slice(0, 12).map((o) => (
                    <div
                      key={o.id}
                      className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold">
                          <span className={o.side === 'BUY' ? 'text-[#00A878]' : 'text-[#FF444F]'}>
                            {o.side}
                          </span>{' '}
                          {o.pair}{' '}
                          <span className="text-[#667085] font-normal uppercase">({o.orderType})</span>
                        </p>
                        <p className="font-mono-num text-[11px] text-[#667085]">
                          {o.amount} {o.currency} @ {formatPairPrice(o.price)} · {o.reference_id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                            o.status === 'open'
                              ? 'bg-amber-500/15 text-amber-500'
                              : o.status === 'cancelled'
                                ? 'bg-slate-500/15 text-slate-400'
                                : 'bg-[#00A878]/15 text-[#00A878]'
                          }`}
                        >
                          {o.status}
                        </span>
                        {o.status === 'open' && (
                          <button
                            type="button"
                            onClick={() => handleCancelOrder(o.id)}
                            className="px-2.5 py-1 rounded-full bg-[#FF444F]/15 text-[#FF444F] hover:bg-[#FF444F]/25 font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transfer & Deposit Flows */}
      <TransferScreen
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        initialFromId={transferFrom}
        initialToId={transferTo}
        accountMode={accountMode}
        onOpenDeposit={accountMode === 'real' ? () => setDepositOpen(true) : undefined}
      />

      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>
  );
};
