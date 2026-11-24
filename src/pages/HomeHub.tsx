import React, { useState } from 'react';
import {
  Plus,
  ArrowLeftRight,
  X,
  Bot,
  Activity,
  Zap,
  Calculator,
  CandlestickChart,
  Shield,
  Wallet,
  Sliders,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getCanonicalBalances } from '../lib/balances';
import {
  Mt5Badge,
  CTraderBadge,
  OptionsSquareBadge,
  TradingViewBadge,
  MoreDotsBadge,
  CrashBoomGraphic,
  AiAnalysisGraphic,
} from '../components/DerivBadges';
import { DepositSheet, TransferScreen } from '../components/CashierFlows';

const PROMO_SLIDES = [
  {
    title: 'New Crash/Boom trades',
    desc: 'Trade the spikes with Rise/Fall. Now in demo.',
    symbol: 'BOOM1000',
    tab: 'mt5-tv' as const,
    kind: 'crash' as const,
  },
  {
    title: 'AI market analysis',
    desc: 'Get AI-powered insights on Gold, BTC, Silver, ETH, and more.',
    symbol: 'frxXAUUSD',
    tab: 'market-analyser' as const,
    kind: 'ai' as const,
  },
  {
    title: 'Accumulators Live',
    desc: 'Compound up to 5% per tick with instant take profit.',
    symbol: '1HZ100V',
    tab: 'mt5-tv' as const,
    kind: 'crash' as const,
  },
  {
    title: 'Zero Spread CFDs',
    desc: 'Institutional execution across Forex, Gold & US Indices.',
    symbol: 'frxXAUUSD',
    tab: 'cfds' as const,
    kind: 'ai' as const,
  },
];

