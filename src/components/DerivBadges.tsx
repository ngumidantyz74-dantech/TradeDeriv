import React from 'react';

export const Mt5Badge: React.FC<{ variant: 'STD' | 'SWF' | 'GOLD' | 'FIN' | 'ZSP' | 'ZRS'; size?: 'sm' | 'md' | 'lg' }> = ({
  variant,
  size = 'md',
}) => {
  const dims =
    size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-14 h-14 rounded-2xl' : 'w-10 h-10 rounded-xl';
  const mainText = size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-[16px]' : 'text-[12px]';
  const subText = size === 'sm' ? 'text-[6.5px]' : size === 'lg' ? 'text-[10px]' : 'text-[7.5px]';

  const normalized = variant === 'ZSP' ? 'ZRS' : variant;
  const footerClass =
    normalized === 'SWF'
      ? 'bg-[#00A8B5] text-white'
      : normalized === 'GOLD'
        ? 'bg-[#D69B08] text-[#111319]'
        : normalized === 'FIN'
          ? 'bg-gradient-to-r from-[#5EC822] to-[#3DA816] text-white'
          : normalized === 'ZRS'
            ? 'bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white'
            : 'bg-[#12275E] text-white';

  return (
    <div
      className={`${dims} overflow-hidden flex flex-col shrink-0 shadow-xs border border-white/10 select-none`}
      aria-hidden="true"
    >
      <div className="flex-1 bg-gradient-to-b from-[#3B76F6] to-[#1D4EBA] flex items-center justify-center">
        <span className={`font-display font-extrabold tracking-tight text-white leading-none ${mainText}`}>MT5</span>
      </div>
      <div className={`py-[2px] flex items-center justify-center font-bold tracking-wider leading-none ${footerClass} ${subText}`}>
        {normalized}
      </div>
    </div>
  );
};

export const OptionsSquareBadge: React.FC<{ size?: 'sm' | 'md'; monochrome?: boolean }> = ({
  size = 'md',
  monochrome = false,
}) => {
  const dims = size === 'sm' ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-xl';
  return (
    <div
      className={`${dims} ${
        monochrome ? 'bg-[#353A47] text-white' : 'bg-[#FF444F] text-white'
      } flex items-center justify-center shrink-0 shadow-xs`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17L17 7" />
        <path d="M11 7h6v6" />
        <path d="M13 17H7v-6" />
      </svg>
    </div>
  );
};

export const CTraderBadge: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
  const dims = size === 'sm' ? 'w-9 h-9 rounded-lg' : 'w-10 h-10 rounded-xl';
  return (
    <div
      className={`${dims} bg-gradient-to-br from-[#FF4D58] to-[#D92D3A] text-white flex items-center justify-center shrink-0 shadow-sm`}
      aria-hidden="true"
    >
      <span className="font-display font-extrabold italic text-[16px] tracking-tighter">cT</span>
    </div>
  );
};

export const UsCircleFlagIcon: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dims = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  return (
    <svg viewBox="0 0 32 32" className={`${dims} rounded-full shrink-0 overflow-hidden`} aria-hidden="true">
      <clipPath id="us-circle-clip">
        <circle cx="16" cy="16" r="16" />
      </clipPath>
      <g clipPath="url(#us-circle-clip)">
        <rect width="32" height="32" fill="#FFFFFF" />
        <rect y="0" width="32" height="2.6" fill="#C81E2B" />
        <rect y="5.1" width="32" height="2.6" fill="#C81E2B" />
        <rect y="10.2" width="32" height="2.6" fill="#C81E2B" />
        <rect y="15.3" width="32" height="2.6" fill="#C81E2B" />
        <rect y="20.4" width="32" height="2.6" fill="#C81E2B" />
        <rect y="25.5" width="32" height="2.6" fill="#C81E2B" />
        <rect y="30.2" width="32" height="2.6" fill="#C81E2B" />
        <rect width="15.5" height="17.9" fill="#2A3A7E" />
        <circle cx="3.2" cy="3.2" r="0.9" fill="#FFFFFF" />
        <circle cx="7.4" cy="3.2" r="0.9" fill="#FFFFFF" />
        <circle cx="11.6" cy="3.2" r="0.9" fill="#FFFFFF" />
        <circle cx="5.3" cy="6.2" r="0.9" fill="#FFFFFF" />
        <circle cx="9.5" cy="6.2" r="0.9" fill="#FFFFFF" />
        <circle cx="13.5" cy="6.2" r="0.9" fill="#FFFFFF" />
        <circle cx="3.2" cy="9.2" r="0.9" fill="#FFFFFF" />
        <circle cx="7.4" cy="9.2" r="0.9" fill="#FFFFFF" />
        <circle cx="11.6" cy="9.2" r="0.9" fill="#FFFFFF" />
        <circle cx="5.3" cy="12.2" r="0.9" fill="#FFFFFF" />
        <circle cx="9.5" cy="12.2" r="0.9" fill="#FFFFFF" />
        <circle cx="3.2" cy="15.0" r="0.9" fill="#FFFFFF" />
        <circle cx="7.4" cy="15.0" r="0.9" fill="#FFFFFF" />
        <circle cx="11.6" cy="15.0" r="0.9" fill="#FFFFFF" />
      </g>
    </svg>
  );
};

