import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  User,
  MapPin,
  FileText,
  Landmark,
  ShieldCheck,
  Home,
  Briefcase,
  Lock,
  Mail,
  Phone,
  Fingerprint,
  KeyRound,
  UserX,
  ExternalLink,
  Globe,
  HelpCircle,
  MessageSquare,
  Moon,
  Sun,
  X,
  Shield,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';

export const ProfileHub: React.FC = () => {
  const {
    user,
    setActiveTab,
    setAdminGateOpen,
    currencyDisplay,
    setCurrencyDisplay,
    theme,
    toggleTheme,
    logout,
    refreshAll,
    launchDerivOAuth,
    showToast,
  } = useApp();

  const isOwnerSession = user?.role === 'owner' || user?.role === 'admin';
  const [derivSettings, setDerivSettings] = useState<Record<string, any>>({});
  const [verification, setVerification] = useState<Record<string, any>>({});
  const [activeSheet, setActiveSheet] = useState<
    null | 'personal' | 'address' | 'tax' | 'kyc' | 'assessment' | 'language' | 'close'
  >(null);

  // Editable form states
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
    loadDetails();
  }, [loadDetails]);

  const initials = (user?.full_name || user?.email || 'TD')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleCopyId = () => {
    if (!user?.deriv_client_id) return;
    navigator.clipboard?.writeText(user.deriv_client_id);
    showToast('Client ID copied to clipboard', 'success');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/account/profile-details', {
        method: 'PUT',
        body: JSON.stringify({
          full_name: fullName,
          phone,
          country,
          preferred_language: language,
          address_line_1: addressLine,
          address_city: addressCity,
          tax_identification_number: taxId,
        }),
      });
      await Promise.all([refreshAll(), loadDetails()]);
      setActiveSheet(null);
      showToast('Profile settings updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/account/close', {
        method: 'POST',
        body: JSON.stringify({ reason: closeReason }),
      });
      showToast('Account closed and authorizations revoked', 'info');
      logout();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Closure failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Dark Profile Header matching screenshot */}
      <section className="bg-[#151820] text-white px-5 sm:px-8 pt-5 pb-7 rounded-b-[28px] lg:rounded-3xl lg:mx-6 lg:mt-6">
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
            aria-label="Back to Home"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-slate-400">Account & Security</span>
          <div className="w-9" />
        </div>

        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#242936] border border-white/10 flex items-center justify-center font-display text-xl font-bold">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold truncate">{user?.full_name || 'Deriv Trader'}</h1>
            <button
              type="button"
              onClick={handleCopyId}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              <span>Client ID:</span>
              <span className="font-mono-num text-slate-200">{user?.deriv_client_id || 'TD-DEMO'}</span>
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      <div className="px-5 sm:px-8 mt-6 space-y-6">
        {/* About You */}
        <section>
          <h2 className="font-display text-sm font-bold text-slate-500 dark:text-slate-400 mb-2.5 px-1">About you</h2>
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] divide-y divide-slate-100 dark:divide-[#2A2F3D]">
            {[
              { label: 'Personal details', sub: user?.full_name, icon: User, sheet: 'personal' as const },
              { label: 'Home address', sub: addressCity || user?.country || 'Kenya', icon: MapPin, sheet: 'address' as const },
              { label: 'Additional information', sub: user?.deriv_nickname || 'Verified profile', icon: FileText, sheet: 'personal' as const },
              { label: 'Tax information', sub: taxId || 'Optional', icon: Landmark, sheet: 'tax' as const },
            ].map((row) => {
              const Icon = row.icon;
              return (
                <button
                  key={row.label}
                  type="button"
                  onClick={() => setActiveSheet(row.sheet)}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer first:rounded-t-2xl last:rounded-b-2xl"
                >
                  <div className="flex items-center gap-3.5">
                    <Icon className="w-4 h-4 text-slate-500" />
                    <div>
                      <p className="text-sm font-medium">{row.label}</p>
                      {row.sub && <p className="text-xs text-slate-400">{row.sub}</p>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              );
            })}
          </div>
        </section>

        {/* Verification & Assessment */}
        <section>
          <h2 className="font-display text-sm font-bold text-slate-500 dark:text-slate-400 mb-2.5 px-1">
            Verification
          </h2>
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] divide-y divide-slate-100 dark:divide-[#2A2F3D]">
            <button
              type="button"
              onClick={() => setActiveSheet('kyc')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer rounded-t-2xl"
            >
              <div className="flex items-center gap-3.5">
                <ShieldCheck className="w-4 h-4 text-[#00A878]" />
                <div>
                  <p className="text-sm font-medium">Proof of identity</p>
                  <p className="text-xs text-[#00A878] capitalize">{verification.poi_status || 'verified'}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => setActiveSheet('kyc')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer rounded-b-2xl"
            >
              <div className="flex items-center gap-3.5">
                <Home className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-sm font-medium">Proof of address</p>
                  <p className="text-xs text-slate-400 capitalize">{verification.poa_status || 'pending'}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </section>

        <section>
          <h2 className="font-display text-sm font-bold text-slate-500 dark:text-slate-400 mb-2.5 px-1">
            Assessment
          </h2>
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D]">
            <button
              type="button"
              onClick={() => setActiveSheet('assessment')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer rounded-2xl"
            >
              <div className="flex items-center gap-3.5">
                <Briefcase className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-sm font-medium">Financial assessment</p>
                  <p className="text-xs text-slate-400">Trading experience & suitability questionnaire</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </section>

        {/* Security matching screenshot */}
        <section>
          <h2 className="font-display text-sm font-bold text-slate-500 dark:text-slate-400 mb-2.5 px-1">Security</h2>
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] divide-y divide-slate-100 dark:divide-[#2A2F3D]">
            <button
              type="button"
              onClick={() => launchDerivOAuth('login')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer rounded-t-2xl"
            >
              <div className="flex items-center gap-3.5">
                <Lock className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium">Account Security & Password</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <div className="px-4 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <Mail className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-sm font-medium">Email address</p>
                  <p className="text-xs text-slate-400">{user?.email}</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-[#00A878]">Verified</span>
            </div>

            <button
              type="button"
              onClick={() => setActiveSheet('personal')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <Phone className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-sm font-medium">Change phone number</p>
                  <p className="text-xs text-slate-400">{user?.phone || 'Not set'}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => showToast('Passkeys & Biometric verification active via Deriv OAuth2', 'info')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <Fingerprint className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium">Passkeys</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => showToast('2FA protected by Deriv OAuth2 PKCE + JWT Session', 'info')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <KeyRound className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium">Two-factor authentication</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => setActiveSheet('close')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-red-50/50 dark:hover:bg-red-950/20 text-left cursor-pointer rounded-b-2xl"
            >
              <div className="flex items-center gap-3.5">
                <UserX className="w-4 h-4 text-[#FF444F]" />
                <span className="text-sm font-medium text-[#FF444F]">Close account</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </section>

        {isOwnerSession && (
          <section>
            <h2 className="font-display text-sm font-bold text-[#FF444F] mb-2.5 px-1">Platform Administration</h2>
            <button
              type="button"
              onClick={() => setAdminGateOpen(true)}
              className="w-full px-4 py-3.5 rounded-2xl bg-[#151820] text-white border border-[#2A2F3D] flex items-center justify-between hover:bg-[#1A1D26] cursor-pointer"
            >
              <div className="flex items-center gap-3.5">
                <Shield className="w-4 h-4 text-[#FF444F]" />
                <div className="text-left">
                  <p className="text-sm font-bold">Open Owner MIS Console</p>
                  <p className="text-xs text-slate-400">Manage users, Real & Demo balances, markup & diagnostics</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </section>
        )}

        {/* Preferences */}
        <section>
          <h2 className="font-display text-sm font-bold text-slate-500 dark:text-slate-400 mb-2.5 px-1">
            Preferences
          </h2>
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] divide-y divide-slate-100 dark:divide-[#2A2F3D]">
            <button
              type="button"
              onClick={() => setActiveSheet('language')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer rounded-t-2xl"
            >
              <div className="flex items-center gap-3.5">
                <Globe className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium">Language</span>
              </div>
              <span className="text-xs font-semibold text-slate-500">{language}</span>
            </button>

            <div className="px-4 py-3.5 flex items-center justify-between">
              <span className="text-sm font-medium">Display Currency</span>
              <div className="flex items-center bg-[#F4F5F7] dark:bg-[#111319] p-1 rounded-full">
                {(['USD', 'KSH'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrencyDisplay(c)}
                    className={`px-3 py-1 rounded-full text-xs font-bold cursor-pointer ${
                      currencyDisplay === c ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]' : 'text-slate-500'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer rounded-b-2xl"
            >
              <div className="flex items-center gap-3.5">
                {theme === 'dark' ? <Moon className="w-4 h-4 text-slate-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                <span className="text-sm font-medium">Theme Appearance</span>
              </div>
              <span className="text-xs font-semibold capitalize text-slate-500">{theme} Mode</span>
            </button>
          </div>
        </section>

        {/* Support */}
        <section>
          <h2 className="font-display text-sm font-bold text-slate-500 dark:text-slate-400 mb-2.5 px-1">Support</h2>
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] divide-y divide-slate-100 dark:divide-[#2A2F3D]">
            <button
              type="button"
              onClick={() => setActiveTab('learning-hub')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left cursor-pointer rounded-t-2xl"
            >
              <div className="flex items-center gap-3.5">
                <HelpCircle className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium">Help centre & Learning Hub</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <a
              href="https://deriv.com/contact-us"
              target="_blank"
              rel="noreferrer"
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 text-left rounded-b-2xl"
            >
              <div className="flex items-center gap-3.5">
                <MessageSquare className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium">Live support desk</span>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>
          </div>
        </section>

        <button
          type="button"
          onClick={logout}
          className="w-full py-3.5 rounded-full border border-slate-300 dark:border-[#2A2F3D] font-semibold text-sm hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          Log out
        </button>
      </div>

      {/* Interactive Edit Modals */}
      {activeSheet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#181C25] rounded-3xl p-6 border border-slate-200 dark:border-[#2A2F3D]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold capitalize">{activeSheet} Settings</h3>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(activeSheet === 'personal' || activeSheet === 'address' || activeSheet === 'tax' || activeSheet === 'language') && (
              <form onSubmit={handleSaveProfile} className="space-y-3.5">
                {activeSheet === 'personal' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Full Name</label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Phone Number</label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
                      />
                    </div>
                  </>
                )}

                {activeSheet === 'address' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Street Address</label>
                      <input
                        type="text"
                        value={addressLine}
                        onChange={(e) => setAddressLine(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">City</label>
                      <input
                        type="text"
                        value={addressCity}
                        onChange={(e) => setAddressCity(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Country</label>
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
                      />
                    </div>
                  </>
                )}

                {activeSheet === 'tax' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Tax Identification Number</label>
                    <input
                      type="text"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
                    />
                  </div>
                )}

                {activeSheet === 'language' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Preferred Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
                    >
                      <option value="EN">English (EN)</option>
                      <option value="SW">Kiswahili (SW)</option>
                      <option value="FR">Français (FR)</option>
                      <option value="ES">Español (ES)</option>
                    </select>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-semibold text-sm cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            )}

            {activeSheet === 'kyc' && (
              <div className="space-y-3 text-sm">
                <div className="p-3.5 rounded-2xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="font-semibold">Proof of Identity (POI)</p>
                  <p className="text-xs text-slate-500 mt-1">Status: {verification.poi_status || 'verified'}</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="font-semibold">Proof of Address (POA)</p>
                  <p className="text-xs text-slate-500 mt-1">Status: {verification.poa_status || 'pending'}</p>
                </div>
                <a
                  href="https://hub.deriv.com/tradershub/verification"
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full py-3 rounded-full bg-[#151820] dark:bg-[#FF444F] text-white text-center font-semibold text-sm"
                >
                  Complete Verification on Deriv
                </a>
              </div>
            )}

            {activeSheet === 'assessment' && (
              <div className="space-y-3 text-sm">
                <p className="text-xs text-slate-500">
                  Suitability status: <strong className="capitalize">{verification.financial_assessment_status || 'Standard'}</strong>
                </p>
                <p className="text-xs text-slate-500">
                  Registered Country: <strong>{derivSettings.country || user?.country || 'Kenya'}</strong>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSheet(null);
                    showToast('Financial assessment acknowledged', 'success');
                  }}
                  className="w-full py-3 rounded-full bg-[#FF444F] text-white font-semibold text-sm cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}

            {activeSheet === 'close' && (
              <form onSubmit={handleCloseAccount} className="space-y-4">
                <p className="text-xs text-slate-500">
                  Closing your account revokes all connected Deriv authorizations and terminates active sessions.
                </p>
                <input
                  type="text"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
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
