import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Minus,
  ArrowLeftRight,
  RefreshCw,
  DollarSign,
  Users,
  Wallet,
  Bitcoin,
  ChevronRight,
  X,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
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
  const { user, accounts, accountMode, formatMoney, refreshAll, refreshAccounts, setActiveTab, showToast } = useApp();
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [transactions, setTransactions] = useState<CashierTransaction[]>([]);
  const [agents, setAgents] = useState<PaymentAgent[]>([]);
  const [adverts, setAdverts] = useState<P2PAdvert[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [modal, setModal] = useState<null | 'deposit' | 'transfer' | 'withdraw' | 'agent-withdraw' | 'p2p-order'>(null);
  const [selectedAgent, setSelectedAgent] = useState<PaymentAgent | null>(null);
  const [selectedAdvert, setSelectedAdvert] = useState<P2PAdvert | null>(null);

  // Form states
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
        apiFetch<{ transactions: CashierTransaction[] }>('/api/cashier/transactions'),
        apiFetch<{ agents: PaymentAgent[] }>('/api/cashier/payment-agents'),
        apiFetch<{ adverts: P2PAdvert[] }>('/api/cashier/p2p/adverts'),
      ]);
      setTransactions(txRes.transactions || []);
      setAgents(agRes.agents || []);
      setAdverts(p2pRes.adverts || []);
    } catch {
      // ignore initial error
    }
  }, []);

  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  const realAcc = accounts.find((a) => !a.is_virtual && a.status === 'active');
  const demoAcc = accounts.find((a) => Boolean(a.is_virtual) && a.status === 'active');
  const optionsBal =
    accountMode === 'real'
      ? Number(realAcc?.balance || 0)
      : Number(demoAcc?.balance ?? user?.virtual_workspace_balance ?? 10000);
  const mt5Acc = accounts.find((a) => a.platform?.includes('mt5'));
  const mt5Bal = Number(mt5Acc?.balance ?? (accountMode === 'demo' ? 10000 : 0));
  const exchangeUsdt = Number(user?.exchange_balances?.USDT || 0);
  const totalWalletUsd = Number(user?.virtual_workspace_balance || 0) + (realAcc ? Number(realAcc.balance) : 0);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshAccounts(true), refreshAll(), loadPortfolioData()]);
    setRefreshing(false);
    showToast('Portfolio balances synced', 'success');
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{ cashierUrl?: string }>('/api/cashier/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), currency, method }),
      });
      await Promise.all([refreshAll(), loadPortfolioData()]);
      setModal(null);
      showToast(`Deposited ${amount} ${currency} via ${method}`, 'success');
      if (res.cashierUrl) {
        showToast('Deriv cashier link prepared in transaction details', 'info');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Deposit failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/api/cashier/transfer', {
        method: 'POST',
        body: JSON.stringify({ account_from: fromAcc, account_to: toAcc, amount: Number(amount), currency: 'USD' }),
      });
      await Promise.all([refreshAll(), loadPortfolioData()]);
      setModal(null);
      showToast(`Transferred $${amount} from ${fromAcc} to ${toAcc}`, 'success');
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
      showToast('Verification code sent to email & notifications', 'info');
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
        body: JSON.stringify({ amount: Number(amount), currency: 'USD', method, verification_code: verifyCode }),
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

  return (
    <div className="max-w-7xl mx-auto">
      {/* Dark Hero Banner */}
      <section className="bg-[#151820] text-white px-5 sm:px-8 pt-4 pb-7 rounded-b-[28px] lg:rounded-3xl lg:mx-6 lg:mt-6">
        {/* Sub-tabs matching screenshot */}
        <div className="flex items-center gap-5 border-b border-white/10 mb-5 overflow-x-auto no-scrollbar">
          {([
            { id: 'overview', label: 'Overview' },
            { id: 'wallet', label: 'Wallet' },
            { id: 'partners', label: 'Partners' },
            { id: 'trading', label: 'Trading' },
            { id: 'p2p', label: 'P2P' },
          ] as Array<{ id: SubTab; label: string }>).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`pb-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                subTab === t.id ? 'border-[#FF444F] text-white' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-400">Estimated total value</p>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="font-mono-num text-3xl sm:text-4xl font-bold">
            {formatMoney(totalWalletUsd, { hideable: true })}
          </h1>
          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refresh balances"
            className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-slate-300 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 3 Circular Actions (+ Deposit, Transfer, - Withdraw) */}
        <div className="flex items-center justify-around sm:justify-start sm:gap-12 mt-7">
          <button
            type="button"
            onClick={() => {
              setCurrency('USD');
              setMethod('M-Pesa / Mobile Money');
              setModal('deposit');
            }}
            className="flex flex-col items-center gap-2 cursor-pointer group"
          >
            <span className="w-12 h-12 rounded-full bg-[#FF444F] group-hover:bg-[#E63946] text-white flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5" />
            </span>
            <span className="text-xs font-medium text-slate-200">Deposit</span>
          </button>

          <button
            type="button"
            onClick={() => setModal('transfer')}
            className="flex flex-col items-center gap-2 cursor-pointer group"
          >
            <span className="w-12 h-12 rounded-full border border-white/25 group-hover:bg-white/10 text-white flex items-center justify-center transition-colors">
              <ArrowLeftRight className="w-5 h-5" />
            </span>
            <span className="text-xs font-medium text-slate-200">Transfer</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMethod('Bank / E-Wallet');
              setModal('withdraw');
            }}
            className="flex flex-col items-center gap-2 cursor-pointer group"
          >
            <span className="w-12 h-12 rounded-full border border-white/25 group-hover:bg-white/10 text-white flex items-center justify-center transition-colors">
              <Minus className="w-5 h-5" />
            </span>
            <span className="text-xs font-medium text-slate-200">Withdraw</span>
          </button>
        </div>
      </section>

      <div className="px-5 sm:px-8 mt-6 space-y-8 pb-8">
        {(subTab === 'overview' || subTab === 'wallet') && (
          <>
            {/* Other payment methods matching screenshot */}
            <section>
              <h2 className="font-display text-lg font-bold mb-3.5">Other payment methods</h2>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setCurrency('USD');
                    setMethod('Bank, Card & E-Wallet');
                    setModal('deposit');
                  }}
                  className="w-full text-left p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] hover:border-[#FF444F]/50 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-[#1A1D26] border border-slate-200 dark:border-[#2A2F3D] flex items-center justify-center shrink-0">
                    <DollarSign className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">USD</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Fund via bank, card, e-wallet, and crypto.
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={() => setSubTab('partners')}
                  className="w-full text-left p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] hover:border-[#FF444F]/50 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-[#1A1D26] border border-slate-200 dark:border-[#2A2F3D] flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">Payment agent</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Deposit and withdraw in your local currency via a verified local agent.
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={() => setSubTab('p2p')}
                  className="w-full text-left p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] hover:border-[#FF444F]/50 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-[#1A1D26] border border-slate-200 dark:border-[#2A2F3D] flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">P2P</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Buy and sell USD with other traders. Deposit and withdraw in your local currency.
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrency('USDT');
                    setMethod('USDT TRC20 / USDC');
                    setModal('deposit');
                  }}
                  className="w-full text-left p-4 rounded-2xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200/70 dark:border-[#2A2F3D] hover:border-[#FF444F]/50 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-[#1A1D26] border border-slate-200 dark:border-[#2A2F3D] flex items-center justify-center shrink-0">
                    <Bitcoin className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">Crypto</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Quickly fund your account with USDT, USDC, and more.
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </section>
          </>
        )}

        {(subTab === 'overview' || subTab === 'trading') && (
          <section>
            <h2 className="font-display text-lg font-bold mb-3.5">Trading</h2>
            <div className="bg-[#F4F5F7] dark:bg-[#181C25] rounded-2xl border border-slate-200/70 dark:border-[#2A2F3D] divide-y divide-slate-200/70 dark:divide-[#2A2F3D]">
              <button
                type="button"
                onClick={() => setActiveTab('options')}
                className="w-full px-4 py-4 flex items-center justify-between hover:bg-white/60 dark:hover:bg-white/5 transition-colors cursor-pointer first:rounded-t-2xl"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#FF444F] text-white flex items-center justify-center">
                    <ArrowLeftRight className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-semibold">Options</span>
                </div>
                <span className="font-mono-num text-sm font-bold">{formatMoney(optionsBal, { hideable: true })}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('cfds')}
                className="w-full px-4 py-4 flex items-center justify-between hover:bg-white/60 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#1958B7] text-white flex flex-col items-center justify-center text-[9px] font-bold leading-none">
                    <span>MT5</span>
                    <span className="text-[7px] opacity-80">STD</span>
                  </span>
                  <span className="text-sm font-semibold">Standard</span>
                </div>
                <span className="font-mono-num text-sm font-bold">{formatMoney(mt5Bal, { hideable: true })}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('exchange')}
                className="w-full px-4 py-4 flex items-center justify-between hover:bg-white/60 dark:hover:bg-white/5 transition-colors cursor-pointer last:rounded-b-2xl"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#FF444F] text-white flex items-center justify-center text-[10px] font-bold">
                    DXN
                  </span>
                  <span className="text-sm font-semibold">TradeDeriv Exchange</span>
                </div>
                <span className="font-mono-num text-sm font-bold">
                  {formatMoney(exchangeUsdt, { hideable: true, currencyOverride: 'USDT' })}
                </span>
              </button>
            </div>
          </section>
        )}

        {subTab === 'partners' && (
          <section>
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h2 className="font-display text-lg font-bold">Verified Payment Agents</h2>
                <p className="text-xs text-slate-500">Local M-Pesa, Airtel Money & Mobile Money settlement</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {agents.map((ag) => (
                <div
                  key={ag.paymentagent_loginid}
                  className="p-5 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-mono-num font-bold px-2.5 py-0.5 rounded-full bg-[#00A878]/10 text-[#00A878]">
                        {ag.paymentagent_loginid}
                      </span>
                      <span className="text-xs text-slate-500">
                        Fee: {ag.deposit_commission} / {ag.withdrawal_commission}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-base mb-1">{ag.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{ag.summary}</p>
                    <p className="text-xs text-slate-500 mb-4">
                      Limits: ${ag.min_withdrawal} – ${ag.max_withdrawal}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAgent(ag);
                      setModal('agent-withdraw');
                    }}
                    className="w-full py-2.5 rounded-full bg-[#151820] dark:bg-[#FF444F] text-white text-xs font-semibold hover:opacity-90 cursor-pointer"
                  >
                    Withdraw via Agent
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {subTab === 'p2p' && (
          <section>
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h2 className="font-display text-lg font-bold">Peer-to-Peer Marketplace</h2>
                <p className="text-xs text-slate-500">Escrow-backed USD / KES P2P offers</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {adverts.map((adv) => (
                <div
                  key={adv.id}
                  className="p-5 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold">{adv.advertiser_details.name}</span>
                    <span className="text-xs font-semibold text-amber-500">
                      ★ {adv.advertiser_details.rating} ({adv.advertiser_details.completed_orders_count})
                    </span>
                  </div>
                  <p className="font-mono-num text-2xl font-bold mb-1">
                    {adv.rate.toFixed(2)} {adv.local_currency}
                  </p>
                  <p className="text-xs text-slate-500 mb-3">
                    Limits: ${adv.min_order_amount_limit} – ${adv.max_order_amount_limit} ·{' '}
                    {adv.payment_method_names.join(', ')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAdvert(adv);
                      setModal('p2p-order');
                    }}
                    className={`w-full py-2.5 rounded-full text-white text-xs font-bold cursor-pointer ${
                      adv.type === 'buy' ? 'bg-[#00A878] hover:bg-[#00966B]' : 'bg-[#FF444F] hover:bg-[#E63946]'
                    }`}
                  >
                    {adv.type === 'buy' ? 'Buy USD' : 'Sell USD'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Cashier Ledger */}
        <section>
          <h2 className="font-display text-lg font-bold mb-3.5">Cashier & Transfer History</h2>
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
            {transactions.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">No deposits, withdrawals, or transfers yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-xs text-slate-500">
                      <th className="text-left px-4 py-3 font-medium">Reference</th>
                      <th className="text-left px-4 py-3 font-medium">Type</th>
                      <th className="text-left px-4 py-3 font-medium">Method / Route</th>
                      <th className="text-right px-4 py-3 font-medium">Amount</th>
                      <th className="text-right px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                    {transactions.slice(0, 20).map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-4 py-3 font-mono-num text-xs font-semibold">{tx.reference_id}</td>
                        <td className="px-4 py-3 capitalize text-xs font-medium">{tx.tx_type}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {tx.method}
                          {tx.account_from && tx.account_to ? ` (${tx.account_from} → ${tx.account_to})` : ''}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num font-bold">
                          {tx.amount.toFixed(2)} {tx.currency}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#00A878]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Cashier Action Modals */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#181C25] rounded-3xl p-6 border border-slate-200 dark:border-[#2A2F3D]">
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
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modal === 'deposit' && (
              <form onSubmit={handleDeposit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Method</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
                  >
                    <option value="M-Pesa / Mobile Money">M-Pesa / Mobile Money</option>
                    <option value="Bank, Card & E-Wallet">Bank, Card & E-Wallet</option>
                    <option value="USDT TRC20 / USDC">USDT TRC20 / USDC</option>
                    <option value="Payment Agent">Payment Agent</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Amount</label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
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
                  <label className="block text-xs font-semibold text-slate-500 mb-1">From Account</label>
                  <select
                    value={fromAcc}
                    onChange={(e) => setFromAcc(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
                  >
                    <option value="USD Wallet">USD Wallet</option>
                    <option value="Options">Options</option>
                    <option value="MT5 Standard">MT5 Standard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">To Account</label>
                  <select
                    value={toAcc}
                    onChange={(e) => setToAcc(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
                  >
                    <option value="MT5 Standard">MT5 Standard</option>
                    <option value="Deriv Exchange">TradeDeriv Exchange (USDT)</option>
                    <option value="Options">Options</option>
                    <option value="MT5 Gold">MT5 Gold</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (USD)</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm"
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
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (USD)</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-500">Verification Code</label>
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
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm"
                  />
                  {hintCode && (
                    <p className="text-[11px] text-[#00A878] mt-1 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Notification code issued: <strong className="font-mono-num">{hintCode}</strong>
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm cursor-pointer disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Confirm Withdrawal'}
                </button>
              </form>
            )}

            {modal === 'p2p-order' && selectedAdvert && (
              <form onSubmit={handleP2POrder} className="space-y-4">
                <div className="p-3 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs space-y-1">
                  <p>
                    Rate: <strong className="font-mono-num">{selectedAdvert.rate.toFixed(2)} {selectedAdvert.local_currency}/USD</strong>
                  </p>
                  <p>Payment: {selectedAdvert.payment_method_names.join(', ')}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (USD)</label>
                  <input
                    type="number"
                    min={selectedAdvert.min_order_amount_limit}
                    max={selectedAdvert.max_order_amount_limit}
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-full bg-[#00A878] hover:bg-[#00966B] text-white font-semibold text-sm cursor-pointer disabled:opacity-60"
                >
                  {submitting ? 'Executing...' : `Confirm P2P ${selectedAdvert.type.toUpperCase()}`}
                </button>
              </form>
            )}

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#2A2F3D] flex items-center justify-between text-[11px] text-slate-500">
              <span>Secured via AES-256 Cashier Bridge</span>
              <a
                href="https://hub.deriv.com/tradershub/cashier"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#FF444F] hover:underline"
              >
                Deriv Cashier <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