export const CryptoCircleBadge: React.FC<{ code: string }> = ({ code }) => {
  const styles: Record<string, { bg: string; label: string; text?: string }> = {
    TRX: { bg: '#EB0029', label: '▽' },
    LTC: { bg: '#B5B8BD', label: 'Ł', text: '#FFFFFF' },
    BTC: { bg: '#F7931A', label: '₿' },
    BNB: { bg: '#F3BA2F', label: '❖', text: '#111319' },
    ETH: { bg: '#E2E8F0', label: '♦', text: '#111319' },
    SOL: { bg: '#14171F', label: '≡', text: '#22D3EE' },
    DOGE: { bg: '#C2A633', label: 'Ð' },
    ADA: { bg: '#0033AD', label: '✳' },
    AVAX: { bg: '#E84142', label: 'A' },
    POL: { bg: '#7B3FE4', label: '∞' },
    USDT: { bg: '#26A17B', label: '₮' },
    USDC: { bg: '#2775CA', label: '$' },
  };
  const s = styles[code] || { bg: '#3B4254', label: code.slice(0, 1) };
  return (
    <span
      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[15px] shrink-0 border border-white/10"
      style={{ backgroundColor: s.bg, color: s.text || '#FFFFFF' }}
      aria-hidden="true"
    >
      {s.label}
    </span>
  );
};

export const MethodTileArtwork: React.FC<{ kind: 'dusupay' | 'payment_agent' | 'mpesa' }> = ({ kind }) => {
  if (kind === 'dusupay') {
    return (
      <div className="h-9 flex items-center justify-center select-none" aria-hidden="true">
        <span className="font-display font-extrabold text-[15px] tracking-tight">
          <span className="text-[#C026D3]">Dusu</span>
          <span className="text-[#FACC15]">Pay</span>
        </span>
      </div>
    );
  }
  if (kind === 'mpesa') {
    return (
      <div className="h-9 flex items-center justify-center relative select-none" aria-hidden="true">
        <span className="font-display font-extrabold text-[14px] tracking-tight text-[#65A30D]">M</span>
        <div className="w-3.5 h-6 rounded-[3px] bg-white border border-slate-300 mx-[1px] flex items-center justify-center relative -rotate-6">
          <span className="w-2.5 h-1.5 bg-[#DC2626] rounded-[1px]" />
        </div>
        <span className="font-display font-extrabold text-[14px] tracking-tight text-[#65A30D]">PESA</span>
      </div>
    );
  }
  return (
    <div className="h-9 flex items-center justify-center gap-1.5 select-none" aria-hidden="true">
      <div className="w-6 h-5 rounded bg-white text-[#111319] flex items-center justify-center text-[10px] font-black">
        $
      </div>
      <div className="text-left leading-[1.05] text-[9px] font-bold text-white">
        <div>Payment</div>
        <div>Agent</div>
      </div>
    </div>
  );
};

export const TradingViewBadge: React.FC = () => (
  <div
    className="w-9 h-9 rounded-xl bg-[#090B0E] border border-white/10 text-white flex flex-col items-center justify-center shrink-0"
    aria-hidden="true"
  >
    <span className="font-display font-black text-[11px] leading-none tracking-tighter">TV</span>
    <span className="text-[5px] text-slate-300 leading-none mt-0.5">TradingView</span>
  </div>
);

