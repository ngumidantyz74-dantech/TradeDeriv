import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Minus,
  ArrowLeftRight,
  X,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
  Copy,
  Receipt,
  Check,
  CreditCard,
  Globe,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { getCanonicalBalances } from '../lib/balances';
import { Mt5Badge, OptionsSquareBadge } from '../components/DerivBadges';
import type { CashierTransaction } from '../types';

type SubTab = 'overview' | 'wallet' | 'partners' | 'trading' | 'p2p';

interface PaymentAgent {
  paymentagent_loginid: string;
  name: string;
  summary: string;
  deposit_commission: string;
  withdrawal_commission: string;
  supported_payment_methods: Array<{ payment_method: string }>;
  min_withdrawal: number;
  max_withdrawal: number;
}

interface P2PAdvert {
  id: string;
  advertiser_details: { name: string; rating: number; completed_orders_count: number };
  type: 'buy' | 'sell';
  rate: number;
  local_currency: string;
  min_order_amount_limit: number;
  max_order_amount_limit: number;
  payment_method_names: string[];
}

export const PortfolioHub: React.FC = () => {
  const {
    user,
    accounts,
    accountMode,
    setAccountMode,
    hideBalances,
    currencyDisplay,
    kesRate,
    refreshAll,
    setActiveTab,
    showToast,
    publicSettings,
  } = useApp();

  const partnerLink = publicSettings.partner?.referralLink || 'https://t.deriv.link?t=FSDRTFVTSKPA';
  const partnerCode = publicSettings.partner?.referralCode || 'VNMH2VHBRTFN';
  const partnerTier = Number(publicSettings.partner?.affiliateTierRate ?? 30);

  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [hideZeroAssets, setHideZeroAssets] = useState<boolean>(true);
  const [transactions, setTransactions] = useState<CashierTransaction[]>([]);
  const [agents, setAgents] = useState<PaymentAgent[]>([]);
  const [adverts, setAdverts] = useState<P2PAdvert[]>([]);
  const [transactionsOpen, setTransactionsOpen] = useState<boolean>(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState<boolean>(false);

  const [modal, setModal] = useState<null | 'deposit' | 'transfer' | 'withdraw' | 'agent-withdraw' | 'p2p-order'>(null);
  const [selectedAgent, setSelectedAgent] = useState<PaymentAgent | null>(null);
  const [selectedAdvert, setSelectedAdvert] = useState<P2PAdvert | null>(null);

  const [amount, setAmount] = useState('100');
  const [currency, setCurrency] = useState('USD');
  const [method, setMethod] = useState('M-Pesa / Mobile Money');
  const [fromAcc, setFromAcc] = useState('USD Wallet');
  const [toAcc, setToAcc] = useState('MT5 Standard');
  const [verifyCode, setVerifyCode] = useState('');
  const [hintCode, setHintCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadPortfolioData = useCallback(async () => {
    try {
      const [txRes, agRes, p2pRes] = await Promise.all([
        apiFetch<{ transactions: CashierTransaction[] }>(`/api/cashier/transactions?accountMode=${accountMode}`),
        apiFetch<{ agents: PaymentAgent[] }>('/api/cashier/payment-agents'),
        apiFetch<{ adverts: P2PAdvert[] }>('/api/cashier/p2p/adverts'),
      ]);
      setTransactions(txRes.transactions || []);
      setAgents(agRes.agents || []);
      setAdverts(p2pRes.adverts || []);
    } catch {
      // ignore
    }
  }, [accountMode]);

  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  const {
    optionsBal,
    mt5StdBal,
    mt5GoldBal,
    exchangeUsdt,
    totalPortfolioUsd: totalWalletUsd,
  } = getCanonicalBalances(user, accounts, accountMode, null);

  const activeHeadlineUsd =
    subTab === 'wallet'
      ? optionsBal
      : subTab === 'partners'
        ? 0
        : subTab === 'p2p'
          ? 0
          : subTab === 'trading'
            ? mt5StdBal + mt5GoldBal + exchangeUsdt + optionsBal
            : totalWalletUsd;

  const renderAmountText = (usdAmount: number, hero = false) => {
    if (hideBalances) return <span className="font-mono-num font-bold">••••••</span>;
    const isKsh = currencyDisplay === 'KSH';
    const val = isKsh ? usdAmount * kesRate : usdAmount;
    const formatted = val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const unit = isKsh ? 'KSH' : 'USD';
    return (
      <span className={`${hero ? 'text-[26px] sm:text-[30px]' : 'text-[14px]'} font-bold tabular-nums text-white`}>
        {formatted} {unit}
      </span>
    );
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/api/cashier/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), currency, method, accountMode }),
      });
      await Promise.all([refreshAll(), loadPortfolioData()]);
      setModal(null);
      showToast(`Deposited ${amount} ${currency} (${accountMode.toUpperCase()})`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Deposit failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromAcc === toAcc) {
      showToast('Select two different wallets to transfer', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/cashier/transfer', {
        method: 'POST',
        body: JSON.stringify({
          account_from: fromAcc,
          account_to: toAcc,
          amount: Number(amount),
          currency: 'USD',
          accountMode,
        }),
      });
      await Promise.all([refreshAll(), loadPortfolioData()]);
      setModal(null);
      showToast(`Transferred $${Number(amount).toFixed(2)}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Transfer failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestCode = async () => {
    try {
      const res = await apiFetch<{ hintCode?: string }>('/api/cashier/withdraw/request-code', { method: 'POST' });
      if (res.hintCode) setHintCode(res.hintCode);
      showToast('Verification code sent', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to request code', 'error');
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/api/cashier/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          currency: 'USD',
          method,
          verification_code: verifyCode,
          accountMode,
        }),
      });
      await Promise.all([refreshAll(), loadPortfolioData()]);
      setModal(null);
      setVerifyCode('');
      setHintCode('');
      showToast(`Withdrawal of $${amount} submitted`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Withdrawal failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAgentWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/cashier/payment-agents/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          paymentagent_loginid: selectedAgent.paymentagent_loginid,
          amount: Number(amount),
          currency: 'USD',
          verification_code: verifyCode,
          accountMode,
        }),
      });
      await Promise.all([refreshAll(), loadPortfolioData()]);
      setModal(null);
      showToast(`Agent withdrawal via ${selectedAgent.name} completed`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Agent withdrawal failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleP2POrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdvert) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/cashier/p2p/orders', {
        method: 'POST',
        body: JSON.stringify({
          advert_id: selectedAdvert.id,
          amount: Number(amount),
          type: selectedAdvert.type,
          accountMode,
        }),
      });
      await Promise.all([refreshAll(), loadPortfolioData()]);
      setModal(null);
      showToast(`P2P ${selectedAdvert.type.toUpperCase()} order completed`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'P2P order failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const tradingRows = [
    {
      key: 'mt5std',
      label: 'CFDs | Standard 3',
      tab: 'cfds' as const,
      bal: mt5StdBal,
      badge: <Mt5Badge variant="STD" size="sm" />,
      currency: 'USD',
    },
    {
      key: 'options',
      label: 'Options',
      tab: 'options' as const,
      bal: optionsBal,
      badge: <OptionsSquareBadge size="sm" />,
      currency: 'USD',
    },
    {
      key: 'mt5gold',
      label: 'CFDs | Gold',
      tab: 'cfds' as const,
      bal: mt5GoldBal,
      badge: <Mt5Badge variant="GOLD" size="sm" />,
      currency: 'USD',
    },
    {
      key: 'exchange',
      label: 'Deriv Exchange',
      tab: 'exchange' as const,
      bal: exchangeUsdt,
      badge: (
        <span className="w-8 h-8 rounded-lg bg-[#FF444F] text-white text-[10px] font-bold flex items-center justify-center">
          DXN
        </span>
      ),
      currency: 'USDT',
    },
  ].filter((r) => !hideZeroAssets || r.bal > 0);

  const walletRows = [
    { key: 'usd', label: 'USD Wallet', bal: optionsBal, currency: 'USD' },
    { key: 'usdt', label: 'USDT Wallet', bal: exchangeUsdt, currency: 'USDT' },
  ].filter((r) => !hideZeroAssets || r.bal > 0);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Dark Hero Header matching Screenshots 102708-102726 */}
      <section className="bg-[#171A21] text-white px-4 sm:px-8 pt-2 pb-6 rounded-b-[24px] lg:rounded-3xl lg:mx-6 lg:mt-4">
        {/* 5 Underline Sub-Tabs */}
        <div className="flex items-center justify-between sm:justify-start sm:gap-7 mb-5 overflow-x-auto no-scrollbar">
          {([
            { id: 'overview', label: 'Overview' },
            { id: 'wallet', label: 'Wallet' },
            { id: 'partners', label: 'Partners' },
            { id: 'trading', label: 'Trading' },
            { id: 'p2p', label: 'P2P' },
          ] as Array<{ id: SubTab; label: string }>).map((t) => {
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className="relative pb-2 text-[14px] font-semibold whitespace-nowrap cursor-pointer px-1"
              >
                <span className={active ? 'text-white' : 'text-[#8E95A2]'}>{t.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2.5px] rounded-full bg-[#FF444F]" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] text-[#9BA3B0]">Est. total value</p>
          <div className="inline-flex items-center bg-[#232732] p-0.5 rounded-full">
            <button
              type="button"
              onClick={() => setAccountMode('real')}
              className={`px-3 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer ${
                accountMode === 'real' ? 'bg-[#383D4A] text-white' : 'text-[#8E95A2]'
              }`}
            >
              Real
            </button>
            <button
              type="button"
              onClick={() => setAccountMode('demo')}
              className={`px-3 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer ${
                accountMode === 'demo' ? 'bg-[#383D4A] text-white' : 'text-[#8E95A2]'
              }`}
            >
              Demo
            </button>
          </div>
        </div>

        <div className="mt-1">{renderAmountText(activeHeadlineUsd, true)}</div>

        {/* Sub-tab Specific Action Buttons */}
        {(subTab === 'overview' || subTab === 'wallet') && (
          <div className="grid grid-cols-3 max-w-md mx-auto lg:mx-0 lg:flex lg:items-center lg:gap-16 mt-6">
            <button
              type="button"
              onClick={() => setModal('deposit')}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-11 h-11 rounded-full bg-[#FF444F] group-hover:bg-[#E63946] text-white flex items-center justify-center">
                <Plus className="w-5 h-5 stroke-[2.3]" />
              </span>
              <span className="text-[12px] text-white/90">Deposit</span>
            </button>

            <button
              type="button"
              onClick={() => setModal('transfer')}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-11 h-11 rounded-full border border-white/75 group-hover:bg-white/10 text-white flex items-center justify-center">
                <ArrowLeftRight className="w-[18px] h-[18px]" />
              </span>
              <span className="text-[12px] text-white/90">Transfer</span>
            </button>

            <button
              type="button"
              onClick={() => setModal('withdraw')}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-11 h-11 rounded-full border border-white/75 group-hover:bg-white/10 text-white flex items-center justify-center">
                <Minus className="w-5 h-5" />
              </span>
              <span className="text-[12px] text-white/90">Withdraw</span>
            </button>
          </div>
        )}

        {subTab === 'partners' && (
          <div className="grid grid-cols-2 max-w-md mx-auto lg:mx-0 lg:flex lg:items-center lg:gap-20 mt-6">
            <a
              href={partnerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-11 h-11 rounded-full bg-[#FF444F] group-hover:bg-[#E63946] text-white flex items-center justify-center">
                <ExternalLink className="w-[18px] h-[18px]" />
              </span>
              <span className="text-[12px] text-white/90 whitespace-nowrap">Go to Partners hub</span>
            </a>

            <button
              type="button"
              onClick={() => setModal('transfer')}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-11 h-11 rounded-full border border-white/75 group-hover:bg-white/10 text-white flex items-center justify-center">
                <ArrowLeftRight className="w-[18px] h-[18px]" />
              </span>
              <span className="text-[12px] text-white/90">Transfer</span>
            </button>
          </div>
        )}

        {subTab === 'trading' && (
          <div className="flex justify-center lg:justify-start mt-6">
            <button
              type="button"
              onClick={() => setModal('transfer')}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-11 h-11 rounded-full bg-[#FF444F] group-hover:bg-[#E63946] text-white flex items-center justify-center">
                <ArrowLeftRight className="w-[18px] h-[18px]" />
              </span>
              <span className="text-[12px] text-white/90">Transfer</span>
            </button>
          </div>
        )}

        {subTab === 'p2p' && (
          <div className="grid grid-cols-2 max-w-md mx-auto lg:mx-0 lg:flex lg:items-center lg:gap-20 mt-6">
            <button
              type="button"
              onClick={() => setMarketplaceOpen(true)}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-11 h-11 rounded-full bg-[#FF444F] group-hover:bg-[#E63946] text-white flex items-center justify-center">
                <ExternalLink className="w-[18px] h-[18px]" />
              </span>
              <span className="text-[12px] text-white/90">Go to P2P</span>
            </button>

            <button
              type="button"
              onClick={() => setModal('transfer')}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-11 h-11 rounded-full border border-white/75 group-hover:bg-white/10 text-white flex items-center justify-center">
                <ArrowLeftRight className="w-[18px] h-[18px]" />
              </span>
              <span className="text-[12px] text-white/90">Transfer</span>
            </button>
          </div>
        )}
      </section>

      {/* Main Sub-Tab Body */}
      <div className="px-4 sm:px-8 mt-5 space-y-6 pb-8">
        {/* Hide Zero Balance Checkbox (Overview, Wallet, Partners, Trading) */}
        {subTab !== 'p2p' && (
          <div>
            {(subTab === 'overview' || subTab === 'wallet') && (
              <h2 className="font-display text-[17px] font-bold text-slate-900 dark:text-white mb-2.5">Wallet</h2>
            )}
            <button
              type="button"
              onClick={() => setHideZeroAssets(!hideZeroAssets)}
              className="inline-flex items-center gap-2.5 text-[13px] text-slate-700 dark:text-[#C7CDD6] cursor-pointer select-none"
            >
              <span
                className={`w-[18px] h-[18px] rounded-[4px] flex items-center justify-center border transition-colors ${
                  hideZeroAssets
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-[#0E0F13] dark:border-white'
                    : 'border-slate-400 dark:border-white/30 bg-transparent'
                }`}
              >
                {hideZeroAssets && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </span>
              <span>Hide assets with zero balance</span>
            </button>

            {(subTab === 'wallet' || (subTab === 'overview' && walletRows.length > 0)) && walletRows.length > 0 && (
              <div className="mt-3 divide-y divide-slate-200 dark:divide-white/[0.08]">
                {walletRows.map((w) => (
                  <div key={w.key} className="py-3.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{w.label}</span>
                    <span className="font-mono-num text-sm font-semibold">
                      {hideBalances ? '••••••' : `${w.bal.toFixed(2)} ${w.currency}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Overview & Trading Accounts List */}
        {(subTab === 'overview' || subTab === 'trading') && (
          <section>
            {subTab === 'overview' && (
              <h2 className="font-display text-[17px] font-bold text-slate-900 dark:text-white mb-2">Trading</h2>
            )}
            <div className="divide-y divide-slate-200 dark:divide-white/[0.08]">
              {tradingRows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setActiveTab(row.tab)}
                  className="w-full py-3.5 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {row.badge}
                    <span className="text-[14px] font-medium text-slate-800 dark:text-[#E2E6ED]">{row.label}</span>
                  </div>
                  <span className="font-mono-num text-[14px] font-semibold text-slate-900 dark:text-white">
                    {hideBalances ? '••••••' : `${row.bal.toFixed(2)} ${row.currency}`}
                  </span>
                </button>
              ))}
            </div>

            {subTab === 'overview' && (
              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  onClick={() => setTransactionsOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-300 dark:border-white/70 text-[13px] font-semibold text-slate-800 dark:text-white hover:bg-white/5 cursor-pointer"
                >
                  <Receipt className="w-4 h-4" />
                  <span>View all transactions</span>
                </button>
              </div>
            )}
          </section>
        )}

        {/* Partners Details & Verified Agents */}
        {subTab === 'partners' && (
          <section className="space-y-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#181B22] border border-slate-200 dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs text-[#00A878] font-semibold">
                  Partner Tier · {partnerTier}% Revenue Share
                </p>
                <p className="text-sm font-bold mt-0.5">Referral Code: {partnerCode}</p>
                <p className="text-xs text-slate-500 dark:text-[#9BA3B0] font-mono-num mt-0.5 truncate max-w-xs">
                  {partnerLink}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(partnerLink);
                  showToast('Partner link copied', 'success');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-300 dark:border-white/25 text-xs font-semibold cursor-pointer self-start sm:self-center"
              >
                <Copy className="w-3.5 h-3.5" /> Copy link
              </button>
            </div>

            {agents.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {agents.map((ag) => (
                  <div
                    key={ag.paymentagent_loginid}
                    className="p-4 rounded-2xl bg-white dark:bg-[#181B22] border border-slate-200 dark:border-white/[0.08] flex flex-col justify-between"
                  >
                    <div>
                      <p className="text-xs font-mono-num text-[#00A878] font-bold">{ag.paymentagent_loginid}</p>
                      <h3 className="font-display font-bold text-sm mt-1">{ag.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-[#9BA3B0] mt-1">{ag.summary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAgent(ag);
                        setModal('agent-withdraw');
                      }}
                      className="mt-3 w-full py-2 rounded-full bg-[#FF444F] text-white text-xs font-semibold cursor-pointer"
                    >
                      Withdraw via Agent
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* P2P Sub-Tab matching Screenshot 102726 exactly */}
        {subTab === 'p2p' && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display text-[17px] font-bold text-slate-900 dark:text-white mb-3">Why use P2P?</h2>
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-white dark:bg-[#13151B] border border-slate-200 dark:border-white/10">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3 relative">
                    <CreditCard className="w-6 h-6 text-slate-200" />
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#FF444F] text-white text-[9px] flex items-center justify-center font-bold">
                      ✓
                    </span>
                  </div>
                  <h3 className="font-display text-[15px] font-bold text-slate-900 dark:text-white">
                    Local payment methods
                  </h3>
                  <p className="text-[12px] text-slate-500 dark:text-[#9BA3B0] mt-1">
                    Choose from 150+ payment methods to deposit and withdraw locally.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-[#13151B] border border-slate-200 dark:border-white/10">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3 relative">
                    <Globe className="w-6 h-6 text-slate-200" />
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#FF444F] text-white text-[9px] flex items-center justify-center font-bold">
                      $
                    </span>
                  </div>
                  <h3 className="font-display text-[15px] font-bold text-slate-900 dark:text-white">
                    Trade across 100+ currencies
                  </h3>
                  <p className="text-[12px] text-slate-500 dark:text-[#9BA3B0] mt-1">
                    Buy and sell with 10,000+ active users worldwide.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-[#13151B] border border-slate-200 dark:border-white/10">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3 relative">
                    <WalletIcon className="w-6 h-6 text-slate-200" />
                  </div>
                  <h3 className="font-display text-[15px] font-bold text-slate-900 dark:text-white">
                    Transparent pricing
                  </h3>
                  <p className="text-[12px] text-slate-500 dark:text-[#9BA3B0] mt-1">
                    Set your own rates and see exactly what you pay. No hidden fees.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="font-display text-[17px] font-bold text-slate-900 dark:text-white mb-4">How P2P works?</h2>
              <div className="relative pl-9 space-y-5">
                <div className="absolute left-3 top-3 bottom-3 w-[1px] bg-white/15" />
                {[
                  {
                    n: 1,
                    title: 'Find or create an ad',
                    desc: 'Pick the best rates and place an order, or create an ad for the rates you want.',
                  },
                  {
                    n: 2,
                    title: 'Send or receive payment',
                    desc: 'Settle the payment with the counterparty of your transaction.',
                  },
                  {
                    n: 3,
                    title: 'Complete the transaction',
                    desc: 'Every order must be completed and confirmed within the specified time limit.',
                  },
                ].map((step) => (
                  <div key={step.n} className="relative">
                    <span className="absolute -left-9 top-0.5 w-6 h-6 rounded-full bg-[#E2E6ED] text-[#0E0F13] text-xs font-bold flex items-center justify-center">
                      {step.n}
                    </span>
                    <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">{step.title}</h3>
                    <p className="text-[12px] text-slate-500 dark:text-[#9BA3B0] mt-0.5">{step.desc}</p>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setMarketplaceOpen(true)}
                className="w-full mt-7 py-3.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm cursor-pointer transition-colors"
              >
                Go to marketplace
              </button>
            </div>
          </section>
        )}
      </div>

      {/* All Transactions Drawer / Modal */}
      {transactionsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl bg-white dark:bg-[#181B22] rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-white/10 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">Cashier &amp; Transfer History</h3>
              <button
                type="button"
                onClick={() => setTransactionsOpen(false)}
                className="p-2 rounded-full hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {transactions.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No deposits, withdrawals, or transfers yet.</p>
            ) : (
              <div className="divide-y divide-white/10">
                {transactions.map((tx) => {
                  const pos = tx.tx_type === 'credit' || tx.tx_type === 'deposit';
                  return (
                    <div key={tx.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold capitalize">{tx.tx_type} · {tx.method}</p>
                        <p className="text-slate-400 font-mono-num">{tx.reference_id}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-mono-num font-bold ${pos ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                          {pos ? '+' : '-'}{Number(tx.amount).toFixed(2)} {tx.currency}
                        </p>
                        <p className="text-[11px] text-[#00A878] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {tx.status}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* P2P Marketplace Modal */}
      {marketplaceOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl bg-white dark:bg-[#181B22] rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 dark:border-white/10 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">P2P Marketplace</h3>
              <button
                type="button"
                onClick={() => setMarketplaceOpen(false)}
                className="p-2 rounded-full hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {adverts.map((adv) => (
                <div
                  key={adv.id}
                  className="p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#13151B] border border-slate-200 dark:border-white/10"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold">{adv.advertiser_details.name}</span>
                    <span className="text-xs text-amber-400 font-semibold">★ {adv.advertiser_details.rating}</span>
                  </div>
                  <p className="font-mono-num text-xl font-bold mb-1">
                    {adv.rate.toFixed(2)} {adv.local_currency}
                  </p>
                  <p className="text-xs text-slate-400 mb-3">
                    ${adv.min_order_amount_limit} – ${adv.max_order_amount_limit} · {adv.payment_method_names.join(', ')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMarketplaceOpen(false);
                      setSelectedAdvert(adv);
                      setModal('p2p-order');
                    }}
                    className={`w-full py-2.5 rounded-full text-white text-xs font-bold cursor-pointer ${
                      adv.type === 'buy' ? 'bg-[#00A878]' : 'bg-[#FF444F]'
                    }`}
                  >
                    {adv.type === 'buy' ? 'Buy USD' : 'Sell USD'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cashier Action Modals */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#181B22] rounded-3xl p-6 border border-slate-200 dark:border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">
                {modal === 'deposit' && 'Deposit Funds'}
                {modal === 'transfer' && 'Transfer Between Accounts'}
                {modal === 'withdraw' && 'Withdraw Funds'}
                {modal === 'agent-withdraw' && `Agent Withdrawal (${selectedAgent?.name})`}
                {modal === 'p2p-order' && `P2P Order (${selectedAdvert?.advertiser_details.name})`}
              </h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="p-2 rounded-full hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modal === 'deposit' && (
              <form onSubmit={handleDeposit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Method</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-white/10 text-sm"
                  >
                    <option value="M-Pesa / Mobile Money">M-Pesa / Mobile Money</option>
                    <option value="Bank, Card & E-Wallet">Bank, Card &amp; E-Wallet</option>
                    <option value="USDT TRC20 / USDC">USDT TRC20 / USDC</option>
                    <option value="Payment Agent">Payment Agent</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Amount</label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-white/10 font-mono-num text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-white/10 text-sm"
                    >
                      <option value="USD">USD</option>
                      <option value="USDT">USDT</option>
                      <option value="USDC">USDC</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm cursor-pointer disabled:opacity-60"
                >
                  {submitting ? 'Processing...' : 'Confirm Deposit'}
                </button>
              </form>
            )}

            {modal === 'transfer' && (
              <form onSubmit={handleTransfer} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">From Account</label>
                  <select
                    value={fromAcc}
                    onChange={(e) => setFromAcc(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-white/10 text-sm"
                  >
                    <option value="USD Wallet">USD Wallet / Options ({optionsBal.toFixed(2)} USD)</option>
                    <option value="MT5 Standard">MT5 Standard ({mt5StdBal.toFixed(2)} USD)</option>
                    <option value="MT5 Gold">MT5 Gold ({mt5GoldBal.toFixed(2)} USD)</option>
                    <option value="Deriv Exchange">Deriv Exchange ({exchangeUsdt.toFixed(2)} USDT)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">To Account</label>
                  <select
                    value={toAcc}
                    onChange={(e) => setToAcc(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-white/10 text-sm"
                  >
                    <option value="MT5 Standard">MT5 Standard ({mt5StdBal.toFixed(2)} USD)</option>
                    <option value="MT5 Gold">MT5 Gold ({mt5GoldBal.toFixed(2)} USD)</option>
                    <option value="Deriv Exchange">Deriv Exchange ({exchangeUsdt.toFixed(2)} USDT)</option>
                    <option value="USD Wallet">USD Wallet / Options ({optionsBal.toFixed(2)} USD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Amount (USD)</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-white/10 font-mono-num text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm cursor-pointer disabled:opacity-60"
                >
                  {submitting ? 'Transferring...' : 'Execute Transfer'}
                </button>
              </form>
            )}

            {(modal === 'withdraw' || modal === 'agent-withdraw') && (
              <form onSubmit={modal === 'withdraw' ? handleWithdraw : handleAgentWithdraw} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Amount (USD)</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-white/10 font-mono-num text-sm"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-400">Verification Code</label>
                    <button
                      type="button"
                      onClick={handleRequestCode}
                      className="text-xs font-semibold text-[#FF444F] hover:underline cursor-pointer"
                    >
                      Send Code
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-white/10 font-mono-num text-sm"
                  />
                  {hintCode && (
                    <p className="text-[11px] text-[#00A878] mt-1 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Code: <strong>{hintCode}</strong>
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm cursor-pointer"
                >
                  {submitting ? 'Submitting...' : 'Confirm Withdrawal'}
                </button>
              </form>
            )}

            {modal === 'p2p-order' && selectedAdvert && (
              <form onSubmit={handleP2POrder} className="space-y-4">
                <p className="text-xs text-slate-400">
                  Rate: <strong>{selectedAdvert.rate.toFixed(2)} {selectedAdvert.local_currency}</strong> per USD
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Order Amount (USD)</label>
                  <input
                    type="number"
                    min={selectedAdvert.min_order_amount_limit}
                    max={selectedAdvert.max_order_amount_limit}
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-white/10 font-mono-num text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm cursor-pointer"
                >
                  {submitting ? 'Matching Order...' : `Confirm P2P ${selectedAdvert.type.toUpperCase()}`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
