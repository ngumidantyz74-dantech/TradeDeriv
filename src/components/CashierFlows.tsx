import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Search,
  Bitcoin,
  DollarSign,
  Plus,
  Minus,
  ArrowLeftRight,
  Users,
  CheckCircle2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { getCanonicalBalances } from '../lib/balances';
import type { CashierTransaction } from '../types';
import {
  UsCircleFlagIcon,
  CryptoCircleBadge,
  MethodTileArtwork,
  Mt5Badge,
  CTraderBadge,
  OptionsSquareBadge,
} from './DerivBadges';

export const DepositSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}> = ({ open, onClose, onCompleted }) => {
  const { refreshAll, setActiveTab, showToast } = useApp();
  const [viewMore, setViewMore] = useState(false);
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [selectedMethod, setSelectedMethod] = useState('USD');
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [amount, setAmount] = useState('50');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const openForm = (methodName: string, curr = 'USD') => {
    setSelectedMethod(methodName);
    setSelectedCurrency(curr);
    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      showToast('Enter a valid deposit amount', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/cashier/deposit', {
        method: 'POST',
        body: JSON.stringify({
          amount: num,
          currency: selectedCurrency,
          method: selectedMethod,
          accountMode: 'real',
        }),
      });
      await refreshAll();
      onCompleted?.();
      showToast(`Deposited ${num.toFixed(2)} ${selectedCurrency} via ${selectedMethod}`, 'success');
      setStep('select');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Deposit failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-[#181B22] text-white rounded-t-[26px] sm:rounded-[26px] px-5 pt-3 pb-7 border-t sm:border border-white/[0.08] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/25 mx-auto mb-5 sm:hidden" />

        {step === 'select' ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[22px] font-bold tracking-tight text-white">Deposit</h2>
              <button
                type="button"
                onClick={onClose}
                className="hidden sm:flex w-8 h-8 rounded-full bg-white/10 items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Horizontal Method Tiles matching 105202 & 105207 */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 pt-2">
              <button
                type="button"
                onClick={() => openForm('USD Wallet (Bank/Card)', 'USD')}
                className="relative min-w-[116px] bg-[#222631] hover:bg-[#292E3C] rounded-2xl px-3 py-4 flex flex-col items-center gap-2.5 border border-white/[0.06] cursor-pointer shrink-0"
              >
                <span className="absolute -top-2 left-0 px-2 py-0.5 rounded-full bg-[#17B978] text-white text-[10px] font-semibold">
                  Last used
                </span>
                <UsCircleFlagIcon size="lg" />
                <span className="text-[13px] font-semibold text-white">USD</span>
              </button>

              <button
                type="button"
                onClick={() => openForm('DusuPay Mobile Money', 'USD')}
                className="min-w-[122px] bg-[#222631] hover:bg-[#292E3C] rounded-2xl px-3 py-4 flex flex-col items-center gap-2.5 border border-white/[0.06] cursor-pointer shrink-0"
              >
                <MethodTileArtwork kind="dusupay" />
                <span className="text-[12px] font-semibold text-white whitespace-nowrap">Mobile Money</span>
              </button>

              <button
                type="button"
                onClick={() => openForm('Payment Agent', 'USD')}
                className="min-w-[122px] bg-[#222631] hover:bg-[#292E3C] rounded-2xl px-3 py-4 flex flex-col items-center gap-2.5 border border-white/[0.06] cursor-pointer shrink-0"
              >
                <MethodTileArtwork kind="payment_agent" />
                <span className="text-[12px] font-semibold text-white whitespace-nowrap">Payment Agent</span>
              </button>

              <button
                type="button"
                onClick={() => openForm('MPESA', 'USD')}
                className="min-w-[122px] bg-[#222631] hover:bg-[#292E3C] rounded-2xl px-3 py-4 flex flex-col items-center gap-2.5 border border-white/[0.06] cursor-pointer shrink-0"
              >
                <MethodTileArtwork kind="mpesa" />
                <span className="text-[12px] font-semibold text-white whitespace-nowrap">MPESA</span>
              </button>
            </div>

            {/* Vertical Options matching 105202 & 105210 */}
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => openForm('Crypto Quick Deposit', 'USDT')}
                className="w-full p-4 rounded-2xl bg-[#222631] hover:bg-[#292E3C] border border-white/[0.06] flex items-center gap-3.5 text-left cursor-pointer"
              >
                <span className="w-9 h-9 rounded-full border border-white/25 flex items-center justify-center shrink-0">
                  <Bitcoin className="w-4 h-4 text-white/85" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-white">Crypto</p>
                  <p className="text-[12px] text-[#9BA3B0]">Quick deposits</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openForm('Bank, Card & E-Wallet', 'USD')}
                className="w-full p-4 rounded-2xl bg-[#222631] hover:bg-[#292E3C] border border-white/[0.06] flex items-center gap-3.5 text-left cursor-pointer"
              >
                <span className="w-9 h-9 rounded-full border border-white/25 flex items-center justify-center shrink-0">
                  <DollarSign className="w-4 h-4 text-white/85" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-white">USD</p>
                  <p className="text-[12px] text-[#9BA3B0]">Fund via bank, card, e-wallet, and crypto.</p>
                </div>
              </button>

              {viewMore && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setActiveTab('portfolio');
                  }}
                  className="w-full p-4 rounded-2xl bg-[#222631] hover:bg-[#292E3C] border border-white/[0.06] flex items-center gap-3.5 text-left cursor-pointer"
                >
                  <span className="w-9 h-9 rounded-lg border border-white/25 flex items-center justify-center text-[10px] font-extrabold tracking-tight shrink-0">
                    P2P
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-white">P2P</p>
                    <p className="text-[12px] text-[#9BA3B0] leading-snug">
                      Buy and sell USD with other traders. Deposit and withdraw in your local currency.
                    </p>
                  </div>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setViewMore((v) => !v)}
              className="w-full mt-5 py-2 flex items-center justify-center gap-1.5 text-[14px] font-semibold text-white/95 hover:text-white cursor-pointer"
            >
              <span>{viewMore ? 'View less' : 'View more'}</span>
              {viewMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep('select')}
                className="w-9 h-9 rounded-full bg-[#242833] flex items-center justify-center cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="font-display text-lg font-bold">Deposit · {selectedMethod}</h3>
                <p className="text-xs text-[#9BA3B0]">Credits directly into your Real US Dollar wallet</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-[#9BA3B0] mb-1">Amount</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-white/10 font-mono-num text-sm text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-[#9BA3B0] mb-1">Currency</label>
                <select
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-white/10 text-sm text-white"
                >
                  <option value="USD">USD (US Dollar)</option>
                  <option value="USDT">USDT (Tether)</option>
                  <option value="USDC">USDC (USD Coin)</option>
                  <option value="BTC">BTC (Bitcoin)</option>
                  <option value="ETH">ETH (Ethereum)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Processing deposit...' : `Deposit ${Number(amount || 0).toFixed(2)} ${selectedCurrency}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export const WithdrawSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}> = ({ open, onClose, onCompleted }) => {
  const { refreshAll, showToast } = useApp();
  const [viewMore, setViewMore] = useState(false);
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [selectedMethod, setSelectedMethod] = useState('USD');
  const [amount, setAmount] = useState('25');
  const [verifyCode, setVerifyCode] = useState('');
  const [hintCode, setHintCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const openForm = (methodName: string) => {
    setSelectedMethod(methodName);
    setStep('form');
  };

  const handleRequestCode = async () => {
    try {
      const res = await apiFetch<{ hintCode?: string }>('/api/cashier/withdraw/request-code', { method: 'POST' });
      if (res.hintCode) setHintCode(res.hintCode);
      showToast('Verification code sent', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to send code', 'error');
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
          method: selectedMethod,
          verification_code: verifyCode,
          accountMode: 'real',
        }),
      });
      await refreshAll();
      onCompleted?.();
      showToast(`Withdrawal of ${Number(amount).toFixed(2)} USD submitted`, 'success');
      setStep('select');
      setVerifyCode('');
      setHintCode('');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Withdrawal failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-[#181B22] text-white rounded-t-[26px] sm:rounded-[26px] px-5 pt-3 pb-7 border-t sm:border border-white/[0.08] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/25 mx-auto mb-5 sm:hidden" />

        {step === 'select' ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[22px] font-bold tracking-tight text-white">Withdraw</h2>
              <button
                type="button"
                onClick={onClose}
                className="hidden sm:flex w-8 h-8 rounded-full bg-white/10 items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* White Featured Last Used Card matching 105404 */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => openForm('USD Wallet (Bank/Card)')}
                className="w-28 bg-white text-[#0E0F13] rounded-2xl p-3.5 text-left shadow-md hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <UsCircleFlagIcon size="sm" />
                <p className="font-display font-bold text-[14px] mt-3">USD</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded bg-[#E5E7EB] text-[#374151] text-[10px] font-medium">
                  Last used
                </span>
              </button>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => openForm('Crypto Wallet Withdrawal')}
                className="w-full p-4 rounded-2xl bg-[#222631] hover:bg-[#292E3C] border border-white/[0.06] flex items-center gap-3.5 text-left cursor-pointer"
              >
                <span className="w-9 h-9 rounded-full border border-white/25 flex items-center justify-center shrink-0">
                  <Bitcoin className="w-4 h-4 text-white/85" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-white">Crypto</p>
                  <p className="text-[12px] text-[#9BA3B0]">Withdraw using major cryptocurrencies directly from your wallet.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openForm('Bank, Card & E-Wallet')}
                className="w-full p-4 rounded-2xl bg-[#222631] hover:bg-[#292E3C] border border-white/[0.06] flex items-center gap-3.5 text-left cursor-pointer"
              >
                <span className="w-9 h-9 rounded-full border border-white/25 flex items-center justify-center shrink-0">
                  <DollarSign className="w-4 h-4 text-white/85" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-white">USD</p>
                  <p className="text-[12px] text-[#9BA3B0]">Withdraw via bank, card, e-wallet, and crypto.</p>
                </div>
              </button>

              {viewMore && (
                <>
                  <button
                    type="button"
                    onClick={() => openForm('Deriv P2P')}
                    className="w-full p-4 rounded-2xl bg-[#222631] hover:bg-[#292E3C] border border-white/[0.06] flex items-center gap-3.5 text-left cursor-pointer"
                  >
                    <span className="w-9 h-9 rounded-lg border border-white/25 flex items-center justify-center text-[10px] font-extrabold tracking-tight shrink-0">
                      P2P
                    </span>
                    <div>
                      <p className="text-[15px] font-semibold text-white">P2P</p>
                      <p className="text-[12px] text-[#9BA3B0] leading-snug">
                        Buy and sell USD with other traders. Deposit and withdraw in your local currency.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => openForm('Payment Agent')}
                    className="w-full p-4 rounded-2xl bg-[#222631] hover:bg-[#292E3C] border border-white/[0.06] flex items-center gap-3.5 text-left cursor-pointer"
                  >
                    <span className="w-9 h-9 rounded-full border border-white/25 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-white/85" />
                    </span>
                    <div>
                      <p className="text-[15px] font-semibold text-white">Payment agent</p>
                      <p className="text-[12px] text-[#9BA3B0] leading-snug">
                        Deposit and withdraw in your local currency via a verified local agent.
                      </p>
                    </div>
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setViewMore((v) => !v)}
              className="w-full mt-5 py-2 flex items-center justify-center gap-1.5 text-[14px] font-semibold text-white/95 hover:text-white cursor-pointer"
            >
              <span>{viewMore ? 'View less' : 'View more'}</span>
              {viewMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </>
        ) : (
          <form onSubmit={handleWithdraw} className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep('select')}
                className="w-9 h-9 rounded-full bg-[#242833] flex items-center justify-center cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="font-display text-lg font-bold">Withdraw · {selectedMethod}</h3>
                <p className="text-xs text-[#9BA3B0]">Real US Dollar wallet payout</p>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#9BA3B0] mb-1">Amount (USD)</label>
              <input
                type="number"
                min="1"
                step="any"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-white/10 font-mono-num text-sm text-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-[#9BA3B0]">Verification Code</label>
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
                required
                placeholder="Enter 6-digit verification code"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111319] border border-white/10 font-mono-num text-sm text-white"
              />
              {hintCode && (
                <p className="text-[11px] text-[#00A878] mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Verification Code: <strong>{hintCode}</strong>
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : 'Confirm Withdrawal'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

interface TransferTargetItem {
  id: string;
  group: 'Trading' | 'Wallet';
  label: string;
  currency: string;
  decimals: number;
  balance: number;
  backendKey: string;
  accountId?: number | null;
  icon: React.ReactNode;
}

export const TransferScreen: React.FC<{
  open: boolean;
  onClose: () => void;
  onOpenDeposit?: () => void;
  initialFromId?: string;
  initialToId?: string;
  accountMode?: 'real' | 'demo';
}> = ({
  open,
  onClose,
  onOpenDeposit,
  initialFromId = 'wallet-usd',
  initialToId = 'cfds-std2',
  accountMode: accountModeProp = 'real',
}) => {
  const { user, accounts, refreshAll, showToast } = useApp();
  const [fromId, setFromId] = useState(initialFromId);
  const [toId, setToId] = useState(initialToId);
  const [amount, setAmount] = useState('');
  const [selectorMode, setSelectorMode] = useState<'from' | 'to' | null>(null);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setFromId(initialFromId);
      setToId(initialToId);
      setAmount('');
      setSelectorMode(null);
    }
  }, [open, initialFromId, initialToId]);

  const effectiveMode = accountModeProp === 'demo' ? 'demo' : 'real';
  const canonical = getCanonicalBalances(user, accounts, effectiveMode, null);
  const modeCfdAccounts = accounts.filter(
    (a) => Boolean(a.is_virtual) === (effectiveMode === 'demo') && (a.platform?.includes('mt5') || a.platform === 'ctrader')
  );

  const items: TransferTargetItem[] = useMemo(() => {
    const std2Acc = modeCfdAccounts.find((a) => String(a.account_type || '').toLowerCase().includes('standard 2'));
    const std3Acc = modeCfdAccounts.find((a) => String(a.account_type || '').toLowerCase().includes('standard 3'));
    const swfAcc = modeCfdAccounts.find((a) => String(a.account_type || '').toLowerCase().includes('swap'));
    const ctrAcc = modeCfdAccounts.find(
      (a) => a.platform === 'ctrader' || String(a.account_type || '').toLowerCase().includes('ctrader')
    );

    const std2Bal = Number(std2Acc?.balance ?? 0);
    const std3Bal = Number(
      std3Acc?.balance ?? (std2Acc ? (std2Bal === 0 ? canonical.mt5StdBal : 0) : canonical.mt5StdBal)
    );
    const swfBal = Number(swfAcc?.balance ?? canonical.mt5GoldBal);
    const ctrBal = Number(ctrAcc?.balance ?? 0);

    const spot = effectiveMode === 'real' ? user?.real_exchange_balances || {} : user?.exchange_balances || {};
    const cryptoWallets: Array<{ code: string; label: string; dec: number }> = [
      { code: 'TRX', label: 'TRX', dec: 6 },
      { code: 'LTC', label: 'Litecoin', dec: 8 },
      { code: 'BTC', label: 'Bitcoin', dec: 8 },
      { code: 'BNB', label: 'BNB', dec: 8 },
      { code: 'ETH', label: 'Ethereum', dec: 8 },
      { code: 'SOL', label: 'Solana', dec: 8 },
      { code: 'DOGE', label: 'Dogecoin', dec: 8 },
      { code: 'ADA', label: 'Cardano', dec: 6 },
      { code: 'AVAX', label: 'AVAX (Avalanche C-Chain)', dec: 8 },
      { code: 'POL', label: 'POL (Polygon Network)', dec: 8 },
      { code: 'USDT', label: 'USDT', dec: 2 },
      { code: 'USDC', label: 'USDC', dec: 2 },
    ];

    return [
      {
        id: 'cfds-std2',
        group: 'Trading',
        label: 'CFDs | Standard 2',
        currency: 'USD',
        decimals: 2,
        balance: std2Bal,
        backendKey: 'CFDs | Standard 2',
        accountId: std2Acc?.id ?? null,
        icon: <Mt5Badge variant="STD" size="sm" />,
      },
      {
        id: 'cfds-std3',
        group: 'Trading',
        label: 'CFDs | Standard 3',
        currency: 'USD',
        decimals: 2,
        balance: std3Bal,
        backendKey: 'CFDs | Standard 3',
        accountId: std3Acc?.id ?? null,
        icon: <Mt5Badge variant="STD" size="sm" />,
      },
      {
        id: 'cfds-swf',
        group: 'Trading',
        label: 'Swap-Free',
        currency: 'USD',
        decimals: 2,
        balance: swfBal,
        backendKey: 'Swap-Free',
        accountId: swfAcc?.id ?? null,
        icon: <Mt5Badge variant="SWF" size="sm" />,
      },
      {
        id: 'ctrader',
        group: 'Trading',
        label: 'cTrader',
        currency: 'USD',
        decimals: 2,
        balance: ctrBal,
        backendKey: 'cTrader',
        accountId: ctrAcc?.id ?? null,
        icon: <CTraderBadge size="sm" />,
      },
      {
        id: 'options',
        group: 'Trading',
        label: 'Options',
        currency: 'USD',
        decimals: 2,
        balance: canonical.optionsBal,
        backendKey: 'USD Wallet',
        icon: <OptionsSquareBadge size="sm" monochrome />,
      },
      {
        id: 'wallet-usd',
        group: 'Wallet',
        label: 'US Dollar',
        currency: 'USD',
        decimals: 2,
        balance: canonical.optionsBal,
        backendKey: 'USD Wallet',
        icon: <UsCircleFlagIcon size="md" />,
      },
      ...cryptoWallets.map((cw) => ({
        id: `wallet-${cw.code.toLowerCase()}`,
        group: 'Wallet' as const,
        label: cw.label,
        currency: cw.code,
        decimals: cw.dec,
        balance: Number((spot as any)[cw.code] ?? 0),
        backendKey: 'Deriv Exchange',
        icon: <CryptoCircleBadge code={cw.code} />,
      })),
    ];
  }, [
    canonical.mt5GoldBal,
    canonical.mt5StdBal,
    canonical.optionsBal,
    effectiveMode,
    modeCfdAccounts,
    user?.exchange_balances,
    user?.real_exchange_balances,
  ]);

  if (!open) return null;

  const fromItem = items.find((i) => i.id === fromId) || items.find((i) => i.id === 'wallet-usd')!;
  const toItem = items.find((i) => i.id === toId) || items[0];

  const handleSwap = () => {
    const prevFrom = fromId;
    setFromId(toId);
    setToId(prevFrom);
  };

  const applyPct = (pct: number) => {
    const v = Number((fromItem.balance * pct).toFixed(2));
    setAmount(v > 0 ? String(v) : '0.00');
  };

  const numericAmount = Number(amount);
  const canTransfer =
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    numericAmount <= fromItem.balance &&
    fromItem.id !== toItem.id;

  const handleExecuteTransfer = async () => {
    if (!canTransfer) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/cashier/transfer', {
        method: 'POST',
        body: JSON.stringify({
          account_from: fromItem.backendKey,
          account_to: toItem.backendKey,
          account_from_id: fromItem.accountId ?? null,
          account_to_id: toItem.accountId ?? null,
          amount: numericAmount,
          currency: 'USD',
          accountMode: effectiveMode,
        }),
      });
      await refreshAll();
      showToast(`Transferred ${numericAmount.toFixed(2)} USD to ${toItem.label}`, 'success');
      setAmount('');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Transfer failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSelectorItems = items.filter(
    (item) =>
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.currency.toLowerCase().includes(search.toLowerCase())
  );
  const tradingList = filteredSelectorItems.filter((i) => i.group === 'Trading');
  const walletList = filteredSelectorItems.filter((i) => i.group === 'Wallet');

  return (
    <div className="fixed inset-0 z-50 bg-[#0E0F13] text-white flex flex-col">
      <div className="max-w-lg w-full mx-auto flex-1 flex flex-col px-5 pt-4 pb-6 overflow-y-auto">
        <div className="mb-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-[#242833] hover:bg-[#2F3544] flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>
        </div>

        <h1 className="font-display text-[22px] font-bold tracking-tight mb-5">Transfer</h1>

        {/* From / Swap / To Card Stack matching 105241 */}
        <div className="relative space-y-2.5">
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSelectorMode('from');
            }}
            className="w-full p-4 rounded-2xl bg-[#181B22] border border-white/[0.1] flex items-center justify-between text-left cursor-pointer hover:border-white/20"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="space-y-2 w-full">
                <p className="text-[12px] text-[#9BA3B0]">From</p>
                <div className="flex items-center gap-3">
                  {fromItem.icon}
                  <div>
                    <p className="text-[15px] font-bold text-white leading-tight">{fromItem.label}</p>
                    <p className="text-[12px] text-[#9BA3B0] font-mono-num mt-0.5">
                      {fromItem.balance.toFixed(fromItem.decimals)} {fromItem.currency}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-[#9BA3B0] shrink-0" />
          </button>

          {/* Overlapping Swap Circle */}
          <div className="flex justify-center -my-3 relative z-10 pointer-events-none">
            <button
              type="button"
              onClick={handleSwap}
              aria-label="Swap accounts"
              className="pointer-events-auto w-9 h-9 rounded-full bg-[#242833] hover:bg-[#313644] border border-[#0E0F13] flex items-center justify-center cursor-pointer shadow-md"
            >
              <ArrowUpDown className="w-4 h-4 text-white" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSelectorMode('to');
            }}
            className="w-full p-4 rounded-2xl bg-[#181B22] border border-white/[0.1] flex items-center justify-between text-left cursor-pointer hover:border-white/20"
          >
            <div className="space-y-2">
              <p className="text-[12px] text-[#9BA3B0]">To</p>
              <div className="flex items-center gap-3">
                {toItem.icon}
                <div>
                  <p className="text-[15px] font-bold text-white leading-tight">{toItem.label}</p>
                  <p className="text-[12px] text-[#9BA3B0] font-mono-num mt-0.5">
                    {toItem.balance.toFixed(toItem.decimals)} {toItem.currency}
                  </p>
                </div>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-[#9BA3B0] shrink-0" />
          </button>
        </div>

        {/* No funds warning banner matching 105241 */}
        {fromItem.balance <= 0 && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenDeposit?.();
            }}
            className="mt-3.5 w-full px-4 py-3 rounded-xl bg-[#FDF5E6] text-[#B45309] flex items-center justify-between text-[13px] font-medium cursor-pointer"
          >
            <span>
              No funds in Wallet. <span className="underline font-semibold">Deposit now.</span>
            </span>
            <span className="w-6 h-6 rounded-full bg-[#E69D00] text-white flex items-center justify-center shrink-0">
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </span>
          </button>
        )}

        {/* Amount Box + Chips matching 105241 */}
        <div className="mt-4">
          <div className="flex items-center px-4 py-3.5 rounded-xl bg-[#181B22] border border-white/[0.12] focus-within:border-white/35">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-[15px] text-white placeholder-[#7A8291] outline-none font-mono-num"
            />
            <span className="text-[14px] text-[#9BA3B0] font-semibold ml-2">{fromItem.currency}</span>
          </div>
          <p className="text-[12px] text-[#9BA3B0] mt-2">
            Available: {fromItem.balance.toFixed(fromItem.decimals)} {fromItem.currency}
          </p>

          <div className="grid grid-cols-4 gap-2.5 mt-4">
            {[
              { label: '25%', pct: 0.25 },
              { label: '50%', pct: 0.5 },
              { label: '75%', pct: 0.75 },
              { label: '100%', pct: 1 },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => applyPct(chip.pct)}
                className="py-2 rounded-full border border-white/25 hover:border-white/50 text-[13px] font-medium text-white cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          disabled={!canTransfer || submitting}
          onClick={handleExecuteTransfer}
          className={`w-full mt-8 py-3.5 rounded-full text-[15px] font-semibold transition-colors ${
            canTransfer
              ? 'bg-[#FF444F] hover:bg-[#E63946] text-white cursor-pointer'
              : 'bg-[#4E2228] text-white/40 cursor-not-allowed'
          }`}
        >
          {submitting ? 'Transferring...' : 'Transfer'}
        </button>
      </div>

      {/* From / To Bottom Selector Sheet matching 105222 & 105231 */}
      {selectorMode && (
        <div
          className="fixed inset-0 z-60 bg-black/70 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
          onClick={() => setSelectorMode(null)}
        >
          <div
            className="w-full sm:max-w-lg bg-[#181B22] text-white rounded-t-[26px] sm:rounded-[26px] px-5 pt-3 pb-7 border-t sm:border border-white/[0.08] max-h-[82vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-white/25 mx-auto mb-4 sm:hidden" />
            <h2 className="font-display text-[17px] font-bold text-center mb-4">
              {selectorMode === 'from' ? 'From' : 'To'}
            </h2>

            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#13151B] border border-white/[0.08] mb-5">
              <Search className="w-4 h-4 text-[#8E95A2]" />
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-white placeholder-[#7A8291] outline-none"
              />
            </div>

            {tradingList.length > 0 && (
              <div className="mb-5">
                <p className="text-[13px] font-medium text-[#9BA3B0] mb-2.5">Trading</p>
                <div className="space-y-2.5">
                  {tradingList.map((item) => {
                    const selected = (selectorMode === 'from' ? fromId : toId) === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (selectorMode === 'from') setFromId(item.id);
                          else setToId(item.id);
                          setSelectorMode(null);
                        }}
                        className="w-full p-3.5 rounded-2xl bg-[#222631] hover:bg-[#292E3C] border border-white/[0.06] flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          {item.icon}
                          <div>
                            <p className="text-[14px] font-semibold text-white">{item.label}</p>
                            <p className="text-[12px] text-[#9BA3B0] font-mono-num">
                              {item.balance.toFixed(item.decimals)} {item.currency}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center ${
                            selected ? 'bg-white' : 'border border-white/40'
                          }`}
                        >
                          {selected && <span className="w-2 h-2 rounded-full bg-[#181B22]" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {walletList.length > 0 && (
              <div>
                <p className="text-[13px] font-medium text-[#9BA3B0] mb-2.5">Wallet</p>
                <div className="space-y-2.5">
                  {walletList.map((item) => {
                    const selected = (selectorMode === 'from' ? fromId : toId) === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (selectorMode === 'from') setFromId(item.id);
                          else setToId(item.id);
                          setSelectorMode(null);
                        }}
                        className="w-full p-3.5 rounded-2xl bg-[#222631] hover:bg-[#292E3C] border border-white/[0.06] flex items-center justify-between text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          {item.icon}
                          <div>
                            <p className="text-[14px] font-semibold text-white">{item.label}</p>
                            <p className="text-[12px] text-[#9BA3B0] font-mono-num">
                              {item.balance.toFixed(item.decimals)} {item.currency}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center ${
                            selected ? 'bg-white' : 'border border-white/40'
                          }`}
                        >
                          {selected && <span className="w-2 h-2 rounded-full bg-[#181B22]" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const AllTransactionsScreen: React.FC<{
  open: boolean;
  onClose: () => void;
  transactions: CashierTransaction[];
}> = ({ open, onClose, transactions }) => {
  if (!open) return null;

  const grouped: Record<string, CashierTransaction[]> = {};
  for (const tx of transactions) {
    const dt = new Date(tx.created_at);
    const label = Number.isNaN(dt.getTime())
      ? 'Recent'
      : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(tx);
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0E0F13] text-white flex flex-col">
      <div className="max-w-2xl w-full mx-auto flex-1 flex flex-col px-5 pt-4 pb-8 overflow-y-auto">
        <div className="mb-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-[#242833] hover:bg-[#2F3544] flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>
        </div>

        <h1 className="font-display text-[22px] font-bold tracking-tight mb-5">All transactions</h1>

        {transactions.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#9BA3B0]">No completed deposits, withdrawals, or transfers yet.</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([dateLabel, rows]) => (
              <section key={dateLabel}>
                <h2 className="text-[13px] font-semibold text-white mb-2">{dateLabel}</h2>
                <div className="divide-y divide-white/[0.08]">
                  {rows.map((tx) => {
                    const type = String(tx.tx_type || '').toLowerCase();
                    const isDeposit = type === 'deposit' || type === 'credit';
                    const isWithdraw = type === 'withdrawal' || type === 'withdraw' || type === 'debit';
                    const title = isDeposit ? 'Deposit' : isWithdraw ? 'Withdraw' : 'Transfer';
                    const subtitle = !isDeposit && !isWithdraw ? tx.method : undefined;
                    const Icon = isDeposit ? Plus : isWithdraw ? Minus : ArrowLeftRight;
                    const statusLabel =
                      tx.status === 'completed' || !tx.status
                        ? 'Completed'
                        : tx.status.charAt(0).toUpperCase() + tx.status.slice(1);
                    return (
                      <div key={tx.id} className="py-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <Icon className="w-[17px] h-[17px] text-[#C7CDD6] shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[14px] font-medium text-white">{title}</p>
                            {subtitle && <p className="text-[12px] text-[#8E95A2] truncate">{subtitle}</p>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[14px] font-semibold font-mono-num text-white tabular-nums">
                            {Number(tx.amount || 0).toFixed(2)} {tx.currency || 'USD'}
                          </p>
                          <p className="text-[12px] text-[#17B978] font-medium flex items-center justify-end gap-1">
                            {statusLabel === 'Completed' ? null : <CheckCircle2 className="w-3 h-3" />}
                            <span>{statusLabel}</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
