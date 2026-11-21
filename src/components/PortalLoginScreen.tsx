import React, { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import {
  AuthenticatedSession,
  CustomerAccount,
  Hub,
  StaffAccount,
} from '../types/erp';
import {
  authenticateUnifiedAccount,
  getDefaultPermissionsForRole,
  hashStaffPassword,
} from '../utils/erpEngine';

interface PortalLoginScreenProps {
  hubs: Hub[];
  staffAccounts: StaffAccount[];
  customerAccounts: CustomerAccount[];
  prefillLoginId?: string;
  onLoginSuccess: (session: AuthenticatedSession) => void;
  onCustomerRegister: (customer: CustomerAccount, session: AuthenticatedSession) => void;
  onGoogleSuperAdminSignIn: () => Promise<void>;
  onBackToWebsite: () => void;
  firebaseUserEmail: string | null;
}

export const PortalLoginScreen: React.FC<PortalLoginScreenProps> = ({
  hubs,
  staffAccounts,
  customerAccounts,
  prefillLoginId = '',
  onLoginSuccess,
  onCustomerRegister,
  onGoogleSuperAdminSignIn,
  onBackToWebsite,
  firebaseUserEmail,
}) => {
  const [authTab, setAuthTab] = useState<'SIGN_IN' | 'CUSTOMER_REGISTER'>('SIGN_IN');
  const [loginId, setLoginId] = useState(prefillLoginId);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Customer self-registration state
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const handleUnifiedSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = authenticateUnifiedAccount({
      loginId,
      password,
      staffAccounts,
      customerAccounts,
    });
    if (!result.ok || !result.session) {
      setError(result.error ?? 'Authentication failed.');
      return;
    }
    setPassword('');
    onLoginSuccess(result.session);
  };

  const handleCustomerRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = regEmail.trim().toLowerCase();
    if (regName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (cleanEmail.length < 4) {
      setError('Please enter a valid Email or Login ID.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    const duplicate =
      customerAccounts.some((c) => c.loginId.toLowerCase() === cleanEmail) ||
      staffAccounts.some((s) => s.loginId.toLowerCase() === cleanEmail);
    if (duplicate) {
      setError('An account with this Login ID already exists. Please sign in instead.');
      return;
    }

    const now = new Date().toISOString();
    const customerId = `CUST-${1001 + customerAccounts.length}`;
    const newCustomer: CustomerAccount = {
      customerId,
      loginId: cleanEmail,
      fullName: regName.trim(),
      phone: regPhone.trim() || '+91-98000-00000',
      address: regAddress.trim() || 'Civil Lines, Barabanki',
      passwordHash: hashStaffPassword(cleanEmail, regPassword),
      createdAt: now,
    };
    const session: AuthenticatedSession = {
      staffId: newCustomer.customerId,
      loginId: newCustomer.loginId,
      fullName: newCustomer.fullName,
      role: 'CUSTOMER',
      allottedHubId: 'ALL',
      permissions: getDefaultPermissionsForRole('CUSTOMER'),
      authMethod: 'CUSTOMER_ACCOUNT',
      phone: newCustomer.phone,
      address: newCustomer.address,
    };
    onCustomerRegister(newCustomer, session);
  };

  const handleGoogleAdmin = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      await onGoogleSuperAdminSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In was cancelled or failed.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const demoRows = [
    { label: 'Super Admin HQ', sub: 'All Hubs · Full Control', id: 'hq.admin@instawash.in', pwd: 'InstaHQ@2026' },
    { label: 'Barabanki Franchise (BBK-01)', sub: 'Own Branch Only', id: 'partner.bbk@instawash.in', pwd: 'BbkHub@2026' },
    { label: 'Ayodhya Franchise (AYD-01)', sub: 'Own Branch Only', id: 'partner.ayd@instawash.in', pwd: 'AydHub@2026' },
    { label: 'Plant Operator (BBK-01)', sub: 'Wash-Floor Kanban', id: 'plant.bbk@instawash.in', pwd: 'Plant@2026' },
    { label: 'Field Rider (BBK-01)', sub: 'Pickup & Weight Lock', id: 'ravi.rider@instawash.in', pwd: 'Rider@2026' },
    { label: 'Customer Panel', sub: 'Personal Orders & OTP', id: 'aditi.customer@instawash.in', pwd: 'Customer@2026' },
  ];

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col lg:flex-row">
      {/* Left Brand & Role Isolation Overview */}
      <aside className="lg:w-[430px] xl:w-[470px] bg-[#0F172A] text-slate-200 p-8 lg:p-11 flex flex-col justify-between shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800">
        <div className="space-y-8">
          <div className="space-y-4">
            <button
              type="button"
              onClick={onBackToWebsite}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back to InstaWash Public Website
            </button>
            <div className="space-y-1.5">
              <div className="font-display text-2xl font-extrabold tracking-tight text-white">
                InstaWash Portal Login
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Single secure gateway. Enter your allotted Login ID &amp; Password and you will be routed automatically into your exact role and branch workspace.
              </p>
            </div>
          </div>

          <div className="space-y-3.5 pt-4 border-t border-slate-800">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                Super Admin HQ
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Full control over all branches, dynamic pricing, Running Banners/Ads, Portal Excel bulk upload, and user permission controls.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Building2 className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
                Franchise &amp; Branch Staff
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Strict branch isolation. Franchises manage their own branch orders, POD cash, and own-branch staff only—never other branches or Super Admin controls.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <UserPlus className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                Dedicated Customer Panel
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Customers can self-register and sign in to track 10-min pickups, view locked digital scale receipts, and manage delivery OTPs.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-6 mt-6 border-t border-slate-800 text-xs text-slate-400 space-y-1">
          <div className="font-medium text-slate-300">Active Hubs ({hubs.length})</div>
          <div className="font-mono text-[11px] text-slate-400">
            {hubs.map((h) => `${h.code} (${h.city})`).join(' · ')}
          </div>
        </div>
      </aside>

      {/* Right Unified Login + Customer Registration Card */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          {/* 2 Tabs: Unified Sign In vs Customer Self-Registration */}
          <div
            role="tablist"
            aria-label="Login or customer registration"
            className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              role="tab"
              aria-selected={authTab === 'SIGN_IN'}
              onClick={() => {
                setAuthTab('SIGN_IN');
                setError(null);
              }}
              className={`py-2.5 px-3 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                authTab === 'SIGN_IN'
                  ? 'bg-[#0F172A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              Login (ID &amp; Password)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authTab === 'CUSTOMER_REGISTER'}
              onClick={() => {
                setAuthTab('CUSTOMER_REGISTER');
                setError(null);
              }}
              className={`py-2.5 px-3 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                authTab === 'CUSTOMER_REGISTER'
                  ? 'bg-[#0284C7] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
              Customer Register
            </button>
          </div>

          {authTab === 'SIGN_IN' ? (
            <>
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-slate-900">
                  Sign In to Your Panel
                </h1>
                <p className="text-xs text-slate-500">
                  Enter your allotted Login ID &amp; Password. Role and branch location are enforced automatically.
                </p>
              </div>

              <form onSubmit={handleUnifiedSignIn} className="space-y-4">
                <div>
                  <label htmlFor="unified-login-id" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Login ID, Staff ID, or Customer Email
                  </label>
                  <input
                    id="unified-login-id"
                    type="text"
                    autoComplete="username"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="e.g., partner.bbk@instawash.in or hq.admin@instawash.in"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="unified-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Password
                  </label>
                  <input
                    id="unified-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                    required
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 flex items-start gap-2"
                  >
                    <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#0284C7] hover:bg-sky-700 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                  Login
                </button>
              </form>

              {/* Super Admin Google Cloud Sync Option */}
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Super Admin Cloud Sync (Google Auth)</span>
                  {firebaseUserEmail && (
                    <span className="font-mono text-[11px] text-emerald-700">{firebaseUserEmail}</span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={googleBusy}
                  onClick={() => void handleGoogleAdmin()}
                  className="w-full py-2 px-4 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {googleBusy ? 'Connecting Google Account...' : 'Sign In with Google (Super Admin HQ)'}
                </button>
              </div>

              {/* Quick Demo Credentials Helper */}
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-sky-700" aria-hidden="true" />
                    Provisioned Role Accounts (Click to Prefill)
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {demoRows.map((row) => (
                    <div
                      key={row.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 bg-white hover:bg-slate-50 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {row.label}{' '}
                          <span className="font-normal text-slate-500">· {row.sub}</span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 truncate">
                          {row.id} · {row.pwd}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginId(row.id);
                          setPassword(row.pwd);
                          setError(null);
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 rounded-md whitespace-nowrap shrink-0"
                      >
                        Fill
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-slate-900">
                  Create Customer Account
                </h1>
                <p className="text-xs text-slate-500">
                  Register once to open your personal Customer Panel for 10-min pickups, live weight receipts, and OTP tracking.
                </p>
              </div>

              <form onSubmit={handleCustomerRegistration} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-name" className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Name
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Riya Verma"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                      Mobile Number
                    </label>
                    <input
                      id="reg-phone"
                      type="text"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="+91-98390-55123"
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Email / Login ID
                  </label>
                  <input
                    id="reg-email"
                    type="text"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="riya.verma@gmail.com"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="reg-address" className="block text-xs font-semibold text-slate-700 mb-1">
                    Default Pickup Address
                  </label>
                  <input
                    id="reg-address"
                    type="text"
                    value={regAddress}
                    onChange={(e) => setRegAddress(e.target.value)}
                    placeholder="House 18, Civil Lines, Barabanki"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="reg-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    Create Password (min 6 chars)
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    required
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 flex items-start gap-2"
                  >
                    <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#0284C7] hover:bg-sky-700 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  Register &amp; Open Customer Panel
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
