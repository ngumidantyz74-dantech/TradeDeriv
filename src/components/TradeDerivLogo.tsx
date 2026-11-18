import React from 'react';

interface LogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
}

export const TradeDerivLogo: React.FC<LogoProps> = ({
  variant = 'light',
  size = 'md',
  showWordmark = true,
}) => {
  const iconDim = size === 'sm' ? 28 : size === 'lg' ? 40 : 34;
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';
  const tradeColor = variant === 'dark' ? 'text-white' : 'text-[#0F1F38] dark:text-white';
  const navyFill = variant === 'dark' ? '#E2E8F0' : '#0F1F38';

  return (
    <div className="inline-flex items-center gap-2.5 select-none shrink-0">
      <svg
        width={iconDim}
        height={iconDim}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Top bar of geometric T / D outer frame in deep navy */}
        <path
          d="M14 14H34L27 24H10L14 14Z"
          fill={navyFill}
        />
        {/* D right geometric loop in deep navy */}
        <path
          d="M35 19H46L56 32L44 47H23L28 38H40L45 32L39 25H32L35 19Z"
          fill={navyFill}
        />
        {/* Bold diagonal coral-red upward arrow intersecting bottom-left to top-right */}
        <path
          d="M9 56L36 16L30 12L49 4L48 24L42 20L17 56H9Z"
          fill="#FF444F"
        />
      </svg>

      {showWordmark && (
        <span className={`font-display font-bold tracking-tight whitespace-nowrap ${textSize}`}>
          <span className={tradeColor}>Trade</span>
          <span className="text-[#FF444F]">Deriv</span>
        </span>
      )}
    </div>
  );
};
