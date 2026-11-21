import React, { useState } from 'react';
import { KeyRound, ShieldCheck, X } from 'lucide-react';
import { StaffAccount, UserRole } from '../types/erp';
import { verifyStaffPassword } from '../utils/erpEngine';

interface RoleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  firebaseUserEmail: string | null;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  staffAccounts: StaffAccount[];
  onStaffLoginSuccess: (staff: StaffAccount) => void;
}

export const RoleAuthModal: React.FC<RoleAuthModalProps> = ({
  isOpen,
  onClose,
  firebaseUserEmail,
  onGoogleSignIn,
  onGoogleSignOut,
  staffAccounts,
  onStaffLoginSuccess,
}) => {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const match = staffAccounts.find(
      (s) => s.loginId.toLowerCase() === loginId.trim().toLowerCase()
    );
    if (!match) {
      setError('Account not found in facility directory.');
      return;
    }
    if (match.status !== 'ACTIVE') {
      setError('This staff account is suspended.');
      return;
    }
    if (!verifyStaffPassword(match.loginId, password, match.passwordHash)) {
      setError('Incorrect password.');
      return;
    }
    onStaffLoginSuccess(match);
    setLoginId('');
    setPassword('');
    onClose();
  };

  const handleGoogleClick = async () => {
    setError(null);
    setBusy(true);
    try {
      await onGoogleSignIn();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In cancelled or failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Account and Cloud Sync Sign In"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-start justify-between pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Account &amp; Cloud Sync Access
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect Firebase Cloud persistence or sign in with a Facility Staff ID
            </p>
          </div>
          <button
            type="button"
            aria-label="Close sign in dialog"
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Google Cloud Sync */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            <ShieldCheck className="w-4 h-4 text-sky-700" aria-hidden="true" />
            Firebase Cloud Persistence (Google Auth)
          </div>
          {firebaseUserEmail ? (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-slate-700 truncate">{firebaseUserEmail}</span>
              <button
                type="button"
                onClick={() => void onGoogleSignOut()}
                className="px-3 py-1.5 font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md whitespace-nowrap"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleGoogleClick()}
              className="w-full py-2 px-4 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              {busy ? 'Connecting...' : 'Sign in with Google to Enable Cloud Sync'}
            </button>
          )}
        </div>

        {/* Staff ID & Password Login */}
        <form onSubmit={handleStaffSubmit} className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
            <KeyRound className="w-4 h-4 text-slate-600" aria-hidden="true" />
            Facility Staff Role Sign-In (ID + Password)
          </div>
          <div>
            <label htmlFor="modal-login-id" className="block text-xs font-medium text-slate-700 mb-1">
              Staff Login ID / Email
            </label>
            <input
              id="modal-login-id"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="partner.bbk@instawash.in"
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label htmlFor="modal-password" className="block text-xs font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              id="modal-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter staff password"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-xs font-medium text-rose-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Sign In as Facility Staff
          </button>
          <p className="text-[11px] text-slate-500">
            Demo credentials: <span className="font-mono">partner.bbk@instawash.in</span> / <span className="font-mono">BbkHub@2026</span> or any Excel-imported account.
          </p>
        </form>
      </div>
    </div>
  );
};
