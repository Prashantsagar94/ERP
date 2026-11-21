import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  KeyRound,
  Lock,
  Settings2,
  ShieldCheck,
  Upload,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import {
  AuthenticatedSession,
  Hub,
  PortalPermissions,
  StaffAccount,
} from '../types/erp';
import {
  getDefaultPermissionsForRole,
  hashStaffPassword,
  RawStaffUploadRow,
  serializePermissionsToString,
  validateBulkStaffRows,
  ValidatedStaffImportRow,
  verifyStaffPassword,
} from '../utils/erpEngine';

interface StaffExcelImportViewProps {
  session: AuthenticatedSession;
  hubs: Hub[];
  staffAccounts: StaffAccount[];
  onImportStaffBatch: (accounts: StaffAccount[]) => void;
  onAddSingleStaff: (account: StaffAccount) => void;
  onUpdateStaffAccount: (account: StaffAccount) => void;
  onToggleStaffStatus: (staffId: string) => void;
}

const PERMISSION_META: { key: keyof PortalPermissions; label: string; desc: string }[] = [
  { key: 'overview', label: 'Overview & Fleet Map', desc: 'Hub KPIs, live geofence map, and fleet dispatch' },
  { key: 'kanban', label: 'Wash-Floor Kanban', desc: '6-stage plant pipeline & Bag QR scanner' },
  { key: 'customerBooking', label: 'Customer 10-Min Booking', desc: 'Walk-in / booking simulator access' },
  { key: 'riderConsole', label: 'Rider Dispatch & Weight Lock', desc: 'Doorstep weighing, QR lock & OTP delivery' },
  { key: 'financeLedger', label: 'Finance & POD Ledger', desc: 'Prepaid/POD totals & franchise GST summary' },
  { key: 'eodSettlement', label: 'Approve EOD Cash Settlement', desc: 'Verify & settle rider POD cash to ₹0' },
  { key: 'weightOverride', label: 'Weight Dispute Override', desc: 'Revise locked weights with 15+ char audit' },
  { key: 'productMaking', label: 'Product Making & BOM', desc: 'Formulas, unit cost margins & production batches' },
  { key: 'bannerAds', label: 'Running Banner Ads CMS', desc: 'Publish/edit Website & Franchise running ads' },
  { key: 'staffDirectory', label: 'Own-Branch Staff Directory', desc: 'Create & manage branch staff IDs & passwords' },
  { key: 'excelImportExport', label: 'Portal Excel Import / Export', desc: 'Bulk .xlsx staff import & directory export' },
];

const SAMPLE_EXCEL_ROWS: RawStaffUploadRow[] = [
  {
    staffId: 'STF-BBK-104',
    fullName: 'Alok Kumar Tiwari',
    role: 'HUB_OPERATOR',
    hub: 'BBK-01',
    loginId: 'alok.plant@instawash.in',
    password: 'WashFloor#2026',
    phone: '+91-98391-55210',
    status: 'ACTIVE',
    permissions: 'default',
  },
  {
    staffId: 'STF-AYD-105',
    fullName: 'Priya Singh',
    role: 'FRANCHISE_PARTNER',
    hub: 'AYD-01',
    loginId: 'priya.ayd@instawash.in',
    password: 'Ayodhya#2026',
    phone: '+91-98392-77890',
    status: 'ACTIVE',
    permissions: 'default',
  },
  {
    staffId: 'STF-LKO-106',
    fullName: 'Mohit Yadav',
    role: 'RIDER',
    hub: 'LKO-01',
    loginId: 'mohit.rider@instawash.in',
    password: 'RiderLko#26',
    phone: '+91-98393-44118',
    status: 'ACTIVE',
    permissions: 'default',
  },
];

