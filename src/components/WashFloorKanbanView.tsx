import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Lock,
  QrCode,
  Scale,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  DiscountSlab,
  Hub,
  Order,
  OrderStatus,
  PricingRule,
  UserRole,
} from '../types/erp';
import {
  calculateOrderBill,
  formatInr,
  getNextKanbanStage,
  KANBAN_STAGES,
  validateWeightOverride,
} from '../utils/erpEngine';
import { SCALE_PROOF_IMAGE } from '../data/seedData';

interface WashFloorKanbanViewProps {
  orders: Order[];
  hubs: Hub[];
  pricingRules: PricingRule[];
  discountSlabs: DiscountSlab[];
  activeRole: UserRole;
  selectedHubFilter: string;
  onAdvanceOrderStatus: (orderId: string, nextStatus: OrderStatus) => void;
  onOverrideWeight: (orderId: string, newWeightKg: number, reason: string) => { ok: boolean; error?: string };
}

const STAGE_LABELS: Record<string, string> = {
  [OrderStatus.WEIGHED_AND_LOCKED]: '01. Weighed & Locked',
  [OrderStatus.RECEIVED_AT_HUB]: '02. Received at Hub',
  [OrderStatus.IN_WASH]: '03. Washing',
  [OrderStatus.DRYING_IRONING]: '04. Drying & Ironing',
  [OrderStatus.QUALITY_CHECK]: '05. Quality Check',
  [OrderStatus.PACKED_AND_READY]: '06. Packed & Ready',
};

