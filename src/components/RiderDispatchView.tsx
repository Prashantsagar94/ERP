import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  CloudOff,
  KeyRound,
  Lock,
  RefreshCw,
  Scale,
  Timer,
  Wifi,
} from 'lucide-react';
import {
  DiscountSlab,
  Hub,
  OfflineWeightQueueItem,
  Order,
  OrderStatus,
  PricingRule,
  RiderTelemetry,
} from '../types/erp';
import {
  calculateOrderBill,
  computeWeightLockHash,
  formatInr,
} from '../utils/erpEngine';
import { SCALE_PROOF_IMAGE } from '../data/seedData';

interface RiderDispatchViewProps {
  orders: Order[];
  hubs: Hub[];
  riders: RiderTelemetry[];
  pricingRules: PricingRule[];
  discountSlabs: DiscountSlab[];
  offlineQueue: OfflineWeightQueueItem[];
  onAcceptPickup: (orderId: string, riderId: string) => void;
  onLockDoorstepWeight: (payload: {
    orderId: string;
    weightKg: number;
    garmentCount: number;
    bagQrCode: string;
    scalePhotoUrl: string;
    offlineMode: boolean;
  }) => { ok: boolean; hash?: string; queued?: boolean; error?: string };
  onSyncOfflineQueue: () => number;
  onCompleteDeliveryOtp: (payload: {
    orderId: string;
    otp: string;
    collectionMode: 'CASH' | 'RIDER_UPI_QR';
  }) => { ok: boolean; error?: string };
}

