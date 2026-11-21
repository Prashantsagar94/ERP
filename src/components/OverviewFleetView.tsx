import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  MapPin,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import {
  ActiveModule,
  Hub,
  Order,
  OrderStatus,
  PricingRule,
  RiderPodLedgerEntry,
  RiderTelemetry,
} from '../types/erp';
import { formatInr, resolvePricingRule } from '../utils/erpEngine';

interface OverviewFleetViewProps {
  hubs: Hub[];
  orders: Order[];
  riders: RiderTelemetry[];
  pricingRules: PricingRule[];
  podLedger: RiderPodLedgerEntry[];
  selectedHubFilter: string;
  onSelectHubFilter: (hubId: string) => void;
  onNavigate: (module: ActiveModule) => void;
  onDispatchRider: (orderId: string, riderId: string) => void;
}

export const OverviewFleetView: React.FC<OverviewFleetViewProps> = ({
  hubs,
  orders,
  riders,
  pricingRules,
  podLedger,
  selectedHubFilter,
  onSelectHubFilter,
  onNavigate,
  onDispatchRider,
}) => {
  const [focusedHubId, setFocusedHubId] = useState<string>(hubs[0]?.hubId ?? '');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const scopedOrders = useMemo(
    () =>
      selectedHubFilter === 'ALL'
        ? orders
        : orders.filter((o) => o.hubId === selectedHubFilter),
    [orders, selectedHubFilter]
  );

  const focusedHub = useMemo(
    () => hubs.find((h) => h.hubId === focusedHubId) ?? hubs[0],
    [hubs, focusedHubId]
  );

  const slaThreshold = useMemo(() => {
    const rule = resolvePricingRule(focusedHub?.hubId ?? 'GLOBAL', pricingRules);
    return rule.slaPickupAlertMinutes;
  }, [focusedHub, pricingRules]);

  const metrics = useMemo(() => {
    const activeOrders = scopedOrders.filter(
      (o) =>
        o.status !== OrderStatus.DELIVERED_AND_SETTLED &&
        o.status !== OrderStatus.CANCELLED
    );
    const slaRisks = activeOrders.filter(
      (o) =>
        (o.status === OrderStatus.PICKUP_REQUESTED ||
          o.status === OrderStatus.RIDER_ASSIGNED) &&
        o.elapsedMinutes >= slaThreshold
    );
    const totalRevenue = scopedOrders
      .filter((o) => o.status !== OrderStatus.CANCELLED)
      .reduce((sum, o) => sum + o.finalPayable, 0);
    const unsettledPod = podLedger
      .filter(
        (e) =>
          e.settlementStatus === 'UNSETTLED' &&
          (selectedHubFilter === 'ALL' || e.hubId === selectedHubFilter)
      )
      .reduce((sum, e) => sum + e.amountCollected, 0);
    const lockedCount = scopedOrders.filter((o) => o.isWeightLocked).length;

    return {
      activeCount: activeOrders.length,
      slaRiskCount: slaRisks.length,
      totalRevenue,
      unsettledPod,
      lockedCount,
    };
  }, [scopedOrders, slaThreshold, podLedger, selectedHubFilter]);

  const hubRiders = useMemo(
    () => riders.filter((r) => r.hubId === focusedHub?.hubId),
    [riders, focusedHub]
  );

  const hubOrders = useMemo(
    () => orders.filter((o) => o.hubId === focusedHub?.hubId && o.status !== OrderStatus.CANCELLED),
    [orders, focusedHub]
  );

  const projectCoord = (lat: number, lng: number) => {
    if (!focusedHub) return { x: 260, y: 162 };
    const radiusDeg = (focusedHub.geofenceRadiusKm / 111) * 1.15;
    const normX = (lng - focusedHub.longitude) / radiusDeg;
    const normY = (focusedHub.latitude - lat) / radiusDeg;
    return {
      x: Math.max(48, Math.min(448, 260 + normX * 112)),
      y: Math.max(42, Math.min(262, 162 + normY * 102)),
    };
  };

  const unassignedOrders = scopedOrders.filter(
    (o) => o.status === OrderStatus.PICKUP_REQUESTED
  );

  return (
    <div className="space-y-6">
      {/* Top KPI Strip - Clean single elevation, no nested cards */}
      <section aria-label="Operational key metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Active Pipeline Orders</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {metrics.activeCount}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {metrics.lockedCount} weight-locked
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Across {selectedHubFilter === 'ALL' ? `${hubs.length} hubs` : focusedHub?.code}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">10-Min Pickup SLA Alerts</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                metrics.slaRiskCount > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {metrics.slaRiskCount}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              Threshold &ge; {slaThreshold} min
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {metrics.slaRiskCount > 0
              ? 'Immediate dispatcher attention required'
              : 'All live pickups within 10-min window'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Billed Gross Order Value</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatInr(metrics.totalRevenue)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Auto-calculated with active slab matrix
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Unsettled Rider POD Cash</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatInr(metrics.unsettledPod)}
            </span>
            <button
              type="button"
              onClick={() => onNavigate(ActiveModule.FINANCE)}
              className="text-xs font-medium text-sky-700 hover:text-sky-900 inline-flex items-center gap-0.5 whitespace-nowrap"
            >
              Reconcile
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Pending End-of-Day hub verification
          </p>
        </div>
      </section>

      {/* Main Split: Geospatial Hub Map + Smart Dispatch Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Live Hub Geofence & Fleet Telemetry Map */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Live Hub Geofence &amp; Fleet Telemetry
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {focusedHub?.name} · {focusedHub?.city} · {focusedHub?.geofenceRadiusKm.toFixed(1)} km radius · {focusedHub?.openHours}
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="tablist" aria-label="Select hub geofence map">
                {hubs.map((hub) => (
                  <button
                    key={hub.hubId}
                    type="button"
                    role="tab"
                    aria-selected={focusedHub?.hubId === hub.hubId}
                    onClick={() => {
                      setFocusedHubId(hub.hubId);
                      onSelectHubFilter(hub.hubId);
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      focusedHub?.hubId === hub.hubId
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {hub.code}
                  </button>
                ))}
              </div>
              {selectedHubFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => onSelectHubFilter('ALL')}
                  className="text-xs font-medium text-sky-700 hover:text-sky-900 whitespace-nowrap"
                >
                  Show All Hubs
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 relative flex-1 min-h-[340px] bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
            <svg
              viewBox="0 0 520 340"
              className="w-full h-full min-h-[340px]"
              role="img"
              aria-label={`Geofence map for ${focusedHub?.name}`}
            >
              <defs>
                <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
                  <path d="M 26 0 L 0 0 0 26" fill="none" stroke="#E2E8F0" strokeWidth="0.7" />
                </pattern>
              </defs>
              <rect width="520" height="340" fill="url(#grid)" />

              {/* Arterial roads stylized lines */}
              <path d="M 40 272 Q 190 202 260 162 T 490 72" fill="none" stroke="#CBD5E1" strokeWidth="2.5" />
              <path d="M 90 32 Q 210 122 260 162 T 430 302" fill="none" stroke="#CBD5E1" strokeWidth="2" />

              {/* Outer 10-min geofence boundary */}
              <circle
                cx="260"
                cy="162"
                r="114"
                fill="rgba(3, 105, 161, 0.06)"
                stroke="#0369A1"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              {/* Inner 5-min core zone */}
              <circle
                cx="260"
                cy="162"
                r="56"
                fill="rgba(3, 105, 161, 0.04)"
                stroke="#7DD3FC"
                strokeWidth="1"
              />

              {/* Top-left Hub Boundary Label (never collides with markers) */}
              <text
                x="16"
                y="24"
                fill="#0F172A"
                fontSize="11"
                fontWeight="700"
                style={{ paintOrder: 'stroke', stroke: '#F8FAFC', strokeWidth: 4 }}
              >
                {focusedHub?.code} · {focusedHub?.geofenceRadiusKm.toFixed(1)} km Geofence
              </text>

              {/* Hub Plant Center */}
              <rect x="249" y="151" width="22" height="22" rx="5" fill="#0F172A" />
              <text x="260" y="165" textAnchor="middle" fill="#FFFFFF" fontSize="8.5" fontWeight="700">
                HUB
              </text>

              {/* Active Orders in Hub */}
              {hubOrders.map((order) => {
                const pos = projectCoord(order.customerLat, order.customerLng);
                const isRisk =
                  (order.status === OrderStatus.PICKUP_REQUESTED ||
                    order.status === OrderStatus.RIDER_ASSIGNED) &&
                  order.elapsedMinutes >= slaThreshold;
                const isSelected = selectedOrderId === order.orderId;
                return (
                  <g
                    key={order.orderId}
                    onClick={() => setSelectedOrderId(order.orderId)}
                    className="cursor-pointer"
                  >
                    {isRisk && (
                      <circle cx={pos.x} cy={pos.y} r="13" fill="rgba(180, 83, 9, 0.18)" />
                    )}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={isSelected ? 7.5 : 6}
                      fill={isRisk ? '#B45309' : order.isWeightLocked ? '#15803D' : '#0369A1'}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                    <text
                      x={pos.x + 10}
                      y={pos.y + 3.5}
                      fill="#0F172A"
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="IBM Plex Mono, monospace"
                      style={{ paintOrder: 'stroke', stroke: '#F8FAFC', strokeWidth: 3.5 }}
                    >
                      {order.orderNumber}
                    </text>
                  </g>
                );
              })}

              {/* Active Riders in Hub */}
              {hubRiders.map((rider) => {
                const pos = projectCoord(rider.latitude, rider.longitude);
                return (
                  <g key={rider.riderId}>
                    <polygon
                      points={`${pos.x},${pos.y - 7} ${pos.x + 6},${pos.y + 5} ${pos.x - 6},${pos.y + 5}`}
                      fill="#0F172A"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                    />
                    <text
                      x={pos.x}
                      y={pos.y - 11}
                      textAnchor="middle"
                      fill="#334155"
                      fontSize="9.5"
                      fontWeight="700"
                      style={{ paintOrder: 'stroke', stroke: '#F8FAFC', strokeWidth: 3.5 }}
                    >
                      {rider.name.split(' ')[0]}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 bg-white/95 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600">
              <div className="flex items-center gap-4 flex-wrap">
                <span>Blue Circle: Active Pickup</span>
                <span>Green Circle: Weight Locked</span>
                <span>Amber Halo: SLA &ge; {slaThreshold}m</span>
                <span>Dark Triangle: Rider GPS</span>
              </div>
              <span className="font-mono tabular-nums text-slate-500">
                {focusedHub?.latitude.toFixed(4)}, {focusedHub?.longitude.toFixed(4)}
              </span>
            </div>
          </div>
        </section>

        {/* Right Column: Live Dispatch Queue & Fleet Status */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Smart Dispatch &amp; SLA Queue
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Redis proximity matching &amp; 10-minute pickup enforcement
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(ActiveModule.RIDER_CONSOLE)}
                className="text-xs font-medium text-sky-700 hover:text-sky-900 whitespace-nowrap"
              >
                Open Rider Console
              </button>
            </div>

            {unassignedOrders.length === 0 ? (
              <div className="py-5 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
                No unassigned pickup requests in queue. All active bookings are assigned to field riders.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {unassignedOrders.map((order) => {
                  const candidateRiders = riders.filter((r) => r.hubId === order.hubId);
                  const bestRider = candidateRiders[0] ?? riders[0];
                  return (
                    <div key={order.orderId} className="p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <span className="font-mono tabular-nums">{order.orderNumber}</span>
                          <span className="text-slate-400">·</span>
                          <span className="truncate">{order.customerName}</span>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {order.customerAddress}
                        </p>
                      </div>
                      {bestRider && (
                        <button
                          type="button"
                          onClick={() => onDispatchRider(order.orderId, bestRider.riderId)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          Assign {bestRider.name.split(' ')[0]}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Active Rider Fleet Table */}
            <div className="pt-2">
              <h3 className="text-xs font-semibold text-slate-700 mb-2.5">
                Active Field Fleet ({riders.length} Riders)
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-3 font-medium">Rider</th>
                      <th className="py-2.5 px-3 font-medium">Hub</th>
                      <th className="py-2.5 px-3 font-medium">State</th>
                      <th className="py-2.5 px-3 font-medium text-right">Battery</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {riders.map((r) => {
                      const hub = hubs.find((h) => h.hubId === r.hubId);
                      return (
                        <tr key={r.riderId} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                            {r.name}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                            {hub?.code ?? r.hubId}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                            {r.status.replace(/_/g, ' ')}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-600">
                            {r.batteryPercent}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              PostGIS &amp; Geo-Radius Validation Active
            </span>
            <button
              type="button"
              onClick={() => onNavigate(ActiveModule.CUSTOMER_PORTAL)}
              className="font-medium text-sky-700 hover:text-sky-900 whitespace-nowrap"
            >
              Simulate 10-Min Booking &rarr;
            </button>
          </div>
        </section>
      </div>

      {/* Live Orders Master Grid */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Live Order Telemetry Ledger
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time state machine tracking across pickups, cryptographic weight locks, wash floor, and settlement
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate(ActiveModule.KANBAN)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              Open Wash-Floor Kanban
            </button>
            <button
              type="button"
              onClick={() => onNavigate(ActiveModule.CONFIG_ENGINE)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              Edit Dynamic Rules
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 px-4 font-medium">Order</th>
                <th className="py-3 px-4 font-medium">Customer &amp; Hub</th>
                <th className="py-3 px-4 font-medium">Stage &amp; SLA</th>
                <th className="py-3 px-4 font-medium text-right">Weight</th>
                <th className="py-3 px-4 font-medium text-right">Discount</th>
                <th className="py-3 px-4 font-medium text-right">Net Payable</th>
                <th className="py-3 px-4 font-medium">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scopedOrders.map((order) => {
                const hub = hubs.find((h) => h.hubId === order.hubId);
                const isSlaAlert =
                  (order.status === OrderStatus.PICKUP_REQUESTED ||
                    order.status === OrderStatus.RIDER_ASSIGNED) &&
                  order.elapsedMinutes >= slaThreshold;
                return (
                  <tr key={order.orderId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-mono font-semibold text-slate-900 tabular-nums">
                        {order.orderNumber}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {order.bagQrCode || 'Awaiting QR'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{order.customerName}</div>
                      <div className="text-xs text-slate-500">
                        {hub?.code ?? order.hubId} · {order.fulfillmentType === 'HOME_DELIVERY' ? 'Home Delivery' : 'Office Self-Pickup'}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-xs font-semibold text-slate-800">
                        {order.status.replace(/_/g, ' ')}
                      </div>
                      {isSlaAlert ? (
                        <div className="text-xs text-amber-700 font-medium inline-flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          SLA Risk ({order.elapsedMinutes}m elapsed)
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 tabular-nums">
                          {order.isWeightLocked ? 'Weight Locked' : `${order.elapsedMinutes}m elapsed`}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {order.weightKg > 0 ? `${order.weightKg.toFixed(2)} Kg` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {order.discountPercent > 0 ? `${order.discountPercent}%` : '0%'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                      {order.finalPayable > 0 ? formatInr(order.finalPayable) : 'Pending'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-xs font-medium text-slate-800">
                        {order.paymentMethod.replace(/_/g, ' ')}
                      </div>
                      <div
                        className={`text-xs ${
                          order.paymentStatus === 'PAID' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {order.paymentStatus}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
