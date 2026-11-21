import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Lock,
  MapPin,
  Receipt,
  ShieldCheck,
  Truck,
  XCircle,
} from 'lucide-react';
import {
  DiscountSlab,
  FulfillmentType,
  Hub,
  Order,
  OrderStatus,
  PaymentMethod,
  PricingRule,
  ProductFormula,
  PromoItem,
  RiderTelemetry,
  WaitlistEntry,
} from '../types/erp';
import {
  calculateOrderBill,
  formatInr,
  ORDER_TIMELINE_STAGES,
  resolveDiscountSlabs,
  resolvePricingRule,
  validatePointInHubs,
} from '../utils/erpEngine';
import { SCALE_PROOF_IMAGE } from '../data/seedData';

interface CustomerBookingViewProps {
  hubs: Hub[];
  orders: Order[];
  riders: RiderTelemetry[];
  pricingRules: PricingRule[];
  discountSlabs: DiscountSlab[];
  products: ProductFormula[];
  promos: PromoItem[];
  waitlist: WaitlistEntry[];
  onCreateBooking: (payload: {
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    latitude: number;
    longitude: number;
    hubId: string;
    fulfillmentType: FulfillmentType;
    paymentMethod: PaymentMethod;
    serviceName: string;
    promoCode?: string;
  }) => Order;
  onCancelOrder: (orderId: string) => { ok: boolean; error?: string };
  onJoinWaitlist: (entry: Omit<WaitlistEntry, 'waitlistId' | 'createdAt'>) => void;
  customerProfile?: {
    fullName: string;
    phone: string;
    address: string;
  };
}

const LOCATION_PRESETS = [
  { label: 'Barabanki Civil Lines (1.1 km)', lat: 26.9335, lng: 81.1968, address: '42 Civil Lines, Near Clock Tower, Barabanki' },
  { label: 'Ayodhya Ram Path (0.9 km)', lat: 26.7965, lng: 82.2045, address: '18 Ram Path, Civil Sector, Ayodhya' },
  { label: 'Lucknow Gomti Nagar (1.4 km)', lat: 26.8615, lng: 81.0112, address: 'Vibhuti Khand Tower 2, Gomti Nagar, Lucknow' },
  { label: 'Kanpur Highway Outskirts (Outside 2.5 km)', lat: 26.742, lng: 80.785, address: 'Unnao Industrial Bypass, Highway Sector 9' },
];