export const StaffExcelImportView: React.FC<StaffExcelImportViewProps> = ({
  session,
  hubs,
  staffAccounts,
  onImportStaffBatch,
  onAddSingleStaff,
  onUpdateStaffAccount,
  onToggleStaffStatus,
}) => {
  const isSuperAdmin = session.role === 'SUPER_ADMIN';
  const canUseExcel = isSuperAdmin || session.permissions.excelImportExport;
  const allottedHub = hubs.find((h) => h.hubId === session.allottedHubId) ?? hubs[0];

  // Franchise strictly sees ONLY their own branch staff (never other branches or Super Admin)
  const visibleStaff = useMemo(() => {
    if (isSuperAdmin) return staffAccounts;
    return staffAccounts.filter(
      (s) => s.hubId === session.allottedHubId && s.role !== 'SUPER_ADMIN'
    );
  }, [isSuperAdmin, session.allottedHubId, staffAccounts]);

  const allowedHubs = useMemo(
    () => (isSuperAdmin ? hubs : hubs.filter((h) => h.hubId === session.allottedHubId)),
    [hubs, isSuperAdmin, session.allottedHubId]
  );

  const [previewRows, setPreviewRows] = useState<ValidatedStaffImportRow[]>([]);
  const [uploadFilename, setUploadFilename] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Manual single staff form
  const [manualStaffId, setManualStaffId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualRole, setManualRole] = useState<StaffAccount['role']>(
    isSuperAdmin ? 'FRANCHISE_PARTNER' : 'HUB_OPERATOR'
  );
  const [manualHubId, setManualHubId] = useState(
    isSuperAdmin ? hubs[0]?.hubId ?? '' : session.allottedHubId
  );
  const [manualLoginId, setManualLoginId] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [manualPhone, setManualPhone] = useState('');

  // Edit Staff / Permissions / Location Modal state
  const [editingStaff, setEditingStaff] = useState<StaffAccount | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<StaffAccount['role']>('HUB_OPERATOR');
  const [editHubId, setEditHubId] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editPermissions, setEditPermissions] = useState<PortalPermissions>(
    getDefaultPermissionsForRole('HUB_OPERATOR')
  );

  // Live Credential Verification Tester
  const [testLoginId, setTestLoginId] = useState('');
  const [testPassword, setTestPassword] = useState('');
  const [testAuthResult, setTestAuthResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const openEditModal = (staff: StaffAccount) => {
    // Hard guard: non-Super-Admin cannot edit Super Admin or other Franchise Partners
    if (!isSuperAdmin && (staff.role === 'SUPER_ADMIN' || staff.hubId !== session.allottedHubId)) {
      setFeedback({
        type: 'err',
        text: 'Access Denied: You can only edit staff inside your own allotted branch.',
      });
      return;
    }
    setEditingStaff(staff);
    setEditFullName(staff.fullName);
    setEditRole(staff.role);
    setEditHubId(staff.hubId);
    setEditPhone(staff.phone);
    setEditNewPassword('');
    setEditPermissions({ ...staff.permissions });
  };

  const handleSaveEditedStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    if (!isSuperAdmin && (editRole === 'SUPER_ADMIN' || editRole === 'FRANCHISE_PARTNER')) {
      setFeedback({
        type: 'err',
        text: 'Franchise Partners can only assign HUB_OPERATOR or RIDER roles inside their own branch.',
      });
      return;
    }
    if (editNewPassword && editNewPassword.length < 6) {
      setFeedback({ type: 'err', text: 'New password must be at least 6 characters.' });
      return;
    }

    const updated: StaffAccount = {
      ...editingStaff,
      fullName: editFullName.trim() || editingStaff.fullName,
      role: isSuperAdmin ? editRole : editingStaff.role === 'FRANCHISE_PARTNER' ? 'FRANCHISE_PARTNER' : editRole,
      hubId: isSuperAdmin ? editHubId : session.allottedHubId,
      phone: editPhone.trim() || editingStaff.phone,
      passwordHash: editNewPassword
        ? hashStaffPassword(editingStaff.loginId, editNewPassword)
        : editingStaff.passwordHash,
      permissions:
        (isSuperAdmin ? editRole : editingStaff.role) === 'SUPER_ADMIN'
          ? getDefaultPermissionsForRole('SUPER_ADMIN')
          : isSuperAdmin
            ? editPermissions
            : editingStaff.permissions,
    };
    onUpdateStaffAccount(updated);
    setEditingStaff(null);
    setFeedback({
      type: 'ok',
      text: `Updated ${updated.fullName} (${updated.staffId})${editNewPassword ? ' including new salted password digest' : ''}.`,
    });
  };

  const handleDownloadTemplate = () => {
    const rows = isSuperAdmin
      ? SAMPLE_EXCEL_ROWS
      : [
          {
            staffId: `STF-${allottedHub?.code ?? 'HUB'}-201`,
            fullName: 'Branch Wash Operator',
            role: 'HUB_OPERATOR',
            hub: allottedHub?.code ?? session.allottedHubId,
            loginId: `operator.${(allottedHub?.code ?? 'hub').toLowerCase()}@instawash.in`,
            password: 'BranchOp#2026',
            phone: '+91-98391-55001',
            status: 'ACTIVE',
            permissions: 'default',
          },
        ];
    const templateRows = rows.map((r) => ({
      Staff_ID: r.staffId,
      Full_Name: r.fullName,
      Role: r.role,
      Hub_Code: r.hub,
      Login_ID: r.loginId,
      Password: r.password,
      Phone: r.phone,
      Status: r.status,
      Permissions: r.permissions ?? 'default',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Facility_Roles_Template');
    XLSX.writeFile(wb, 'instawash-staff-role-upload-template.xlsx');
  };

  const handleExportDirectory = () => {
    const exportRows = visibleStaff.map((s) => {
      const hub = hubs.find((h) => h.hubId === s.hubId);
      return {
        Staff_ID: s.staffId,
        Full_Name: s.fullName,
        Role: s.role,
        Hub_Code: hub?.code ?? s.hubId,
        Hub_Name: hub?.name ?? '',
        Login_ID: s.loginId,
        Phone: s.phone,
        Status: s.status,
        Permissions: serializePermissionsToString(s.permissions),
        Password_Digest_Prefix: `${s.passwordHash.slice(0, 24)}...`,
        Source: s.importSource,
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Staff_Directory');
    XLSX.writeFile(wb, 'instawash-staff-directory.xlsx');
  };

  const normalizeRowKeys = (rawObj: Record<string, unknown>): RawStaffUploadRow => {
    const map: Record<string, string> = Object.create(null);
    const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
    for (const [key, val] of Object.entries(rawObj)) {
      const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!norm || forbidden.has(norm)) continue;
      map[norm] = String(val ?? '').trim().slice(0, 160);
    }
    return {
      staffId: map.staffid || map.id || map.employeeid || map.empid,
      fullName: map.fullname || map.name || map.staffname,
      role: map.role || map.facilityrole || map.userrole,
      hub: map.hubcode || map.hub || map.hubid || map.branch || map.facility,
      loginId: map.loginid || map.email || map.username || map.userid,
      password: map.password || map.passcode || map.pwd,
      phone: map.phone || map.mobile || map.contact,
      status: map.status || 'ACTIVE',
      permissions: map.permissions || map.access || 'default',
    };
  };

  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ type: 'err', text: 'File exceeds the 5 MB upload limit.' });
      e.target.value = '';
      return;
    }
    setUploadFilename(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', sheetRows: 2001 });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      if (rawJson.length === 0) {
        setFeedback({ type: 'err', text: 'Uploaded spreadsheet is empty.' });
        setPreviewRows([]);
        return;
      }
      const normalized = rawJson.slice(0, 2000).map(normalizeRowKeys);
      const actorRole = session.role === 'CUSTOMER' ? 'RIDER' : session.role;
      const validated = validateBulkStaffRows(normalized, allowedHubs, staffAccounts, actorRole);
      setPreviewRows(validated);
      const validCount = validated.filter((r) => r.isValid).length;
      setFeedback({
        type: validCount > 0 ? 'ok' : 'err',
        text: `Parsed ${validated.length} row(s) from ${file.name}: ${validCount} valid, ${validated.length - validCount} with errors.`,
      });
    } catch {
      setFeedback({
        type: 'err',
        text: 'Could not parse file. Please upload a valid .xlsx, .xls, or .csv workbook.',
      });
    }
    e.target.value = '';
  };

  const handleLoadSampleBatch = () => {
    setUploadFilename('sample_facility_roles_batch.xlsx');
    const actorRole = session.role === 'CUSTOMER' ? 'RIDER' : session.role;
    const validated = validateBulkStaffRows(SAMPLE_EXCEL_ROWS, allowedHubs, staffAccounts, actorRole);
    setPreviewRows(validated);
    const validCount = validated.filter((r) => r.isValid).length;
    setFeedback({
      type: validCount > 0 ? 'ok' : 'err',
      text: `Loaded sample Excel batch (${validated.length} rows): ${validCount} ready to hash & import.`,
    });
  };

  const handleCommitBulkImport = () => {
    const validRows = previewRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setFeedback({ type: 'err', text: 'No valid rows available to import.' });
      return;
    }
    const now = new Date().toISOString();
    const newAccounts: StaffAccount[] = validRows.map((row) => ({
      staffId: row.staffId,
      loginId: row.loginId,
      fullName: row.fullName,
      role: row.role,
      hubId: row.hubId,
      phone: row.phone,
      passwordHash: hashStaffPassword(row.loginId, row.rawPassword),
      status: row.status,
      importSource: 'EXCEL_BULK',
      permissions: row.permissions,
      createdAt: now,
    }));
    onImportStaffBatch(newAccounts);
    setPreviewRows([]);
    setUploadFilename('');
    setFeedback({
      type: 'ok',
      text: `Imported ${newAccounts.length} allotted account(s). Each user can now sign in via the main Login button with their ID & Password.`,
    });
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveRole: StaffAccount['role'] = isSuperAdmin
      ? manualRole
      : manualRole === 'RIDER'
        ? 'RIDER'
        : 'HUB_OPERATOR';
    const effectiveHub = isSuperAdmin ? manualHubId : session.allottedHubId;
    const actorRole = session.role === 'CUSTOMER' ? 'RIDER' : session.role;

    const check = validateBulkStaffRows(
      [
        {
          staffId: manualStaffId,
          fullName: manualName,
          role: effectiveRole,
          hub: effectiveHub,
          loginId: manualLoginId,
          password: manualPassword,
          phone: manualPhone,
          status: 'ACTIVE',
          permissions: 'default',
        },
      ],
      allowedHubs,
      staffAccounts,
      actorRole
    )[0];

    if (!check.isValid) {
      setFeedback({ type: 'err', text: check.errors.join(' · ') });
      return;
    }

    onAddSingleStaff({
      staffId: check.staffId,
      loginId: check.loginId,
      fullName: check.fullName,
      role: check.role,
      hubId: check.hubId,
      phone: check.phone,
      passwordHash: hashStaffPassword(check.loginId, check.rawPassword),
      status: 'ACTIVE',
      importSource: 'MANUAL',
      permissions: getDefaultPermissionsForRole(check.role),
      createdAt: new Date().toISOString(),
    });
    setManualStaffId('');
    setManualName('');
    setManualLoginId('');
    setManualPassword('');
    setManualPhone('');
    setFeedback({
      type: 'ok',
      text: `Allotted login account ${check.loginId} (${check.role}) for ${check.hubLabel}. They can now log in immediately.`,
    });
  };

  const handleVerifyCredential = (e: React.FormEvent) => {
    e.preventDefault();
    const matched = visibleStaff.find(
      (s) => s.loginId.toLowerCase() === testLoginId.trim().toLowerCase()
    );
    if (!matched) {
      setTestAuthResult({ ok: false, msg: 'No account found in your authorized branch directory.' });
      return;
    }
    if (matched.status !== 'ACTIVE') {
      setTestAuthResult({ ok: false, msg: `Account ${matched.staffId} is currently SUSPENDED.` });
      return;
    }
    const valid = verifyStaffPassword(matched.loginId, testPassword, matched.passwordHash);
    if (!valid) {
      setTestAuthResult({ ok: false, msg: 'Invalid password against stored salted SHA-256 digest.' });
      return;
    }
    const hub = hubs.find((h) => h.hubId === matched.hubId);
    setTestAuthResult({
      ok: true,
      msg: `Verified! ${matched.fullName} authenticates as ${matched.role} locked to ${hub?.name ?? matched.hubId}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Branch Isolation Guardrail Notice for Franchise Partners */}
      {!isSuperAdmin && (
        <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-sky-950">
            <Building2 className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-bold">
                Branch-Isolated Staff Directory — {allottedHub?.name} ({allottedHub?.code})
              </div>
              <p className="text-sky-800 mt-0.5">
                You can view, create, edit, and suspend staff strictly inside your own branch ({allottedHub?.city}). Other branches and Super Admin HQ accounts are hidden and protected.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-sky-800">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            BRANCH LOCKED
          </span>
        </div>
      )}

      {/* Bulk Excel Upload Studio (Super Admin or explicitly delegated) */}
      {canUseExcel && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Portal Excel — Bulk Franchise &amp; Staff ID/Password Upload
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload <span className="font-mono">.xlsx</span>, <span className="font-mono">.xls</span>, or <span className="font-mono">.csv</span> sheets containing Staff ID, Full Name, Role, Hub Code, Login ID, Password, and Permissions. All passwords are converted to salted SHA-256 digests before commit.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Download Excel Template
              </button>
              <button
                type="button"
                onClick={handleLoadSampleBatch}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                Load Sample Excel Batch
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
            <div className="space-y-1 text-center sm:text-left">
              <p className="text-sm font-semibold text-slate-900">
                Upload Facility Staff, Franchise &amp; Role Workbook
              </p>
              <p className="text-xs text-slate-500">
                Columns: <span className="font-mono text-slate-700">Staff_ID, Full_Name, Role, Hub_Code, Login_ID, Password, Permissions</span>
              </p>
            </div>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0">
              <Upload className="w-4 h-4" aria-hidden="true" />
              Select .xlsx / .csv File
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelFileUpload}
                className="sr-only"
              />
            </label>
          </div>

          {previewRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Import Validation Preview — {uploadFilename}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewRows([])}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    Discard Batch
                  </button>
                  <button
                    type="button"
                    disabled={previewRows.filter((r) => r.isValid).length === 0}
                    onClick={handleCommitBulkImport}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg transition-colors"
                  >
                    Hash &amp; Commit {previewRows.filter((r) => r.isValid).length} Valid Account(s)
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-3 font-medium">Row</th>
                      <th className="py-2.5 px-3 font-medium">Staff ID</th>
                      <th className="py-2.5 px-3 font-medium">Full Name</th>
                      <th className="py-2.5 px-3 font-medium">Role</th>
                      <th className="py-2.5 px-3 font-medium">Allotted Hub</th>
                      <th className="py-2.5 px-3 font-medium">Login ID</th>
                      <th className="py-2.5 px-3 font-medium">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row) => (
                      <tr key={`${row.rowNumber}-${row.staffId}`} className={row.isValid ? 'bg-white' : 'bg-rose-50/50'}>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{row.rowNumber}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">{row.staffId}</td>
                        <td className="py-2.5 px-3 text-slate-800">{row.fullName}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">{row.role}</td>
                        <td className="py-2.5 px-3 text-slate-700">{row.hubLabel}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">{row.loginId}</td>
                        <td className="py-2.5 px-3">
                          {row.isValid ? (
                            <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              Ready
                            </span>
                          ) : (
                            <span className="text-rose-700 font-medium inline-flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              {row.errors.join('; ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {feedback && (
        <div
          role="status"
          className={`p-3 rounded-lg border text-xs font-medium ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Split: Create Allotted Login ID + Live Credential Verifier */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleManualAdd} className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-slate-600" aria-hidden="true" />
            {isSuperAdmin
              ? 'Create & Allot Franchise / Staff Login ID'
              : `Add Staff to ${allottedHub?.name ?? 'Own Branch'}`}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="m-staff-id" className="block text-xs font-medium text-slate-700 mb-1">Staff ID</label>
              <input
                id="m-staff-id"
                type="text"
                value={manualStaffId}
                onChange={(e) => setManualStaffId(e.target.value)}
                placeholder="STF-BBK-209"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label htmlFor="m-full-name" className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
              <input
                id="m-full-name"
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Ramesh Kumar"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label htmlFor="m-role" className="block text-xs font-medium text-slate-700 mb-1">Role</label>
              <select
                id="m-role"
                value={manualRole}
                onChange={(e) => setManualRole(e.target.value as StaffAccount['role'])}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              >
                {isSuperAdmin && <option value="SUPER_ADMIN">SUPER_ADMIN</option>}
                {isSuperAdmin && <option value="FRANCHISE_PARTNER">FRANCHISE_PARTNER</option>}
                <option value="HUB_OPERATOR">HUB_OPERATOR</option>
                <option value="RIDER">RIDER</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="m-hub" className="block text-xs font-medium text-slate-700 mb-1">Allotted Location / Hub</label>
              <select
                id="m-hub"
                value={isSuperAdmin ? manualHubId : session.allottedHubId}
                disabled={!isSuperAdmin}
                onChange={(e) => setManualHubId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white disabled:bg-slate-100 border border-slate-300 rounded-lg"
              >
                {allowedHubs.map((h) => (
                  <option key={h.hubId} value={h.hubId}>
                    {h.name} ({h.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="m-login" className="block text-xs font-medium text-slate-700 mb-1">Login ID / Email</label>
              <input
                id="m-login"
                type="text"
                value={manualLoginId}
                onChange={(e) => setManualLoginId(e.target.value)}
                placeholder="ramesh.bbk@instawash.in"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label htmlFor="m-pwd" className="block text-xs font-medium text-slate-700 mb-1">Password (min 6)</label>
              <input
                id="m-pwd"
                type="password"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                required
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              aria-label="Phone number"
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              placeholder="Phone (+91-...)"
              className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg w-52"
            />
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              Allot ID &amp; Create Account
            </button>
          </div>
        </form>

        {/* Credential Hash Verification Tester */}
        <form onSubmit={handleVerifyCredential} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-slate-600" aria-hidden="true" />
            Verify Allotted Staff Credentials
          </h3>
          <p className="text-xs text-slate-500">
            Test any allotted Login ID &amp; Password against its stored salted SHA-256 digest.
          </p>
          <div className="space-y-3">
            <div>
              <label htmlFor="verify-login" className="block text-xs font-medium text-slate-700 mb-1">Login ID</label>
              <input
                id="verify-login"
                type="text"
                value={testLoginId}
                onChange={(e) => setTestLoginId(e.target.value)}
                placeholder="partner.bbk@instawash.in"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label htmlFor="verify-pwd" className="block text-xs font-medium text-slate-700 mb-1">Password</label>
              <input
                id="verify-pwd"
                type="password"
                value={testPassword}
                onChange={(e) => setTestPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                required
              />
            </div>
          </div>
          {testAuthResult && (
            <div
              role="status"
              className={`p-2.5 rounded-lg border text-xs font-medium ${
                testAuthResult.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {testAuthResult.msg}
            </div>
          )}
          <button
            type="submit"
            className="w-full py-2 px-4 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors"
          >
            Test Login Verification
          </button>
        </form>
      </div>

      {/* Provisioned Staff & Franchise Directory */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isSuperAdmin
                ? `All Franchises & Facility Staff Directory (${visibleStaff.length})`
                : `${allottedHub?.name ?? 'Own Branch'} Staff Directory (${visibleStaff.length})`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isSuperAdmin
                ? 'Super Admin can edit any user’s allotted hub, granular portal permissions, password, or active status.'
                : 'Showing only staff allotted to your branch. Super Admin & other branch directories are isolated.'}
            </p>
          </div>
          {canUseExcel && (
            <button
              type="button"
              onClick={handleExportDirectory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export Directory (.xlsx)
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 px-4 font-medium">Staff ID</th>
                <th className="py-3 px-4 font-medium">Name &amp; Login ID</th>
                <th className="py-3 px-4 font-medium">Role</th>
                <th className="py-3 px-4 font-medium">Allotted Location</th>
                <th className="py-3 px-4 font-medium">Permissions</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleStaff.map((stf) => {
                const hub = hubs.find((h) => h.hubId === stf.hubId);
                const enabledCount = Object.values(stf.permissions).filter(Boolean).length;
                const canModifyRow =
                  isSuperAdmin ||
                  (stf.hubId === session.allottedHubId &&
                    stf.role !== 'SUPER_ADMIN' &&
                    stf.role !== 'FRANCHISE_PARTNER');

                return (
                  <tr key={stf.staffId} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {stf.staffId}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{stf.fullName}</div>
                      <div className="text-xs font-mono text-slate-500">{stf.loginId}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                      {stf.role}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {stf.role === 'SUPER_ADMIN'
                        ? 'ALL HUBS (HQ)'
                        : `${hub?.code ?? stf.hubId} · ${hub?.city ?? ''}`}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        {stf.role === 'SUPER_ADMIN' ? 'Full HQ (11/11)' : `${enabledCount}/11 modules`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold whitespace-nowrap">
                      <span className={stf.status === 'ACTIVE' ? 'text-emerald-700' : 'text-rose-700'}>
                        {stf.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-3">
                      {canModifyRow ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(stf)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900"
                          >
                            <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
                            {isSuperAdmin ? 'Edit / Permissions' : 'Edit Staff'}
                          </button>
                          {stf.staffId !== session.staffId && (
                            <button
                              type="button"
                              onClick={() => onToggleStaffStatus(stf.staffId)}
                              className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2"
                            >
                              {stf.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] font-mono text-slate-400">Branch Owner</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Edit Staff / Franchise Permissions & Location Modal */}
      {editingStaff && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Edit user permissions and allotted hub"
        >
          <form
            onSubmit={handleSaveEditedStaff}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5"
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isSuperAdmin
                    ? `Super Admin Control — Edit ${editingStaff.fullName} (${editingStaff.staffId})`
                    : `Edit Branch Staff — ${editingStaff.fullName} (${editingStaff.staffId})`}
                </h3>
                <p className="text-xs font-mono text-slate-500 mt-0.5">
                  Login ID: {editingStaff.loginId}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close edit modal"
                onClick={() => setEditingStaff(null)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-name" className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  id="edit-name"
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label htmlFor="edit-phone" className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                <input
                  id="edit-phone"
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="edit-role" className="block text-xs font-medium text-slate-700 mb-1">Assigned Role</label>
                <select
                  id="edit-role"
                  value={editRole}
                  onChange={(e) => {
                    const next = e.target.value as StaffAccount['role'];
                    setEditRole(next);
                    if (isSuperAdmin) {
                      setEditPermissions(getDefaultPermissionsForRole(next));
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  {isSuperAdmin && <option value="SUPER_ADMIN">SUPER_ADMIN</option>}
                  {isSuperAdmin && <option value="FRANCHISE_PARTNER">FRANCHISE_PARTNER</option>}
                  <option value="HUB_OPERATOR">HUB_OPERATOR</option>
                  <option value="RIDER">RIDER</option>
                </select>
              </div>
              <div>
                <label htmlFor="edit-hub" className="block text-xs font-medium text-slate-700 mb-1">Allotted Location / Hub</label>
                <select
                  id="edit-hub"
                  value={isSuperAdmin ? editHubId : session.allottedHubId}
                  disabled={!isSuperAdmin}
                  onChange={(e) => setEditHubId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white disabled:bg-slate-100 border border-slate-300 rounded-lg"
                >
                  {allowedHubs.map((h) => (
                    <option key={h.hubId} value={h.hubId}>
                      {h.name} ({h.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="edit-new-pwd" className="block text-xs font-medium text-slate-700 mb-1">
                Reset Password (leave blank to keep current digest)
              </label>
              <input
                id="edit-new-pwd"
                type="password"
                value={editNewPassword}
                onChange={(e) => setEditNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 chars)"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            {/* Granular Permission Checkboxes — Strictly Super Admin Editable */}
            {isSuperAdmin && editRole !== 'SUPER_ADMIN' && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Granular User Portal Permissions (Super Admin Control)
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditPermissions(getDefaultPermissionsForRole(editRole))}
                    className="text-[11px] font-semibold text-sky-700 hover:underline"
                  >
                    Reset Role Defaults
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PERMISSION_META.map((item) => (
                    <label
                      key={item.key}
                      className="p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-start gap-2.5 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={editPermissions[item.key]}
                        onChange={(e) =>
                          setEditPermissions((prev) => ({
                            ...prev,
                            [item.key]: e.target.checked,
                          }))
                        }
                        className="mt-0.5 rounded border-slate-300 text-sky-700 focus:ring-sky-600"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900">{item.label}</div>
                        <div className="text-[11px] text-slate-500">{item.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg"
              >
                Save Account Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
