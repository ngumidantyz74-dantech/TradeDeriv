import React, { useState } from 'react';
import { Menu, X, Star, ArrowRight, ShieldCheck, Globe, Mail, Lock } from 'lucide-react';
import { TradeDerivLogo } from './TradeDerivLogo';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';

export const LandingHero: React.FC = () => {
  const { launchDerivOAuth, loginWithToken, showToast, registerLogoTap, publicSettings } = useApp();
  const appName = publicSettings.branding?.appName || 'DERIV';
  const heroTitle = publicSettings.branding?.heroTitle || 'Trading for';
  const heroSubtitle = publicSettings.branding?.heroSubtitle || 'Anyone Anywhere Anytime';
  const heroDescription =
    publicSettings.branding?.heroDescription ||
    'Widest range of products, markets, platforms with 24/7 customer support.';
  const partnerLink = publicSettings.partner?.referralLink || 'https://t.deriv.link?t=FSDRTFVTSKPA';
  const partnerCode = publicSettings.partner?.referralCode || 'VNMH2VHBRTFN';

  const [menuOpen, setMenuOpen] = useState(false);
  const [authModal, setAuthModal] = useState<'login' | 'register' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      const endpoint = authModal === 'register' ? '/api/auth/register' : '/api/auth/login';
      const res = await apiFetch<{ token: string }>(endpoint, {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      await loginWithToken(res.token);
      setAuthModal(null);
      showToast(authModal === 'register' ? `Welcome to ${appName}!` : 'Signed in successfully', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Authentication failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
            onClick={() => launchDerivOAuth('login')}
            className="min-h-[40px] px-4 sm:px-5 py-2 rounded-full border border-white/80 text-white text-xs sm:text-sm font-semibold hover:bg-white hover:text-[#0E1117] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => setAuthModal('register')}
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
              onClick={() => launchDerivOAuth('registration')}
              className="w-full sm:w-auto sm:min-w-[240px] min-h-[50px] px-8 py-3.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-base transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#FF444F]/25 cursor-pointer whitespace-nowrap"
            >
              <span>Open account</span>
            </button>
            <button
              type="button"
              onClick={() => setAuthModal('login')}
              className="w-full sm:w-auto min-h-[50px] px-6 py-3.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/25 backdrop-blur-md text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span>Email sign in</span>
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
                    launchDerivOAuth('login');
                  }}
                  className="w-full py-3.5 px-5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm text-center cursor-pointer"
                >
                  Continue with {appName} OAuth2
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    launchDerivOAuth('registration');
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
                <p className="text-xs text-slate-400 mb-3">Direct Account Sign-In</p>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setAuthModal('login');
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#1A1D26] hover:bg-[#222633] text-sm cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-[#FF444F]" /> Sign in with Email
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setAuthModal('register');
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

      {/* Email Sign-In / Account Modal */}
      {authModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#181C25] text-[#0E1117] dark:text-white rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-[#2A2F3D] shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <TradeDerivLogo variant="light" size="sm" appName={appName} />
              <button
                type="button"
                onClick={() => setAuthModal(null)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <h2 className="font-display text-2xl font-bold mb-1">
              {authModal === 'register' ? `Create ${appName} account` : 'Welcome back'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {authModal === 'register'
                ? 'Starts with $10,000.00 Demo balance & instant Real account access.'
                : `Sign in to access your ${appName} trading platforms & bots.`}
            </p>

            <button
              type="button"
              onClick={() => {
                setAuthModal(null);
                launchDerivOAuth(authModal === 'register' ? 'registration' : 'login');
              }}
              className="w-full min-h-[46px] mb-5 rounded-full border border-slate-300 dark:border-[#2A2F3D] hover:bg-slate-50 dark:hover:bg-white/5 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF444F]" />
              <span>Continue directly with {appName} OAuth</span>
            </button>

            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-slate-200 dark:border-[#2A2F3D] w-full" />
              <span className="px-3 text-xs text-slate-400 bg-white dark:bg-[#181C25]">or</span>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              {authModal === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Full name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Mwangi"
                    className="w-full px-4 py-3 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm outline-none focus:border-[#FF444F]"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@example.com"
                  className="w-full px-4 py-3 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm outline-none focus:border-[#FF444F]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm outline-none focus:border-[#FF444F]"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-full bg-[#FF444F] hover:bg-[#E63946] disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer mt-2"
              >
                {submitting ? 'Authenticating...' : authModal === 'register' ? 'Open account' : 'Log in'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-500 mt-5">
              {authModal === 'register' ? 'Already have an account? ' : "Don't have an account yet? "}
              <button
                type="button"
                onClick={() => setAuthModal(authModal === 'register' ? 'login' : 'register')}
                className="text-[#0E1117] dark:text-white font-semibold underline cursor-pointer"
              >
                {authModal === 'register' ? 'Log in' : 'Sign up'}
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
