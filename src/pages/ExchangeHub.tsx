import React, { useState, useEffect } from 'react';
import { RefreshCw, Plus, Send, ArrowUpDown, ChevronRight, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import type { ExchangePair } from '../types';
import { SparklineSvg } from '../components/SparklineSvg';

export const ExchangeHub: React.FC = () => {
  const { user, refreshAll, showToast, setActiveTab, hideBalances } = useApp();
  const [pairs, setPairs] = useState<ExchangePair[]>([]);
  const [filter, setFilter] = useState<'trending' | 'gainers' | 'losers'>('trending');
  const [search, setSearch] = useState('');
  const [baseCoin, setBaseCoin] = useState<'ETH' | 'BTC' | 'USDC' | 'USDT'>('ETH');
  const [selectedPair, setSelectedPair] = useState('LTC/ETH');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [limitPrice, setLimitPrice] = useState('');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPairs = async (f = filter, q = search) => {
    try {
      const res = await apiFetch<{ pairs: ExchangePair[] }>(
        `/api/exchange/pairs?filter=${f}&q=${encodeURIComponent(q)}`
      );
      setPairs(res.pairs || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadPairs(filter, search);
  }, [filter, search]);

  const spotBalances = user?.exchange_balances || { USDT: 0, USDC: 0, BTC: 0, ETH: 0 };
  const totalUsdt =
    Number(spotBalances.USDT || 0) +
    Number(spotBalances.USDC || 0) +
    Number(spotBalances.BTC || 0) * 91450 +
    Number(spotBalances.ETH || 0) * 3180;

  const activePairObj = pairs.find((p) => p.pair === selectedPair) || {
    pair: selectedPair,
    base: selectedPair.split('/')[0] || 'LTC',
    quote: selectedPair.split('/')[1] || 'ETH',
    price: 0.02454,
    change24h: -1.2,
    volume24hM: 28.4,
    color: '#345D9D',
    sparkline: [0.024, 0.0245, 0.0242, 0.02454],
  };

  const quoteBalance = Number(spotBalances[activePairObj.quote] || 0);
  const amtNum = Number(amount || 0);
  const previewOut =
    side === 'BUY'
      ? (amtNum / (Number(limitPrice || activePairObj.price) || 1)).toFixed(4)
      : (amtNum * Number(limitPrice || activePairObj.price)).toFixed(6);

  const handlePercent = (pct: number) => {
    const avail = side === 'BUY' ? quoteBalance || Number(user?.virtual_workspace_balance || 0) : Number(spotBalances[activePairObj.base] || 0);
    setAmount(((avail * pct) / 100).toFixed(4));
  };

  const handlePlaceOrder = async () => {
    if (!amtNum || amtNum <= 0) {
      showToast('Enter an amount to trade', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/exchange/order', {
        method: 'POST',
        body: JSON.stringify({
          pair: activePairObj.pair,
          side,
          amount: amtNum,
          orderType,
          limitPrice: orderType === 'limit' ? Number(limitPrice) : undefined,
        }),
      });
      await refreshAll();
      setAmount('');
      showToast(`${side} order filled on ${activePairObj.pair}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Exchange order failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Dark Hero Banner */}
      <section className="bg-[#151820] text-white px-5 sm:px-8 pt-6 pb-7 rounded-b-[28px] lg:rounded-3xl lg:mx-6 lg:mt-6">
        <p className="text-xs text-slate-400">Estimated total value ›</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="font-mono-num text-2xl sm:text-3xl font-bold">
            {hideBalances ? '••••••' : `${totalUsdt.toFixed(2)} USDT`}
          </span>
          <button
            type="button"
            onClick={async () => {
              setRefreshing(true);
              await refreshAll();
              setRefreshing(false);
            }}
            className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-slate-300 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center justify-center lg:justify-start gap-12 mt-6">
          <button
            type="button"
            onClick={() => setActiveTab('portfolio')}
            className="flex flex-col items-center gap-2 cursor-pointer"
          >
            <span className="w-12 h-12 rounded-full bg-[#FF444F] hover:bg-[#E63946] flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </span>
            <span className="text-xs font-medium">Add funds</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('portfolio')}
            className="flex flex-col items-center gap-2 cursor-pointer"
          >
            <span className="w-12 h-12 rounded-full border border-white/30 hover:bg-white/10 flex items-center justify-center">
              <Send className="w-4 h-4 text-white" />
            </span>
            <span className="text-xs font-medium">Send</span>
          </button>
        </div>
      </section>

      <div className="px-5 sm:px-8 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Buy & Sell Crypto Card */}
        <section className="lg:col-span-5">
          <h2 className="font-display text-lg font-bold mb-3.5">Buy & sell crypto</h2>
          <div className="bg-white dark:bg-[#181C25] rounded-3xl p-5 border border-slate-200 dark:border-[#2A2F3D]">
            {/* Base coin pills */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {(['ETH', 'BTC', 'USDC', 'USDT'] as const).map((coin) => (
                  <button
                    key={coin}
                    type="button"
                    onClick={() => {
                      setBaseCoin(coin);
                      const match = pairs.find((p) => p.quote === coin);
                      if (match) setSelectedPair(match.pair);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                      baseCoin === coin
                        ? 'border-[#0E1117] dark:border-white bg-slate-100 dark:bg-white/10'
                        : 'border-slate-200 dark:border-[#2A2F3D] text-slate-500'
                    }`}
                  >
                    {coin}
                  </button>
                ))}
              </div>
              <div className="flex items-center bg-[#F4F5F7] dark:bg-[#111319] p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    side === 'BUY' ? 'bg-[#00A878] text-white' : 'text-slate-500'
                  }`}
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    side === 'SELL' ? 'bg-[#FF444F] text-white' : 'text-slate-500'
                  }`}
                >
                  Sell
                </button>
              </div>
            </div>

            {/* Pair Selector */}
            <div className="p-3.5 rounded-2xl bg-[#F4F5F7] dark:bg-[#111319] mb-3">
              <select
                value={selectedPair}
                onChange={(e) => setSelectedPair(e.target.value)}
                className="w-full bg-transparent text-sm font-bold outline-none cursor-pointer"
              >
                {pairs.length === 0 ? (
                  <option value="LTC/ETH">LTC/ETH</option>
                ) : (
                  pairs.map((p) => (
                    <option key={p.pair} value={p.pair} className="dark:bg-[#181C25]">
                      {p.pair} ({p.price})
                    </option>
                  ))
                )}
              </select>
              <p className={`font-mono-num text-xs mt-0.5 ${activePairObj.change24h >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                {activePairObj.price} ({activePairObj.change24h >= 0 ? '+' : ''}
                {activePairObj.change24h.toFixed(2)}%)
              </p>
            </div>

            {/* Spot Balance & Amount */}
            <div className="rounded-2xl bg-[#F4F5F7] dark:bg-[#111319] p-3.5 mb-2">
              <div className="flex items-center justify-between text-xs text-slate-500 pb-2.5 border-b border-slate-200/70 dark:border-[#2A2F3D]">
                <span>{activePairObj.quote} Spot balance</span>
                <span className="font-mono-num font-semibold text-[#0E1117] dark:text-white">
                  {quoteBalance.toFixed(8)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-3">
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                  className="w-full bg-transparent font-mono-num text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSide(side === 'BUY' ? 'SELL' : 'BUY')}
                  className="px-3 py-1.5 rounded-full bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <span>{side === 'BUY' ? activePairObj.quote : activePairObj.base}</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </div>
            </div>

            <p className="font-mono-num text-xs text-slate-500 mb-3">
              ≈ {previewOut} {side === 'BUY' ? activePairObj.base : activePairObj.quote}
            </p>

            {/* Allocation pills */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercent(pct)}
                  className="py-2 rounded-full border border-slate-200 dark:border-[#2A2F3D] hover:border-[#00A878] text-xs font-semibold cursor-pointer"
                >
                  {pct}%
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handlePlaceOrder}
              className={`w-full min-h-[46px] rounded-full text-white font-semibold text-sm transition-colors cursor-pointer ${
                side === 'BUY' ? 'bg-[#00A878] hover:bg-[#059669]' : 'bg-[#FF444F] hover:bg-[#E63946]'
              }`}
            >
              {submitting ? 'Processing...' : side === 'BUY' ? 'Buy' : 'Sell'}
            </button>

            <button
              type="button"
              onClick={() => setAdvancedOpen(true)}
              className="w-full mt-4 pt-3 border-t border-slate-100 dark:border-[#2A2F3D] flex items-center justify-between text-left cursor-pointer group"
            >
              <div>
                <p className="text-sm font-semibold">Advanced mode</p>
                <p className="text-xs text-slate-500">Limit orders, order book, charts</p>
              </div>
              <span className="w-6 h-6 rounded-full bg-[#0E1117] dark:bg-white text-white dark:text-[#0E1117] flex items-center justify-center">
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </button>
          </div>

          {/* 50x Leverage Promo Banner */}
          <div className="mt-5 rounded-2xl bg-gradient-to-r from-[#2A0E12] via-[#1B1318] to-[#151820] text-white p-5 border border-[#3A1E24]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded bg-[#FF444F] text-[10px] font-bold">DXN</span>
              <h3 className="font-display text-sm font-bold">Trade bigger, hold longer</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Open positions worth up to 50x your balance, long or short. Hold as long as you like — no expiry.
            </p>
          </div>
        </section>

        {/* Markets Table */}
        <section className="lg:col-span-7 pb-6">
          <h2 className="font-display text-lg font-bold mb-3.5">Markets</h2>

          <div className="relative mb-3.5">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 38 pairs"
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] text-sm outline-none focus:border-[#FF444F]"
            />
          </div>

          <div className="flex items-center gap-2 mb-4">
            {(['trending', 'gainers', 'losers'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize border cursor-pointer ${
                  filter === f
                    ? 'border-[#0E1117] dark:border-white bg-white dark:bg-[#181C25]'
                    : 'border-slate-200 dark:border-[#2A2F3D] text-slate-500'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] divide-y divide-slate-100 dark:divide-[#2A2F3D]">
            <div className="grid grid-cols-12 px-4 py-2.5 text-[11px] font-medium text-slate-400">
              <div className="col-span-5">Coin</div>
              <div className="col-span-4 text-center">24H chart</div>
              <div className="col-span-3 text-right">24H price</div>
            </div>

            {pairs.slice(0, 15).map((p) => {
              const pos = p.change24h >= 0;
              return (
                <button
                  key={p.pair}
                  type="button"
                  onClick={() => setSelectedPair(p.pair)}
                  className="w-full grid grid-cols-12 items-center px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 text-left transition-colors cursor-pointer"
                >
                  <div className="col-span-5 flex items-center gap-3 min-w-0">
                    <span
                      className="w-8 h-8 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.base.slice(0, 3)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{p.pair}</p>
                      <p className="text-[11px] text-slate-500">Vol {p.volume24hM.toFixed(2)}M</p>
                    </div>
                  </div>

                  <div className="col-span-4 flex justify-center">
                    <SparklineSvg data={p.sparkline} positive={pos} width={100} height={30} />
                  </div>

                  <div className="col-span-3 text-right">
                    <p className="font-mono-num text-sm font-bold">
                      {p.price < 0.001 ? p.price.toFixed(8) : p.price < 1 ? p.price.toFixed(4) : p.price.toFixed(2)}
                    </p>
                    <p className={`font-mono-num text-xs font-semibold ${pos ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                      {pos ? '+' : ''}
                      {p.change24h.toFixed(2)}%
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Advanced Mode Modal (Limit Order + Order Book) */}
      {advancedOpen && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-[#181C25] rounded-3xl p-6 border border-slate-200 dark:border-[#2A2F3D]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-bold">{activePairObj.pair} Advanced Terminal</h3>
                <p className="text-xs text-slate-500">Live Order Book & Limit Execution</p>
              </div>
              <button
                type="button"
                onClick={() => setAdvancedOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Order Book */}
              <div className="bg-[#F4F5F7] dark:bg-[#111319] rounded-2xl p-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">Order Book ({activePairObj.pair})</p>
                <div className="space-y-1 text-xs font-mono-num">
                  {[1.004, 1.003, 1.002, 1.001].map((mult, i) => (
                    <div key={i} className="flex justify-between text-[#FF444F]">
                      <span>{(activePairObj.price * mult).toFixed(5)}</span>
                      <span>{(12.4 * (i + 1)).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="py-1.5 text-center font-bold border-y border-slate-200 dark:border-[#2A2F3D]">
                    {activePairObj.price}
                  </div>
                  {[0.999, 0.998, 0.997, 0.996].map((mult, i) => (
                    <div key={i} className="flex justify-between text-[#00A878]">
                      <span>{(activePairObj.price * mult).toFixed(5)}</span>
                      <span>{(15.1 * (i + 1)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Limit Order Form */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderType('market')}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                      orderType === 'market' ? 'bg-[#151820] text-white' : 'bg-[#F4F5F7] dark:bg-[#111319]'
                    }`}
                  >
                    Market
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderType('limit');
                      setLimitPrice(String(activePairObj.price));
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                      orderType === 'limit' ? 'bg-[#151820] text-white' : 'bg-[#F4F5F7] dark:bg-[#111319]'
                    }`}
                  >
                    Limit
                  </button>
                </div>

                {orderType === 'limit' && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Limit Price</label>
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
                  <label className="block text-xs text-slate-500 mb-1">Order Amount ({activePairObj.quote})</label>
                  <input
                    type="number"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="50"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  className={`w-full py-3 rounded-full text-white text-sm font-semibold cursor-pointer ${
                    side === 'BUY' ? 'bg-[#00A878]' : 'bg-[#FF444F]'
                  }`}
                >
                  Place {orderType.toUpperCase()} {side}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
