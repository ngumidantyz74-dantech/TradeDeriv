import React, { useState, useEffect, useRef } from 'react';
import {
  CandlestickChart,
  RotateCcw,
  ArrowRight,
  ArrowLeftRight,
  TrendingUp,
  ArrowUpDown,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { getCanonicalBalances } from '../lib/balances';
import { SparklineSvg } from '../components/SparklineSvg';
import { SynthCandleBadge, AccumulatorCoinGraphic, TradeOnGoldGraphic } from '../components/DerivBadges';
import { DepositSheet, TransferScreen } from '../components/CashierFlows';

const MOST_TRADED_SPECS = [
  { symbol: '1HZ100V', num: '100', name: 'Volatility 100 (1s) Index', fallbackPrice: 1724.8 },
  { symbol: '1HZ10V', num: '10', name: 'Volatility 10 (1s) Index', fallbackPrice: 9715.62 },
  { symbol: '1HZ25V', num: '25', name: 'Volatility 25 (1s) Index', fallbackPrice: 901126.62 },
  { symbol: '1HZ15V', num: '15', name: 'Volatility 15 (1s) Index', fallbackPrice: 14410.93 },
  { symbol: '1HZ75V', num: '75', name: 'Volatility 75 (1s) Index', fallbackPrice: 3522.55 },
];

export const OptionsHub: React.FC = () => {
  const {
    user,
    accounts,
    accountMode,
    setAccountMode,
    hideBalances,
    currencyDisplay,
    kesRate,
    instruments,
    ticks,
    refreshAll,
    setActiveTab,
    setSelectedSymbol,
    setTradePreset,
    showToast,
  } = useApp();

  const [tradeFilter, setTradeFilter] = useState<'Deriv Trader' | 'Deriv Bot' | 'SmartTrader'>('Deriv Trader');
  const [resetting, setResetting] = useState(false);
  const [featuredSlide, setFeaturedSlide] = useState<0 | 1>(0);
  const [transferOpen, setTransferOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const sparkHistoryRef = useRef<Record<string, number[]>>({});

  useEffect(() => {
    for (const spec of MOST_TRADED_SPECS) {
      const q = ticks[spec.symbol]?.quote;
      if (!q || !Number.isFinite(q)) continue;
      const buf = sparkHistoryRef.current[spec.symbol] || [];
      if (buf[buf.length - 1] !== q) {
        sparkHistoryRef.current[spec.symbol] = [...buf.slice(-22), q];
      }
    }
  }, [ticks]);

  const { optionsBal: totalValue } = getCanonicalBalances(user, accounts, accountMode, null);

  const renderHeroBalance = () => {
    if (hideBalances) return <span className="font-mono-num text-[22px] sm:text-[26px] font-bold tracking-widest text-white">*****</span>;
    const isKsh = currencyDisplay === 'KSH';
    const val = isKsh ? totalValue * kesRate : totalValue;
    const formatted = val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (
      <span className="font-display text-[26px] sm:text-[30px] font-bold tracking-tight tabular-nums text-white">
        {formatted} {isKsh ? 'KSH' : 'USD'}
      </span>
    );
  };

  const handleResetBalance = async () => {
    if (accountMode !== 'demo') return;
    setResetting(true);
    try {
      await apiFetch('/api/orders/reset-balance', {
        method: 'POST',
        body: JSON.stringify({ accountMode: 'demo' }),
      });
      await refreshAll();
      showToast('Demo balance reset to $10,000.00 USD', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reset failed', 'error');
    } finally {
      setResetting(false);
    }
  };

  const featuredMarkets = MOST_TRADED_SPECS.map((spec) => {
    const inst = instruments.find((i) => i.symbol === spec.symbol);
    const live = ticks[spec.symbol];
    const price = live?.quote ?? inst?.price ?? spec.fallbackPrice;
    const baseSpark =
      sparkHistoryRef.current[spec.symbol]?.length >= 3
        ? sparkHistoryRef.current[spec.symbol]
        : inst?.sparkline?.length
          ? [...inst.sparkline, price]
          : [price * 0.9985, price * 0.9992, price * 0.9998, price];
    const first = baseSpark[0] || price;
    const livePct = first > 0 ? Number((((price - first) / first) * 100).toFixed(2)) : inst?.change_pct ?? 0.05;
    return {
      symbol: spec.symbol,
      num: spec.num,
      name: inst?.display_name || spec.name,
      price,
      changePct: livePct,
      sparkline: baseSpark,
    };
  });

  const tradeTypes = [
    { name: 'Accumulators', contractType: 'ACCU', tab: 'mt5-tv' },
    { name: 'Multipliers', contractType: 'MULTUP', tab: 'mt5-tv' },
    { name: 'Rise/Fall', contractType: 'CALL', tab: 'smart-trader' },
    { name: 'Higher/Lower', contractType: 'CALLE', tab: 'smart-trader' },
    { name: 'Over/Under', contractType: 'DIGITOVER', tab: 'smart-trader' },
    { name: 'Even/Odd', contractType: 'DIGITEVEN', tab: 'smart-trader' },
    { name: 'Matches/Differs', contractType: 'DIGITDIFF', tab: 'smart-trader' },
    { name: 'Touch/No Touch', contractType: 'ONETOUCH', tab: 'smart-trader' },
    { name: 'Vanillas', contractType: 'CALL', tab: 'mt5-tv' },
    { name: 'Turbos', contractType: 'MULTUP', tab: 'mt5-tv' },
  ];

  const handleLaunchTradeType = (tt: (typeof tradeTypes)[number]) => {
    setTradePreset({
      symbol: '1HZ100V',
      contractType: tt.contractType,
      growthRate: tt.contractType === 'ACCU' ? 0.02 : undefined,
    });
    if (tradeFilter === 'Deriv Bot') {
      setActiveTab('bot-builder');
    } else if (tradeFilter === 'SmartTrader') {
      setActiveTab('smart-trader');
    } else {
      setActiveTab(tt.contractType === 'ACCU' || tt.contractType === 'MULTUP' ? 'mt5-tv' : (tt.tab as any));
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Upper Dark Hero Block matching 105336 (Real) & Demo */}
      <section className="bg-[#171A21] text-white px-4 sm:px-8 pt-2 pb-6 rounded-b-[24px] lg:rounded-3xl lg:mx-6 lg:mt-4">
        <div className="hidden lg:flex items-center mb-4">
          <div className="inline-flex items-center bg-[#232732] p-1 rounded-full">
            <button
              type="button"
              onClick={() => setAccountMode('real')}
              className={`px-5 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                accountMode === 'real' ? 'bg-[#383D4A] text-white' : 'text-[#8E95A2]'
              }`}
            >
              Real
            </button>
            <button
              type="button"
              onClick={() => setAccountMode('demo')}
              className={`px-5 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                accountMode === 'demo' ? 'bg-[#383D4A] text-white' : 'text-[#8E95A2]'
              }`}
            >
              Demo
            </button>
          </div>
        </div>

        <p className="text-[13px] text-[#9BA3B0]">Balance</p>
        <div className="mt-0.5">{renderHeroBalance()}</div>
        <p className="text-[12px] text-[#8E95A2] mt-0.5">Updated just now</p>

        <div className="grid grid-cols-2 max-w-md mx-auto lg:mx-0 lg:flex lg:items-center lg:gap-20 mt-6">
          <button
            type="button"
            onClick={() => setActiveTab('mt5-tv')}
            className="flex flex-col items-center gap-1.5 cursor-pointer group"
          >
            <span className="w-11 h-11 rounded-full bg-[#FF444F] group-hover:bg-[#E63946] flex items-center justify-center transition-colors">
              <CandlestickChart className="w-5 h-5 text-white" />
            </span>
            <span className="text-[12px] font-medium text-white/95">Trade</span>
          </button>

          {accountMode === 'demo' ? (
            <button
              type="button"
              disabled={resetting}
              onClick={handleResetBalance}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-11 h-11 rounded-full border border-white/75 group-hover:bg-white/10 flex items-center justify-center transition-colors">
                <RotateCcw className={`w-[18px] h-[18px] text-white ${resetting ? 'animate-spin' : ''}`} />
              </span>
              <span className="text-[12px] font-medium text-white/95">Reset balance</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setTransferOpen(true)}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-11 h-11 rounded-full border border-white/75 group-hover:bg-white/10 flex items-center justify-center transition-colors">
                <ArrowLeftRight className="w-[18px] h-[18px] text-white" />
              </span>
              <span className="text-[12px] font-medium text-white/95">Transfer</span>
            </button>
          )}
        </div>
      </section>

      {/* Most traded markets 2-col grid matching 105336 */}
      <section className="px-4 sm:px-8 mt-6">
        <h2 className="font-display text-[17px] font-bold text-white mb-3">Most traded markets</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {featuredMarkets.map((m) => {
            const pos = m.changePct >= 0;
            return (
              <button
                key={m.symbol}
                type="button"
                onClick={() => {
                  setSelectedSymbol(m.symbol);
                  setActiveTab('mt5-tv');
                }}
                className="text-left p-3.5 rounded-2xl bg-[#181B22] border border-white/[0.06] hover:border-[#FF444F]/50 transition-colors cursor-pointer"
              >
                <div className="mb-2">
                  <SynthCandleBadge num={m.num} />
                </div>
                <p className="text-[12px] font-medium text-[#C7CDD6] truncate">{m.name}</p>
                <p className="font-mono-num text-[17px] font-bold text-white mt-0.5 tabular-nums">
                  {m.price.toFixed(2)}
                </p>
                <div className="mt-2.5 flex items-center justify-between gap-1.5">
                  <SparklineSvg data={m.sparkline} positive={pos} width={76} height={24} />
                  <span className="text-[11px] font-semibold whitespace-nowrap tabular-nums">
                    <span className={pos ? 'text-[#17B978]' : 'text-[#FF444F]'}>
                      {m.changePct.toFixed(2)}%
                    </span>{' '}
                    <span className="text-[#8E95A2] font-normal">(5m)</span>
                  </span>
                </div>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setActiveTab('mt5-tv')}
            className="p-4 rounded-2xl bg-[#181B22] border border-white/[0.06] hover:border-[#FF444F]/50 flex flex-col items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowRight className="w-5 h-5 text-white" />
            <span className="text-sm font-medium text-white">View all</span>
          </button>
        </div>
      </section>

      {/* Featured Stacked Carousel matching Screenshot 105341 (Trade on Gold + Accumulators) */}
      <section className="px-4 sm:px-8 mt-6">
        <h2 className="font-display text-[17px] font-bold text-white mb-3">Featured</h2>
        <div className="max-w-md mx-auto lg:mx-0 lg:max-w-xl">
          <div className="mx-3 h-2 rounded-t-2xl bg-[#1E222B] border-t border-x border-white/[0.08]" />
          <div className="rounded-2xl overflow-hidden bg-[#181B22] border border-white/[0.08]">
            <div className="p-3.5 pb-0">
              <div className="rounded-xl overflow-hidden">
                {featuredSlide === 0 ? <TradeOnGoldGraphic /> : <AccumulatorCoinGraphic />}
              </div>
            </div>

            <div className="p-4">
              <h3 className="font-display text-[17px] font-bold text-white">
                {featuredSlide === 0 ? 'Trade on Gold' : 'Accumulators'}
              </h3>
              <p className="text-[13px] text-[#9BA3B0] mt-1 leading-snug">
                {featuredSlide === 0
                  ? "Predict whether gold prices will rise or fall. Trade one of the world's most popular commodities, available 24/5."
                  : 'Grow your stake up to 5% per tick with instant stop & take profit.'}
              </p>

              <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-[#272B36] text-[10px] font-medium text-[#C7CDD6]">
                    {featuredSlide === 0 ? '24/5 trading' : 'Up to 5%/tick'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#272B36] text-[10px] font-medium text-[#C7CDD6]">
                    From 1 USD
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (featuredSlide === 0) {
                      setSelectedSymbol('frxXAUUSD');
                      setTradePreset({ symbol: 'frxXAUUSD', contractType: 'CALL' });
                    } else {
                      setTradePreset({ symbol: '1HZ100V', contractType: 'ACCU', growthRate: 0.02 });
                    }
                    setActiveTab('mt5-tv');
                  }}
                  className="px-4 py-1.5 rounded-full border border-white/75 hover:bg-white/10 text-xs font-semibold text-white cursor-pointer"
                >
                  Trade now
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-3">
            {([0, 1] as const).map((idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Featured option ${idx + 1}`}
                onClick={() => setFeaturedSlide(idx)}
                className={`w-1.5 h-1.5 rounded-full cursor-pointer ${
                  featuredSlide === idx ? 'bg-white' : 'bg-white/25'
                }`}
              />
            ))}
          </div>

          {/* Learn more card matching Screenshot 105341 */}
          <button
            type="button"
            onClick={() => setActiveTab('learning-hub')}
            className="w-full mt-5 p-4 rounded-2xl bg-[#13151B] border border-white/[0.1] hover:border-white/25 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
          >
            <span className="text-[13px] font-medium text-[#E2E6ED]">
              Learn more about Options trading and other trade types.
            </span>
            <span className="w-8 h-8 rounded-full border border-white/60 flex items-center justify-center shrink-0">
              <ArrowRight className="w-4 h-4 text-white" />
            </span>
          </button>
        </div>
      </section>

      {/* Platforms Stack (Deriv Trader DT, Deriv Bot DB, SmartTrader ST) */}
      <section className="px-4 sm:px-8 mt-7">
        <h2 className="font-display text-[17px] font-bold text-white mb-3">Platforms</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              code: 'DT',
              title: 'Deriv Trader',
              desc: 'Accumulators, Multipliers & Options on live charts.',
              color: 'bg-[#FF444F]',
              tab: 'mt5-tv',
            },
            {
              code: 'DB',
              title: 'Deriv Bot',
              desc: 'Quick strategy bots, XML builder & Analyser auto-sync.',
              color: 'bg-[#FF444F]',
              tab: 'bot-builder',
            },
            {
              code: 'ST',
              title: 'SmartTrader',
              desc: 'Rise/Fall, Higher/Lower, Over/Under, Even/Odd & Digits.',
              color: 'bg-[#2C3A67]',
              tab: 'smart-trader',
            },
          ].map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => setActiveTab(p.tab as any)}
              className="flex items-center gap-3.5 p-4 rounded-2xl bg-[#181B22] border border-white/[0.06] hover:border-[#FF444F]/50 text-left cursor-pointer"
            >
              <span
                className={`w-11 h-11 rounded-xl ${p.color} text-white font-display font-bold text-sm flex items-center justify-center shrink-0`}
              >
                {p.code}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-[14px] font-bold text-white">{p.title}</h3>
                <p className="text-[12px] text-[#9BA3B0] mt-0.5">{p.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Trade types */}
      <section className="px-4 sm:px-8 mt-7 pb-6">
        <h2 className="font-display text-[17px] font-bold text-white mb-3">Trade types</h2>
        <div className="flex items-center gap-2 mb-3.5 overflow-x-auto no-scrollbar">
          {(['Deriv Trader', 'Deriv Bot', 'SmartTrader'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setTradeFilter(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                tradeFilter === tab
                  ? 'border-white bg-[#232732] text-white'
                  : 'border-white/15 text-[#8E95A2]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {tradeTypes.map((tt) => (
            <button
              key={tt.name}
              type="button"
              onClick={() => handleLaunchTradeType(tt)}
              className="p-3.5 rounded-2xl bg-[#181B22] border border-white/[0.06] hover:border-[#FF444F]/50 flex flex-col items-center justify-center gap-2 text-center cursor-pointer"
            >
              <div className="flex items-center gap-1 text-[#FF444F]">
                <TrendingUp className="w-4 h-4" />
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <span className="text-[11px] font-medium truncate max-w-full text-[#E2E6ED]">
                {tt.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
      <TransferScreen
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onOpenDeposit={() => setDepositOpen(true)}
      />
    </div>
  );
};
