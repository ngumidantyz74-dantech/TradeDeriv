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

export const CryptoCircleBadge: React.FC<{ code: string; size?: 'xs' | 'sm' | 'md' }> = ({ code, size = 'md' }) => {
  const styles: Record<string, { bg: string; label: string; text?: string }> = {
    TRX: { bg: '#EB0029', label: '▽' },
    LTC: { bg: '#B5B8BD', label: 'Ł', text: '#FFFFFF' },
    BTC: { bg: '#F7931A', label: '₿' },
    WBTC: { bg: '#282138', label: '₿', text: '#F7931A' },
    BNB: { bg: '#F3BA2F', label: '❖', text: '#FFFFFF' },
    ETH: { bg: '#E2E8F0', label: '♦', text: '#111319' },
    SOL: { bg: '#14171F', label: '≡', text: '#22D3EE' },
    DOGE: { bg: '#C2A633', label: 'Ð' },
    ADA: { bg: '#0033AD', label: '✳' },
    AVAX: { bg: '#E84142', label: 'A' },
    POL: { bg: '#7B3FE4', label: '∞' },
    DOT: { bg: '#E6007A', label: '●' },
    XRP: { bg: '#111319', label: '✕' },
    SUI: { bg: '#4DA2FF', label: '💧' },
    TON: { bg: '#0098EA', label: '▽' },
    LINK: { bg: '#2A5ADA', label: '⬡' },
    UNI: { bg: '#FF007A', label: 'U' },
    AAVE: { bg: '#B6509E', label: 'A' },
    NEAR: { bg: '#111319', label: 'N' },
    ARB: { bg: '#28A0F0', label: 'A' },
    OP: { bg: '#FF0420', label: 'OP' },
    SHIB: { bg: '#FFA409', label: 'S' },
    USDT: { bg: '#26A17B', label: '₮' },
    USDC: { bg: '#2775CA', label: '$' },
  };
  const s = styles[code] || { bg: '#3B4254', label: code.slice(0, 1) };
  const dims =
    size === 'xs'
      ? 'w-5 h-5 text-[11px]'
      : size === 'sm'
        ? 'w-7 h-7 text-[13px]'
        : 'w-8 h-8 text-[15px]';
  return (
    <span
      className={`${dims} rounded-full flex items-center justify-center font-bold shrink-0 border border-white/10 leading-none`}
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

export const BotInstrumentIcon: React.FC<{
  symbol?: string | null;
  size?: 'sm' | 'md';
}> = ({ symbol, size = 'sm' }) => {
  const s = String(symbol || '').toUpperCase().trim();
  const boxCls =
    size === 'sm'
      ? 'relative w-8 h-7 shrink-0 select-none flex items-end justify-center'
      : 'relative w-9 h-8 shrink-0 select-none flex items-end justify-center';
  const svgCls = size === 'sm' ? 'w-[28px] h-[25px]' : 'w-[32px] h-[28px]';
  const numCls =
    size === 'sm'
      ? 'absolute top-0 left-0 px-[3px] py-[1px] rounded-[2px] bg-[#343a40] text-[7px] font-extrabold text-white leading-none tabular-nums'
      : 'absolute -top-0.5 left-0 px-1 py-[1px] rounded-[2px] bg-[#343a40] text-[8px] font-extrabold text-white leading-none tabular-nums';

  // 1s Volatility Indices: exact SVG candlestick badge from trading_app_exact_interactive_replica.html
  const hzMatch = s.match(/^1HZ(\d+)V$/);
  if (hzMatch) {
    const label = hzMatch[1];
    return (
      <div className={boxCls} aria-hidden="true">
        <svg viewBox="0 0 28 24" className={svgCls}>
          <rect x="0" y="1" width="16" height="8" rx="1.5" fill="#343a40" />
          <text
            x="8"
            y="6.8"
            fill="#ffffff"
            fontSize={label.length >= 3 ? '5.4' : '6'}
            fontWeight="700"
            textAnchor="middle"
            fontFamily="Arial, sans-serif"
          >
            {label}
          </text>
          <circle cx="22.5" cy="5" r="4" fill="#ef5260" />
          <text
            x="22.5"
            y="6.8"
            fill="#ffffff"
            fontSize="5"
            fontWeight="700"
            textAnchor="middle"
            fontFamily="Arial, sans-serif"
          >
            1s
          </text>
          <line x1="4" y1="11" x2="4" y2="21" stroke="#43a7ad" strokeWidth="1.2" />
          <rect x="2.5" y="13" width="3" height="5" fill="#43a7ad" />
          <line x1="10" y1="9" x2="10" y2="23" stroke="#43a7ad" strokeWidth="1.2" />
          <rect x="8.5" y="12" width="3" height="7" fill="#43a7ad" />
          <line x1="16" y1="12" x2="16" y2="22" stroke="#43a7ad" strokeWidth="1.2" />
          <rect x="14.5" y="14" width="3" height="5" fill="#43a7ad" />
          <line x1="22" y1="10" x2="22" y2="24" stroke="#43a7ad" strokeWidth="1.2" />
          <rect x="20.5" y="12" width="3" height="8" fill="#43a7ad" />
        </svg>
      </div>
    );
  }

  // Standard Volatility Indices: R_10 .. R_100 (same exact badge without 1s circle)
  const rMatch = s.match(/^R_(\d+)$/);
  if (rMatch) {
    const label = rMatch[1];
    return (
      <div className={boxCls} aria-hidden="true">
        <svg viewBox="0 0 28 24" className={svgCls}>
          <rect x="0" y="1" width="16" height="8" rx="1.5" fill="#343a40" />
          <text
            x="8"
            y="6.8"
            fill="#ffffff"
            fontSize={label.length >= 3 ? '5.4' : '6'}
            fontWeight="700"
            textAnchor="middle"
            fontFamily="Arial, sans-serif"
          >
            {label}
          </text>
          <line x1="4" y1="11" x2="4" y2="21" stroke="#43a7ad" strokeWidth="1.2" />
          <rect x="2.5" y="13" width="3" height="5" fill="#43a7ad" />
          <line x1="10" y1="9" x2="10" y2="23" stroke="#43a7ad" strokeWidth="1.2" />
          <rect x="8.5" y="12" width="3" height="7" fill="#43a7ad" />
          <line x1="16" y1="12" x2="16" y2="22" stroke="#43a7ad" strokeWidth="1.2" />
          <rect x="14.5" y="14" width="3" height="5" fill="#43a7ad" />
          <line x1="22" y1="10" x2="22" y2="24" stroke="#43a7ad" strokeWidth="1.2" />
          <rect x="20.5" y="12" width="3" height="8" fill="#43a7ad" />
        </svg>
      </div>
    );
  }

  // Jump Indices: JD10 .. JD100
  const jdMatch = s.match(/^JD(\d+)$/);
  if (jdMatch) {
    return (
      <div className={boxCls} aria-hidden="true">
        <svg viewBox="0 0 36 28" className={svgCls} fill="none">
          <path d="M4 22H10V16H16V10H22V14H28V7" stroke="#00B5C8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="28" cy="7" r="2.2" fill="#FF444F" />
        </svg>
        <span className={numCls}>J{jdMatch[1]}</span>
      </div>
    );
  }

  // Boom Indices
  const boomMatch = s.match(/^BOOM(\d+)/);
  if (boomMatch) {
    const label = boomMatch[1] === '1000' ? '1K' : boomMatch[1];
    return (
      <div className={boxCls} aria-hidden="true">
        <svg viewBox="0 0 36 28" className={svgCls} fill="none">
          <path d="M5 23L11 19L16 21L21 8L26 16L31 11" stroke="#00A878" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className={numCls}>B{label}</span>
      </div>
    );
  }

  // Crash Indices
  const crashMatch = s.match(/^CRASH(\d+)/);
  if (crashMatch) {
    const label = crashMatch[1] === '1000' ? '1K' : crashMatch[1];
    return (
      <div className={boxCls} aria-hidden="true">
        <svg viewBox="0 0 36 28" className={svgCls} fill="none">
          <path d="M5 9L11 13L16 10L21 23L26 15L31 19" stroke="#FF444F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className={numCls}>C{label}</span>
      </div>
    );
  }

  // Step / Range Break Indices
  if (s === 'STPIDX' || s === 'STPRNG' || s === 'RDBULL' || s === 'RDBEAR' || s === 'RB100' || s === 'RB200') {
    const label = s === 'STPIDX' || s === 'STPRNG' ? 'STP' : s === 'RDBULL' ? 'BULL' : s === 'RDBEAR' ? 'BEAR' : s;
    const stroke = s === 'RDBEAR' ? '#ed465b' : '#43a7ad';
    return (
      <div className={boxCls} aria-hidden="true">
        <svg viewBox="0 0 36 28" className={svgCls} fill="none">
          <path
            d={s === 'RDBEAR' ? 'M4 9H12V14H20V19H30' : 'M4 21H12V16H20V11H30'}
            stroke={stroke}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={numCls}>{label}</span>
      </div>
    );
  }

  // Metals / Commodities (Gold / Silver / Platinum / Palladium / Energy / Soft)
  if (s === 'FRXXAUUSD' || s === 'WLDXAU' || s === 'XAUUSD' || s === 'FRXXAGUSD' || s === 'WLDXAG' || s === 'XAGUSD' || s === 'FRXXPTUSD' || s === 'FRXXPDUSD') {
    const isSilver = s.includes('XAG');
    const lbl = s.includes('XAG') ? 'XAG' : s.includes('XPT') ? 'XPT' : s.includes('XPD') ? 'XPD' : 'XAU';
    return (
      <div className={boxCls} aria-hidden="true">
        <div
          className={`w-6 h-5 rounded-[4px] flex items-center justify-center text-[7.5px] font-black tracking-tight shadow-xs ${
            isSilver
              ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-[#111319]'
              : 'bg-gradient-to-br from-[#FACC15] to-[#B45309] text-[#111319]'
          }`}
        >
          {lbl}
        </div>
      </div>
    );
  }

  if (['USOUSD', 'UKOUSD', 'NATGAS', 'COFFEEUSD', 'COCOAUSD', 'COTTONUSD', 'SUGARUSD'].includes(s)) {
    const lbl = s === 'NATGAS' ? 'GAS' : s.slice(0, 3);
    return (
      <div className={boxCls} aria-hidden="true">
        <div className="w-6 h-5 rounded-[4px] bg-[#343a40] text-[#FACC15] flex items-center justify-center text-[7px] font-extrabold leading-none">
          {lbl}
        </div>
      </div>
    );
  }

  // Basket Indices (WLDAUD, WLDEUR, WLDGBP, WLDUSD, WLDCMP)
  const wldMatch = s.match(/^WLD([A-Z]{3})$/);
  if (wldMatch) {
    return (
      <div className={boxCls} aria-hidden="true">
        <svg viewBox="0 0 36 28" className={svgCls} fill="none">
          <path d="M4 20L12 14L20 17L30 9" stroke="#43a7ad" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className={numCls}>{wldMatch[1]}</span>
      </div>
    );
  }

  // Cryptocurrencies (cryBTCUSD, cryETHUSD, etc.)
  const cryMatch = s.match(/^CRY([A-Z0-9]+?)USD$/);
  if (cryMatch) {
    return <CryptoCircleBadge code={cryMatch[1]} size={size === 'sm' ? 'xs' : 'sm'} />;
  }

  // Forex pairs (frxEURUSD, frxGBPUSD, etc.)
  const frxMatch = s.match(/^FRX([A-Z]{3})([A-Z]{3})$/);
  if (frxMatch) {
    return (
      <div className={boxCls} aria-hidden="true">
        <div className="w-6 h-5 rounded-[4px] bg-[#1E293B] border border-[#334155] flex items-center justify-center text-[7px] font-extrabold text-[#38BDF8] leading-none">
          {frxMatch[1].slice(0, 2)}/{frxMatch[2].slice(0, 2)}
        </div>
      </div>
    );
  }

  // Stock Indices & Stocks
  if (s.startsWith('OTC_') || ['AAPL', 'AMZN', 'TSLA', 'MSFT', 'BARC', 'BP', 'VOD', 'BMW', 'SIE', 'AIR'].includes(s)) {
    const codeMap: Record<string, string> = {
      OTC_DJI: 'US30',
      OTC_NDX: 'NDX',
      OTC_SPC: 'SPX',
      OTC_FTSE: 'UK',
      OTC_GDAXI: 'DE40',
      OTC_N225: 'JP',
    };
    return (
      <div className={boxCls} aria-hidden="true">
        <div className="w-6 h-5 rounded-[4px] bg-[#232732] border border-white/10 flex items-center justify-center text-[7px] font-extrabold text-[#43a7ad] leading-none">
          {codeMap[s] || s.slice(0, 4)}
        </div>
      </div>
    );
  }

  // Neutral fallback icon when instrument symbol is unknown
  return (
    <div className={boxCls} aria-hidden="true">
      <svg viewBox="0 0 36 28" className={svgCls}>
        <line x1="7" y1="8" x2="7" y2="23" stroke="#94A3B8" strokeWidth="1.8" />
        <rect x="5" y="12" width="4" height="7" rx="0.7" fill="#94A3B8" />
        <line x1="15" y1="6" x2="15" y2="21" stroke="#94A3B8" strokeWidth="1.8" />
        <rect x="13" y="10" width="4" height="7" rx="0.7" fill="#94A3B8" />
        <line x1="23" y1="9" x2="23" y2="24" stroke="#94A3B8" strokeWidth="1.8" />
        <rect x="21" y="13" width="4" height="7" rx="0.7" fill="#94A3B8" />
      </svg>
    </div>
  );
};

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

export const TabExchangeIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <span
    className={`w-[21px] h-[21px] rounded-[5px] flex items-center justify-center text-[7px] font-black tracking-tighter leading-none select-none ${
      active
        ? 'bg-[#FF444F] text-white'
        : 'border-[1.6px] border-current text-current'
    }`}
    aria-hidden="true"
  >
    DXN
  </span>
);

export const DxnCandlesGraphic: React.FC = () => (
  <div className="relative w-20 h-14 shrink-0 select-none flex items-center justify-center" aria-hidden="true">
    <svg viewBox="0 0 88 64" className="w-20 h-14">
      <line x1="16" y1="22" x2="16" y2="54" stroke="#FF444F" strokeWidth="2" strokeLinecap="round" />
      <rect x="11" y="28" width="10" height="18" rx="1.5" fill="#FF444F" />
      <line x1="32" y1="12" x2="32" y2="48" stroke="#E2E8F0" strokeWidth="2" strokeLinecap="round" />
      <rect x="27" y="18" width="10" height="19" rx="1.5" fill="#FFFFFF" />
      <line x1="48" y1="18" x2="48" y2="50" stroke="#FF444F" strokeWidth="2" strokeLinecap="round" />
      <rect x="43" y="22" width="10" height="16" rx="1.5" fill="#FF444F" />
      <line x1="64" y1="6" x2="64" y2="40" stroke="#E2E8F0" strokeWidth="2" strokeLinecap="round" />
      <rect x="59" y="11" width="10" height="17" rx="1.5" fill="#FFFFFF" />
      <rect x="55" y="39" width="18" height="16" rx="3" fill="#1E2028" stroke="#FF444F" strokeWidth="1.5" />
      <path d="M59 51L68 43M62 43H68V49" stroke="#FF444F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

type ContractSvgRenderer = (className: string) => React.ReactNode;

const renderMatchesDiffersSvg: ContractSvgRenderer = (className) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
    <path
      d="M52 57 L34 39 M48 60 L20 60 M52 63 L34 81 M68 63 L86 81 M72 60 L100 60 M68 57 L86 39"
      stroke="#ed465b"
      strokeWidth="10"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M60 8 V22 M60 98 V112" stroke="#86acad" strokeWidth="8" strokeLinecap="round" />
  </svg>
);

const renderEvenOddSvg: ContractSvgRenderer = (className) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
    <rect x="17" y="17" width="34" height="34" rx="1.5" fill="#ed465b" />
    <rect x="69" y="17" width="34" height="34" rx="1.5" fill="#86acad" />
    <rect x="17" y="69" width="34" height="34" rx="1.5" fill="#86acad" />
    <rect x="69" y="69" width="34" height="34" rx="1.5" fill="#ed465b" />
  </svg>
);

