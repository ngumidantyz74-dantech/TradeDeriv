import React, { useState } from 'react';
import { RefreshCw, CandlestickChart, X, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';

export const CfdsHub: React.FC = () => {
  const {
    user,
    accounts,
    accountMode,
    setAccountMode,
    formatMoney,
    refreshAccounts,
    setActiveTab,
    setSelectedSymbol,
    showToast,
  } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  const cfdAccounts = accounts.filter(
    (a) =>
      (a.platform?.includes('mt5') || a.platform === 'ctrader') &&
      (accountMode === 'demo' ? Boolean(a.is_virtual) : !a.is_virtual)
  );
  const stdWalletBal =
    accountMode === 'real'
      ? Number(user?.real_wallets?.mt5_standard ?? 0)
      : Number(user?.demo_wallets?.mt5_standard ?? 0);
  const goldWalletBal =
    accountMode === 'real'
      ? Number(user?.real_wallets?.mt5_gold ?? 0)
      : Number(user?.demo_wallets?.mt5_gold ?? 0);
  const totalValue =
    cfdAccounts.length > 0
      ? cfdAccounts.reduce((acc, a) => acc + Number(a.balance || 0), 0)
      : stdWalletBal + goldWalletBal;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAccounts(true);
    setRefreshing(false);
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

  return (
    <div className="max-w-7xl mx-auto">
      {/* Dark Hero Banner */}
      <section className="bg-[#151820] text-white px-5 sm:px-8 pt-5 pb-7 rounded-b-[28px] lg:rounded-3xl lg:mx-6 lg:mt-6">
        <div className="flex justify-center lg:justify-start mb-5">
          <div className="inline-flex items-center bg-[#232734] p-1 rounded-full">
            <button
              type="button"
              onClick={() => setAccountMode('real')}
              className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                accountMode === 'real' ? 'bg-[#363C4E] text-white' : 'text-slate-400'
              }`}
            >
              Real
            </button>
            <button
              type="button"
              onClick={() => setAccountMode('demo')}
              className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                accountMode === 'demo' ? 'bg-[#363C4E] text-white' : 'text-slate-400'
              }`}
            >
              Demo
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400">Total trading value</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="font-mono-num text-2xl sm:text-3xl font-bold">
            {formatMoney(totalValue, { hideable: true })}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh CFD balance"
            className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-slate-300 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">Updated just now</p>

        <div className="flex justify-center lg:justify-start mt-6">
          <button
            type="button"
            onClick={() => setActiveTab('mt5-tv')}
            className="flex flex-col items-center gap-2 group cursor-pointer"
          >
            <span className="w-13 h-13 rounded-full bg-[#FF444F] group-hover:bg-[#E63946] flex items-center justify-center transition-colors shadow-lg shadow-[#FF444F]/25">
              <CandlestickChart className="w-6 h-6 text-white" />
            </span>
            <span className="text-xs font-medium text-white">Trade</span>
          </button>
        </div>
      </section>

      {/* My accounts */}
      <section className="px-5 sm:px-8 mt-7">
        <h2 className="font-display text-lg font-bold mb-3.5">My accounts</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(cfdAccounts.length > 0
            ? cfdAccounts
            : [
                {
                  id: 0,
                  deriv_account_id: accountMode === 'demo' ? 'MT5-DEMO-STD' : 'MT5-REAL-STD',
                  account_type: 'CFDs | Standard',
                  balance: stdWalletBal,
                  currency: 'USD',
                },
                {
                  id: -1,
                  deriv_account_id: accountMode === 'demo' ? 'MT5-DEMO-GOLD' : 'MT5-REAL-GOLD',
                  account_type: 'CFDs | Gold',
                  balance: goldWalletBal,
                  currency: 'USD',
                },
              ]
          ).map((acc) => (
            <button
              key={acc.id}
              type="button"
              onClick={() => setActiveTab('mt5-tv')}
              className="text-left p-5 rounded-2xl bg-[#EEF1F5] dark:bg-[#181C25] border border-slate-200/80 dark:border-[#2A2F3D] hover:border-[#1958B7] transition-colors cursor-pointer"
            >
              <div className="w-11 h-11 rounded-xl bg-[#1958B7] text-white flex flex-col items-center justify-center mb-4 text-xs font-bold leading-tight">
                <span>MT5</span>
                <span className="text-[9px] opacity-80">STD</span>
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {acc.account_type || 'CFDs | Standard'}
              </p>
              <p className="font-mono-num text-lg font-bold mt-1">
                {formatMoney(Number(acc.balance || 0), { hideable: true })}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Featured Gold Card */}
      <section className="px-5 sm:px-8 mt-7">
        <h2 className="font-display text-lg font-bold mb-3.5">Featured</h2>
        <div className="rounded-3xl overflow-hidden bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
          <div className="h-44 sm:h-52 w-full bg-[#080A0E] relative overflow-hidden">
            <img
              src="/src/assets/images/mt5_gold_bars_1795009383164.jpg"
              alt="MT5 Gold bullion"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-5">
            <h3 className="font-display text-lg font-bold">Gold</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Specialised account for gold and metals
            </p>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 dark:border-[#2A2F3D]">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-1 rounded-lg bg-[#1958B7] text-white text-[10px] font-bold">
                  MT5 GOLD
                </span>
                <span className="text-sm font-semibold">Gold</span>
              </div>
              <button
                type="button"
                disabled={activating === 'Gold'}
                onClick={() => {
                  handleActivate('Gold', 'mt5');
                  setSelectedSymbol('frxXAUUSD');
                }}
                className="px-4 py-2 rounded-full border border-slate-300 dark:border-[#2A2F3D] hover:bg-slate-50 dark:hover:bg-white/5 text-xs font-semibold cursor-pointer"
              >
                {activating === 'Gold' ? 'Activating...' : 'Activate now'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Available accounts grid */}
      <section className="px-5 sm:px-8 mt-7 pb-6">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="font-display text-lg font-bold">Available accounts</h2>
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="px-4 py-1.5 rounded-full border border-slate-300 dark:border-[#2A2F3D] text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
          >
            Compare
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[
            { name: 'cTrader', desc: 'CFDs copy trading with 150+ assets', badge: 'Copy Trading', color: 'bg-[#FF444F]', code: 'cT', platform: 'ctrader' },
            { name: 'Zero Spread', desc: 'Cost-efficient trades, starting from 0 pips', badge: 'Trade with your terms', color: 'bg-[#1958B7]', code: 'MT5', platform: 'mt5' },
            { name: 'Swap-Free', desc: 'No overnight financing charges on positions', badge: 'Overnight hold', color: 'bg-[#0284C7]', code: 'MT5', platform: 'mt5' },
            { name: 'Financial', desc: 'Forex, metals, crypto & global stock indices', badge: 'High leverage', color: 'bg-[#1958B7]', code: 'MT5', platform: 'mt5' },
          ].map((item) => (
            <div
              key={item.name}
              className="p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] flex flex-col justify-between"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-bold">{item.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{item.desc}</p>
                </div>
                <span className={`w-10 h-10 rounded-xl ${item.color} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                  {item.code}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#1A1D26] px-2.5 py-1 rounded-lg border border-slate-200/70 dark:border-[#2A2F3D]">
                  {item.badge}
                </span>
                <button
                  type="button"
                  onClick={() => handleActivate(item.name, item.platform)}
                  className="text-xs font-semibold text-[#FF444F] hover:underline cursor-pointer"
                >
                  {activating === item.name ? '...' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Compare Accounts Modal */}
      {compareOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-[#181C25] rounded-3xl p-6 border border-slate-200 dark:border-[#2A2F3D] max-h-[85vh] overflow-y-auto">
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
                <thead className="border-b border-slate-200 dark:border-[#2A2F3D] text-slate-500">
                  <tr>
                    <th className="py-2.5 pr-4">Feature</th>
                    <th className="py-2.5 px-3">Standard</th>
                    <th className="py-2.5 px-3">Gold</th>
                    <th className="py-2.5 px-3">Zero Spread</th>
                    <th className="py-2.5 px-3">Swap-Free</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
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
                    <td className="py-3 px-3 text-[#00A878] font-semibold inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> None</td>
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