export const HomeHub: React.FC = () => {
  const {
    user,
    accounts,
    setActiveTab,
    setSelectedSymbol,
    hideBalances,
    currencyDisplay,
    kesRate,
    publicSettings,
  } = useApp();

  const appName = publicSettings.branding?.appName || 'DERIV';
  const [promoDismissed, setPromoDismissed] = useState(false);
  const [promoIdx, setPromoIdx] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  // Home balance & trading accounts ALWAYS display Real accounts separated from Demo
  const {
    mt5StdBal,
    mt5GoldBal,
    totalPortfolioUsd,
  } = getCanonicalBalances(user, accounts, 'real', null);

  const renderSplitMoney = (usdAmount: number, size: 'hero' | 'card' = 'card') => {
    if (hideBalances) {
      return (
        <span
          className={`font-mono-num font-bold tracking-widest ${
            size === 'hero' ? 'text-[22px] sm:text-[26px] text-white' : 'text-[14px] text-[#111319] dark:text-white'
          }`}
        >
          *****
        </span>
      );
    }
    const isKsh = currencyDisplay === 'KSH';
    const val = isKsh ? usdAmount * kesRate : usdAmount;
    const formatted = val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const unit = isKsh ? 'KSH' : 'USD';

    if (size === 'hero') {
      return (
        <span className="font-display text-[26px] sm:text-[30px] font-bold tracking-tight tabular-nums text-white">
          {formatted} {unit}
        </span>
      );
    }

    return (
      <span className="inline-flex items-baseline gap-1 tabular-nums">
        <span className="text-[16px] font-bold text-[#111319] dark:text-white">{formatted}</span>
        <span className="text-[11px] font-normal text-[#6B7280] dark:text-[#8E95A2]">{unit}</span>
      </span>
    );
  };

  const cfdRealAccounts = accounts.filter(
    (a) => (a.platform?.includes('mt5') || a.platform === 'ctrader') && !a.is_virtual
  );

  const accountCards =
    cfdRealAccounts.length >= 2
      ? cfdRealAccounts.map((acc, idx) => {
          const t = String(acc.account_type || 'CFDs | Standard');
          const lower = t.toLowerCase();
          const isCTrader = acc.platform === 'ctrader' || lower.includes('ctrader');
          const isSwf = lower.includes('swap');
          const isGold = lower.includes('gold');
          const variant: 'STD' | 'SWF' | 'GOLD' | 'CT' = isCTrader
            ? 'CT'
            : isSwf
              ? 'SWF'
              : isGold
                ? 'GOLD'
                : 'STD';
          return {
            key: `${acc.id}-${idx}`,
            title: t,
            bal: Number(acc.balance || 0),
            variant,
            tab: 'cfds' as const,
          };
        })
      : [
          { key: 'std2', title: 'CFDs | Standard 2', bal: 0, variant: 'STD' as const, tab: 'cfds' as const },
          { key: 'std3', title: 'CFDs | Standard 3', bal: mt5StdBal, variant: 'STD' as const, tab: 'cfds' as const },
          { key: 'swf', title: 'Swap-Free', bal: mt5GoldBal, variant: 'SWF' as const, tab: 'cfds' as const },
          { key: 'ct', title: 'cTrader', bal: 0, variant: 'CT' as const, tab: 'cfds' as const },
        ];

  const activePromo = PROMO_SLIDES[promoIdx] || PROMO_SLIDES[0];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Upper Dark Hero Block matching Screenshots 105127 & 105252 */}
      <section className="bg-[#171A21] text-white px-4 sm:px-8 pt-2 pb-6 rounded-b-[24px] lg:rounded-3xl lg:mx-6 lg:mt-4">
        <p className="text-[13px] text-[#9BA3B0]">Total value</p>
        <div className="mt-0.5">{renderSplitMoney(totalPortfolioUsd, 'hero')}</div>
        <p className="text-[12px] text-[#8E95A2] mt-0.5">Updated just now</p>

        <div className="grid grid-cols-2 max-w-md mx-auto lg:mx-0 lg:flex lg:items-center lg:gap-20 mt-6">
          <button
            type="button"
            onClick={() => setDepositOpen(true)}
            className="flex flex-col items-center gap-1.5 cursor-pointer group"
          >
            <span className="w-11 h-11 rounded-full bg-[#FF444F] group-hover:bg-[#E63946] text-white flex items-center justify-center transition-colors shadow-sm">
              <Plus className="w-5 h-5 stroke-[2.3]" />
            </span>
            <span className="text-[12px] font-medium text-white/95">Deposit</span>
          </button>

          <button
            type="button"
            onClick={() => setTransferOpen(true)}
            className="flex flex-col items-center gap-1.5 cursor-pointer group"
          >
            <span className="w-11 h-11 rounded-full border border-white/75 group-hover:bg-white/10 text-white flex items-center justify-center transition-colors">
              <ArrowLeftRight className="w-[18px] h-[18px]" />
            </span>
            <span className="text-[12px] font-medium text-white/95">Transfer</span>
          </button>
        </div>
      </section>

      {/* My trading accounts horizontal scroller (Real accounts only) */}
      <section className="px-4 sm:px-8 mt-6">
        <h2 className="font-display text-[17px] font-bold text-[#111319] dark:text-white mb-3">
          My trading accounts
        </h2>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 lg:grid lg:grid-cols-4">
          {accountCards.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setActiveTab(card.tab)}
              className="min-w-[164px] text-left p-3.5 rounded-2xl bg-[#F4F5F7] dark:bg-[#181B22] border border-slate-200/80 dark:border-white/[0.06] hover:border-[#FF444F]/50 transition-colors cursor-pointer shrink-0"
            >
              <div className="mb-3">
                {card.variant === 'CT' ? <CTraderBadge /> : <Mt5Badge variant={card.variant} />}
              </div>
              <p className="text-[13px] font-medium text-[#374151] dark:text-[#E2E6ED] truncate">{card.title}</p>
              <div className="mt-1">{renderSplitMoney(card.bal, 'card')}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Promo Carousel matching 105127 & 105252 */}
      {!promoDismissed && (
        <section className="px-4 sm:px-8 mt-5">
          <div className="bg-[#181B22] text-white rounded-2xl p-4 border border-white/[0.06] relative flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedSymbol(activePromo.symbol);
                setActiveTab(activePromo.tab);
              }}
              className="flex-1 text-left flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="min-w-0 pr-2">
                <h3 className="font-display text-[15px] font-bold text-white leading-snug">{activePromo.title}</h3>
                <p className="text-[12px] text-[#9BA3B0] mt-0.5 leading-snug">{activePromo.desc}</p>
              </div>
              {activePromo.kind === 'ai' ? <AiAnalysisGraphic /> : <CrashBoomGraphic />}
            </button>

            <button
              type="button"
              onClick={() => setPromoDismissed(true)}
              aria-label="Dismiss promo"
              className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-[#2B303D] hover:bg-[#383E4F] text-white/80 flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 4-dot carousel pagination */}
          <div className="flex items-center justify-center gap-1.5 mt-2.5">
            {PROMO_SLIDES.map((s, idx) => (
              <button
                key={s.title}
                type="button"
                aria-label={`Promo slide ${idx + 1}`}
                onClick={() => setPromoIdx(idx)}
                className={`h-1 rounded-full transition-all cursor-pointer ${
                  promoIdx === idx ? 'w-5 bg-[#111319] dark:bg-white' : 'w-1.5 bg-[#D1D5DB] dark:bg-white/25'
                }`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Explore Deriv 3x2 Circular Icon Grid matching Screenshots */}
      <section className="px-4 sm:px-8 mt-6">
        <h2 className="font-display text-[17px] font-bold text-[#111319] dark:text-white mb-4">
          Explore {appName === 'DERIV' ? 'Deriv' : appName}
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-y-5 gap-x-4">
          {[
            {
              label: 'CFDs | Standard',
              badge: <Mt5Badge variant="STD" size="sm" />,
              action: () => setActiveTab('cfds'),
            },
            {
              label: 'Options',
              badge: <OptionsSquareBadge size="sm" />,
              action: () => setActiveTab('options'),
            },
            {
              label: 'TradingView',
              badge: <TradingViewBadge />,
              action: () => setActiveTab('mt5-tv'),
            },
            {
              label: 'Swap-Free',
              badge: <Mt5Badge variant="SWF" size="sm" />,
              action: () => setActiveTab('cfds'),
            },
            {
              label: 'Gold',
              badge: <Mt5Badge variant="GOLD" size="sm" />,
              action: () => {
                setSelectedSymbol('frxXAUUSD');
                setActiveTab('mt5-tv');
              },
            },
            {
              label: 'More',
              badge: <MoreDotsBadge />,
              action: () => setMoreOpen(true),
            },
          ].map((tile) => (
            <button
              key={tile.label}
              type="button"
              onClick={tile.action}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-[58px] h-[58px] rounded-full bg-[#F4F5F7] dark:bg-[#181B22] border border-slate-200/80 dark:border-white/[0.06] flex items-center justify-center group-hover:border-[#FF444F]/60 transition-colors">
                {tile.badge}
              </div>
              <span className="text-[12px] font-medium text-[#374151] dark:text-[#C7CDD6] text-center whitespace-nowrap">
                {tile.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Highlights horizontal graphic cards */}
      <section className="px-4 sm:px-8 mt-7 pb-6">
        <h2 className="font-display text-[17px] font-bold text-[#111319] dark:text-white mb-3">Highlights</h2>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 lg:grid lg:grid-cols-3">
          {/* Card 1: Metals */}
          <button
            type="button"
            onClick={() => {
              setSelectedSymbol('frxXAUUSD');
              setActiveTab('mt5-tv');
            }}
            className="min-w-[168px] text-left rounded-2xl bg-[#F4F5F7] dark:bg-[#181B22] border border-slate-200/80 dark:border-white/[0.06] overflow-hidden hover:border-[#FF444F]/50 transition-colors cursor-pointer shrink-0 flex flex-col"
          >
            <div className="h-28 w-full bg-[#090B0E] relative overflow-hidden flex items-center justify-center">
              <svg viewBox="0 0 180 100" className="w-full h-full" aria-hidden="true">
                <polygon points="88,76 96,95 80,95" fill="#FF444F" />
                <line x1="20" y1="84" x2="162" y2="54" stroke="#64748B" strokeWidth="4" strokeLinecap="round" />
                <rect x="24" y="68" width="24" height="10" rx="2" transform="rotate(-12 24 68)" fill="#EAB308" />
                <rect x="108" y="49" width="26" height="10" rx="2" transform="rotate(-12 108 49)" fill="#FACC15" />
                <rect x="136" y="43" width="24" height="10" rx="2" transform="rotate(-12 136 43)" fill="#EAB308" />
                <rect x="115" y="38" width="24" height="10" rx="2" transform="rotate(-12 115 38)" fill="#CBD5E1" />
                <rect x="140" y="33" width="22" height="10" rx="2" transform="rotate(-12 140 33)" fill="#FACC15" />
              </svg>
            </div>
            <div className="p-3.5">
              <h3 className="font-display text-[15px] font-bold text-[#111319] dark:text-white">Metals</h3>
              <p className="text-[12px] text-[#525866] dark:text-[#9BA3B0] mt-1 leading-snug line-clamp-2">
                Key metals. Tight spreads. Up to 1:1000 leverage.
              </p>
            </div>
          </button>

          {/* Card 2: US Indices */}
          <button
            type="button"
            onClick={() => {
              setSelectedSymbol('1HZ100V');
              setActiveTab('mt5-tv');
            }}
            className="min-w-[168px] text-left rounded-2xl bg-[#F4F5F7] dark:bg-[#181B22] border border-slate-200/80 dark:border-white/[0.06] overflow-hidden hover:border-[#FF444F]/50 transition-colors cursor-pointer shrink-0 flex flex-col"
          >
            <div className="h-28 w-full bg-[#0E1320] relative overflow-hidden p-2.5 flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-[#1D2D50] via-[#7F1D1D]/55 to-[#090B0E]" />
              <div className="relative z-10 flex items-center gap-1.5 -rotate-6">
                <div className="bg-white text-[#111319] px-2 py-2 rounded-lg shadow-md text-center">
                  <p className="text-[9px] font-bold leading-none">US Tech</p>
                  <p className="text-[7px] text-slate-500 mt-0.5">100</p>
                </div>
                <div className="bg-white text-[#111319] px-2 py-2 rounded-lg shadow-md text-center translate-y-2">
                  <p className="text-[9px] font-bold leading-none">US SP</p>
                  <p className="text-[7px] text-slate-500 mt-0.5">500</p>
                </div>
                <div className="bg-white text-[#111319] px-2 py-2 rounded-lg shadow-md text-center translate-y-4">
                  <p className="text-[9px] font-bold leading-none">Mid Cap</p>
                  <p className="text-[7px] text-slate-500 mt-0.5">400</p>
                </div>
              </div>
            </div>
            <div className="p-3.5">
              <h3 className="font-display text-[15px] font-bold text-[#111319] dark:text-white">US Indices</h3>
              <p className="text-[12px] text-[#525866] dark:text-[#9BA3B0] mt-1 leading-snug line-clamp-2">
                1:400 leverage and record-low spreads on America&apos;s top indices.
              </p>
            </div>
          </button>

          {/* Card 3: Zero Spread */}
          <button
            type="button"
            onClick={() => setActiveTab('cfds')}
            className="min-w-[168px] text-left rounded-2xl bg-[#F4F5F7] dark:bg-[#181B22] border border-slate-200/80 dark:border-white/[0.06] overflow-hidden hover:border-[#FF444F]/50 transition-colors cursor-pointer shrink-0 flex flex-col"
          >
            <div className="h-28 w-full bg-[#090B0E] relative overflow-hidden flex items-center justify-center">
              <svg viewBox="0 0 180 100" className="w-full h-full" aria-hidden="true">
                <ellipse cx="90" cy="50" rx="74" ry="30" fill="none" stroke="#B91C1C" strokeWidth="1.2" opacity="0.6" />
                <ellipse cx="90" cy="50" rx="54" ry="22" fill="none" stroke="#FF444F" strokeWidth="1.4" opacity="0.8" />
                <ellipse cx="90" cy="50" rx="34" ry="14" fill="none" stroke="#FF444F" strokeWidth="1.5" />
                <circle cx="90" cy="50" r="20" fill="#FFFFFF" />
                <text x="90" y="56" textAnchor="middle" fill="#0E1117" fontSize="18" fontWeight="800">
                  0
                </text>
              </svg>
            </div>
            <div className="p-3.5">
              <h3 className="font-display text-[15px] font-bold text-[#111319] dark:text-white">Zero Spread</h3>
              <p className="text-[12px] text-[#525866] dark:text-[#9BA3B0] mt-1 leading-snug line-clamp-2">
                Keep more profits with tight zero-pip spreads.
              </p>
            </div>
          </button>
        </div>
      </section>

      {/* More Tools Bottom Sheet / Modal */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-[#181B22] text-[#111319] dark:text-white rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-white/10">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg font-bold">All Platforms &amp; Tools</h3>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'mt5-tv', label: 'Deriv Trader', icon: CandlestickChart },
                { id: 'bot-builder', label: 'Deriv Bot', icon: Bot },
                { id: 'smart-trader', label: 'SmartTrader', icon: Sliders },
                { id: 'market-analyser', label: 'Ask Amy Analyser', icon: Activity },
                { id: 'cfds', label: 'MT5 CFDs Hub', icon: Shield },
                { id: 'portfolio', label: 'Portfolio & Cashier', icon: Wallet },
                { id: 'trading-bots', label: 'Strategy Lab', icon: Bot },
                { id: 'bulk-trader', label: 'Bulk Trader', icon: Zap },
                { id: 'risk-calc', label: 'Risk Centre', icon: Calculator },
              ].map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      setActiveTab(tool.id as any);
                    }}
                    className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#F4F5F7] dark:bg-[#1D212A] hover:border-[#FF444F] border border-transparent text-left cursor-pointer"
                  >
                    <Icon className="w-5 h-5 text-[#FF444F] shrink-0" />
                    <span className="text-sm font-semibold">{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
      <TransferScreen
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onOpenDeposit={() => setDepositOpen(true)}
      />
    </div>
  );
};
