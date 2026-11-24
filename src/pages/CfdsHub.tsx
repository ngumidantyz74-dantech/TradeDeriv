import React, { useState } from 'react';
import {
  CandlestickChart,
  X,
  Check,
  ArrowLeft,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  MoreHorizontal,
  Receipt,
  ArrowLeftRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { getCanonicalBalances } from '../lib/balances';
import { Mt5Badge, CTraderBadge } from '../components/DerivBadges';

interface SelectedCfdDetail {
  code: 'STD' | 'SWF' | 'GOLD' | 'FIN' | 'ZSP' | 'cT';
  title: string;
  balance: number;
  server: string;
  loginId: string;
  leverage: string;
  isDemo: boolean;
}

export const CfdsHub: React.FC = () => {
  const {
    user,
    accounts,
    accountMode,
    setAccountMode,
    hideBalances,
    setHideBalances,
    orders,
    currencyDisplay,
    kesRate,
    formatMoney,
    refreshAccounts,
    refreshAll,
    setActiveTab,
    setSelectedSymbol,
    showToast,
  } = useApp();

  const [compareOpen, setCompareOpen] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<SelectedCfdDetail | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [featuredSlide, setFeaturedSlide] = useState<0 | 1>(0);

  const cfdAccounts = accounts.filter(
    (a) =>
      (a.platform?.includes('mt5') || a.platform === 'ctrader') &&
      (accountMode === 'demo' ? Boolean(a.is_virtual) : !a.is_virtual)
  );
  const {
    mt5StdBal: stdWalletBal,
    mt5GoldBal: goldWalletBal,
    cfdsTotalBal: totalValue,
  } = getCanonicalBalances(user, accounts, accountMode, null);

  const renderSplitMoney = (usdAmount: number, hero = false) => {
    if (hideBalances) {
      return <span className="font-mono-num font-bold text-slate-900 dark:text-white">••••••</span>;
    }
    const isKsh = currencyDisplay === 'KSH';
    const val = isKsh ? usdAmount * kesRate : usdAmount;
    const formatted = val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const unit = isKsh ? 'KSH' : 'USD';
    if (hero) {
      return (
        <span className="font-display text-[26px] sm:text-[30px] font-bold tracking-tight tabular-nums text-white">
          {formatted} {unit}
        </span>
      );
    }
    return (
      <span className="inline-flex items-baseline gap-1 tabular-nums">
        <span className="text-[16px] font-bold text-slate-900 dark:text-white">{formatted}</span>
        <span className="text-[11px] font-normal text-slate-500 dark:text-[#8E95A2]">{unit}</span>
      </span>
    );
  };

  const handleActivate = async (accountType: string, platform = 'mt5') => {
    setActivating(accountType);
    try {
      await apiFetch('/api/account/create-trading-account', {
        method: 'POST',
        body: JSON.stringify({
          account_type: accountType,
          platform,
          is_virtual: accountMode === 'demo',
          currency: 'USD',
        }),
      });
      await refreshAccounts(false);
      showToast(`${accountType} (${accountMode}) account activated`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Activation failed', 'error');
    } finally {
      setActivating(null);
    }
  };

  const handleResetDemo = async () => {
    setResettingDemo(true);
    try {
      await apiFetch('/api/orders/reset-balance', {
        method: 'POST',
        body: JSON.stringify({ accountMode: 'demo' }),
      });
      await refreshAll();
      if (selectedDetail) {
        setSelectedDetail({ ...selectedDetail, balance: 10000 });
      }
      showToast('Demo balance reset successfully', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to reset demo balance', 'error');
    } finally {
      setResettingDemo(false);
    }
  };

  const openDetailForAccount = (
    name: string,
    code: SelectedCfdDetail['code'],
    balance: number,
    loginId: string
  ) => {
    setSelectedDetail({
      code,
      title: name,
      balance,
      server: accountMode === 'demo' ? 'Deriv-Demo' : 'Deriv-Server-02',
      loginId,
      leverage: code === 'GOLD' ? '1:500' : '1:1000',
      isDemo: accountMode === 'demo',
    });
  };

  if (selectedDetail) {
    const accountOrders = orders.slice(0, 12);
    return (
      <div className="min-h-[82vh] bg-[#0E0F13] text-white">
        <div className="max-w-3xl mx-auto px-5 pt-5 pb-12">
          <div className="flex items-center justify-between mb-8">
            <button
              type="button"
              onClick={() => setSelectedDetail(null)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center cursor-pointer"
              aria-label="Back to CFDs"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setHideBalances(!hideBalances)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center cursor-pointer"
              aria-label="Toggle balance visibility"
            >
              {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex flex-col items-center text-center pb-8 border-b border-white/10">
            <div className="mb-5">
              {selectedDetail.code === 'cT' ? (
                <CTraderBadge />
              ) : (
                <Mt5Badge variant={selectedDetail.code} size="lg" />
              )}
            </div>

            <p className="font-mono-num text-3xl sm:text-4xl font-bold">
              {formatMoney(selectedDetail.balance, { hideable: true })}
            </p>

            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-slate-300">{selectedDetail.title}</span>
              {selectedDetail.isDemo && (
                <span className="px-2 py-0.5 rounded border border-white/25 text-[10px] font-semibold text-slate-300">
                  Demo
                </span>
              )}
            </div>

            <div className="flex items-center justify-center gap-10 mt-8">
              {!selectedDetail.isDemo && (
                <button
                  type="button"
                  onClick={() => setActiveTab('portfolio')}
                  className="flex flex-col items-center gap-2 cursor-pointer"
                >
                  <span className="w-12 h-12 rounded-full bg-[#FF444F] hover:bg-[#E63946] flex items-center justify-center">
                    <Plus className="w-5 h-5 text-white" />
                  </span>
                  <span className="text-xs font-medium">Deposit</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveTab('mt5-tv')}
                className="flex flex-col items-center gap-2 cursor-pointer"
              >
                <span
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    selectedDetail.isDemo
                      ? 'bg-[#FF444F] hover:bg-[#E63946]'
                      : 'border border-white/30 hover:bg-white/10'
                  }`}
                >
                  <CandlestickChart className="w-5 h-5 text-white" />
                </span>
                <span className="text-xs font-medium">Trade</span>
              </button>

              {selectedDetail.isDemo && (
                <button
                  type="button"
                  disabled={resettingDemo}
                  onClick={handleResetDemo}
                  className="flex flex-col items-center gap-2 cursor-pointer"
                >
                  <span className="w-12 h-12 rounded-full border border-white/30 hover:bg-white/10 flex items-center justify-center">
                    <RotateCcw className={`w-5 h-5 text-white ${resettingDemo ? 'animate-spin' : ''}`} />
                  </span>
                  <span className="text-xs font-medium">Reset balance</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setDetailsModalOpen(true)}
                className="flex flex-col items-center gap-2 cursor-pointer"
              >
                <span className="w-12 h-12 rounded-full border border-white/30 hover:bg-white/10 flex items-center justify-center">
                  <MoreHorizontal className="w-5 h-5 text-white" />
                </span>
                <span className="text-xs font-medium">Details</span>
              </button>
            </div>
          </div>

          <div className="pt-10">
            {accountOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Receipt className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-slate-400 mb-3">Recent Transactions &amp; Orders</p>
                {accountOrders.map((o) => (
                  <div
                    key={o.id}
                    className="p-3.5 rounded-2xl bg-[#181B22] border border-white/10 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold">
                        {o.symbol} · {o.side}
                      </p>
                      <p className="text-slate-400 mt-0.5">
                        Stake ${Number(o.stake).toFixed(2)} · {o.status}
                      </p>
                    </div>
                    <span className={`font-mono-num font-bold ${Number(o.pnl) >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                      {Number(o.pnl) >= 0 ? '+' : ''}${Number(o.pnl || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {detailsModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[#181B22] rounded-3xl p-6 border border-white/10 text-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-bold">Account Details</h3>
                <button
                  type="button"
                  onClick={() => setDetailsModalOpen(false)}
                  className="p-2 rounded-full hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-white/10">
                  <span className="text-slate-400">Broker</span>
                  <span className="font-semibold">Deriv (SVG) Ltd</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/10">
                  <span className="text-slate-400">Server</span>
                  <span className="font-mono-num font-semibold">{selectedDetail.server}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/10">
                  <span className="text-slate-400">Login ID</span>
                  <span className="font-mono-num font-semibold">{selectedDetail.loginId}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">Max Leverage</span>
                  <span className="font-mono-num font-semibold">{selectedDetail.leverage}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailsModalOpen(false);
                  setActiveTab('mt5-tv');
                }}
                className="w-full mt-5 py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm cursor-pointer"
              >
                Open Web Terminal
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const displayedAccounts =
    cfdAccounts.length > 0
      ? cfdAccounts
      : accountMode === 'demo'
        ? [
            {
              id: 0,
              deriv_account_id: 'MT5-DEMO-STD',
              account_type: 'CFDs | Standard',
              balance: stdWalletBal,
            },
          ]
        : [
            {
              id: 0,
              deriv_account_id: 'MT5-REAL-STD2',
              account_type: 'CFDs | Standard 2',
              balance: 0,
            },
            {
              id: -1,
              deriv_account_id: 'MT5-REAL-STD3',
              account_type: 'CFDs | Standard 3',
              balance: stdWalletBal,
            },
            {
              id: -2,
              deriv_account_id: 'MT5-REAL-SWF',
              account_type: 'Swap-Free',
              balance: goldWalletBal,
            },
          ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Upper Dark Hero Block matching 102701 (Real) & 102820 (Demo) */}
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

        <p className="text-[13px] text-[#9BA3B0]">Total trading value</p>
        <div className="mt-0.5">{renderSplitMoney(totalValue, true)}</div>
        <p className="text-[12px] text-[#8E95A2] mt-0.5">Updated just now</p>

        {accountMode === 'real' ? (
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

            <button
              type="button"
              onClick={() => setActiveTab('portfolio')}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-11 h-11 rounded-full border border-white/75 group-hover:bg-white/10 flex items-center justify-center transition-colors">
                <ArrowLeftRight className="w-[18px] h-[18px] text-white" />
              </span>
              <span className="text-[12px] font-medium text-white/95">Transfer</span>
            </button>
          </div>
        ) : (
          <div className="flex justify-center lg:justify-start mt-6">
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
          </div>
        )}
      </section>

      {/* My accounts */}
      <section className="px-4 sm:px-8 mt-6">
        <h2 className="font-display text-[17px] font-bold text-slate-900 dark:text-white mb-3">My accounts</h2>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 lg:grid lg:grid-cols-3">
          {displayedAccounts.map((acc) => {
            const name = String(acc.account_type || 'CFDs | Standard');
            const isGold = name.toLowerCase().includes('gold');
            const isSwf = name.toLowerCase().includes('swap');
            const badgeCode: SelectedCfdDetail['code'] = isGold ? 'GOLD' : isSwf ? 'SWF' : 'STD';
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() =>
                  openDetailForAccount(name, badgeCode, Number(acc.balance || 0), acc.deriv_account_id)
                }
                className="min-w-[164px] text-left p-3.5 rounded-2xl bg-white dark:bg-[#181B22] border border-slate-200/80 dark:border-white/[0.06] hover:border-[#1958B7] transition-colors cursor-pointer shrink-0"
              >
                <div className="mb-3">
                  <Mt5Badge variant={badgeCode} />
                </div>
                <p className="text-[13px] font-medium text-slate-700 dark:text-[#E2E6ED] truncate">{name}</p>
                <div className="mt-1">{renderSplitMoney(Number(acc.balance || 0), false)}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured Gold Stacked Card matching 102701 & 102820 */}
      <section className="px-4 sm:px-8 mt-6">
        <h2 className="font-display text-[17px] font-bold text-slate-900 dark:text-white mb-3">Featured</h2>
        <div className="max-w-md mx-auto lg:mx-0 lg:max-w-xl">
          {/* Subtle top stacked deck shadow card edge */}
          <div className="mx-3 h-2 rounded-t-2xl bg-slate-200 dark:bg-[#1E222B] border-t border-x border-slate-300/60 dark:border-white/[0.08]" />
          <div className="rounded-2xl overflow-hidden bg-white dark:bg-[#181B22] border border-slate-200 dark:border-white/[0.08]">
            <div className="p-3.5 pb-0">
              <div className="h-36 sm:h-44 w-full rounded-xl bg-[#07090C] relative overflow-hidden">
                <img
                  src="/src/assets/images/mt5_gold_bars_1795009383164.jpg"
                  alt="Precious metals gold bullion"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="p-4">
              <h3 className="font-display text-[16px] font-bold text-slate-900 dark:text-white">
                {featuredSlide === 0 ? 'Precious metals' : 'Zero Spread CFDs'}
              </h3>
              <p className="text-[13px] text-slate-500 dark:text-[#9BA3B0] mt-1 leading-snug">
                {featuredSlide === 0
                  ? 'Trade gold, silver, copper, and more with tight spreads.'
                  : 'Execute major forex pairs from 0.0 pips with deep liquidity.'}
              </p>

              <div className="mt-4 bg-[#F4F5F7] dark:bg-[#232732] rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Mt5Badge variant={featuredSlide === 0 ? 'GOLD' : 'STD'} size="sm" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {featuredSlide === 0 ? 'Gold' : 'Zero Spread'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={activating === (featuredSlide === 0 ? 'Gold' : 'Zero Spread')}
                  onClick={() => {
                    const target = featuredSlide === 0 ? 'Gold' : 'Zero Spread';
                    handleActivate(target, 'mt5');
                    setSelectedSymbol(featuredSlide === 0 ? 'frxXAUUSD' : 'frxEURUSD');
                  }}
                  className="px-4 py-1.5 rounded-full border border-slate-400 dark:border-white/70 hover:bg-white/10 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
                >
                  {activating === (featuredSlide === 0 ? 'Gold' : 'Zero Spread') ? '...' : 'Activate'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-3">
            {([0, 1] as const).map((idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setFeaturedSlide(idx)}
                aria-label={`Featured slide ${idx + 1}`}
                className={`w-1.5 h-1.5 rounded-full cursor-pointer ${
                  featuredSlide === idx ? 'bg-slate-900 dark:bg-white' : 'bg-slate-300 dark:bg-white/25'
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Available accounts matching Screenshot 102701 & 102820 */}
      <section className="px-4 sm:px-8 mt-6 pb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-[17px] font-bold text-slate-900 dark:text-white">Available accounts</h2>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="px-3.5 py-1 rounded-full border border-slate-300 dark:border-white/25 text-xs font-semibold text-slate-700 dark:text-white hover:bg-white/5 cursor-pointer"
          >
            Compare
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              name: 'cTrader',
              desc: 'CFDs copy trading with 150+ assets',
              tag: 'Copy Trading',
              badge: <CTraderBadge size="sm" />,
              code: 'cT' as const,
              platform: 'ctrader',
            },
            {
              name: 'Zero Spread',
              desc: 'Cost-efficient trades, starting from 0 pips',
              tag: 'Trade with your terms',
              badge: <Mt5Badge variant="STD" size="sm" />,
              code: 'ZSP' as const,
              platform: 'mt5',
            },
            {
              name: 'Swap-Free',
              desc: 'Hold overnight positions with zero swap fees',
              tag: 'Overnight hold',
              badge: <Mt5Badge variant="SWF" size="sm" />,
              code: 'SWF' as const,
              platform: 'mt5',
            },
            {
              name: 'Financial',
              desc: 'Tight spreads on Forex & commodities',
              tag: 'Financial',
              badge: <Mt5Badge variant="FIN" size="sm" />,
              code: 'FIN' as const,
              platform: 'mt5',
            },
          ].map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => openDetailForAccount(item.name, item.code, 0, `${item.code}-${accountMode.toUpperCase()}`)}
              className="text-left p-4 rounded-2xl bg-white dark:bg-[#181B22] border border-slate-200/80 dark:border-white/[0.06] hover:border-[#FF444F]/50 flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="min-w-0">
                <h3 className="font-display text-[15px] font-bold text-slate-900 dark:text-white">{item.name}</h3>
                <p className="text-[12px] text-slate-500 dark:text-[#9BA3B0] mt-0.5 line-clamp-1">{item.desc}</p>
                <span className="inline-block mt-2.5 px-2 py-0.5 rounded border border-slate-300 dark:border-white/25 text-[10px] font-medium text-slate-700 dark:text-slate-200">
                  {item.tag}
                </span>
              </div>
              {item.badge}
            </button>
          ))}
        </div>
      </section>

      {/* Compare Accounts Modal */}
      {compareOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-[#181B22] rounded-3xl p-6 border border-slate-200 dark:border-white/10 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">Compare CFD Accounts</h3>
              <button
                type="button"
                onClick={() => setCompareOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-slate-200 dark:border-white/10 text-slate-400">
                  <tr>
                    <th className="py-2.5 pr-4">Feature</th>
                    <th className="py-2.5 px-3">Standard</th>
                    <th className="py-2.5 px-3">Gold</th>
                    <th className="py-2.5 px-3">Zero Spread</th>
                    <th className="py-2.5 px-3">Swap-Free</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  <tr>
                    <td className="py-3 pr-4 font-semibold">Max Leverage</td>
                    <td className="py-3 px-3 font-mono-num">1:1000</td>
                    <td className="py-3 px-3 font-mono-num">1:500</td>
                    <td className="py-3 px-3 font-mono-num">1:500</td>
                    <td className="py-3 px-3 font-mono-num">1:400</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-semibold">Spreads From</td>
                    <td className="py-3 px-3 font-mono-num">0.5 pips</td>
                    <td className="py-3 px-3 font-mono-num">0.28 USD</td>
                    <td className="py-3 px-3 font-mono-num">0.0 pips</td>
                    <td className="py-3 px-3 font-mono-num">0.8 pips</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-semibold">Overnight Swap</td>
                    <td className="py-3 px-3">Standard</td>
                    <td className="py-3 px-3">Standard</td>
                    <td className="py-3 px-3">Standard</td>
                    <td className="py-3 px-3 text-[#00A878] font-semibold inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> None
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