export const WashFloorKanbanView: React.FC<WashFloorKanbanViewProps> = ({
  orders,
  hubs,
  pricingRules,
  discountSlabs,
  activeRole,
  selectedHubFilter,
  onAdvanceOrderStatus,
  onOverrideWeight,
}) => {
  const [qrInput, setQrInput] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [inspectOrderId, setInspectOrderId] = useState<string | null>(null);
  const [overrideWeightInput, setOverrideWeightInput] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideSuccess, setOverrideSuccess] = useState<string | null>(null);

  const filteredOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          (selectedHubFilter === 'ALL' || o.hubId === selectedHubFilter) &&
          KANBAN_STAGES.includes(o.status)
      ),
    [orders, selectedHubFilter]
  );

  const inspectedOrder = useMemo(
    () => orders.find((o) => o.orderId === inspectOrderId) ?? null,
    [orders, inspectOrderId]
  );

  const handleQrScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = qrInput.trim().toUpperCase();
    if (!cleaned) return;
    const match = orders.find(
      (o) =>
        o.bagQrCode.toUpperCase() === cleaned || o.orderNumber.toUpperCase() === cleaned
    );
    if (!match) {
      setScanFeedback({
        type: 'err',
        text: `No active bag matched QR/Order "${cleaned}".`,
      });
      return;
    }
    const nextStage = getNextKanbanStage(match.status);
    if (!nextStage) {
      if (match.status === OrderStatus.PACKED_AND_READY) {
        onAdvanceOrderStatus(match.orderId, OrderStatus.OUT_FOR_DELIVERY);
        setScanFeedback({
          type: 'ok',
          text: `${match.orderNumber} (${match.bagQrCode}) dispatched Out for Delivery.`,
        });
        setQrInput('');
        return;
      }
      setScanFeedback({
        type: 'err',
        text: `${match.orderNumber} is currently in stage ${match.status.replace(/_/g, ' ')} and cannot advance via wash-floor scan.`,
      });
      return;
    }
    onAdvanceOrderStatus(match.orderId, nextStage);
    setScanFeedback({
      type: 'ok',
      text: `${match.orderNumber} (${match.bagQrCode}) advanced to ${STAGE_LABELS[nextStage] ?? nextStage}.`,
    });
    setQrInput('');
  };

  const openInspectModal = (order: Order) => {
    setInspectOrderId(order.orderId);
    setOverrideWeightInput(order.weightKg > 0 ? order.weightKg.toFixed(2) : '');
    setOverrideReason('');
    setOverrideError(null);
    setOverrideSuccess(null);
  };

  const previewBill = useMemo(() => {
    if (!inspectedOrder) return null;
    const parsed = parseFloat(overrideWeightInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return calculateOrderBill({
      weightKg: parsed,
      hubId: inspectedOrder.hubId,
      fulfillmentType: inspectedOrder.fulfillmentType,
      pricingRules,
      discountSlabs,
    });
  }, [inspectedOrder, overrideWeightInput, pricingRules, discountSlabs]);

  const handleOverrideSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedOrder) return;
    setOverrideError(null);
    setOverrideSuccess(null);
    const parsedWeight = parseFloat(overrideWeightInput);
    const check = validateWeightOverride({
      order: inspectedOrder,
      newWeightKg: parsedWeight,
      reason: overrideReason,
      actorRole: activeRole,
    });
    if (!check.valid) {
      setOverrideError(check.error ?? 'Invalid override request.');
      return;
    }
    const res = onOverrideWeight(inspectedOrder.orderId, parsedWeight, overrideReason.trim());
    if (!res.ok) {
      setOverrideError(res.error ?? 'Override failed.');
      return;
    }
    setOverrideSuccess('Weight recalculated, logged to immutable audit ledger, and revised digital receipt dispatched.');
    setOverrideReason('');
  };

  return (
    <div className="space-y-6">
      {/* QR Hardware Scanner Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Wash-Floor Plant Kanban &amp; Bag QR Scanner
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Scan physical garment bag QR tags (e.g. <span className="font-mono text-slate-700">IW-BBK-8821</span> or <span className="font-mono text-slate-700">IW-AYD-4410</span>) to advance bags automatically through the 6-stage plant pipeline.
            </p>
          </div>
          <form onSubmit={handleQrScanSubmit} className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-72">
              <QrCode className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                aria-label="Scan or enter bag QR code"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Scan Bag QR or Order # (IW-BBK-8821)"
                className="w-full pl-9 pr-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600 focus:bg-white"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Scan &amp; Advance
            </button>
          </form>
        </div>

        {scanFeedback && (
          <div
            role="status"
            className={`mt-3 px-3.5 py-2 rounded-lg text-xs font-medium border ${
              scanFeedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {scanFeedback.text}
          </div>
        )}
      </section>

      {/* 6-Column Wash-Floor Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {KANBAN_STAGES.map((stage) => {
          const stageOrders = filteredOrders.filter((o) => o.status === stage);
          const nextStage = getNextKanbanStage(stage);
          return (
            <section
              key={stage}
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col min-h-[260px]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">{STAGE_LABELS[stage]}</h3>
                <span className="text-xs font-mono font-semibold text-slate-500 tabular-nums">
                  {stageOrders.length}
                </span>
              </div>

              <div className="mt-3 space-y-3 flex-1">
                {stageOrders.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">
                    No bags in this stage
                  </p>
                ) : (
                  stageOrders.map((order) => {
                    const hub = hubs.find((h) => h.hubId === order.hubId);
                    return (
                      <article
                        key={order.orderId}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                              {order.orderNumber}
                            </div>
                            <div className="text-xs text-slate-600">
                              {order.customerName} · {hub?.code ?? order.hubId}
                            </div>
                          </div>
                          <div className="text-right font-mono text-xs tabular-nums">
                            <div className="font-semibold text-slate-900">
                              {order.weightKg.toFixed(2)} Kg
                            </div>
                            <div className="text-slate-500">{order.garmentCount} pcs</div>
                          </div>
                        </div>

                        <div className="text-xs text-slate-500 font-mono flex items-center justify-between">
                          <span>QR: {order.bagQrCode || 'Pending'}</span>
                          <span className="font-semibold text-slate-800">
                            {formatInr(order.finalPayable)}
                          </span>
                        </div>

                        {order.isCorrectedByManager && (
                          <div className="text-xs font-medium text-amber-800">
                            Invoice Corrected by Hub Manager
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => openInspectModal(order)}
                            className="text-xs font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2 whitespace-nowrap"
                          >
                            Inspect / Dispute
                          </button>

                          {nextStage ? (
                            <button
                              type="button"
                              onClick={() => onAdvanceOrderStatus(order.orderId, nextStage)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
                            >
                              Next Stage
                              <ArrowRight className="w-3 h-3" aria-hidden="true" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                onAdvanceOrderStatus(order.orderId, OrderStatus.OUT_FOR_DELIVERY)
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-md transition-colors whitespace-nowrap"
                            >
                              Dispatch Delivery
                              <ArrowRight className="w-3 h-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Inspect Order + Weight Dispute Override Modal */}
      {inspectedOrder && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Order details and weight override for ${inspectedOrder.orderNumber}`}
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {inspectedOrder.orderNumber} — Locked Payload &amp; Dispute Control
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {inspectedOrder.customerName} · Bag {inspectedOrder.bagQrCode || 'Unassigned'} · OTP {inspectedOrder.deliveryOtp}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close order details modal"
                onClick={() => setInspectOrderId(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-3">
                <div className="aspect-[4/3] bg-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  <img
                    src={inspectedOrder.scalePhotoUrl || SCALE_PROOF_IMAGE}
                    alt={`Doorstep scale verification photo for ${inspectedOrder.orderNumber}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                    Cryptographic Weight Lock Signature
                  </div>
                  <div className="font-mono text-[11px] bg-slate-50 border border-slate-200 rounded p-2 break-all text-slate-700">
                    {inspectedOrder.weightLockHash || 'Not locked yet'}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Verified Weight</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {inspectedOrder.weightKg.toFixed(2)} Kg ({inspectedOrder.garmentCount} pcs)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Gross Amount</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {formatInr(inspectedOrder.grossAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Slab Discount ({inspectedOrder.discountPercent}%)</span>
                    <span className="font-mono tabular-nums text-emerald-700">
                      -{formatInr(inspectedOrder.discountAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fulfillment Fee</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {formatInr(inspectedOrder.deliveryFee)}
                    </span>
                  </div>
                  <div className="pt-1.5 border-t border-slate-200 flex justify-between font-semibold text-slate-900">
                    <span>Net Payable</span>
                    <span className="font-mono tabular-nums">{formatInr(inspectedOrder.finalPayable)}</span>
                  </div>
                </div>

                {/* Weight Override Form */}
                <form onSubmit={handleOverrideSubmit} className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                    <ShieldAlert className="w-4 h-4 text-amber-700" aria-hidden="true" />
                    Hub Manager / Super Admin Weight Override
                  </div>
                  <div>
                    <label htmlFor="override-weight" className="block text-xs font-medium text-slate-700 mb-1">
                      Revised Weight (Kg)
                    </label>
                    <input
                      id="override-weight"
                      type="number"
                      step="0.05"
                      min="0.1"
                      value={overrideWeightInput}
                      onChange={(e) => setOverrideWeightInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="override-reason" className="block text-xs font-medium text-slate-700 mb-1">
                      Mandatory Audit Explanation (min 15 chars)
                    </label>
                    <textarea
                      id="override-reason"
                      rows={3}
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Explain scale variance or customer dispute resolution..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                      required
                    />
                  </div>

                  {previewBill && (
                    <div className="text-xs text-slate-600 font-mono tabular-nums">
                      Recalculated Total: <strong className="text-slate-900">{formatInr(previewBill.finalPayable)}</strong> ({previewBill.discountPercent}% slab)
                    </div>
                  )}

                  {overrideError && (
                    <p role="alert" className="text-xs font-medium text-rose-700">
                      {overrideError}
                    </p>
                  )}
                  {overrideSuccess && (
                    <p role="status" className="text-xs font-medium text-emerald-700">
                      {overrideSuccess}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    Commit Weight Override &amp; Re-Issue Invoice
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