export const MoreDotsBadge: React.FC = () => {
  const cells = [
    '#FF444F', '#FF444F', '#FFFFFF',
    '#FFFFFF', '#FF444F', '#FF444F',
    '#FFFFFF', '#FFFFFF', '#FF444F',
  ];
  return (
    <div className="w-9 h-9 rounded-xl bg-[#111318] flex items-center justify-center shrink-0" aria-hidden="true">
      <div className="grid grid-cols-3 gap-[3px]">
        {cells.map((color, idx) => (
          <span key={idx} className="w-[6px] h-[6px] rounded-[1.5px]" style={{ backgroundColor: color }} />
        ))}
      </div>
    </div>
  );
};

export const AskAmyPill: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#1D202A] via-[#262330] to-[#2B2524] border border-white/[0.12] hover:border-white/25 text-white text-[13px] font-semibold shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
  >
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path
        d="M11 3L12.7 8.3L18 10L12.7 11.7L11 17L9.3 11.7L4 10L9.3 8.3L11 3Z"
        fill="#A49BFF"
      />
      <path
        d="M18.5 14L19.3 16.5L21.8 17.3L19.3 18.1L18.5 20.6L17.7 18.1L15.2 17.3L17.7 16.5L18.5 14Z"
        fill="#E0C389"
      />
    </svg>
    <span>Ask Amy</span>
  </button>
);

export const SynthCandleBadge: React.FC<{ num: string; is1s?: boolean }> = ({ num, is1s = true }) => (
  <div className="relative w-10 h-9 flex items-end justify-center shrink-0 select-none" aria-hidden="true">
    <svg viewBox="0 0 36 28" className="w-8 h-7">
      <line x1="6" y1="7" x2="6" y2="25" stroke="#00B5C8" strokeWidth="1.5" />
      <rect x="4" y="11" width="4" height="8" rx="0.8" fill="#00B5C8" />
      <line x1="13" y1="5" x2="13" y2="23" stroke="#00B5C8" strokeWidth="1.5" />
      <rect x="11" y="9" width="4" height="9" rx="0.8" fill="#00B5C8" />
      <line x1="20" y1="9" x2="20" y2="26" stroke="#00B5C8" strokeWidth="1.5" />
      <rect x="18" y="12" width="4" height="8" rx="0.8" fill="#00B5C8" />
      <line x1="27" y1="6" x2="27" y2="22" stroke="#00B5C8" strokeWidth="1.5" />
      <rect x="25" y="10" width="4" height="7" rx="0.8" fill="#00B5C8" />
    </svg>
    <span className="absolute -top-0.5 left-0 px-1 py-[1px] rounded bg-[#232732] border border-white/10 text-[9px] font-bold text-white leading-none tabular-nums">
      {num}
    </span>
    {is1s && (
      <span className="absolute -top-0.5 right-0 px-1 py-[1px] rounded-full bg-[#FF444F] text-[8px] font-bold text-white leading-none">
        1s
      </span>
    )}
  </div>
);

export const CrashBoomGraphic: React.FC = () => (
  <div className="relative w-20 h-16 shrink-0 select-none" aria-hidden="true">
    <div className="absolute top-0 left-1 w-12 h-11 rounded-xl bg-gradient-to-br from-[#2B303D] to-[#171A21] border border-white/15 -rotate-6 flex items-center justify-center shadow-md">
      <svg viewBox="0 0 40 24" className="w-9 h-5" fill="none">
        <path d="M2 16L10 13L17 15L23 6L29 14L38 10" stroke="#CBD5E1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
    <div className="absolute bottom-0 right-1 w-12 h-11 rounded-xl bg-gradient-to-br from-[#FF5660] to-[#B81D27] border border-white/20 rotate-6 flex items-center justify-center shadow-lg">
      <svg viewBox="0 0 40 24" className="w-9 h-5" fill="none">
        <path d="M2 18L11 10L17 13L25 5L31 12L38 16" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  </div>
);

