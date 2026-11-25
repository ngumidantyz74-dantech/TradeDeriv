import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  X,
  Star,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Globe,
  Mail,
  Eye,
  EyeOff,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { TradeDerivLogo } from './TradeDerivLogo';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';

type AuthScreen =
  | null
  | 'login'
  | 'login-password'
  | 'signup-country'
  | 'signup-method'
  | 'verify-email'
  | 'signup-password'
  | 'forgot-email'
  | 'forgot-verify'
  | 'forgot-reset';

const COUNTRY_OPTIONS: Array<{ name: string; flag: string; code: string }> = [
  { name: 'Kenya', flag: '🇰🇪', code: 'ke' },
  { name: 'Nigeria', flag: '🇳🇬', code: 'ng' },
  { name: 'South Africa', flag: '🇿🇦', code: 'za' },
  { name: 'Tanzania', flag: '🇹🇿', code: 'tz' },
  { name: 'Uganda', flag: '🇺🇬', code: 'ug' },
  { name: 'Rwanda', flag: '🇷🇼', code: 'rw' },
  { name: 'Ghana', flag: '🇬🇭', code: 'gh' },
  { name: 'Egypt', flag: '🇪🇬', code: 'eg' },
  { name: 'United Kingdom', flag: '🇬🇧', code: 'gb' },
  { name: 'United Arab Emirates', flag: '🇦🇪', code: 'ae' },
  { name: 'India', flag: '🇮🇳', code: 'in' },
  { name: 'Malaysia', flag: '🇲🇾', code: 'my' },
  { name: 'Indonesia', flag: '🇮🇩', code: 'id' },
  { name: 'Philippines', flag: '🇵🇭', code: 'ph' },
  { name: 'Pakistan', flag: '🇵🇰', code: 'pk' },
  { name: 'Brazil', flag: '🇧🇷', code: 'br' },
  { name: 'Germany', flag: '🇩🇪', code: 'de' },
  { name: 'Singapore', flag: '🇸🇬', code: 'sg' },
  { name: 'Canada', flag: '🇨🇦', code: 'ca' },
  { name: 'Australia', flag: '🇦🇺', code: 'au' },
];

const GoogleGIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const FacebookCircleIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-[19px] h-[19px]" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#1877F2" />
    <path
      d="M13.5 19v-6.2h2.1l.3-2.4h-2.4V8.8c0-.7.2-1.2 1.2-1.2h1.3V5.5c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.1-3.2 3.3v1.7H8.8v2.4H11V19h2.5z"
      fill="#FFFFFF"
    />
  </svg>
);

const AppleLogoIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-[#111319]" aria-hidden="true">
    <path d="M16.36 12.66c-.02-2.12 1.73-3.15 1.81-3.2-1-1.45-2.54-1.65-3.09-1.67-1.31-.14-2.57.78-3.24.78-.67 0-1.7-.76-2.8-.74-1.44.02-2.77.84-3.5 2.13-1.5 2.6-.38 6.45 1.07 8.56.71 1.03 1.56 2.19 2.67 2.15 1.08-.04 1.49-.7 2.79-.7 1.3 0 1.67.7 2.8.68 1.16-.02 1.89-1.05 2.59-2.08.82-1.19 1.15-2.35 1.17-2.41-.03-.01-2.24-.86-2.27-3.5zM14.23 6.32c.59-.72.99-1.71.88-2.71-.85.04-1.89.57-2.5 1.28-.54.63-1.02 1.65-.89 2.62.95.07 1.92-.48 2.51-1.19z" />
  </svg>
);

