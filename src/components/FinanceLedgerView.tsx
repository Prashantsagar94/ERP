import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ReceiptText,
} from 'lucide-react';
import {
  Hub,
  Order,
  OrderStatus,
  PaymentMethod,
  RiderPodLedgerEntry,
  UserRole,
} from '../types/erp';
import { computeFranchiseSettlement, formatInr } from '../utils/erpEngine';

interface FinanceLedgerViewProps {
  hubs: Hub[];
  orders: Order[];
  podLedger: RiderPodLedgerEntry[];
  activeRole: UserRole;
  selectedHubFilter: string;
  onSettlePodEntry: (entryId: string) => void;
  onSettleAllForRider: (riderId: string) => void;
}

export const FinanceLedgerView: React.FC<FinanceLedgerViewProps> = ({
  hubs,
  orders,
  podLedger,
  activeRole,
  selectedHubFilter,
  onSettlePodEntry,
  onSettleAllForRider,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNSETTLED' | 'SETTLED_WITH_HUB'>('ALL');
  const [invoiceHubId, setInvoiceHubId] = useState<string | null>(null);

  const scopedHubs = useMemo(
    () => (selectedHubFilter === 'ALL' ? hubs : hubs.filter((h) => h.hubId === selectedHubFilter)),
    [hubs, selectedHubFilter]
  );

  const scopedLedger = useMemo(
    () =>
      podLedger.filter((entry) => {
        if (selectedHubFilter !== 'ALL' && entry.hubId !== selectedHubFilter) return false;
        if (statusFilter !== 'ALL' && entry.settlementStatus !== statusFilter) return false;
        return true;
      }),
    [podLedger, selectedHubFilter, statusFilter]
  );

  const financialTotals = useMemo(() => {
    const validOrders = orders.filter(
      (o) =>
        o.status !== OrderStatus.CANCELLED &&
        (selectedHubFilter === 'ALL' || o.hubId === selectedHubFilter)
    );
    const prepaid = validOrders
      .filter((o) => o.paymentMethod === PaymentMethod.ONLINE_PREPAID)
      .reduce((s, o) => s + o.finalPayable, 0);
    const unsettledCash = podLedger
      .filter(
        (e) =>
          e.settlementStatus === 'UNSETTLED' &&
          (selectedHubFilter === 'ALL' || e.hubId === selectedHubFilter)
      )
      .reduce((s, e) => s + e.amountCollected, 0);
    const settledPod = podLedger
      .filter(
        (e) =>
          e.settlementStatus === 'SETTLED_WITH_HUB' &&
          (selectedHubFilter === 'ALL' || e.hubId === selectedHubFilter)
      )
      .reduce((s, e) => s + e.amountCollected, 0);

    return { prepaid, unsettledCash, settledPod };
  }, [orders, podLedger, selectedHubFilter]);

  const franchiseSummaries = useMemo(
    () => scopedHubs.map((hub) => computeFranchiseSettlement(orders, hub)),
    [scopedHubs, orders]
  );

  const riderLiabilities = useMemo(() => {
    const map = new Map<string, { riderId: string; riderName: string; unsettled: number; count: number }>();
    for (const entry of podLedger) {
      if (selectedHubFilter !== 'ALL' && entry.hubId !== selectedHubFilter) continue;
      if (entry.settlementStatus !== 'UNSETTLED') continue;
      const existing = map.get(entry.riderId) ?? {
        riderId: entry.riderId,
        riderName: entry.riderName,
        unsettled: 0,
        count: 0,
      };
      existing.unsettled += entry.amountCollected;
      existing.count += 1;
      map.set(entry.riderId, existing);
    }
    return Array.from(map.values());
  }, [podLedger, selectedHubFilter]);

  const exportCsvSettlement = () => {
    const headers = [
      'Hub Name',
      'Contract Tier',
      'Orders',
      'Gross Revenue (INR)',
      'Partner Share %',
      'Partner Payout (INR)',
      'Royalty %',
      'Head Office Royalty (INR)',
      'GST 18% on Royalty (INR)',
      'Net Partner Remittance (INR)',
    ];
    const rows = franchiseSummaries.map((s) => [
      s.hubName,
      s.franchiseTier,
      String(s.orderCount),
      s.grossRevenue.toFixed(2),
      String(s.partnerSharePercent),
      s.partnerPayout.toFixed(2),
      String(s.royaltyPercent),
      s.headOfficeRoyalty.toFixed(2),
      s.gstOnRoyalty.toFixed(2),
      s.netPartnerRemittance.toFixed(2),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'instawash-franchise-settlement-gst.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedInvoiceSummary = franchiseSummaries.find((s) => s.hubId === invoiceHubId) ?? null;

  return (
    <div className="space-y-6">
      {/* Financial Reconciliation Summary */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Online Prepaid Gateway Total</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatInr(financialTotals.prepaid)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Razorpay / UPI Intent direct settlement</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Rider Unsettled POD Liability</p>
          <p
            className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
              financialTotals.unsettledCash > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {formatInr(financialTotals.unsettledCash)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Physical cash &amp; field UPI awaiting EOD sign-off</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Settled with Hub Treasury</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {formatInr(financialTotals.settledPod)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Verified &amp; reconciled EOD collections</p>
        </div>
      </section>

      {/* EOD Rider Cash Settlement Queue */}
      {riderLiabilities.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              End-of-Day (EOD) Rider Cash Reconciliation
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Count physical cash deposited by each rider and approve settlement to reset their liability ledger to ₹0.00.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {riderLiabilities.map((rl) => (
              <div
                key={rl.riderId}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{rl.riderName}</div>
                  <div className="text-xs text-slate-500">
                    {rl.count} unsettled order(s) ·{' '}
                    <span className="font-mono font-semibold text-amber-800 tabular-nums">
                      {formatInr(rl.unsettled)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={activeRole !== UserRole.SUPER_ADMIN && activeRole !== UserRole.FRANCHISE_PARTNER}
                  onClick={() => onSettleAllForRider(rl.riderId)}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Approve EOD
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Rider POD Ledger Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Rider POD Cash &amp; UPI Ledger</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Line-by-line audit of rider collections and hub treasury verification
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['ALL', 'UNSETTLED', 'SETTLED_WITH_HUB'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL' ? 'All Entries' : st === 'UNSETTLED' ? 'Unsettled' : 'Settled'}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 px-4 font-medium">Order</th>
                <th className="py-3 px-4 font-medium">Rider &amp; Hub</th>
                <th className="py-3 px-4 font-medium">Mode</th>
                <th className="py-3 px-4 font-medium text-right">Collected</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scopedLedger.map((entry) => {
                const hub = hubs.find((h) => h.hubId === entry.hubId);
                return (
                  <tr key={entry.entryId} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {entry.orderNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{entry.riderName}</div>
                      <div className="text-xs text-slate-500">{hub?.name ?? entry.hubId}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {entry.collectionMode.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold tabular-nums text-right text-slate-900 whitespace-nowrap">
                      {formatInr(entry.amountCollected)}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                      {entry.settlementStatus === 'SETTLED_WITH_HUB' ? (
                        <span className="text-emerald-700 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Settled ({entry.settledWithAdmin ?? 'Admin'})
                        </span>
                      ) : (
                        <span className="text-amber-700">Unsettled Liability</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {entry.settlementStatus === 'UNSETTLED' ? (
                        <button
                          type="button"
                          onClick={() => onSettlePodEntry(entry.entryId)}
                          className="px-3 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
                        >
                          Verify &amp; Settle
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Reconciled</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Automated Franchise Split & GST Tax Ledger */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Franchise Revenue Split &amp; GST Royalty Ledger
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Dynamic Partner vs. Head Office Royalty split configured per hub contract tier
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsvSettlement}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export GST Ledger CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 px-4 font-medium">Franchise Hub</th>
                <th className="py-3 px-4 font-medium text-right">Orders</th>
                <th className="py-3 px-4 font-medium text-right">Gross Revenue</th>
                <th className="py-3 px-4 font-medium text-right">Partner Share</th>
                <th className="py-3 px-4 font-medium text-right">HQ Royalty</th>
                <th className="py-3 px-4 font-medium text-right">GST (18%)</th>
                <th className="py-3 px-4 font-medium text-right">Net Partner Payout</th>
                <th className="py-3 px-4 font-medium text-right">Tax Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {franchiseSummaries.map((s) => (
                <tr key={s.hubId} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{s.hubName}</div>
                    <div className="text-xs text-slate-500">
                      {s.franchiseTier.replace(/_/g, ' ')} · {s.partnerSharePercent}% / {s.royaltyPercent}% split
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {s.orderCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                    {formatInr(s.grossRevenue)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                    {formatInr(s.partnerPayout)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                    {formatInr(s.headOfficeRoyalty)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                    {formatInr(s.gstOnRoyalty)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                    {formatInr(s.netPartnerRemittance)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setInvoiceHubId(s.hubId)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 whitespace-nowrap"
                    >
                      <ReceiptText className="w-3.5 h-3.5" aria-hidden="true" />
                      Preview GST
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* GST Tax Invoice Preview Modal */}
      {selectedInvoiceSummary && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="GST Franchise Tax Invoice"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">GST Tax Invoice — Royalty Settlement</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  InstaWash Operations Pvt. Ltd. · SAC 999712 · {selectedInvoiceSummary.hubName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceHubId(null)}
                className="text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Billed Gross Orders ({selectedInvoiceSummary.orderCount})</span>
                <span className="font-mono tabular-nums font-semibold">{formatInr(selectedInvoiceSummary.grossRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Franchise Partner Entitlement ({selectedInvoiceSummary.partnerSharePercent}%)</span>
                <span className="font-mono tabular-nums text-emerald-700">{formatInr(selectedInvoiceSummary.partnerPayout)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Head Office Royalty Fee ({selectedInvoiceSummary.royaltyPercent}%)</span>
                <span className="font-mono tabular-nums">{formatInr(selectedInvoiceSummary.headOfficeRoyalty)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CGST (9%) + SGST (9%) on Royalty</span>
                <span className="font-mono tabular-nums">{formatInr(selectedInvoiceSummary.gstOnRoyalty)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900">
                <span>Net Remittance to Franchise Bank</span>
                <span className="font-mono tabular-nums">{formatInr(selectedInvoiceSummary.netPartnerRemittance)}</span>
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={exportCsvSettlement}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors"
              >
                Download CSV Statement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