export const AiAnalysisGraphic: React.FC = () => (
  <div className="relative w-24 h-16 shrink-0 select-none flex items-center justify-center" aria-hidden="true">
    <div className="w-16 h-12 rounded-lg bg-[#F8FAFC] border border-white/40 shadow-md p-1.5 flex flex-col justify-between -rotate-2">
      <div className="flex gap-1">
        <span className="w-1 h-1 rounded-full bg-[#FF444F]" />
        <span className="w-1 h-1 rounded-full bg-[#F59E0B]" />
        <span className="w-1 h-1 rounded-full bg-[#10B981]" />
      </div>
      <svg viewBox="0 0 56 26" className="w-full h-7">
        <line x1="6" y1="6" x2="6" y2="20" stroke="#EF4444" strokeWidth="1.5" />
        <rect x="4.5" y="9" width="3" height="7" fill="#EF4444" />
        <line x1="15" y1="4" x2="15" y2="18" stroke="#10B981" strokeWidth="1.5" />
        <rect x="13.5" y="7" width="3" height="8" fill="#10B981" />
        <line x1="24" y1="8" x2="24" y2="22" stroke="#EF4444" strokeWidth="1.5" />
        <rect x="22.5" y="11" width="3" height="7" fill="#EF444F" />
        <line x1="33" y1="5" x2="33" y2="19" stroke="#10B981" strokeWidth="1.5" />
        <rect x="31.5" y="8" width="3" height="8" fill="#10B981" />
        <line x1="42" y1="3" x2="42" y2="16" stroke="#10B981" strokeWidth="1.5" />
        <rect x="40.5" y="6" width="3" height="6" fill="#10B981" />
      </svg>
    </div>
    <span className="absolute bottom-0.5 left-1 px-1.5 py-0.5 rounded bg-gradient-to-br from-slate-200 to-slate-400 text-[#111319] text-[6px] font-black -rotate-12 shadow">
      SILVER
    </span>
    <span className="absolute bottom-0 right-7 w-5 h-5 rounded-full bg-[#F7931A] text-white text-[10px] font-black flex items-center justify-center shadow border border-white/40">
      ₿
    </span>
    <span className="absolute bottom-0 right-0 px-2 py-1 rounded bg-gradient-to-br from-[#FACC15] to-[#CA8A04] text-[#111319] text-[6.5px] font-black rotate-12 shadow">
      GOLD
    </span>
  </div>
);

export const TradeOnGoldGraphic: React.FC = () => (
  <div className="w-full h-40 bg-[#050608] relative overflow-hidden flex items-center justify-center" aria-hidden="true">
    <div className="relative flex flex-col items-center justify-end h-32">
      {/* Upper tilted gold bullion bar */}
      <div className="w-20 h-9 rounded-md bg-gradient-to-br from-[#FFF1A8] via-[#FACC15] to-[#B45309] border border-[#FEF08A]/70 shadow-[0_6px_22px_rgba(250,204,21,0.3)] -rotate-[26deg] translate-y-2.5 flex items-center justify-center">
        <div className="text-center leading-tight">
          <p className="text-[7px] font-extrabold text-[#78350F] tracking-wider uppercase">Gold</p>
          <p className="text-[6px] font-bold text-[#92400E]">999.9</p>
        </div>
      </div>
      {/* Lower horizontal gold bar */}
      <div className="w-24 h-7 rounded bg-gradient-to-r from-[#D97706] via-[#FACC15] to-[#B45309] border border-[#FDE047]/60 shadow-md" />
      {/* Metallic silver pedestal */}
      <div className="w-36 h-4 rounded-b-lg rounded-t-xs bg-gradient-to-r from-[#64748B] via-[#E2E8F0] to-[#475569] shadow-lg" />
    </div>
  </div>
);

export const AccumulatorCoinGraphic: React.FC = () => (
  <div className="w-full h-40 bg-gradient-to-b from-[#090B0E] via-[#111520] to-[#171B24] relative overflow-hidden flex items-center justify-center" aria-hidden="true">
    <svg viewBox="0 0 320 120" className="w-full h-full absolute inset-0" preserveAspectRatio="none">
      <path d="M0 95 C90 95, 110 38, 170 48 C230 58, 250 18, 320 18" stroke="#3B4B6B" strokeWidth="26" fill="none" opacity="0.45" />
    </svg>
    <div className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-b from-[#F1F5F9] to-[#94A3B8] shadow-[0_10px_28px_rgba(0,0,0,0.65)] border-2 border-white flex items-center justify-center">
      <svg viewBox="0 0 36 36" className="w-9 h-9" fill="none">
        <line x1="7" y1="10" x2="29" y2="10" stroke="#00B5C8" strokeWidth="2.8" strokeLinecap="round" />
        <line x1="7" y1="26" x2="29" y2="26" stroke="#00B5C8" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M8 19L13 15L19 21L28 14" stroke="#FF444F" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  </div>
);