export const CustomerBookingView: React.FC<CustomerBookingViewProps> = ({
  hubs,
  orders,
  riders,
  pricingRules,
  discountSlabs,
  products,
  promos,
  waitlist,
  onCreateBooking,
  onCancelOrder,
  onJoinWaitlist,
  customerProfile,
}) => {
  const [customerName, setCustomerName] = useState(customerProfile?.fullName || 'Aditi Sharma');
  const [customerPhone, setCustomerPhone] = useState(customerProfile?.phone || '+91-98390-44512');
  const [customerAddress, setCustomerAddress] = useState(
    customerProfile?.address || LOCATION_PRESETS[0].address
  );
  const [latitude, setLatitude] = useState(LOCATION_PRESETS[0].lat);
  const [longitude, setLongitude] = useState(LOCATION_PRESETS[0].lng);
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>(FulfillmentType.HOME_DELIVERY);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.POD_CASH);
  const [selectedService, setSelectedService] = useState(products[0]?.name ?? 'Wash & Fold Standard (Per Kg)');
  const [estimatedKg, setEstimatedKg] = useState(3.5);
  const [promoCode, setPromoCode] = useState('');
  const [activeOrderId, setActiveOrderId] = useState<string>(orders[0]?.orderId ?? '');
  const [bookingMessage, setBookingMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  const geofenceCheck = useMemo(
    () => validatePointInHubs(latitude, longitude, hubs),
    [latitude, longitude, hubs]
  );

  const effectiveHubId = geofenceCheck.matchedHub?.hubId ?? 'GLOBAL';
  const activeRule = useMemo(
    () => resolvePricingRule(effectiveHubId, pricingRules),
    [effectiveHubId, pricingRules]
  );
  const activeSlabs = useMemo(
    () => resolveDiscountSlabs(effectiveHubId, discountSlabs),
    [effectiveHubId, discountSlabs]
  );

  const matchedPromo = useMemo(() => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return null;
    return (
      promos.find(
        (p) =>
          p.status === 'ACTIVE' &&
          p.code.toUpperCase() === code &&
          (p.hubId === 'GLOBAL' || p.hubId === effectiveHubId)
      ) ?? null
    );
  }, [promoCode, promos, effectiveHubId]);

  const estimate = useMemo(
    () =>
      calculateOrderBill({
        weightKg: estimatedKg,
        hubId: effectiveHubId,
        fulfillmentType,
        pricingRules,
        discountSlabs,
        extraPromoPercent: matchedPromo?.extraDiscountPercent ?? 0,
      }),
    [estimatedKg, effectiveHubId, fulfillmentType, pricingRules, discountSlabs, matchedPromo]
  );

  const nearbyRidersCount = useMemo(() => {
    if (!geofenceCheck.matchedHub) return 0;
    return riders.filter((r) => r.hubId === geofenceCheck.matchedHub?.hubId).length;
  }, [riders, geofenceCheck]);

  const trackedOrder = useMemo(
    () => orders.find((o) => o.orderId === activeOrderId) ?? orders[0],
    [orders, activeOrderId]
  );

  const activePromos = promos.filter((p) => p.status === 'ACTIVE');
  const publishedServices = products.filter((p) => p.isPublished);

  const handleBookPickup = (e: React.FormEvent) => {
    e.preventDefault();
    setBookingMessage(null);
    if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim()) {
      setBookingMessage({ type: 'err', text: 'Please fill in customer name, phone, and address.' });
      return;
    }
    if (!geofenceCheck.inCoverage || !geofenceCheck.matchedHub) {
      setBookingMessage({
        type: 'err',
        text: 'Selected coordinates are outside all active hub geofences. Join the expansion waitlist below.',
      });
      return;
    }
    if (paymentMethod === PaymentMethod.POD_CASH && !activeRule.codEnabled) {
      setBookingMessage({ type: 'err', text: 'Cash on Delivery is currently disabled for this hub.' });
      return;
    }
    const created = onCreateBooking({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerAddress: customerAddress.trim(),
      latitude,
      longitude,
      hubId: geofenceCheck.matchedHub.hubId,
      fulfillmentType,
      paymentMethod,
      serviceName: selectedService,
      promoCode: matchedPromo?.code,
    });
    setActiveOrderId(created.orderId);
    setBookingMessage({
      type: 'ok',
      text: `10-Min Pickup confirmed! Order ${created.orderNumber} assigned to ${geofenceCheck.matchedHub.name}. Delivery OTP: ${created.deliveryOtp}.`,
    });
  };

  const handleWaitlistSubmit = () => {
    if (!customerName.trim() || !customerPhone.trim()) return;
    onJoinWaitlist({
      customerName: customerName.trim(),
      phone: customerPhone.trim(),
      latitude,
      longitude,
      nearestHubName: geofenceCheck.nearestHub?.name ?? 'Unassigned',
      distanceKm: geofenceCheck.distanceKm,
    });
    setWaitlistSubmitted(true);
  };

  const handleCancelTracked = () => {
    if (!trackedOrder) return;
    const res = onCancelOrder(trackedOrder.orderId);
    if (!res.ok) {
      setBookingMessage({ type: 'err', text: res.error ?? 'Cancellation blocked.' });
    } else {
      setBookingMessage({ type: 'ok', text: `Order ${trackedOrder.orderNumber} cancelled prior to weighing.` });
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Promo Banner Strip from Dynamic CMS */}
      {activePromos.length > 0 && (
        <div className="bg-slate-900 text-white rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{activePromos[0].title}</p>
            <p className="text-xs text-slate-300 mt-0.5">{activePromos[0].description}</p>
          </div>
          <button
            type="button"
            onClick={() => setPromoCode(activePromos[0].code)}
            className="px-3 py-1.5 text-xs font-mono font-semibold bg-white text-slate-900 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Apply {activePromos[0].code}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: 10-Min Pickup Booking & Geofence Validator */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="pb-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">
              10-Min Pickup Booking &amp; Geofence Check
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              10-Min Pickup · Premium Care · All pricing and discount tiers pulled live from Dynamic Rules
            </p>
          </div>

          {/* Preset Location Coordinates */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Test GPS Location / Hub Geofence Pin
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LOCATION_PRESETS.map((preset) => {
                const isSelected = preset.lat === latitude && preset.lng === longitude;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setLatitude(preset.lat);
                      setLongitude(preset.lng);
                      setCustomerAddress(preset.address);
                      setWaitlistSubmitted(false);
                    }}
                    className={`text-left px-3 py-2 text-xs rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-sky-50 border-sky-600 text-sky-900 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Geofence Validation Result Banner */}
          <div
            className={`p-3.5 rounded-lg border text-xs ${
              geofenceCheck.inCoverage
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {geofenceCheck.inCoverage && geofenceCheck.matchedHub ? (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                    Inside {geofenceCheck.matchedHub.name} Geofence ({geofenceCheck.distanceKm} km / {geofenceCheck.matchedHub.geofenceRadiusKm} km limit)
                  </div>
                  <p className="mt-1 text-emerald-800">
                    {nearbyRidersCount} active rider(s) nearby · Est. pickup in{' '}
                    <span className="font-mono font-semibold">{geofenceCheck.estimatedPickupMinutes} mins</span> · Open {geofenceCheck.matchedHub.openHours}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="font-semibold flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                  Outside Active Geofence Coverage ({geofenceCheck.distanceKm} km from {geofenceCheck.nearestHub?.name})
                </div>
                <p className="text-amber-800">
                  Your coordinates exceed the {geofenceCheck.nearestHub?.geofenceRadiusKm} km 10-minute dispatch boundary. Subscribe below to capture expansion analytics.
                </p>
                {waitlistSubmitted ? (
                  <p className="font-semibold text-emerald-800">
                    Added to InstaWash Expansion Waitlist ({waitlist.length} total requests logged).
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleWaitlistSubmit}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-md transition-colors"
                  >
                    Join Expansion Waitlist
                  </button>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleBookPickup} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="cust-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Customer Name
                </label>
                <input
                  id="cust-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                  required
                />
              </div>
              <div>
                <label htmlFor="cust-phone" className="block text-xs font-medium text-slate-700 mb-1">
                  WhatsApp / Mobile Number
                </label>
                <input
                  id="cust-phone"
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="cust-address" className="block text-xs font-medium text-slate-700 mb-1">
                Doorstep Pickup Address
              </label>
              <input
                id="cust-address"
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="cust-service" className="block text-xs font-medium text-slate-700 mb-1">
                  Care Service / Package
                </label>
                <select
                  id="cust-service"
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                >
                  {publishedServices.map((svc) => (
                    <option key={svc.productId} value={svc.name}>
                      {svc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cust-promo" className="block text-xs font-medium text-slate-700 mb-1">
                  Promo Code (Optional)
                </label>
                <input
                  id="cust-promo"
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="e.g. INSTA10MIN"
                  className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
            </div>

            {/* Fulfillment Selector */}
            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1.5">
                Fulfillment Mode
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setFulfillmentType(FulfillmentType.OFFICE_PICKUP)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    fulfillmentType === FulfillmentType.OFFICE_PICKUP
                      ? 'bg-sky-50 border-sky-600 text-sky-900'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-semibold">Office / Store Self-Pickup</div>
                  <div className="text-xs font-mono tabular-nums mt-0.5 text-slate-600">
                    {activeRule.officePickupFee === 0 ? '₹0 (Free)' : formatInr(activeRule.officePickupFee)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentType(FulfillmentType.HOME_DELIVERY)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    fulfillmentType === FulfillmentType.HOME_DELIVERY
                      ? 'bg-sky-50 border-sky-600 text-sky-900'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-semibold">Home Delivery Drop-off</div>
                  <div className="text-xs font-mono tabular-nums mt-0.5 text-slate-600">
                    +{formatInr(activeRule.homeDeliveryFee)}
                  </div>
                </button>
              </div>
            </div>

            {/* Payment Mode Selector */}
            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1.5">
                Payment Mode
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={!activeRule.codEnabled}
                  onClick={() => setPaymentMethod(PaymentMethod.POD_CASH)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    paymentMethod === PaymentMethod.POD_CASH
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40'
                  }`}
                >
                  Pay on Delivery (Cash)
                </button>
                <button
                  type="button"
                  disabled={!activeRule.upiEnabled}
                  onClick={() => setPaymentMethod(PaymentMethod.POD_UPI)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    paymentMethod === PaymentMethod.POD_UPI
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40'
                  }`}
                >
                  POD UPI Intent
                </button>
                <button
                  type="button"
                  disabled={!activeRule.cardsEnabled}
                  onClick={() => setPaymentMethod(PaymentMethod.ONLINE_PREPAID)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    paymentMethod === PaymentMethod.ONLINE_PREPAID
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40'
                  }`}
                >
                  Online Prepaid
                </button>
              </div>
            </div>

            {/* Interactive Weight & Slab Estimator */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="est-kg-slider" className="font-semibold text-slate-800">
                  Live Bill Estimator ({estimatedKg.toFixed(1)} Kg at ₹{activeRule.ratePerKg}/Kg)
                </label>
                <span className="font-mono text-sky-800 font-semibold">
                  {estimate.matchedSlabLabel}
                </span>
              </div>
              <input
                id="est-kg-slider"
                type="range"
                min="1"
                max="12"
                step="0.5"
                value={estimatedKg}
                onChange={(e) => setEstimatedKg(parseFloat(e.target.value))}
                className="w-full accent-sky-700"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                <div>
                  <span className="text-slate-500 block">Gross</span>
                  <span className="font-mono font-semibold tabular-nums">{formatInr(estimate.grossAmount)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Discount ({estimate.discountPercent}%)</span>
                  <span className="font-mono font-semibold tabular-nums text-emerald-700">
                    -{formatInr(estimate.discountAmount)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Delivery Fee</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {estimate.freeDeliveryApplied ? '₹0.00 (Free)' : formatInr(estimate.deliveryFee)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Est. Payable</span>
                  <span className="font-mono font-bold tabular-nums text-slate-900">
                    {formatInr(estimate.finalPayable)}
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                {activeSlabs.map((slab) => (
                  <span key={slab.slabId}>
                    {slab.label}: <strong className="text-slate-700">{slab.discountPercent}% OFF</strong>
                  </span>
                ))}
              </div>
            </div>

            {bookingMessage && (
              <div
                role="status"
                className={`p-3 rounded-lg border text-xs font-medium ${
                  bookingMessage.type === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {bookingMessage.text}
              </div>
            )}

            <button
              type="submit"
              disabled={!geofenceCheck.inCoverage}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Request 10-Min Pickup
            </button>
          </form>
        </section>

        {/* Right: Live Order Timeline & Locked Digital Receipt */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Live Order Timeline &amp; Locked Digital Receipt
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time state tracking, verified doorstep weight proof, and 4-digit delivery OTP
              </p>
            </div>
            <select
              aria-label="Select order to track"
              value={trackedOrder?.orderId ?? ''}
              onChange={(e) => setActiveOrderId(e.target.value)}
              className="px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
            >
              {orders.map((o) => (
                <option key={o.orderId} value={o.orderId}>
                  {o.orderNumber} — {o.customerName}
                </option>
              ))}
            </select>
          </div>

          {trackedOrder ? (
            <div className="space-y-5">
              {/* Order Summary Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
                    {trackedOrder.orderNumber}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {trackedOrder.customerName} · {trackedOrder.serviceName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-medium text-slate-500">Delivery Security OTP</div>
                  <div className="font-mono text-xl font-bold tracking-widest text-sky-800 tabular-nums">
                    {trackedOrder.deliveryOtp}
                  </div>
                </div>
              </div>

              {/* Stepper Timeline */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-700">Order State Progression</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {ORDER_TIMELINE_STAGES.map((stage, idx) => {
                    const currentIdx = ORDER_TIMELINE_STAGES.indexOf(trackedOrder.status);
                    const isDone = trackedOrder.status !== OrderStatus.CANCELLED && idx <= currentIdx;
                    const isCurrent = trackedOrder.status === stage;
                    return (
                      <div
                        key={stage}
                        className={`p-2 rounded-lg border text-[11px] ${
                          isCurrent
                            ? 'bg-sky-50 border-sky-600 text-sky-900 font-semibold'
                            : isDone
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                            : 'bg-white border-slate-200 text-slate-400'
                        }`}
                      >
                        <div className="font-mono tabular-nums text-[10px] opacity-75">0{idx + 1}</div>
                        <div className="truncate mt-0.5">{stage.replace(/_/g, ' ')}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Locked Digital Receipt */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-slate-600" aria-hidden="true" />
                    Itemized Digital Receipt
                  </h3>
                  <span
                    className={`text-xs font-semibold inline-flex items-center gap-1 ${
                      trackedOrder.isWeightLocked ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {trackedOrder.isWeightLocked ? (
                      <>
                        <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                        Weight Locked
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        Awaiting Doorstep Scale
                      </>
                    )}
                  </span>
                </div>

                {trackedOrder.isCorrectedByManager && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs font-medium text-amber-900">
                    Invoice Corrected by Hub Manager — revised totals synced with WhatsApp receipt.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                  <div className="sm:col-span-5 aspect-[4/3] bg-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    <img
                      src={trackedOrder.scalePhotoUrl || SCALE_PROOF_IMAGE}
                      alt={`Scale proof for ${trackedOrder.orderNumber}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="sm:col-span-7 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Verified Weight</span>
                      <span className="font-mono font-semibold tabular-nums text-slate-900">
                        {trackedOrder.weightKg > 0
                          ? `${trackedOrder.weightKg.toFixed(2)} Kg (${trackedOrder.garmentCount} pcs)`
                          : 'Pending Rider'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Bag QR Security Tag</span>
                      <span className="font-mono text-slate-900">{trackedOrder.bagQrCode || 'Pending'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Gross Subtotal</span>
                      <span className="font-mono tabular-nums text-slate-900">{formatInr(trackedOrder.grossAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Auto-Applied Tier ({trackedOrder.discountPercent}%)</span>
                      <span className="font-mono tabular-nums text-emerald-700">
                        -{formatInr(trackedOrder.discountAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">
                        {trackedOrder.fulfillmentType === FulfillmentType.HOME_DELIVERY
                          ? 'Home Delivery Fee'
                          : 'Office Self-Pickup'}
                      </span>
                      <span className="font-mono tabular-nums text-slate-900">{formatInr(trackedOrder.deliveryFee)}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900">
                      <span>Net Billable Total</span>
                      <span className="font-mono tabular-nums">{formatInr(trackedOrder.finalPayable)}</span>
                    </div>
                  </div>
                </div>

                {/* Cancellation Guardrail */}
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  {trackedOrder.isWeightLocked ? (
                    <span className="text-slate-500 inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-slate-400" aria-hidden="true" />
                      Manual cancellation locked post-weighing (Hub Manager authorization required)
                    </span>
                  ) : trackedOrder.status === OrderStatus.CANCELLED ? (
                    <span className="text-rose-700 font-medium">Order Cancelled</span>
                  ) : (
                    <>
                      <span className="text-slate-500">
                        Free pre-weighing cancellation (₹{activeRule.cancellationPenalty} penalty if rider &gt; 1 km)
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelTracked}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        Cancel Pickup
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No active orders yet. Request a 10-min pickup on the left.</p>
          )}
        </section>
      </div>
    </div>
  );
};