const renderOverSvg: ContractSvgRenderer = (className) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
    <path
      d="M31 61 L83 13 M57 13 H83 V39"
      stroke="#ed465b"
      strokeWidth="9"
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
    <path d="M8 78 H108" stroke="#86acad" strokeWidth="9" strokeLinecap="square" />
    <path d="M19 88 Q25 83 31 86 L26 92 Q21 94 17 91 Z" fill="#ed465b" opacity="0.82" />
  </svg>
);

const renderUnderSvg: ContractSvgRenderer = (className) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
    <path d="M8 42 H108" stroke="#86acad" strokeWidth="9" strokeLinecap="square" />
    <path
      d="M31 59 L83 107 M57 107 H83 V81"
      stroke="#ed465b"
      strokeWidth="9"
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
    <path d="M19 32 Q25 37 31 34 L26 28 Q21 26 17 29 Z" fill="#ed465b" opacity="0.82" />
  </svg>
);

const renderHigherSvg: ContractSvgRenderer = (className) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
    <path
      d="M31 61 L83 13 M57 13 H83 V39"
      stroke="#ed465b"
      strokeWidth="9"
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
    <path d="M8 78 H108" stroke="#86acad" strokeWidth="9" strokeLinecap="square" />
    <path d="M19 88 Q25 83 31 86 L26 92 Q21 94 17 91 Z" fill="#ed465b" opacity="0.82" />
  </svg>
);

