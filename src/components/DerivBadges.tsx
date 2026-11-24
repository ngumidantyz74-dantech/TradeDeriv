import React from 'react';

export const Mt5Badge: React.FC<{ variant: 'STD' | 'SWF' | 'GOLD' | 'FIN' | 'ZSP'; size?: 'sm' | 'md' | 'lg' }> = ({
  variant,
  size = 'md',
}) => {
  const dims =
    size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-14 h-14 rounded-2xl' : 'w-10 h-10 rounded-xl';
  const mainText = size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-[16px]' : 'text-[12px]';
  const subText = size === 'sm' ? 'text-[6.5px]' : size === 'lg' ? 'text-[10px]' : 'text-[7.5px]';

  const footerClass =
    variant === 'SWF'
      ? 'bg-[#00A8B5] text-white'
      : variant === 'GOLD'
        ? 'bg-[#D69B08] text-[#111319]'
        : variant === 'FIN'
          ? 'bg-[#00A878] text-white'
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
        {variant}
      </div>
    </div>
  );
};

export const OptionsSquareBadge: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
  const dims = size === 'sm' ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-xl';
  return (
    <div
      className={`${dims} bg-[#FF444F] text-white flex items-center justify-center shrink-0 shadow-xs`}
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
  const dims = size === 'sm' ? 'w-9 h-9 rounded-lg' : 'w-11 h-11 rounded-xl';
  return (
    <div
      className={`${dims} bg-gradient-to-br from-[#FF4D58] to-[#D92D3A] text-white flex items-center justify-center shrink-0 shadow-sm`}
      aria-hidden="true"
    >
      <span className="font-display font-extrabold italic text-[17px] tracking-tighter">cT</span>
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

export const AccumulatorCoinGraphic: React.FC = () => (
  <div className="w-full h-36 bg-gradient-to-b from-[#090B0E] via-[#111520] to-[#171B24] relative overflow-hidden flex items-center justify-center" aria-hidden="true">
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
