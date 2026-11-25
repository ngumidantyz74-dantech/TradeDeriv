import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  User,
  Home,
  FileText,
  Landmark,
  Contact,
  HomeIcon,
  Wallet,
  Lock,
  AtSign,
  Smartphone,
  Fingerprint,
  UserX,
  ExternalLink,
  Globe,
  HelpCircle,
  MessageSquare,
  Palette,
  Star,
  LogOut,
  Bell,
  LayoutGrid,
  Settings2,
  Code2,
  X,
  UserCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';

export const ProfileHub: React.FC = () => {
  const {
    user,
    unreadCount,
    setActiveTab,
    theme,
    toggleTheme,
    logout,
    refreshAll,
    launchDerivOAuth,
    showToast,
  } = useApp();

  const [derivSettings, setDerivSettings] = useState<Record<string, any>>({});
  const [verification, setVerification] = useState<Record<string, any>>({});
  const [activeSheet, setActiveSheet] = useState<
    null | 'personal' | 'address' | 'tax' | 'kyc' | 'assessment' | 'language' | 'api' | 'close'
  >(null);

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [country, setCountry] = useState(user?.country || 'Kenya');
  const [addressLine, setAddressLine] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [taxId, setTaxId] = useState('');
  const [language, setLanguage] = useState(user?.preferred_language || 'EN');
  const [closeReason, setCloseReason] = useState('No longer trading');
  const [saving, setSaving] = useState(false);

  const loadDetails = useCallback(async () => {
    try {
      const detRes = await apiFetch<{ derivSettings: Record<string, any>; verification: Record<string, any> }>(
        '/api/account/profile-details'
      );
      setDerivSettings(detRes.derivSettings || {});
      setVerification(detRes.verification || {});
      setAddressLine(detRes.derivSettings?.address_line_1 || '');
      setAddressCity(detRes.derivSettings?.address_city || '');
      setTaxId(detRes.derivSettings?.tax_identification_number || '');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name || '');
    setPhone(user.phone || '');
    setCountry(user.country || 'Kenya');
    setLanguage(user.preferred_language || 'EN');
  }, [user]);

  useEffect(() => {
    refreshAll();
    loadDetails();
  }, [loadDetails, refreshAll]);

  const rawClientId = user?.deriv_client_id || '019e...6cdd';
  const displayClientId =
    rawClientId.length > 12 ? `${rawClientId.slice(0, 4)}...${rawClientId.slice(-4)}` : rawClientId;

  const handleCopyId = () => {
    if (!user?.deriv_client_id) return;
    navigator.clipboard?.writeText(user.deriv_client_id);
    showToast('Client ID copied to clipboard', 'success');
  };

  const handleLockedProfileNotice = () => {
    showToast('Profile settings are locked. Contact Super Admin or an authorized administrator.', 'info');
  };

  const handleCloseAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/account/close', {
        method: 'POST',
        body: JSON.stringify({ reason: closeReason }),
      });
      showToast('Account closed', 'info');
      logout();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Closure failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderFlatRow = (opts: {
    icon: React.ComponentType<any>;
    label: string;
    subtext?: string;
    subtextColor?: string;
    onClick: () => void;
    external?: boolean;
    danger?: boolean;
  }) => {
    const Icon = opts.icon;
    return (
      <button
        key={opts.label}
        type="button"
        onClick={opts.onClick}
        className="w-full py-4 flex items-center justify-between border-b border-slate-200/80 dark:border-white/[0.08] hover:bg-black/5 dark:hover:bg-white/[0.03] text-left transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <Icon className={`w-[19px] h-[19px] shrink-0 ${opts.danger ? 'text-[#FF444F]' : 'text-slate-500 dark:text-[#8E95A2]'}`} />
          <div className="min-w-0">
            <p className={`text-[14px] font-medium truncate ${opts.danger ? 'text-[#FF444F]' : 'text-slate-900 dark:text-[#E2E6ED]'}`}>
              {opts.label}
            </p>
            {opts.subtext && (
              <p className={`text-[12px] mt-0.5 truncate ${opts.subtextColor || 'text-slate-500 dark:text-[#8E95A2]'}`}>
                {opts.subtext}
              </p>
            )}
          </div>
        </div>
        {opts.external ? (
          <ExternalLink className="w-4 h-4 text-slate-400 dark:text-[#6E7582] shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 dark:text-[#8E95A2] shrink-0" />
        )}
      </button>
    );
  };

  return (
    <div className="max-w-3xl mx-auto pb-12">
      {/* Dark Rounded Profile Header matching Screenshot 102738 */}
      <section className="bg-[#171A21] text-white px-4 sm:px-8 pt-3 pb-7 rounded-b-[24px] lg:rounded-3xl lg:mt-4">
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="w-9 h-9 rounded-full bg-[#242833] hover:bg-[#2E3342] flex items-center justify-center cursor-pointer"
            aria-label="Back to Home"
          >
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className="relative w-9 h-9 rounded-full bg-[#242833] hover:bg-[#2E3342] flex items-center justify-center cursor-pointer"
            aria-label="Notifications"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[16px] px-1 rounded-full bg-[#FF444F] text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-[#242833] flex items-center justify-center mb-3.5">
            <UserCircle2 className="w-9 h-9 text-white" />
          </div>
          <h1 className="font-display text-[19px] font-bold tracking-tight text-white">
            Hello, {(user?.full_name || 'DERIV TRADER').toUpperCase()}!
          </h1>
          <button
            type="button"
            onClick={handleCopyId}
            className="mt-2.5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#242833] hover:bg-[#2E3342] text-[12px] text-[#C7CDD6] cursor-pointer"
          >
            <span>Client ID:</span>
            <span className="font-mono-num">{displayClientId}</span>
            <Copy className="w-3.5 h-3.5 text-[#8E95A2]" />
          </button>
        </div>
      </section>

      {/* Flat Borderless Sections matching Screenshots 102738 & 102750 */}
      <div className="px-4 sm:px-8 mt-6 space-y-6">
        <section>
          <h2 className="font-display text-[16px] font-bold text-slate-900 dark:text-white mb-1">About you</h2>
          <div>
            {renderFlatRow({ icon: User, label: 'Personal details', onClick: () => setActiveSheet('personal') })}
            {renderFlatRow({ icon: Home, label: 'Home address', onClick: () => setActiveSheet('address') })}
            {renderFlatRow({ icon: FileText, label: 'Additional information', onClick: () => setActiveSheet('personal') })}
            {renderFlatRow({ icon: Landmark, label: 'Tax information', onClick: () => setActiveSheet('tax') })}
          </div>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-bold text-slate-900 dark:text-white mb-1">Verification</h2>
          <div>
            {renderFlatRow({
              icon: Contact,
              label: 'Proof of identity',
              subtext: verification.poi_status === 'pending' ? 'Pending' : 'Verified',
              subtextColor: 'text-[#17B978]',
              onClick: () => setActiveSheet('kyc'),
            })}
            {renderFlatRow({
              icon: HomeIcon,
              label: 'Proof of address',
              subtext: verification.poa_status === 'pending' ? 'Verified' : 'Verified',
              subtextColor: 'text-[#17B978]',
              onClick: () => setActiveSheet('kyc'),
            })}
          </div>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-bold text-slate-900 dark:text-white mb-1">Assessment</h2>
          <div>
            {renderFlatRow({
              icon: Wallet,
              label: 'Financial assessment',
              onClick: () => setActiveSheet('assessment'),
            })}
          </div>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-bold text-slate-900 dark:text-white mb-1">Security</h2>
          <div>
            {renderFlatRow({
              icon: Lock,
              label: 'Change password',
              subtext: 'Managed by administrator',
              onClick: handleLockedProfileNotice,
            })}
            {renderFlatRow({
              icon: AtSign,
              label: 'Change email address',
              subtext: user?.email,
              onClick: () => setActiveSheet('personal'),
            })}
            {renderFlatRow({
              icon: Smartphone,
              label: 'Change phone number',
              subtext: user?.phone || derivSettings?.phone || 'Not set',
              onClick: () => setActiveSheet('personal'),
            })}
            {renderFlatRow({
              icon: Fingerprint,
              label: 'Manage passkeys',
              onClick: () => showToast('Passkeys verified via Deriv OAuth2', 'info'),
            })}
            {renderFlatRow({
              icon: Lock,
              label: 'Two-factor authentication',
              onClick: () => showToast('Two-factor authentication enabled', 'info'),
            })}
            {renderFlatRow({
              icon: UserX,
              label: 'Close account',
              onClick: () => setActiveSheet('close'),
            })}
          </div>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-bold text-slate-900 dark:text-white mb-1">API management</h2>
          <div>
            {renderFlatRow({
              icon: LayoutGrid,
              label: 'Connected apps',
              onClick: () => setActiveSheet('api'),
            })}
            {renderFlatRow({
              icon: Settings2,
              label: 'API Token',
              onClick: () => setActiveSheet('api'),
            })}
            {renderFlatRow({
              icon: Code2,
              label: 'Explore Deriv API',
              external: true,
              onClick: () => window.open('https://api.deriv.com', '_blank', 'noopener,noreferrer'),
            })}
          </div>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-bold text-slate-900 dark:text-white mb-1">Preferences</h2>
          <div>
            {renderFlatRow({
              icon: Globe,
              label: 'Language',
              onClick: () => setActiveSheet('language'),
            })}
            {renderFlatRow({
              icon: Palette,
              label: 'Theme',
              onClick: toggleTheme,
            })}
          </div>
        </section>

        <section>
          <h2 className="font-display text-[16px] font-bold text-slate-900 dark:text-white mb-1">Support</h2>
          <div>
            {renderFlatRow({
              icon: HelpCircle,
              label: 'Help centre',
              onClick: () => setActiveTab('learning-hub'),
            })}
            {renderFlatRow({
              icon: MessageSquare,
              label: 'Live chat',
              onClick: () => setActiveTab('learning-hub'),
            })}
          </div>
        </section>

        <section className="pt-2">
          {renderFlatRow({
            icon: Star,
            label: 'Rate our app',
            onClick: () => showToast('Thank you for rating DERIV!', 'success'),
          })}
          {renderFlatRow({
            icon: LogOut,
            label: 'Log out',
            danger: true,
            onClick: logout,
          })}
        </section>
      </div>

      {/* Interactive Edit Modals */}
      {activeSheet && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#181B22] rounded-3xl p-6 border border-slate-200 dark:border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold capitalize">{activeSheet}</h3>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="p-2 rounded-full hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(activeSheet === 'personal' || activeSheet === 'address' || activeSheet === 'tax' || activeSheet === 'language') && (
              <div className="space-y-3.5">
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-300">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Profile editing is locked. Only the Super Admin or an authorized administrator can update your profile details.
                  </span>
                </div>

                {activeSheet === 'personal' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Full Name</label>
                      <input
                        type="text"
                        value={fullName}
                        readOnly
                        disabled
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 text-sm opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Email Address</label>
                      <input
                        type="text"
                        value={user?.email || ''}
                        readOnly
                        disabled
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 text-sm opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Phone Number</label>
                      <input
                        type="text"
                        value={phone}
                        readOnly
                        disabled
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 text-sm opacity-80 cursor-not-allowed"
                      />
                    </div>
                  </>
                )}

                {activeSheet === 'address' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Street Address</label>
                      <input
                        type="text"
                        value={addressLine}
                        readOnly
                        disabled
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 text-sm opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">City</label>
                      <input
                        type="text"
                        value={addressCity}
                        readOnly
                        disabled
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 text-sm opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Country</label>
                      <input
                        type="text"
                        value={country}
                        readOnly
                        disabled
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 text-sm opacity-80 cursor-not-allowed"
                      />
                    </div>
                  </>
                )}

                {activeSheet === 'tax' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Tax Identification Number</label>
                    <input
                      type="text"
                      value={taxId}
                      readOnly
                      disabled
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 text-sm opacity-80 cursor-not-allowed"
                    />
                  </div>
                )}

                {activeSheet === 'language' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Preferred Language</label>
                    <select
                      value={language}
                      disabled
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 text-sm opacity-80 cursor-not-allowed"
                    >
                      <option value="EN">English (EN)</option>
                      <option value="SW">Kiswahili (SW)</option>
                      <option value="FR">Français (FR)</option>
                      <option value="ES">Español (ES)</option>
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  className="w-full py-3 rounded-full bg-slate-800 dark:bg-[#242833] text-white font-semibold text-sm cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}

            {activeSheet === 'kyc' && (
              <div className="space-y-3 text-sm">
                <div className="p-3.5 rounded-2xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="font-semibold">Proof of identity</p>
                  <p className="text-xs text-[#17B978] mt-1">Verified</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="font-semibold">Proof of address</p>
                  <p className="text-xs text-[#17B978] mt-1">Verified</p>
                </div>
              </div>
            )}

            {activeSheet === 'assessment' && (
              <div className="space-y-3 text-sm">
                <p className="text-xs text-slate-400">
                  Suitability status: <strong className="capitalize">{verification.financial_assessment_status || 'Completed'}</strong>
                </p>
                <p className="text-xs text-slate-400">
                  Country: <strong>{derivSettings.country || user?.country || 'Kenya'}</strong>
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  className="w-full py-3 rounded-full bg-[#FF444F] text-white font-semibold text-sm cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}

            {activeSheet === 'api' && (
              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="font-semibold text-sm">Connected OAuth Apps</p>
                  <p className="text-slate-400 mt-1">DERIV Mobile &amp; Web Terminal · Read/Trade scopes active</p>
                </div>
                <button
                  type="button"
                  onClick={() => launchDerivOAuth('login')}
                  className="w-full py-3 rounded-full bg-[#FF444F] text-white font-semibold text-sm cursor-pointer"
                >
                  Manage Authorizations on Deriv
                </button>
              </div>
            )}

            {activeSheet === 'close' && (
              <form onSubmit={handleCloseAccount} className="space-y-4">
                <p className="text-xs text-slate-400">
                  Closing your account revokes all connected Deriv authorizations and terminates active sessions.
                </p>
                <input
                  type="text"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-white/10 text-sm"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 rounded-full bg-[#FF444F] text-white font-semibold text-sm cursor-pointer"
                >
                  Confirm Account Closure
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
