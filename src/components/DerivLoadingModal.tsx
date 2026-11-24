import React from 'react';

interface CircleLoaderProps {
  fullscreen?: boolean;
  label?: string;
}

/**
 * Deriv ring + italic lowercase red `d` loading modal (matches Screenshot_20261124-155852).
 */
export const DerivCircleLoader: React.FC<CircleLoaderProps> = ({ fullscreen = true, label }) => {
  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-[100] bg-white dark:bg-[#0F1115] flex flex-col items-center justify-center select-none'
          : 'w-full h-full flex flex-col items-center justify-center py-12 select-none'
      }
      role="status"
      aria-live="polite"
      aria-label={label || 'Loading'}
    >
      <div className="relative w-14 h-14 flex items-center justify-center">
        <svg className="w-14 h-14 animate-deriv-ring" viewBox="0 0 56 56" fill="none">
          <circle cx="28" cy="28" r="22" stroke="#FADADD" strokeWidth="4.5" />
          <path
            d="M 46.8 39.6 A 22 22 0 0 1 39.2 46.9"
            stroke="#FF444F"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </svg>
        <span
          className="absolute text-[24px] font-bold italic text-[#FF444F] leading-none"
          style={{ fontFamily: "'IBM Plex Sans', 'Ubuntu', sans-serif", transform: 'translate(-1px, -1px)' }}
        >
          d
        </span>
      </div>
      {label && <p className="mt-4 text-xs font-medium text-[#525866] dark:text-[#9BA3B0]">{label}</p>}
    </div>
  );
};

export const DerivBarsPulse: React.FC = () => (
  <div className="flex items-center justify-center gap-[5px]" aria-hidden="true">
    {[0, 1, 2, 3, 4].map((i) => (
      <span
        key={i}
        className="deriv-bar w-[5px] h-[16px] rounded-full bg-[#7BB3B8]"
        style={{ animationDelay: `${i * 0.11}s` }}
      />
    ))}
  </div>
);

/**
 * Full-page initializer screen matching Screenshot_20261124-152354.
 */
export const DerivBotInitializingLoader: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[95] bg-white dark:bg-[#0F1115] flex flex-col select-none">
      <div className="h-[52px] px-3.5 border-b border-slate-200/80 dark:border-white/[0.06] flex items-center">
        <span className="w-[34px] h-[34px] rounded-[6px] bg-[#FF444F] text-white font-display font-bold text-[15px] flex items-center justify-center tracking-tight">
          DB
        </span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-16 px-4">
        <DerivBarsPulse />
        <p className="text-[14px] text-[#333333] dark:text-[#D1D5DB] font-normal">
          Initializing Deriv Bot account...
        </p>
      </div>
    </div>
  );
};

/**
 * Dimmed Blockly workspace overlay matching Screenshot_20261124-152357.
 */
export const BlocklyOverlayLoader: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[90] bg-black/55 flex items-center justify-center select-none">
      <span className="fixed top-2 left-2 text-[11px] font-medium text-[#111319]/90 bg-white/80 px-1.5 py-0.5 rounded">
        Loading Blockly...
      </span>
      <DerivBarsPulse />
    </div>
  );
};