const renderLowerSvg: ContractSvgRenderer = (className) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
    <path d="M8 42 H108" stroke="#86acad" strokeWidth="9" strokeLinecap="square" />
    <path
      d="M31 59 L83 107 M57 107 H83 V81"
      stroke="#ed465b"
      strokeWidth="9"
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
    <path d="M19 32 Q25 37 31 34 L26 28 Q21 26 17 29 Z" fill="#ed465b" opacity="0.82" />
  </svg>
);

const renderTouchSvg: ContractSvgRenderer = (className) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
    <path d="M12 36 H108" stroke="#86acad" strokeWidth="8" strokeLinecap="round" />
    <path d="M22 92 L66 38 L96 64" stroke="#ed465b" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="66" cy="36" r="10" fill="#ed465b" />
  </svg>
);

const renderNoTouchSvg: ContractSvgRenderer = (className) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
    <path d="M12 36 H108" stroke="#86acad" strokeWidth="8" strokeLinecap="round" />
    <path d="M22 92 L58 62 L98 84" stroke="#ed465b" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const renderRiseSvg: ContractSvgRenderer = (className) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
    <path
      d="M22 91 L91 22 M59 22 H91 V54"
      stroke="#ed465b"
      strokeWidth="10"
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
    <path d="M9 99 L20 94 L17 106 Z" fill="#8d9695" />
  </svg>
);

