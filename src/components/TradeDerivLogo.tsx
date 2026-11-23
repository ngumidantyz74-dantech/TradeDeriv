import React, { useState } from 'react';

interface LogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  appName?: string;
  onClick?: () => void;
  className?: string;
}

export const TradeDerivLogo: React.FC<LogoProps> = ({
  variant = 'light',
  size = 'md',
  showWordmark = true,
  appName = 'DERIV',
  onClick,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const iconDim = size === 'sm' ? 28 : size === 'lg' ? 40 : 34;
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';
  const wordColor = variant === 'dark' ? 'text-white' : 'text-[#0E1117] dark:text-white';

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 select-none shrink-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {!imgError ? (
        <img
          src="/assets/aistudio/dvlogo_cc893c11.png"
          alt="DERIV"
          width={iconDim}
          height={iconDim}
          onError={() => setImgError(true)}
          className="rounded-full object-cover shrink-0 shadow-xs"
          style={{ width: iconDim, height: iconDim }}
        />
      ) : (
        <svg
          width={iconDim}
          height={iconDim}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="shrink-0"
        >
          <circle cx="32" cy="32" r="32" fill="#FF444F" />
          <path
            d="M38.6 15.5L35.4 30.2C34 28.9 31.9 28.1 29.4 28.1C22.9 28.1 17.8 33.4 16.5 40.2C15.1 47.4 19.6 52.3 26.5 52.3C29.6 52.3 32.1 51.3 34.1 49.4L33.6 51.7H40.3L47.8 15.5H38.6ZM28.8 46.1C25.3 46.1 23.2 43.7 23.9 40.2C24.6 36.7 27.4 34.3 30.9 34.3C34.4 34.3 36.5 36.7 35.8 40.2C35.1 43.7 32.3 46.1 28.8 46.1Z"
            fill="#FFFFFF"
          />
        </svg>
      )}

      {showWordmark && (
        <span className={`font-display font-extrabold tracking-tight whitespace-nowrap ${textSize} ${wordColor}`}>
          {appName || 'DERIV'}
        </span>
      )}
    </div>
  );
};