export const LandingHero: React.FC = () => {
  const { launchDerivOAuth, loginWithToken, showToast, registerLogoTap, publicSettings } = useApp();
  const appName = publicSettings.branding?.appName || 'deriv';
  const heroTitle = publicSettings.branding?.heroTitle || 'Trading for';
  const heroSubtitle = publicSettings.branding?.heroSubtitle || 'Anyone Anywhere Anytime';
  const heroDescription =
    publicSettings.branding?.heroDescription ||
    'Widest range of products, markets, platforms with 24/7 customer support.';
  const partnerLink = publicSettings.partner?.referralLink || 'https://t.deriv.link?t=FSDRTFVTSKPA';
  const partnerCode = publicSettings.partner?.referralCode || 'VNMH2VHBRTFN';

  const [menuOpen, setMenuOpen] = useState(false);
  const [authScreen, setAuthScreen] = useState<AuthScreen>(null);
  const [language, setLanguage] = useState<'EN' | 'ES' | 'FR'>('EN');
  const [country, setCountry] = useState<string>('Kenya');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendSeconds, setResendSeconds] = useState<number>(60);
  const [verificationToken, setVerificationToken] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (authScreen !== 'verify-email' && authScreen !== 'forgot-verify') return;
    if (resendSeconds <= 0) return;
    const t = setInterval(() => {
      setResendSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [authScreen, resendSeconds]);

  const openLoginScreen = () => {
    setAuthError(null);
    setPassword('');
    setAuthScreen('login');
  };

  const openSignupScreen = () => {
    setAuthError(null);
    setPassword('');
    setOtpDigits(['', '', '', '', '', '']);
    setVerificationToken('');
    setAuthScreen('signup-country');
  };

  const selectedCountryMeta = COUNTRY_OPTIONS.find((c) => c.name === country) || COUNTRY_OPTIONS[0];

  const handleLoginIdentifierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setAuthError('Please enter the email address registered with your account.');
      return;
    }
    setEmail(clean);
    setAuthError(null);
    setAuthScreen('login-password');
  };

  const handleDbLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setAuthError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/login', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      await loginWithToken(res.token);
      setAuthScreen(null);
      showToast('Signed in successfully', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid email or password';
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const sendOtpViaBrevo = async (targetEmail: string, purpose: 'signup' | 'password_reset') => {
    setAuthError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; cooldownSeconds?: number }>('/api/auth/send-verification-code', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email: targetEmail, purpose, country }),
      });
      setOtpDigits(['', '', '', '', '', '']);
      setResendSeconds(res.cooldownSeconds || 60);
      setAuthScreen(purpose === 'password_reset' ? 'forgot-verify' : 'verify-email');
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to send verification code';
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignupMethodNext = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setAuthError('Enter a valid email address to verify via Brevo.');
      return;
    }
    setEmail(clean);
    await sendOtpViaBrevo(clean, 'signup');
  };

  const verifyOtpCode = async (digits: string[], purpose: 'signup' | 'password_reset') => {
    const code = digits.join('');
    if (!/^\d{6}$/.test(code)) return;
    setAuthError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; verificationToken: string }>('/api/auth/verify-email-code', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email: email.trim().toLowerCase(), code, purpose }),
      });
      setVerificationToken(res.verificationToken);
      if (purpose === 'signup') {
        if (!fullName.trim()) {
          setFullName(email.split('@')[0] || 'Trader');
        }
        setAuthScreen('signup-password');
      } else {
        setPassword('');
        setAuthScreen('forgot-reset');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid verification code';
      setAuthError(msg);
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 40);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpDigitChange = (idx: number, rawVal: string, purpose: 'signup' | 'password_reset') => {
    const cleaned = rawVal.replace(/\D/g, '');
    if (cleaned.length > 1) {
      const next = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        next[i] = cleaned[i] || '';
      }
      setOtpDigits(next);
      const focusIdx = Math.min(5, cleaned.length);
      otpRefs.current[focusIdx]?.focus();
      if (cleaned.length >= 6) {
        verifyOtpCode(next, purpose);
      }
      return;
    }
    const next = [...otpDigits];
    next[idx] = cleaned;
    setOtpDigits(next);
    setAuthError(null);
    if (cleaned && idx < 5) {
      otpRefs.current[idx + 1]?.focus();
    }
    if (next.every((d) => /^\d$/.test(d))) {
      verifyOtpCode(next, purpose);
    }
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleCompleteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return;
    }
    setAuthError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/register', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          full_name: fullName.trim() || email.split('@')[0],
          country,
          referral_code: referralCode.trim(),
          verificationToken,
        }),
      });
      await loginWithToken(res.token);
      setAuthScreen(null);
      showToast(`Welcome to ${appName}! Account saved & verified.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to complete registration';
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompletePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return;
    }
    setAuthError(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ verificationToken, password }),
      });
      showToast('Password updated. You can now log in.', 'success');
      setPassword('');
      setAuthScreen('login-password');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password reset failed';
      setAuthError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // EXACT DERIV AUTHENTICATION & REGISTRATION SCREENS (Matches uploaded screenshots 005959, 010005, 010021, 010051)
  if (authScreen) {
    const showBackCircle =
      authScreen === 'login-password' ||
      authScreen === 'signup-method' ||
      authScreen === 'verify-email' ||
      authScreen === 'signup-password' ||
      authScreen === 'forgot-email' ||
      authScreen === 'forgot-verify' ||
      authScreen === 'forgot-reset';

    const handleBackArrow = () => {
      setAuthError(null);
      if (authScreen === 'login-password') setAuthScreen('login');
      else if (authScreen === 'signup-method') setAuthScreen('signup-country');
      else if (authScreen === 'verify-email') setAuthScreen('signup-method');
      else if (authScreen === 'signup-password') setAuthScreen('verify-email');
      else if (authScreen === 'forgot-email') setAuthScreen('login-password');
      else if (authScreen === 'forgot-verify') setAuthScreen('forgot-email');
      else if (authScreen === 'forgot-reset') setAuthScreen('forgot-verify');
    };

    const renderSocialButtons = (mode: 'login' | 'signup') => (
      <div className="space-y-3">
        <div className="relative">
          {mode === 'login' && (
            <span className="absolute -top-2 right-3 z-10 px-2 py-[2px] rounded-full bg-[#00A79D] text-white text-[10px] font-bold leading-none shadow-xs">
              Last used
            </span>
          )}
          <button
            type="button"
            onClick={() => launchDerivOAuth(mode === 'signup' ? 'registration' : 'login')}
            className="w-full h-12 rounded-full border border-[#D5D8DD] bg-white hover:bg-[#F9FAFB] flex items-center justify-center relative text-[14.5px] font-semibold text-[#111319] transition-colors cursor-pointer"
          >
            <span className="absolute left-5 flex items-center">
              <GoogleGIcon />
            </span>
            <span>{mode === 'signup' ? 'Sign up with Google' : 'Log in with Google'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => launchDerivOAuth(mode === 'signup' ? 'registration' : 'login')}
          className="w-full h-12 rounded-full border border-[#D5D8DD] bg-white hover:bg-[#F9FAFB] flex items-center justify-center relative text-[14.5px] font-semibold text-[#111319] transition-colors cursor-pointer"
        >
          <span className="absolute left-5 flex items-center">
            <FacebookCircleIcon />
          </span>
          <span>{mode === 'signup' ? 'Sign up with Facebook' : 'Log in with Facebook'}</span>
        </button>

        <button
          type="button"
          onClick={() => launchDerivOAuth(mode === 'signup' ? 'registration' : 'login')}
          className="w-full h-12 rounded-full border border-[#D5D8DD] bg-white hover:bg-[#F9FAFB] flex items-center justify-center relative text-[14.5px] font-semibold text-[#111319] transition-colors cursor-pointer"
        >
          <span className="absolute left-5 flex items-center">
            <AppleLogoIcon />
          </span>
          <span>{mode === 'signup' ? 'Sign up with Apple' : 'Log in with Apple'}</span>
        </button>
      </div>
    );

    return (
      <div className="min-h-screen w-full bg-white text-[#111319] flex flex-col">
        <div className="w-full max-w-[440px] mx-auto px-6 pt-5 pb-12 flex-1 flex flex-col">
          {/* Exact Deriv Top Header Row */}
          <div className="flex items-center justify-between mb-9">
            {showBackCircle ? (
              <button
                type="button"
                onClick={handleBackArrow}
                aria-label="Go back"
                className="w-10 h-10 rounded-full border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] flex items-center justify-center text-[#111319] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthScreen(null)}
                className="text-left cursor-pointer"
                title="Back to landing"
              >
                <span
                  className="text-[27px] font-bold italic tracking-[-0.03em] leading-none text-[#FF444F] select-none"
                  style={{ fontFamily: "'IBM Plex Sans', 'Ubuntu', sans-serif" }}
                >
                  deriv
                </span>
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLanguage((l) => (l === 'EN' ? 'FR' : l === 'FR' ? 'ES' : 'EN'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E5E7EB] bg-white text-[13px] font-medium text-[#111319] hover:bg-[#F9FAFB] cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-[#374151]" />
                <span>{language}</span>
              </button>
              <button
                type="button"
                onClick={() => setAuthScreen(null)}
                aria-label="Close"
                className="w-9 h-9 rounded-full bg-[#F3F4F6] hover:bg-[#E5E7EB] flex items-center justify-center text-[#374151] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {authError && (
            <div className="mb-5 px-3.5 py-2.5 rounded-[8px] bg-[#FF444F]/10 border border-[#FF444F]/30 text-[12.5px] font-medium text-[#D92D3A]">
              {authError}
            </div>
          )}

          {/* SCREEN 1: WELCOME BACK LOGIN (Screenshot 005959) */}
          {authScreen === 'login' && (
            <div>
              <h1 className="text-[26px] font-bold tracking-tight text-[#111319] mb-6">Welcome back</h1>

              {renderSocialButtons('login')}

              <div className="relative flex items-center justify-center my-6">
                <div className="border-t border-[#E5E7EB] w-full" />
                <span className="px-4 text-[13px] text-[#6B7280] bg-white">or</span>
              </div>

              <form onSubmit={handleLoginIdentifierSubmit} className="space-y-5">
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setAuthError(null);
                  }}
                  placeholder="Email or phone number"
                  className="w-full h-[50px] px-4 rounded-[8px] border border-[#D5D8DD] bg-white text-[15px] text-[#111319] placeholder:text-[#9CA3AF] focus:border-[#111319] outline-none"
                />

                <button
                  type="submit"
                  className="w-full h-12 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-[15px] transition-colors cursor-pointer"
                >
                  Log in
                </button>
              </form>

              <p className="text-center text-[13.5px] text-[#4B5563] mt-6">
                Don&apos;t have an account yet?{' '}
                <button
                  type="button"
                  onClick={openSignupScreen}
                  className="text-[#111319] font-medium underline cursor-pointer"
                >
                  Sign up
                </button>
              </p>
            </div>
          )}

          {/* SCREEN 1B: LOGIN PASSWORD STEP */}
          {authScreen === 'login-password' && (
            <div>
              <h1 className="text-[26px] font-bold tracking-tight text-[#111319] mb-1.5">Enter your password</h1>
              <p className="text-[14px] text-[#4B5563] mb-6">
                Signing in as <strong className="text-[#111319]">{email}</strong>
              </p>

              <form onSubmit={handleDbLoginSubmit} className="space-y-4">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setAuthError(null);
                    }}
                    placeholder="Password"
                    className="w-full h-[50px] pl-4 pr-11 rounded-[8px] border border-[#D5D8DD] bg-white text-[15px] text-[#111319] placeholder:text-[#9CA3AF] focus:border-[#111319] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6B7280] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError(null);
                      setAuthScreen('forgot-email');
                    }}
                    className="text-[13px] font-medium text-[#111319] underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-full bg-[#FF444F] hover:bg-[#E63946] disabled:opacity-60 text-white font-bold text-[15px] transition-colors cursor-pointer"
                >
                  {submitting ? 'Logging in...' : 'Log in'}
                </button>
              </form>
            </div>
          )}

          {/* SCREEN 2: JOIN 3M+ GLOBAL TRADERS COUNTRY SELECTION (Screenshot 010005) */}
          {authScreen === 'signup-country' && (
            <div>
              <h1 className="text-[26px] font-bold tracking-tight text-[#111319] mb-2">Join 3M+ global traders</h1>
              <p className="text-[14.5px] text-[#4B5563] leading-relaxed mb-7">
                Tell us where you live. We&apos;ll show you the products and services available in your region.
              </p>

              <label className="block text-[13px] font-medium text-[#111319] mb-2">Country/region</label>
              <div className="relative h-[52px] rounded-[8px] border border-[#D5D8DD] bg-white px-4 flex items-center justify-between mb-6 focus-within:border-[#111319]">
                <div className="flex items-center gap-3 text-[15px] text-[#111319] pointer-events-none">
                  <span className="text-[20px] leading-none">{selectedCountryMeta.flag}</span>
                  <span>{selectedCountryMeta.name}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-[#4B5563] pointer-events-none" />
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  aria-label="Country/region"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                >
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.name}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setAuthScreen('signup-method');
                }}
                className="w-full h-12 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-[15px] transition-colors cursor-pointer"
              >
                Sign up
              </button>

              <p className="text-center text-[13.5px] text-[#4B5563] mt-6">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={openLoginScreen}
                  className="text-[#111319] font-medium underline cursor-pointer"
                >
                  Log in
                </button>
              </p>
            </div>
          )}

          {/* SCREEN 3: CHOOSE SIGN UP METHOD (Screenshot 010021) */}
          {authScreen === 'signup-method' && (
            <div>
              <h1 className="text-[26px] font-bold tracking-tight text-[#111319] mb-2">Choose sign up method</h1>
              <p className="text-[14.5px] text-[#4B5563] mb-6">Choose how you&apos;d like to create your account.</p>

              {renderSocialButtons('signup')}

              <div className="relative flex items-center justify-center my-6">
                <div className="border-t border-[#E5E7EB] w-full" />
                <span className="px-4 text-[13px] text-[#6B7280] bg-white">or</span>
              </div>

              <form onSubmit={handleSignupMethodNext} className="space-y-4">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setAuthError(null);
                  }}
                  placeholder="Email or phone number"
                  className="w-full h-[50px] px-4 rounded-[8px] border border-[#D5D8DD] bg-white text-[15px] text-[#111319] placeholder:text-[#9CA3AF] focus:border-[#111319] outline-none"
                />

                <div className="text-[13px] text-[#4B5563]">
                  Have a referral code?{' '}
                  <button
                    type="button"
                    onClick={() => setShowReferralInput((v) => !v)}
                    className="text-[#111319] underline font-medium cursor-pointer"
                  >
                    {showReferralInput ? 'Hide' : 'Add it here'}
                  </button>
                  {showReferralInput && (
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      placeholder="Enter referral code (optional)"
                      className="mt-2.5 w-full h-[46px] px-3.5 rounded-[8px] border border-[#D5D8DD] bg-white text-[14px] text-[#111319] placeholder:text-[#9CA3AF] focus:border-[#111319] outline-none"
                    />
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-full bg-[#FF444F] hover:bg-[#E63946] disabled:opacity-60 text-white font-bold text-[15px] transition-colors cursor-pointer mt-2"
                >
                  {submitting ? 'Sending verification code...' : 'Next'}
                </button>
              </form>

              <p className="text-[12px] text-[#4B5563] leading-relaxed mt-5">
                By continuing, you agree to our{' '}
                <span className="text-[#111319] underline">Terms and conditions</span> and acknowledge our{' '}
                <span className="text-[#111319] underline">Privacy policy</span>. We may send you product updates
                and marketing emails. You can unsubscribe at any time.
              </p>

              <p className="text-center text-[13.5px] text-[#4B5563] mt-6">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={openLoginScreen}
                  className="text-[#111319] font-medium underline cursor-pointer"
                >
                  Log in
                </button>
              </p>
            </div>
          )}

          {/* SCREEN 4: VERIFY YOUR EMAIL (Screenshot 010051) */}
          {(authScreen === 'verify-email' || authScreen === 'forgot-verify') && (
            <div>
              <h1 className="text-[26px] font-bold tracking-tight text-[#111319] mb-2">Verify your email</h1>
              <p className="text-[14.5px] text-[#4B5563] leading-snug">Enter the 6-digit code sent to</p>
              <p className="text-[14.5px] font-bold text-[#111319] mt-0.5 mb-7 break-all">{email}</p>

              <div className="flex items-center justify-between gap-2 max-w-[336px] mx-auto mb-6">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    maxLength={6}
                    value={digit}
                    disabled={submitting}
                    onChange={(e) =>
                      handleOtpDigitChange(idx, e.target.value, authScreen === 'forgot-verify' ? 'password_reset' : 'signup')
                    }
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    aria-label={`Verification digit ${idx + 1}`}
                    className={`w-12 h-13 rounded-[8px] text-center text-[20px] font-bold text-[#111319] outline-none transition-colors ${
                      digit
                        ? 'bg-[#F2F3F5] border-2 border-[#111319]'
                        : 'bg-[#F2F3F5] border-2 border-transparent focus:border-[#111319] focus:bg-white'
                    }`}
                  />
                ))}
              </div>

              <p className="text-center text-[13.5px] text-[#4B5563] leading-relaxed max-w-[300px] mx-auto">
                Didn&apos;t get the code? Check your spam folder or{' '}
                {resendSeconds > 0 ? (
                  <span>resend code ({resendSeconds}s).</span>
                ) : (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      sendOtpViaBrevo(email, authScreen === 'forgot-verify' ? 'password_reset' : 'signup')
                    }
                    className="text-[#111319] font-semibold underline cursor-pointer"
                  >
                    resend code
                  </button>
                )}
              </p>

              {submitting && (
                <p className="text-center text-[12.5px] text-[#4B5563] mt-4 font-medium">Verifying 6-digit code...</p>
              )}
            </div>
          )}

          {/* SCREEN 5: CREATE PASSWORD & NAME TO COMPLETE DB REGISTRATION */}
          {authScreen === 'signup-password' && (
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00A79D]/10 text-[#00A79D] text-[11.5px] font-bold mb-3">
                <CheckCircle2 className="w-3.5 h-3.5" /> Email verified ({email})
              </div>
              <h1 className="text-[26px] font-bold tracking-tight text-[#111319] mb-2">Keep your account secure</h1>
              <p className="text-[14px] text-[#4B5563] mb-6">
                Enter your display name and create a password to open your Demo &amp; Real USD accounts.
              </p>

              <form onSubmit={handleCompleteSignup} className="space-y-4">
                <div>
                  <label className="block text-[12.5px] font-medium text-[#111319] mb-1.5">Full name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Mwangi"
                    className="w-full h-[50px] px-4 rounded-[8px] border border-[#D5D8DD] bg-white text-[15px] text-[#111319] outline-none focus:border-[#111319]"
                  />
                </div>

                <div>
                  <label className="block text-[12.5px] font-medium text-[#111319] mb-1.5">Create a password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setAuthError(null);
                      }}
                      placeholder="Minimum 8 characters"
                      className="w-full h-[50px] pl-4 pr-11 rounded-[8px] border border-[#D5D8DD] bg-white text-[15px] text-[#111319] outline-none focus:border-[#111319]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6B7280] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-full bg-[#FF444F] hover:bg-[#E63946] disabled:opacity-60 text-white font-bold text-[15px] transition-colors cursor-pointer mt-2"
                >
                  {submitting ? 'Creating account...' : 'Start trading'}
                </button>
              </form>
            </div>
          )}

          {/* FORGOT PASSWORD: SEND BREVO CODE & RESET */}
          {authScreen === 'forgot-email' && (
            <div>
              <h1 className="text-[26px] font-bold tracking-tight text-[#111319] mb-2">Reset your password</h1>
              <p className="text-[14px] text-[#4B5563] mb-6">
                We&apos;ll send a 6-digit verification code to your registered email address.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendOtpViaBrevo(email.trim().toLowerCase(), 'password_reset');
                }}
                className="space-y-4"
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full h-[50px] px-4 rounded-[8px] border border-[#D5D8DD] bg-white text-[15px] text-[#111319] outline-none focus:border-[#111319]"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-[15px] cursor-pointer"
                >
                  {submitting ? 'Sending code...' : 'Reset password'}
                </button>
              </form>
            </div>
          )}

          {authScreen === 'forgot-reset' && (
            <div>
              <h1 className="text-[26px] font-bold tracking-tight text-[#111319] mb-2">Choose a new password</h1>
              <p className="text-[14px] text-[#4B5563] mb-6">Enter your new password below.</p>
              <form onSubmit={handleCompletePasswordReset} className="space-y-4">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="New password (min 8 characters)"
                    className="w-full h-[50px] pl-4 pr-11 rounded-[8px] border border-[#D5D8DD] bg-white text-[15px] text-[#111319] outline-none focus:border-[#111319]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6B7280] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-[15px] cursor-pointer"
                >
                  {submitting ? 'Updating...' : 'Save new password'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-[#0B0E14] text-white overflow-hidden flex flex-col justify-between">
      {/* Full-bleed editorial trader portrait background */}
      <div className="absolute inset-0 z-0">
        <img
          src="/src/assets/images/hero_trader_portrait_1795009382829.jpg"
          alt="Trader using deriv mobile terminal"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center lg:object-[center_20%]"
        />
        {/* Measured scrim for crisp contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090B10] via-[#090B10]/55 to-[#090B10]/45" />
        <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-[#090B10]/85 via-[#090B10]/40 to-transparent" />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-20 flex items-center justify-between gap-3 px-4 sm:px-8 lg:px-14 pt-5 pb-4 max-w-7xl w-full mx-auto">
        <TradeDerivLogo variant="dark" size="md" appName={appName} onClick={registerLogoTap} />

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={openLoginScreen}
            className="min-h-[40px] px-4 sm:px-5 py-2 rounded-full border border-white/80 text-white text-xs sm:text-sm font-semibold hover:bg-white hover:text-[#0E1117] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={openSignupScreen}
            className="hidden sm:inline-flex min-h-[40px] px-5 py-2 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer items-center justify-center"
          >
            Sign up
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation menu"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Bottom Editorial Hero Content */}
      <main className="relative z-20 px-5 sm:px-8 lg:px-14 pb-8 lg:pb-14 pt-20 max-w-7xl w-full mx-auto">
        <div className="max-w-xl">
          <p className="text-sm sm:text-base font-semibold text-white/95 tracking-tight mb-2">{heroTitle}</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.06] text-white mb-4 [text-wrap:balance]">
            {heroSubtitle}
          </h1>
          <p className="text-sm sm:text-base text-white/85 leading-relaxed mb-7 max-w-md">{heroDescription}</p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-7">
            <button
              type="button"
              onClick={openSignupScreen}
              className="w-full sm:w-auto sm:min-w-[240px] min-h-[50px] px-8 py-3.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-base transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#FF444F]/25 cursor-pointer whitespace-nowrap"
            >
              <span>Open account</span>
            </button>
            <button
              type="button"
              onClick={openLoginScreen}
              className="w-full sm:w-auto min-h-[50px] px-6 py-3.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/25 backdrop-blur-md text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span>Sign in</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Trustpilot 5-star badge row */}
          <div className="flex items-center justify-center sm:justify-start gap-2.5">
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((idx) => (
                <span
                  key={idx}
                  className={`w-6 h-6 rounded-[3px] flex items-center justify-center ${
                    idx < 4 ? 'bg-[#00B67A]' : 'bg-gradient-to-r from-[#00B67A] via-[#00B67A] to-[#DCDCE6]'
                  }`}
                >
                  <Star className="w-3.5 h-3.5 fill-white text-white" />
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <Star className="w-4 h-4 fill-[#00B67A] text-[#00B67A]" />
              <span>Trustpilot</span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 text-xs text-white/75">
            <span>
              New to {appName}?{' '}
              <a
                href={partnerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline hover:text-[#FF444F] font-semibold"
              >
                Partner Sign up
              </a>{' '}
              <span className="font-mono-num text-white/60">({partnerCode})</span>
            </span>
          </div>
        </div>
      </main>

      {/* Slide-out Menu Drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-sm bg-[#151820] border-l border-[#2A2F3D] h-full p-6 flex flex-col justify-between text-white">
            <div>
              <div className="flex items-center justify-between mb-8">
                <TradeDerivLogo variant="dark" size="sm" appName={appName} />
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="p-2 rounded-full hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openLoginScreen();
                  }}
                  className="w-full py-3.5 px-5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm text-center cursor-pointer"
                >
                  Log in to {appName}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openSignupScreen();
                  }}
                  className="w-full py-3.5 px-5 rounded-full border border-white/25 hover:bg-white/10 text-white font-semibold text-sm text-center cursor-pointer"
                >
                  Open {appName} Account
                </button>
                <a
                  href={partnerLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 text-center"
                >
                  Partner Code: <strong className="font-mono-num text-white">{partnerCode}</strong>
                </a>
              </div>

              <div className="mt-8 pt-6 border-t border-[#2A2F3D] space-y-2">
                <p className="text-xs text-slate-400 mb-3">Quick Access</p>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    launchDerivOAuth('login');
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1A1D26] hover:bg-[#222633] text-sm cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-[#FF444F]" /> Continue with Deriv OAuth2
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openSignupScreen();
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1A1D26] hover:bg-[#222633] text-sm cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#00A878]" /> Try free demo ($10,000)
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-400 flex items-center justify-between pt-4 border-t border-[#2A2F3D]">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> EN · Global
              </span>
              <span>24/7 Support</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