export const RiderDispatchView: React.FC<RiderDispatchViewProps> = ({
  orders,
  hubs,
  riders,
  pricingRules,
  discountSlabs,
  offlineQueue,
  onAcceptPickup,
  onLockDoorstepWeight,
  onSyncOfflineQueue,
  onCompleteDeliveryOtp,
}) => {
  const [selectedRiderId, setSelectedRiderId] = useState(riders[0]?.riderId ?? '');
  const [countdown, setCountdown] = useState(45);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Doorstep weighing form state
  const [weighOrderId, setWeighOrderId] = useState<string>('');
  const [weightKgInput, setWeightKgInput] = useState('3.50');
  const [garmentCountInput, setGarmentCountInput] = useState('12');
  const [bagQrInput, setBagQrInput] = useState('IW-BBK-9410');
  const [scalePhotoPreview, setScalePhotoPreview] = useState(SCALE_PROOF_IMAGE);
  const [weighFeedback, setWeighFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Handover OTP state
  const [handoverOrderId, setHandoverOrderId] = useState<string>('');
  const [otpInput, setOtpInput] = useState('');
  const [collectionMode, setCollectionMode] = useState<'CASH' | 'RIDER_UPI_QR'>('CASH');
  const [handoverFeedback, setHandoverFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 45 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const pendingDispatchOrders = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.PICKUP_REQUESTED),
    [orders]
  );

  const weighingEligibleOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === OrderStatus.RIDER_ASSIGNED ||
          o.status === OrderStatus.WEIGHED_AND_LOCKED
      ),
    [orders]
  );

  const deliveryOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === OrderStatus.OUT_FOR_DELIVERY ||
          o.status === OrderStatus.PACKED_AND_READY
      ),
    [orders]
  );

  const activeWeighOrder = useMemo(
    () =>
      weighingEligibleOrders.find((o) => o.orderId === weighOrderId) ??
      weighingEligibleOrders.find((o) => !o.isWeightLocked) ??
      weighingEligibleOrders[0] ??
      null,
    [weighingEligibleOrders, weighOrderId]
  );

  const activeDeliveryOrder = useMemo(
    () =>
      deliveryOrders.find((o) => o.orderId === handoverOrderId) ??
      deliveryOrders[0] ??
      null,
    [deliveryOrders, handoverOrderId]
  );

  const liveBillPreview = useMemo(() => {
    if (!activeWeighOrder) return null;
    const w = parseFloat(weightKgInput);
    if (!Number.isFinite(w) || w <= 0) return null;
    return calculateOrderBill({
      weightKg: w,
      hubId: activeWeighOrder.hubId,
      fulfillmentType: activeWeighOrder.fulfillmentType,
      pricingRules,
      discountSlabs,
    });
  }, [activeWeighOrder, weightKgInput, pricingRules, discountSlabs]);

  const handleScalePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setScalePhotoPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWeighFeedback(null);
    if (!activeWeighOrder) return;
    if (activeWeighOrder.isWeightLocked) {
      setWeighFeedback({
        type: 'err',
        text: 'Weight is cryptographically locked. Rider edits are blocked; escalate to Hub Manager.',
      });
      return;
    }
    const w = parseFloat(weightKgInput);
    const g = parseInt(garmentCountInput, 10);
    if (!Number.isFinite(w) || w <= 0) {
      setWeighFeedback({ type: 'err', text: 'Enter a valid positive weight in Kg.' });
      return;
    }
    if (!Number.isFinite(g) || g <= 0) {
      setWeighFeedback({ type: 'err', text: 'Enter a valid garment count.' });
      return;
    }
    if (!bagQrInput.trim()) {
      setWeighFeedback({ type: 'err', text: 'Bag QR code tag is mandatory before locking.' });
      return;
    }
    const result = onLockDoorstepWeight({
      orderId: activeWeighOrder.orderId,
      weightKg: w,
      garmentCount: g,
      bagQrCode: bagQrInput.trim().toUpperCase(),
      scalePhotoUrl: scalePhotoPreview,
      offlineMode: isOfflineMode,
    });
    if (!result.ok) {
      setWeighFeedback({ type: 'err', text: result.error ?? 'Failed to lock weight.' });
      return;
    }
    if (result.queued) {
      setWeighFeedback({
        type: 'ok',
        text: `Saved to Offline SQLite Queue with local signature ${result.hash?.slice(0, 22)}... Sync when network returns.`,
      });
    } else {
      setWeighFeedback({
        type: 'ok',
        text: `Weight locked (${w.toFixed(2)} Kg) & Digital Receipt dispatched to Customer! Signature: ${result.hash?.slice(0, 22)}...`,
      });
    }
  };

  const handleSyncClick = () => {
    const synced = onSyncOfflineQueue();
    setIsOfflineMode(false);
    setWeighFeedback({
      type: 'ok',
      text: synced > 0
        ? `Synced ${synced} offline payload(s) after verifying cryptographic signatures.`
        : 'Offline queue is already empty.',
    });
  };

  const handleHandoverSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHandoverFeedback(null);
    if (!activeDeliveryOrder) return;
    const res = onCompleteDeliveryOtp({
      orderId: activeDeliveryOrder.orderId,
      otp: otpInput.trim(),
      collectionMode,
    });
    if (!res.ok) {
      setHandoverFeedback({ type: 'err', text: res.error ?? 'OTP verification failed.' });
      return;
    }
    setHandoverFeedback({
      type: 'ok',
      text: `Order ${activeDeliveryOrder.orderNumber} delivered & settled! Recorded in Rider POD Ledger (${collectionMode}).`,
    });
    setOtpInput('');
  };

  return (
    <div className="space-y-6">
      {/* Rider Identity & Offline Resilience Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="rider-selector" className="text-xs font-semibold text-slate-700">
            Active Field Rider
          </label>
          <select
            id="rider-selector"
            value={selectedRiderId}
            onChange={(e) => setSelectedRiderId(e.target.value)}
            className="px-3 py-1.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
          >
            {riders.map((r) => {
              const hub = hubs.find((h) => h.hubId === r.hubId);
              return (
                <option key={r.riderId} value={r.riderId}>
                  {r.name} ({hub?.code ?? r.hubId})
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIsOfflineMode((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
              isOfflineMode
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {isOfflineMode ? (
              <>
                <CloudOff className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                Offline Basement Mode (SQLite Queue On)
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                Online Telemetry Active
              </>
            )}
          </button>

          {offlineQueue.filter((q) => !q.isSynced).length > 0 && (
            <button
              type="button"
              onClick={handleSyncClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Sync {offlineQueue.filter((q) => !q.isSynced).length} Queued Payload(s)
            </button>
          )}
        </div>
      </section>

      {/* Incoming Smart Dispatch Pickup Queue */}
      {pendingDispatchOrders.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              High-Priority 10-Min Pickup Dispatch Alerts ({pendingDispatchOrders.length})
            </h2>
            <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-amber-700 tabular-nums">
              <Timer className="w-3.5 h-3.5" aria-hidden="true" />
              Auto-reroute in {countdown}s
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingDispatchOrders.map((order) => (
              <div
                key={order.orderId}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm font-bold text-slate-900">
                    {order.orderNumber} · {order.customerName}
                  </div>
                  <p className="text-xs text-slate-600 truncate mt-0.5">{order.customerAddress}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onAcceptPickup(order.orderId, selectedRiderId);
                    setWeighOrderId(order.orderId);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Accept Pickup
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Split: Doorstep Weight Lock + Delivery OTP Handover */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Doorstep Manual Weight Entry & Tamper Lock */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Doorstep Weight Entry &amp; One-Way Tamper Lock
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Once locked, weight becomes permanently read-only for field accounts and dispatches the customer receipt in &lt;2s.
              </p>
            </div>
            <select
              aria-label="Select assigned order for doorstep weighing"
              value={activeWeighOrder?.orderId ?? ''}
              onChange={(e) => {
                setWeighOrderId(e.target.value);
                setWeighFeedback(null);
              }}
              className="px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
            >
              {weighingEligibleOrders.length === 0 ? (
                <option value="">No assigned orders</option>
              ) : (
                weighingEligibleOrders.map((o) => (
                  <option key={o.orderId} value={o.orderId}>
                    {o.orderNumber} — {o.customerName} ({o.isWeightLocked ? 'LOCKED' : 'READY'})
                  </option>
                ))
              )}
            </select>
          </div>

          {activeWeighOrder ? (
            <form onSubmit={handleLockSubmit} className="space-y-4">
              {activeWeighOrder.isWeightLocked && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                    Payload Cryptographically Locked (Read-Only)
                  </div>
                  <p>
                    Locked at {activeWeighOrder.weightKg.toFixed(2)} Kg ({activeWeighOrder.garmentCount} garments) · Bag {activeWeighOrder.bagQrCode} · Net {formatInr(activeWeighOrder.finalPayable)}.
                    Any revision requires Hub Manager override with a 15+ char audit reason.
                  </p>
                  <p className="font-mono text-[11px] break-all text-emerald-800">
                    {activeWeighOrder.weightLockHash}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="rider-weight-kg" className="block text-xs font-medium text-slate-700 mb-1">
                    Verified Weight (Kg)
                  </label>
                  <input
                    id="rider-weight-kg"
                    type="number"
                    step="0.05"
                    min="0.1"
                    disabled={activeWeighOrder.isWeightLocked}
                    value={activeWeighOrder.isWeightLocked ? activeWeighOrder.weightKg.toFixed(2) : weightKgInput}
                    onChange={(e) => setWeightKgInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="rider-garments" className="block text-xs font-medium text-slate-700 mb-1">
                    Garment Count
                  </label>
                  <input
                    id="rider-garments"
                    type="number"
                    min="1"
                    disabled={activeWeighOrder.isWeightLocked}
                    value={activeWeighOrder.isWeightLocked ? String(activeWeighOrder.garmentCount) : garmentCountInput}
                    onChange={(e) => setGarmentCountInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="rider-bag-qr" className="block text-xs font-medium text-slate-700 mb-1">
                    Laundry Bag QR Tag
                  </label>
                  <input
                    id="rider-bag-qr"
                    type="text"
                    disabled={activeWeighOrder.isWeightLocked}
                    value={activeWeighOrder.isWeightLocked ? activeWeighOrder.bagQrCode : bagQrInput}
                    onChange={(e) => setBagQrInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    required
                  />
                </div>
              </div>

              {/* Scale Photo Proof & Live Auto-Calculated Invoice Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="sm:col-span-5 space-y-2">
                  <div className="aspect-[4/3] bg-slate-200 rounded-lg overflow-hidden border border-slate-200">
                    <img
                      src={activeWeighOrder.scalePhotoUrl || scalePhotoPreview}
                      alt="Digital scale output proof"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {!activeWeighOrder.isWeightLocked && (
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 cursor-pointer">
                      <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                      Replace Scale Photo Proof
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleScalePhotoUpload}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>

                <div className="sm:col-span-7 space-y-2 text-xs">
                  <div className="font-semibold text-slate-900">
                    Instant Auto-Calculated Invoice Preview
                  </div>
                  {liveBillPreview && !activeWeighOrder.isWeightLocked ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">
                          {liveBillPreview.billableWeightKg.toFixed(2)} Kg &times; ₹{liveBillPreview.ratePerKg}
                        </span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatInr(liveBillPreview.grossAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">
                          {liveBillPreview.matchedSlabLabel} ({liveBillPreview.discountPercent}%)
                        </span>
                        <span className="font-mono tabular-nums text-emerald-700">
                          -{formatInr(liveBillPreview.discountAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Fulfillment Charge</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatInr(liveBillPreview.deliveryFee)}
                        </span>
                      </div>
                      <div className="pt-1.5 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900">
                        <span>Net Payable</span>
                        <span className="font-mono tabular-nums">
                          {formatInr(liveBillPreview.finalPayable)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      Locked Total: {formatInr(activeWeighOrder.finalPayable)}
                    </div>
                  )}
                </div>
              </div>

              {weighFeedback && (
                <div
                  role="status"
                  className={`p-3 rounded-lg border text-xs font-medium ${
                    weighFeedback.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {weighFeedback.text}
                </div>
              )}

              <button
                type="submit"
                disabled={activeWeighOrder.isWeightLocked}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors inline-flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" aria-hidden="true" />
                {activeWeighOrder.isWeightLocked
                  ? 'Weight Locked (Read-Only)'
                  : isOfflineMode
                  ? 'Sign & Queue Offline (SQLite)'
                  : 'Lock & Submit Weight'}
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-500 py-6">
              No assigned pickups waiting for weighing. Accept a pickup alert above or create a new customer booking.
            </p>
          )}
        </section>

        {/* Right: Outbound Delivery OTP Verification & POD Collection */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="pb-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">
              POD Handover &amp; 4-Digit OTP Verification
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Validate customer identity via 4-digit OTP and record Cash or dynamic UPI QR payment into the Rider POD Ledger.
            </p>
          </div>

          {deliveryOrders.length > 0 && activeDeliveryOrder ? (
            <form onSubmit={handleHandoverSubmit} className="space-y-4">
              <div>
                <label htmlFor="handover-order-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Order Ready for Handover
                </label>
                <select
                  id="handover-order-select"
                  value={activeDeliveryOrder.orderId}
                  onChange={(e) => {
                    setHandoverOrderId(e.target.value);
                    setHandoverFeedback(null);
                  }}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                >
                  {deliveryOrders.map((o) => (
                    <option key={o.orderId} value={o.orderId}>
                      {o.orderNumber} — {o.customerName} ({formatInr(o.finalPayable)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-semibold text-slate-900">{activeDeliveryOrder.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bag Tag</span>
                  <span className="font-mono text-slate-900">{activeDeliveryOrder.bagQrCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount Due</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatInr(activeDeliveryOrder.finalPayable)}
                  </span>
                </div>
                <div className="pt-1 text-[11px] text-slate-500">
                  Demo OTP for verification: <span className="font-mono font-semibold text-sky-800">{activeDeliveryOrder.deliveryOtp}</span>
                </div>
              </div>

              <div>
                <label htmlFor="handover-otp" className="block text-xs font-medium text-slate-700 mb-1">
                  Customer 4-Digit Delivery OTP
                </label>
                <input
                  id="handover-otp"
                  type="text"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  placeholder="Enter 4-digit OTP"
                  className="w-full px-3 py-2 text-base font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                  required
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-700 mb-1.5">
                  Payment Collection Mode
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCollectionMode('CASH')}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      collectionMode === 'CASH'
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Physical Cash (POD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectionMode('RIDER_UPI_QR')}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      collectionMode === 'RIDER_UPI_QR'
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Dynamic Rider UPI QR
                  </button>
                </div>
              </div>

              {handoverFeedback && (
                <div
                  role="status"
                  className={`p-3 rounded-lg border text-xs font-medium ${
                    handoverFeedback.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {handoverFeedback.text}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" aria-hidden="true" />
                Verify OTP &amp; Complete Handover
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-500 py-6">
              No packed orders currently awaiting delivery handover.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};