const renderFallSvg: ContractSvgRenderer = (className) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
    <path
      d="M22 22 L91 91 M59 91 H91 V59"
      stroke="#ed465b"
      strokeWidth="10"
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
    <path d="M9 11 L20 16 L17 4 Z" fill="#8d9695" />
  </svg>
);

const renderAccuSvg: ContractSvgRenderer = (className) => (
  <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true">
    <path d="M14 28 H106" stroke="#86acad" strokeWidth="8" strokeLinecap="round" />
    <path d="M14 92 H106" stroke="#86acad" strokeWidth="8" strokeLinecap="round" />
    <path d="M22 68 L44 50 L68 72 L98 44" stroke="#ed465b" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CONTRACT_TYPE_SVG_MAP: Record<string, ContractSvgRenderer> = {
  RISE: renderRiseSvg,
  CALL: renderRiseSvg,
  CALLE: renderRiseSvg,
  BUY: renderRiseSvg,
  MULTUP: renderRiseSvg,
  ASIANU: renderRiseSvg,
  RESETCALL: renderRiseSvg,
  TICKHIGH: renderRiseSvg,
  RUNHIGH: renderRiseSvg,
  FALL: renderFallSvg,
  PUT: renderFallSvg,
  PUTE: renderFallSvg,
  SELL: renderFallSvg,
  MULTDOWN: renderFallSvg,
  ASIAND: renderFallSvg,
  RESETPUT: renderFallSvg,
  TICKLOW: renderFallSvg,
  RUNLOW: renderFallSvg,
  MATCHES: renderMatchesDiffersSvg,
  MATCH: renderMatchesDiffersSvg,
  DIGITMATCH: renderMatchesDiffersSvg,
  DIFFERS: renderMatchesDiffersSvg,
  DIFF: renderMatchesDiffersSvg,
  DIGITDIFF: renderMatchesDiffersSvg,
  EVEN: renderEvenOddSvg,
  DIGITEVEN: renderEvenOddSvg,
  ODD: renderEvenOddSvg,
  DIGITODD: renderEvenOddSvg,
  OVER: renderOverSvg,
  DIGITOVER: renderOverSvg,
  UNDER: renderUnderSvg,
  DIGITUNDER: renderUnderSvg,
  HIGHER: renderHigherSvg,
  LOWER: renderLowerSvg,
  TOUCH: renderTouchSvg,
  ONETOUCH: renderTouchSvg,
  NOTOUCH: renderNoTouchSvg,
  EXPIRYRANGE: renderAccuSvg,
  EXPIRYMISS: renderAccuSvg,
  ENDSIN: renderAccuSvg,
  ENDSOUT: renderAccuSvg,
  ACCU: renderAccuSvg,
};

export const BotContractTypeIcon: React.FC<{
  contractType?: string | null;
  side?: string | null;
  barrier?: string | number | null;
  className?: string;
}> = ({ contractType, side, barrier, className = 'w-4 h-4 shrink-0' }) => {
  const ct = String(contractType || '').toUpperCase().trim();
  const s = String(side || '').toUpperCase().trim();
  const rawKey = ct || s;
  const barrierStr = barrier !== undefined && barrier !== null ? String(barrier).trim() : '';
  const isPriceBarrier = /^[+-]\d+(\.\d+)?$/.test(barrierStr) || /^\d+\.\d+$/.test(barrierStr);

  let resolvedKey = rawKey;
  if (s === 'HIGHER' || ((rawKey === 'CALL' || rawKey === 'CALLE') && isPriceBarrier)) {
    resolvedKey = 'HIGHER';
  } else if (s === 'LOWER' || ((rawKey === 'PUT' || rawKey === 'PUTE') && isPriceBarrier)) {
    resolvedKey = 'LOWER';
  }

  const renderer = CONTRACT_TYPE_SVG_MAP[resolvedKey];
  if (renderer) {
    return <>{renderer(className)}</>;
  }

  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" stroke="#94A3B8" strokeWidth="1.8" />
      <line x1="6.8" y1="10" x2="13.2" y2="10" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
};

export const TradeTypeCell: React.FC<{
  symbol?: string | null;
  contractType?: string | null;
  side?: string | null;
  barrier?: string | number | null;
  size?: 'sm' | 'md';
  iconClassName?: string;
}> = ({ symbol, contractType, side, barrier, size = 'sm', iconClassName = 'w-4 h-4 shrink-0' }) => (
  <div className="inline-flex items-center gap-2 shrink-0">
    <BotInstrumentIcon symbol={symbol} size={size} />
    <BotContractTypeIcon
      contractType={contractType}
      side={side}
      barrier={barrier}
      className={iconClassName}
    />
  </div>
);



