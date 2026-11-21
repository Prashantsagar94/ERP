/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  Building2,
  ClipboardList,
  Factory,
  Globe,
  LayoutDashboard,
  Lock,
  LogOut,
  Megaphone,
  Menu,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  ActiveModule,
  AuditEvent,
  AuthenticatedSession,
  CustomerAccount,
  DiscountSlab,
  FulfillmentType,
  Hub,
  OfflineWeightQueueItem,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PricingRule,
  ProductFormula,
  ProductionBatch,
  PromoItem,
  RiderPodLedgerEntry,
  RiderTelemetry,
  RunningBanner,
  StaffAccount,
  UserRole,
  WaitlistEntry,
  WeightAuditLog,
  WorkflowStageConfig,
} from './types/erp';
import {
  INITIAL_AUDIT_EVENTS,
  INITIAL_BANNERS,
  INITIAL_CUSTOMERS,
  INITIAL_DISCOUNT_SLABS,
  INITIAL_HUBS,
  INITIAL_ORDERS,
  INITIAL_POD_LEDGER,
  INITIAL_PRICING_RULES,
  INITIAL_PRODUCTION_BATCHES,
  INITIAL_PRODUCTS,
  INITIAL_PROMOS,
  INITIAL_RIDERS,
  INITIAL_STAFF_ACCOUNTS,
  INITIAL_WEIGHT_AUDIT_LOGS,
  INITIAL_WORKFLOW_STAGES,
  OPS_DIRECTOR_AVATAR,
} from './data/seedData';
import {
  calculateOrderBill,
  canAccessModule,
  computeProductMakingMetrics,
  computeWeightLockHash,
  getDefaultPermissionsForRole,
  scopeEntitiesBySession,
  validateWeightOverride,
} from './utils/erpEngine';
import { auth, googleAuthProvider } from './lib/firebase';
import {
  deleteBannerFromFirestore,
  syncAuditEventToFirestore,
  syncBannerToFirestore,
  syncDiscountSlabToFirestore,
  syncHubToFirestore,
  syncOrderToFirestore,
  syncPodLedgerToFirestore,
  syncPricingRuleToFirestore,
  syncProductionBatchToFirestore,
  syncProductToFirestore,
  syncStaffAccountToFirestore,
  syncWeightAuditToFirestore,
} from './lib/firestoreSync';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OverviewFleetView } from './components/OverviewFleetView';
import { WashFloorKanbanView } from './components/WashFloorKanbanView';
import { CustomerBookingView } from './components/CustomerBookingView';
import { RiderDispatchView } from './components/RiderDispatchView';
import { FinanceLedgerView } from './components/FinanceLedgerView';
import { ProductMakingView } from './components/ProductMakingView';
import { StaffExcelImportView } from './components/StaffExcelImportView';
import { DynamicConfigView } from './components/DynamicConfigView';
import { AuditBlueprintView } from './components/AuditBlueprintView';
import { BannerAdsCmsView } from './components/BannerAdsCmsView';
import { RunningBannerBar } from './components/RunningBannerBar';
import { PublicWebsiteView } from './components/PublicWebsiteView';
import { PortalLoginScreen } from './components/PortalLoginScreen';

interface NavItemConfig {
  id: ActiveModule;
  label: string;
  section: 'Operations' | 'Enterprise' | 'Governance';
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: ActiveModule.OVERVIEW, label: 'Overview & Fleet Map', section: 'Operations', icon: LayoutDashboard },
  { id: ActiveModule.KANBAN, label: 'Wash-Floor Kanban', section: 'Operations', icon: ClipboardList },
  { id: ActiveModule.CUSTOMER_PORTAL, label: 'Customer 10-Min App', section: 'Operations', icon: Smartphone },
  { id: ActiveModule.RIDER_CONSOLE, label: 'Rider Dispatch & Lock', section: 'Operations', icon: Truck },
  { id: ActiveModule.FINANCE, label: 'Finance & POD Ledger', section: 'Enterprise', icon: Wallet },
  { id: ActiveModule.PRODUCT_MAKING, label: 'Product Making & BOM', section: 'Enterprise', icon: Factory },
  { id: ActiveModule.BANNERS_CMS, label: 'Running Banners & Ads', section: 'Enterprise', icon: Megaphone },
  { id: ActiveModule.STAFF_EXCEL, label: 'Staff Roles & Excel', section: 'Enterprise', icon: Users },
  { id: ActiveModule.CONFIG_ENGINE, label: 'Dynamic Rules Engine', section: 'Governance', icon: SlidersHorizontal },
  { id: ActiveModule.AUDIT_TRAIL, label: 'Audit & SQL Blueprint', section: 'Governance', icon: ShieldCheck },
];

const BOOTSTRAPPED_ADMIN_EMAIL = 'prashantsagarmepl@gmail.com';

const ROLE_LABELS: Record<AuthenticatedSession['role'], string> = {
  SUPER_ADMIN: 'Super Admin HQ',
  FRANCHISE_PARTNER: 'Franchise Partner',
  HUB_OPERATOR: 'Hub Plant Operator',
  RIDER: 'Field Rider',
  CUSTOMER: 'Customer',
};

function ErpWorkspace() {
  // Public Website -> Unified Login Page -> Authenticated Role Portal
  const [surface, setSurface] = useState<'PUBLIC_WEBSITE' | 'LOGIN' | 'PORTAL'>('PUBLIC_WEBSITE');
  const [session, setSession] = useState<AuthenticatedSession | null>(null);
  const [activeModule, setActiveModule] = useState<ActiveModule>(ActiveModule.OVERVIEW);
  const [superAdminHubFilter, setSuperAdminHubFilter] = useState<string>('ALL');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Firebase Auth state (used for Super Admin Cloud Sync)
  const [firebaseUserEmail, setFirebaseUserEmail] = useState<string | null>(null);
  const [firebaseUserName, setFirebaseUserName] = useState<string | null>(null);

  // Core Enterprise State
  const [hubs, setHubs] = useState<Hub[]>(INITIAL_HUBS);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>(INITIAL_PRICING_RULES);
  const [discountSlabs, setDiscountSlabs] = useState<DiscountSlab[]>(INITIAL_DISCOUNT_SLABS);
  const [workflowStages, setWorkflowStages] = useState<WorkflowStageConfig[]>(INITIAL_WORKFLOW_STAGES);
  const [promos, setPromos] = useState<PromoItem[]>(INITIAL_PROMOS);
  const [banners, setBanners] = useState<RunningBanner[]>(INITIAL_BANNERS);
  const [riders, setRiders] = useState<RiderTelemetry[]>(INITIAL_RIDERS);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [podLedger, setPodLedger] = useState<RiderPodLedgerEntry[]>(INITIAL_POD_LEDGER);
  const [weightAuditLogs, setWeightAuditLogs] = useState<WeightAuditLog[]>(INITIAL_WEIGHT_AUDIT_LOGS);
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>(INITIAL_STAFF_ACCOUNTS);
  const [customerAccounts, setCustomerAccounts] = useState<CustomerAccount[]>(INITIAL_CUSTOMERS);
  const [products, setProducts] = useState<ProductFormula[]>(INITIAL_PRODUCTS);
  const [batches, setBatches] = useState<ProductionBatch[]>(INITIAL_PRODUCTION_BATCHES);
  const [offlineQueue, setOfflineQueue] = useState<OfflineWeightQueueItem[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(INITIAL_AUDIT_EVENTS);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && user.emailVerified) {
        setFirebaseUserEmail(user.email);
        setFirebaseUserName(user.displayName);
      } else {
        setFirebaseUserEmail(null);
        setFirebaseUserName(null);
      }
    });
    return () => unsub();
  }, []);

  const activeActorName = session?.fullName ?? firebaseUserName ?? 'Public Visitor';
  const activeActorRole: UserRole =
    session?.role === 'SUPER_ADMIN'
      ? UserRole.SUPER_ADMIN
      : session?.role === 'FRANCHISE_PARTNER'
        ? UserRole.FRANCHISE_PARTNER
        : session?.role === 'HUB_OPERATOR'
          ? UserRole.HUB_OPERATOR
          : session?.role === 'RIDER'
            ? UserRole.RIDER
            : UserRole.CUSTOMER;

  const visibleNavItems = useMemo(() => {
    if (!session) return [];
    return NAV_ITEMS.filter((item) => canAccessModule(session, item.id));
  }, [session]);

  const scopedData = useMemo(() => {
    if (!session) {
      return {
        hubs,
        orders,
        riders,
        podLedger,
        batches,
        staffAccounts,
        effectiveHubFilter: 'ALL',
      };
    }
    return scopeEntitiesBySession({
      session,
      hubs,
      orders,
      riders,
      podLedger,
      batches,
      staffAccounts,
      superAdminHubFilter,
    });
  }, [session, hubs, orders, riders, podLedger, batches, staffAccounts, superAdminHubFilter]);

  const logAudit = (action: string, entityType: string, summary: string) => {
    const event: AuditEvent = {
      eventId: `evt_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      actorName: activeActorName,
      actorRole: session?.role ?? 'PUBLIC',
      action,
      entityType,
      summary,
      createdAt: new Date().toISOString(),
    };
    setAuditEvents((prev) => [event, ...prev]);
    void syncAuditEventToFirestore(event).catch(() => undefined);
  };

  // Authentication Handlers
  const openFirstPermittedModule = (nextSession: AuthenticatedSession) => {
    if (nextSession.role === 'CUSTOMER') {
      setActiveModule(ActiveModule.CUSTOMER_PORTAL);
      return;
    }
    const allowed = NAV_ITEMS.filter((item) => canAccessModule(nextSession, item.id));
    setActiveModule(allowed[0]?.id ?? ActiveModule.OVERVIEW);
  };

  const handleLoginSuccess = (nextSession: AuthenticatedSession) => {
    setSession(nextSession);
    setSuperAdminHubFilter('ALL');
    openFirstPermittedModule(nextSession);
    setSurface('PORTAL');
    setMobileMenuOpen(false);
    logAudit(
      'PORTAL_LOGIN',
      'AUTH',
      `${nextSession.fullName} (${nextSession.role}) logged in (${nextSession.allottedHubId}).`
    );
  };

  const handleCustomerRegister = (
    customer: CustomerAccount,
    nextSession: AuthenticatedSession
  ) => {
    setCustomerAccounts((prev) => [customer, ...prev]);
    handleLoginSuccess(nextSession);
    logAudit(
      'CUSTOMER_REGISTERED',
      'CUSTOMER',
      `New customer ${customer.fullName} (${customer.loginId}) registered for dedicated Customer Panel.`
    );
  };

  const handleGoogleSuperAdminSignIn = async () => {
    const result = await signInWithPopup(auth, googleAuthProvider);
    const user = result.user;
    if (!user || !user.emailVerified) {
      throw new Error('Verified Google account is required for Super Admin Cloud Sync.');
    }
    if (user.email?.toLowerCase() !== BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
      await signOut(auth);
      throw new Error(
        `Only the verified Super Admin HQ account (${BOOTSTRAPPED_ADMIN_EMAIL}) can sign in via Google HQ Auth. Franchise & branch users must use their allotted Login ID & Password.`
      );
    }
    const hqSession: AuthenticatedSession = {
      staffId: 'STF-HQ-GOOGLE',
      loginId: user.email,
      fullName: user.displayName || 'Prashant Sagar',
      role: 'SUPER_ADMIN',
      allottedHubId: 'ALL',
      permissions: getDefaultPermissionsForRole('SUPER_ADMIN'),
      authMethod: 'GOOGLE_SUPER_ADMIN',
    };
    handleLoginSuccess(hqSession);
  };

  const handleLogout = async () => {
    const prevName = session?.fullName ?? 'User';
    const prevRole = session?.role ?? 'UNKNOWN';
    logAudit('PORTAL_LOGOUT', 'AUTH', `${prevName} (${prevRole}) logged out cleanly.`);
    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch {
        // Ignore signOut network errors in offline mode
      }
    }
    setSession(null);
    setSuperAdminHubFilter('ALL');
    setMobileMenuOpen(false);
    setSurface('PUBLIC_WEBSITE');
  };

  // Core Business Actions (all Firestore sync calls kept strictly outside setState updaters!)
  const handleCreateBooking = (payload: {
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
  }): Order => {
    const num = 2608 + orders.length;
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const now = new Date().toISOString();
    const estFee = calculateOrderBill({
      weightKg: 0,
      hubId: payload.hubId,
      fulfillmentType: payload.fulfillmentType,
      pricingRules,
      discountSlabs,
    }).deliveryFee;

    const newOrder: Order = {
      orderId: `ord_${num}`,
      orderNumber: `IW-${num}`,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      customerAddress: payload.customerAddress,
      customerLat: payload.latitude,
      customerLng: payload.longitude,
      hubId: payload.hubId,
      riderId: '',
      riderName: 'Unassigned',
      bagQrCode: '',
      fulfillmentType: payload.fulfillmentType,
      paymentMethod: payload.paymentMethod,
      paymentStatus:
        payload.paymentMethod === PaymentMethod.ONLINE_PREPAID
          ? PaymentStatus.PAID
          : PaymentStatus.PENDING,
      weightKg: 0,
      garmentCount: 0,
      isWeightLocked: false,
      weightLockHash: '',
      grossAmount: 0,
      discountPercent: 0,
      discountAmount: 0,
      deliveryFee: estFee,
      finalPayable: 0,
      deliveryOtp: otp,
      status: OrderStatus.PICKUP_REQUESTED,
      elapsedMinutes: 1,
      serviceName: payload.serviceName,
      createdAt: now,
      updatedAt: now,
    };

    setOrders((prev) => [newOrder, ...prev]);
    logAudit('ORDER_CREATED', 'ORDER', `Customer ${payload.customerName} booked 10-min pickup ${newOrder.orderNumber}.`);
    void syncOrderToFirestore(newOrder).catch(() => undefined);
    return newOrder;
  };

  const handleDispatchRider = (orderId: string, riderId: string) => {
    const rider = riders.find((r) => r.riderId === riderId);
    const target = orders.find((o) => o.orderId === orderId);
    if (!rider || !target) return;

    const updated: Order = {
      ...target,
      riderId: rider.riderId,
      riderName: rider.name,
      status: OrderStatus.RIDER_ASSIGNED,
      updatedAt: new Date().toISOString(),
    };
    setOrders((prev) => prev.map((o) => (o.orderId === orderId ? updated : o)));
    setRiders((prev) =>
      prev.map((r) =>
        r.riderId === riderId ? { ...r, status: 'EN_ROUTE_PICKUP', activeOrderId: orderId } : r
      )
    );
    logAudit('RIDER_ASSIGNED', 'ORDER', `Dispatched ${rider.name} to order ${updated.orderNumber}.`);
    void syncOrderToFirestore(updated).catch(() => undefined);
  };

  const handleLockDoorstepWeight = (payload: {
    orderId: string;
    weightKg: number;
    garmentCount: number;
    bagQrCode: string;
    scalePhotoUrl: string;
    offlineMode: boolean;
  }) => {
    const target = orders.find((o) => o.orderId === payload.orderId);
    if (!target) return { ok: false, error: 'Order not found.' };
    if (target.isWeightLocked) {
      return { ok: false, error: 'Weight is already cryptographically locked.' };
    }

    const now = new Date().toISOString();
    const lockHash = computeWeightLockHash({
      orderId: target.orderId,
      weightKg: payload.weightKg,
      garmentCount: payload.garmentCount,
      bagQrCode: payload.bagQrCode,
      timestamp: now,
    });

    if (payload.offlineMode) {
      const queuedItem: OfflineWeightQueueItem = {
        queueId: `off_${Date.now()}`,
        orderId: target.orderId,
        orderNumber: target.orderNumber,
        weightKg: payload.weightKg,
        garmentCount: payload.garmentCount,
        bagQrCode: payload.bagQrCode,
        localHash: lockHash,
        capturedAt: now,
        isSynced: false,
      };
      setOfflineQueue((prev) => [queuedItem, ...prev]);
      logAudit('OFFLINE_WEIGHT_QUEUED', 'ORDER', `Signed offline weight payload for ${target.orderNumber} (${payload.weightKg} Kg).`);
      return { ok: true, hash: lockHash, queued: true };
    }

    const bill = calculateOrderBill({
      weightKg: payload.weightKg,
      hubId: target.hubId,
      fulfillmentType: target.fulfillmentType,
      pricingRules,
      discountSlabs,
    });

    const updatedOrder: Order = {
      ...target,
      weightKg: payload.weightKg,
      garmentCount: payload.garmentCount,
      bagQrCode: payload.bagQrCode,
      scalePhotoUrl: payload.scalePhotoUrl,
      isWeightLocked: true,
      weightLockedAt: now,
      weightLockHash: lockHash,
      grossAmount: bill.grossAmount,
      discountPercent: bill.discountPercent,
      discountAmount: bill.discountAmount,
      deliveryFee: bill.deliveryFee,
      finalPayable: bill.finalPayable,
      status: OrderStatus.WEIGHED_AND_LOCKED,
      updatedAt: now,
    };

    setOrders((prev) => prev.map((o) => (o.orderId === target.orderId ? updatedOrder : o)));
    logAudit(
      'WEIGHT_LOCKED',
      'ORDER',
      `Locked ${target.orderNumber} at ${payload.weightKg.toFixed(2)} Kg (Bag ${payload.bagQrCode}, Net ₹${bill.finalPayable.toFixed(2)}).`
    );
    void syncOrderToFirestore(updatedOrder).catch(() => undefined);
    return { ok: true, hash: lockHash, queued: false };
  };

  const handleSyncOfflineQueue = (): number => {
    const unsynced = offlineQueue.filter((q) => !q.isSynced);
    if (unsynced.length === 0) return 0;

    const updatedOrdersMap = new Map<string, Order>();
    for (const item of unsynced) {
      const target = orders.find((o) => o.orderId === item.orderId);
      if (!target || target.isWeightLocked) continue;
      const bill = calculateOrderBill({
        weightKg: item.weightKg,
        hubId: target.hubId,
        fulfillmentType: target.fulfillmentType,
        pricingRules,
        discountSlabs,
      });
      const updatedOrder: Order = {
        ...target,
        weightKg: item.weightKg,
        garmentCount: item.garmentCount,
        bagQrCode: item.bagQrCode,
        isWeightLocked: true,
        weightLockedAt: item.capturedAt,
        weightLockHash: item.localHash,
        grossAmount: bill.grossAmount,
        discountPercent: bill.discountPercent,
        discountAmount: bill.discountAmount,
        deliveryFee: bill.deliveryFee,
        finalPayable: bill.finalPayable,
        status: OrderStatus.WEIGHED_AND_LOCKED,
        updatedAt: new Date().toISOString(),
      };
      updatedOrdersMap.set(target.orderId, updatedOrder);
    }

    if (updatedOrdersMap.size > 0) {
      setOrders((prev) => prev.map((o) => updatedOrdersMap.get(o.orderId) ?? o));
      for (const updated of updatedOrdersMap.values()) {
        void syncOrderToFirestore(updated).catch(() => undefined);
      }
    }

    setOfflineQueue((prev) => prev.map((q) => ({ ...q, isSynced: true })));
    logAudit('OFFLINE_QUEUE_SYNCED', 'ORDER', `Verified and synced ${unsynced.length} queued doorstep weight payload(s).`);
    return unsynced.length;
  };

  const handleAdvanceOrderStatus = (orderId: string, nextStatus: OrderStatus) => {
    const target = orders.find((o) => o.orderId === orderId);
    if (!target) return;
    const updated: Order = {
      ...target,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
    setOrders((prev) => prev.map((o) => (o.orderId === orderId ? updated : o)));
    logAudit('PIPELINE_ADVANCED', 'ORDER', `Advanced order ${updated.orderNumber} to ${nextStatus}.`);
    void syncOrderToFirestore(updated).catch(() => undefined);
  };

  const handleOverrideWeight = (orderId: string, newWeightKg: number, reason: string) => {
    if (!session || (session.role !== 'SUPER_ADMIN' && !session.permissions.weightOverride)) {
      return { ok: false, error: 'You do not have permission to override locked weights.' };
    }
    const target = orders.find((o) => o.orderId === orderId);
    if (!target) return { ok: false, error: 'Order not found.' };
    const check = validateWeightOverride({
      order: target,
      newWeightKg,
      reason,
      actorRole: activeActorRole,
    });
    if (!check.valid) return { ok: false, error: check.error };

    const bill = calculateOrderBill({
      weightKg: newWeightKg,
      hubId: target.hubId,
      fulfillmentType: target.fulfillmentType,
      pricingRules,
      discountSlabs,
    });

    const now = new Date().toISOString();
    const newHash = computeWeightLockHash({
      orderId: target.orderId,
      weightKg: newWeightKg,
      garmentCount: target.garmentCount,
      bagQrCode: target.bagQrCode,
      timestamp: now,
    });

    const updatedOrder: Order = {
      ...target,
      weightKg: newWeightKg,
      grossAmount: bill.grossAmount,
      discountPercent: bill.discountPercent,
      discountAmount: bill.discountAmount,
      deliveryFee: bill.deliveryFee,
      finalPayable: bill.finalPayable,
      weightLockHash: newHash,
      isCorrectedByManager: true,
      updatedAt: now,
    };

    const auditEntry: WeightAuditLog = {
      logId: `wal_${Date.now()}`,
      orderId: target.orderId,
      orderNumber: target.orderNumber,
      oldWeight: target.weightKg,
      newWeight: newWeightKg,
      oldPayable: target.finalPayable,
      newPayable: bill.finalPayable,
      changedByRole: session.role === 'FRANCHISE_PARTNER' ? 'FRANCHISE_PARTNER' : 'SUPER_ADMIN',
      changedByName: activeActorName,
      reason,
      createdAt: now,
    };

    setOrders((prev) => prev.map((o) => (o.orderId === orderId ? updatedOrder : o)));
    setWeightAuditLogs((prev) => [auditEntry, ...prev]);
    logAudit(
      'WEIGHT_OVERRIDE',
      'WEIGHT_AUDIT_LOG',
      `Revised ${target.orderNumber} from ${target.weightKg.toFixed(2)} Kg to ${newWeightKg.toFixed(2)} Kg: "${reason}".`
    );
    void syncOrderToFirestore(updatedOrder).catch(() => undefined);
    void syncWeightAuditToFirestore(auditEntry).catch(() => undefined);
    return { ok: true };
  };

  const handleCompleteDeliveryOtp = (payload: {
    orderId: string;
    otp: string;
    collectionMode: 'CASH' | 'RIDER_UPI_QR';
  }) => {
    const target = orders.find((o) => o.orderId === payload.orderId);
    if (!target) return { ok: false, error: 'Order not found.' };
    if (payload.otp !== target.deliveryOtp) {
      return { ok: false, error: 'Incorrect 4-digit Delivery Security OTP.' };
    }
    const now = new Date().toISOString();
    const updatedOrder: Order = {
      ...target,
      status: OrderStatus.DELIVERED_AND_SETTLED,
      paymentStatus: PaymentStatus.PAID,
      updatedAt: now,
    };
    setOrders((prev) => prev.map((o) => (o.orderId === target.orderId ? updatedOrder : o)));

    if (target.paymentMethod !== PaymentMethod.ONLINE_PREPAID) {
      const ledgerEntry: RiderPodLedgerEntry = {
        entryId: `pod_${Date.now()}`,
        riderId: target.riderId || 'rid_bbk_01',
        riderName: target.riderName || 'Field Rider',
        hubId: target.hubId,
        orderId: target.orderId,
        orderNumber: target.orderNumber,
        collectionMode: payload.collectionMode,
        amountCollected: target.finalPayable,
        settlementStatus: 'UNSETTLED',
        createdAt: now,
      };
      setPodLedger((prev) => [ledgerEntry, ...prev]);
      void syncPodLedgerToFirestore(ledgerEntry).catch(() => undefined);
    }

    logAudit(
      'DELIVERED_AND_SETTLED',
      'ORDER',
      `Verified OTP for ${target.orderNumber}. Collected ₹${target.finalPayable.toFixed(2)} via ${payload.collectionMode}.`
    );
    void syncOrderToFirestore(updatedOrder).catch(() => undefined);
    return { ok: true };
  };

  const handleCancelOrder = (orderId: string) => {
    const target = orders.find((o) => o.orderId === orderId);
    if (!target) return { ok: false, error: 'Order not found.' };
    if (target.isWeightLocked) {
      return {
        ok: false,
        error: 'Post-weighing cancellation is locked. Hub Manager authorization is required.',
      };
    }
    const updated: Order = {
      ...target,
      status: OrderStatus.CANCELLED,
      updatedAt: new Date().toISOString(),
    };
    setOrders((prev) => prev.map((o) => (o.orderId === orderId ? updated : o)));
    logAudit('ORDER_CANCELLED', 'ORDER', `Cancelled ${target.orderNumber} prior to weighing.`);
    void syncOrderToFirestore(updated).catch(() => undefined);
    return { ok: true };
  };

  const handleSettlePodEntry = (entryId: string) => {
    const target = podLedger.find((e) => e.entryId === entryId);
    if (!target || target.settlementStatus === 'SETTLED_WITH_HUB') return;
    const now = new Date().toISOString();
    const settled: RiderPodLedgerEntry = {
      ...target,
      settlementStatus: 'SETTLED_WITH_HUB',
      settledWithAdmin: activeActorName,
      settledAt: now,
    };
    setPodLedger((prev) => prev.map((e) => (e.entryId === entryId ? settled : e)));
    logAudit('POD_SETTLED', 'RIDER_POD_LEDGER', `Verified and settled rider POD ledger entry ${entryId}.`);
    void syncPodLedgerToFirestore(settled).catch(() => undefined);
  };

  const handleSettleAllForRider = (riderId: string) => {
    const now = new Date().toISOString();
    const toSettle = podLedger.filter(
      (e) => e.riderId === riderId && e.settlementStatus === 'UNSETTLED'
    );
    if (toSettle.length === 0) return;
    const settledMap = new Map<string, RiderPodLedgerEntry>(
      toSettle.map((e) => [
        e.entryId,
        {
          ...e,
          settlementStatus: 'SETTLED_WITH_HUB',
          settledWithAdmin: activeActorName,
          settledAt: now,
        },
      ])
    );
    setPodLedger((prev) => prev.map((e) => settledMap.get(e.entryId) ?? e));
    logAudit('EOD_RIDER_SETTLED', 'RIDER_POD_LEDGER', `Approved End-of-Day cash reconciliation for rider ${riderId}.`);
    for (const settled of settledMap.values()) {
      void syncPodLedgerToFirestore(settled).catch(() => undefined);
    }
  };

  const handleSavePricingRule = (rule: PricingRule) => {
    if (session?.role !== 'SUPER_ADMIN') return;
    setPricingRules((prev) => {
      const exists = prev.some((r) => r.hubId === rule.hubId);
      return exists ? prev.map((r) => (r.hubId === rule.hubId ? rule : r)) : [...prev, rule];
    });
    logAudit('PRICING_UPDATED', 'PRICING_RULE', `Updated ${rule.hubId} pricing: ₹${rule.ratePerKg}/Kg, Home ₹${rule.homeDeliveryFee}.`);
    void syncPricingRuleToFirestore(rule).catch(() => undefined);
  };

  const handleSaveDiscountSlabs = (nextSlabs: DiscountSlab[]) => {
    if (session?.role !== 'SUPER_ADMIN') return;
    setDiscountSlabs(nextSlabs);
    logAudit('DISCOUNT_SLABS_UPDATED', 'DISCOUNT_SLAB', `Updated discount tier matrix (${nextSlabs.length} configured brackets).`);
    for (const s of nextSlabs) {
      void syncDiscountSlabToFirestore(s).catch(() => undefined);
    }
  };

  const handleSaveHub = (hub: Hub) => {
    if (session?.role !== 'SUPER_ADMIN') return;
    setHubs((prev) => {
      const exists = prev.some((h) => h.hubId === hub.hubId);
      return exists ? prev.map((h) => (h.hubId === hub.hubId ? hub : h)) : [...prev, hub];
    });
    logAudit('HUB_CONFIGURED', 'HUB', `Saved hub ${hub.name} (${hub.geofenceRadiusKm} km, ${hub.partnerSharePercent}/${hub.royaltyPercent} split).`);
    void syncHubToFirestore(hub).catch(() => undefined);
  };

  // Running Banners CRUD (Super Admin or explicitly delegated)
  const handleSaveBanner = (banner: RunningBanner) => {
    if (!session || (session.role !== 'SUPER_ADMIN' && !session.permissions.bannerAds)) return;
    setBanners((prev) => {
      const exists = prev.some((b) => b.bannerId === banner.bannerId);
      return exists ? prev.map((b) => (b.bannerId === banner.bannerId ? banner : b)) : [banner, ...prev];
    });
    logAudit('BANNER_SAVED', 'RUNNING_BANNER', `Published running banner "${banner.title}" for ${banner.placement}.`);
    void syncBannerToFirestore(banner).catch(() => undefined);
  };

  const handleToggleBanner = (bannerId: string) => {
    if (!session || (session.role !== 'SUPER_ADMIN' && !session.permissions.bannerAds)) return;
    const target = banners.find((b) => b.bannerId === bannerId);
    if (!target) return;
    const updated: RunningBanner = {
      ...target,
      isActive: !target.isActive,
      updatedAt: new Date().toISOString(),
    };
    setBanners((prev) => prev.map((b) => (b.bannerId === bannerId ? updated : b)));
    logAudit('BANNER_TOGGLED', 'RUNNING_BANNER', `${updated.isActive ? 'Activated' : 'Paused'} banner "${updated.title}".`);
    void syncBannerToFirestore(updated).catch(() => undefined);
  };

  const handleDeleteBanner = (bannerId: string) => {
    if (!session || (session.role !== 'SUPER_ADMIN' && !session.permissions.bannerAds)) return;
    const target = banners.find((b) => b.bannerId === bannerId);
    setBanners((prev) => prev.filter((b) => b.bannerId !== bannerId));
    logAudit('BANNER_DELETED', 'RUNNING_BANNER', `Deleted running banner "${target?.title ?? bannerId}".`);
    void deleteBannerFromFirestore(bannerId).catch(() => undefined);
  };

  // Staff & Franchise Accounts CRUD with strict own-branch enforcement
  const handleImportStaffBatch = (newAccounts: StaffAccount[]) => {
    if (!session) return;
    const safeAccounts =
      session.role === 'SUPER_ADMIN'
        ? newAccounts
        : newAccounts.filter(
            (a) =>
              a.hubId === session.allottedHubId &&
              a.role !== 'SUPER_ADMIN' &&
              a.role !== 'FRANCHISE_PARTNER'
          );
    if (safeAccounts.length === 0) return;
    setStaffAccounts((prev) => [...safeAccounts, ...prev]);
    logAudit(
      'EXCEL_STAFF_IMPORT',
      'STAFF_ACCOUNT',
      `Imported ${safeAccounts.length} allotted login account(s) via Excel bulk upload.`
    );
    for (const acc of safeAccounts) {
      void syncStaffAccountToFirestore(acc).catch(() => undefined);
    }
  };

  const handleAddSingleStaff = (account: StaffAccount) => {
    if (!session) return;
    if (
      session.role !== 'SUPER_ADMIN' &&
      (account.hubId !== session.allottedHubId ||
        account.role === 'SUPER_ADMIN' ||
        account.role === 'FRANCHISE_PARTNER')
    ) {
      return;
    }
    setStaffAccounts((prev) => [account, ...prev]);
    logAudit('STAFF_CREATED', 'STAFF_ACCOUNT', `Allotted login account ${account.loginId} (${account.role}) for hub ${account.hubId}.`);
    void syncStaffAccountToFirestore(account).catch(() => undefined);
  };

  const handleUpdateStaffAccount = (updated: StaffAccount) => {
    if (!session) return;
    if (
      session.role !== 'SUPER_ADMIN' &&
      (updated.hubId !== session.allottedHubId || updated.role === 'SUPER_ADMIN')
    ) {
      return;
    }
    setStaffAccounts((prev) => prev.map((s) => (s.staffId === updated.staffId ? updated : s)));
    logAudit(
      'STAFF_PERMISSIONS_UPDATED',
      'STAFF_ACCOUNT',
      `Updated account ${updated.loginId} (${updated.role}, hub ${updated.hubId}).`
    );
    void syncStaffAccountToFirestore(updated).catch(() => undefined);
  };

  const handleToggleStaffStatus = (staffId: string) => {
    if (!session) return;
    const target = staffAccounts.find((s) => s.staffId === staffId);
    if (!target) return;
    if (
      session.role !== 'SUPER_ADMIN' &&
      (target.hubId !== session.allottedHubId ||
        target.role === 'SUPER_ADMIN' ||
        target.role === 'FRANCHISE_PARTNER')
    ) {
      return;
    }
    const updated: StaffAccount = {
      ...target,
      status: target.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
    };
    setStaffAccounts((prev) => prev.map((s) => (s.staffId === staffId ? updated : s)));
    logAudit(
      'STAFF_STATUS_CHANGED',
      'STAFF_ACCOUNT',
      `Set ${updated.loginId} status to ${updated.status}.`
    );
    void syncStaffAccountToFirestore(updated).catch(() => undefined);
  };

  const handleSaveProduct = (product: ProductFormula) => {
    setProducts((prev) => {
      const exists = prev.some((p) => p.productId === product.productId);
      return exists ? prev.map((p) => (p.productId === product.productId ? product : p)) : [product, ...prev];
    });
    logAudit('PRODUCT_FORMULA_SAVED', 'PRODUCT', `Saved product making formula ${product.sku} (${product.name}).`);
    void syncProductToFirestore(product).catch(() => undefined);
  };

  const handleDeleteProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.productId !== productId));
    logAudit('PRODUCT_DELETED', 'PRODUCT', `Removed product formula ${productId}.`);
  };

  const handleRunProductionBatch = (payload: {
    productId: string;
    hubId: string;
    quantityProduced: number;
  }) => {
    const product = products.find((p) => p.productId === payload.productId);
    if (!product) return;
    const targetHubId =
      session && session.role !== 'SUPER_ADMIN' ? session.allottedHubId : payload.hubId;
    const metrics = computeProductMakingMetrics(product.materials, product.sellingPrice);
    const totalCost = Number((metrics.unitMakingCost * payload.quantityProduced).toFixed(2));
    const batch: ProductionBatch = {
      batchId: `bch_${Date.now()}`,
      batchCode: `BATCH-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${batches.length + 1}`,
      productId: product.productId,
      productName: product.name,
      hubId: targetHubId,
      quantityProduced: payload.quantityProduced,
      unitMakingCost: metrics.unitMakingCost,
      totalCost,
      status: 'QC_PASSED',
      createdBy: activeActorName,
      createdAt: new Date().toISOString(),
    };

    const updatedProduct = {
      ...product,
      stockUnits: product.stockUnits + payload.quantityProduced,
      updatedAt: new Date().toISOString(),
    };

    setBatches((prev) => [batch, ...prev]);
    setProducts((prev) => prev.map((p) => (p.productId === product.productId ? updatedProduct : p)));
    logAudit(
      'PRODUCTION_BATCH_RUN',
      'PRODUCTION_BATCH',
      `Produced ${payload.quantityProduced} units of ${product.sku} (Batch ${batch.batchCode}, Cost ₹${totalCost.toFixed(2)}).`
    );
    void syncProductionBatchToFirestore(batch).catch(() => undefined);
    void syncProductToFirestore(updatedProduct).catch(() => undefined);
  };

  // 1. Public Website Surface (Default when logged out, or when Super Admin previews public site)
  if (surface === 'PUBLIC_WEBSITE') {
    return (
      <PublicWebsiteView
        hubs={hubs}
        orders={orders}
        riders={riders}
        pricingRules={pricingRules}
        discountSlabs={discountSlabs}
        products={products}
        promos={promos}
        banners={banners}
        waitlist={waitlist}
        onOpenLogin={() => {
          if (session) {
            setSurface('PORTAL');
          } else {
            setSurface('LOGIN');
          }
        }}
        onCreateBooking={handleCreateBooking}
        onCancelOrder={handleCancelOrder}
        onJoinWaitlist={(entry) => {
          setWaitlist((prev) => [
            { ...entry, waitlistId: `wl_${Date.now()}`, createdAt: new Date().toISOString() },
            ...prev,
          ]);
          logAudit('WAITLIST_JOINED', 'WAITLIST', `${entry.customerName} requested expansion near ${entry.nearestHubName}.`);
        }}
      />
    );
  }

  // 2. Unified Login & Customer Registration Page (Hard auth gate — no ID/Password, no access!)
  if (surface === 'LOGIN' || !session) {
    return (
      <PortalLoginScreen
        hubs={hubs}
        staffAccounts={staffAccounts}
        customerAccounts={customerAccounts}
        onLoginSuccess={handleLoginSuccess}
        onCustomerRegister={handleCustomerRegister}
        onGoogleSuperAdminSignIn={handleGoogleSuperAdminSignIn}
        onBackToWebsite={() => setSurface('PUBLIC_WEBSITE')}
        firebaseUserEmail={firebaseUserEmail}
      />
    );
  }

  // 3. Separate Dedicated Customer Panel (when logged in as a registered Customer)
  if (session.role === 'CUSTOMER') {
    const customerOrders = orders.filter(
      (o) =>
        o.customerName.toLowerCase() === session.fullName.toLowerCase() ||
        (session.phone && o.customerPhone === session.phone)
    );
    return (
      <div className="min-h-screen bg-[#F7F8FA] text-slate-900 flex flex-col">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-display text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
                InstaWash
              </span>
              <span className="text-slate-300">/</span>
              <h1 className="text-sm font-bold text-slate-800 truncate">
                Customer Panel
              </h1>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:block text-right">
                <div className="text-xs font-semibold text-slate-900">{session.fullName}</div>
                <div className="text-[11px] font-mono text-slate-500">{session.loginId}</div>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                Logout
              </button>
            </div>
          </div>
          <RunningBannerBar
            banners={banners}
            surface="PUBLIC_WEBSITE"
            hubId="ALL"
            hubs={hubs}
          />
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Welcome, {session.fullName}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Customer ID <span className="font-mono text-slate-700">{session.staffId}</span> · Saved Address: {session.address || 'Barabanki'}
              </p>
            </div>
            <div className="text-xs font-mono text-slate-600 tabular-nums">
              Your Active / Past Orders: <strong className="text-slate-900">{customerOrders.length}</strong>
            </div>
          </div>

          <CustomerBookingView
            hubs={hubs}
            orders={customerOrders.length > 0 ? customerOrders : orders}
            riders={riders}
            pricingRules={pricingRules}
            discountSlabs={discountSlabs}
            products={products}
            promos={promos}
            waitlist={waitlist}
            customerProfile={{
              fullName: session.fullName,
              phone: session.phone ?? '+91-98000-00000',
              address: session.address ?? 'Civil Lines, Barabanki',
            }}
            onCreateBooking={handleCreateBooking}
            onCancelOrder={handleCancelOrder}
            onJoinWaitlist={(entry) => {
              setWaitlist((prev) => [
                { ...entry, waitlistId: `wl_${Date.now()}`, createdAt: new Date().toISOString() },
                ...prev,
              ]);
              logAudit('WAITLIST_JOINED', 'WAITLIST', `${entry.customerName} requested expansion near ${entry.nearestHubName}.`);
            }}
          />
        </main>
      </div>
    );
  }

  // 4. Authenticated Enterprise ERP Portal (Super Admin HQ, Franchise Partner, Hub Operator, Field Rider)
  const allottedHubObj =
    session.allottedHubId === 'ALL'
      ? null
      : hubs.find((h) => h.hubId === session.allottedHubId) ?? null;

  const activeNavMeta = visibleNavItems.find((n) => n.id === activeModule) ?? visibleNavItems[0];
  const effectiveModule = canAccessModule(session, activeModule)
    ? activeModule
    : visibleNavItems[0]?.id ?? ActiveModule.OVERVIEW;

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0F172A] text-slate-200">
      <div className="px-5 h-16 flex items-center justify-between border-b border-slate-800">
        <div className="min-w-0">
          <span className="font-display text-lg font-extrabold tracking-tight text-white whitespace-nowrap block">
            InstaWash
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 block truncate">
            {session.role === 'SUPER_ADMIN'
              ? 'Super Admin HQ'
              : allottedHubObj
                ? `${allottedHubObj.code} · ${allottedHubObj.city}`
                : ROLE_LABELS[session.role]}
          </span>
        </div>
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Primary ERP navigation">
        {(['Operations', 'Enterprise', 'Governance'] as const).map((section) => {
          const items = visibleNavItems.filter((item) => item.section === section);
          if (items.length === 0) return null;
          return (
            <div key={section} className="space-y-1">
              <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {section}
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = effectiveModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveModule(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                      isActive
                        ? 'bg-[#0284C7] text-white font-semibold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom Authenticated Profile & Logout */}
      <div className="p-3 border-t border-slate-800 space-y-2">
        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/70">
          <img
            src={OPS_DIRECTOR_AVATAR}
            alt="User avatar"
            className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-700"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white truncate">
              {session.fullName}
            </div>
            <div className="text-[10px] font-mono text-slate-400 truncate">
              {ROLE_LABELS[session.role]}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-rose-700 hover:text-white rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          Logout Session
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F7F8FA] text-slate-900">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 fixed inset-y-0 left-0 z-30 border-r border-slate-800">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 shrink-0 h-full">{renderSidebarContent()}</div>
          <button
            type="button"
            aria-label="Close backdrop"
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 bg-slate-950/50"
          />
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        {/* Top Utility Header Bar */}
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 font-medium hidden sm:inline whitespace-nowrap">
                InstaWash ERP
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-bold text-slate-900 truncate">
                {activeNavMeta?.label ?? 'Workspace'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Location Isolation Indicator (Super Admin Hub Filter vs Locked Franchise Branch) */}
            {session.role === 'SUPER_ADMIN' ? (
              <div className="hidden md:flex items-center gap-2">
                <select
                  aria-label="Super Admin hub scope"
                  value={superAdminHubFilter}
                  onChange={(e) => setSuperAdminHubFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-800"
                >
                  <option value="ALL">All Locations ({hubs.length} Hubs)</option>
                  {hubs.map((h) => (
                    <option key={h.hubId} value={h.hubId}>
                      {h.name} ({h.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSurface('PUBLIC_WEBSITE')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                  Public Website
                </button>
              </div>
            ) : (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-sky-900 bg-sky-50 border border-sky-200 rounded-lg whitespace-nowrap">
                <Building2 className="w-3.5 h-3.5 text-sky-700" aria-hidden="true" />
                <span>
                  {allottedHubObj ? `${allottedHubObj.code} · ${allottedHubObj.city}` : session.allottedHubId}
                </span>
                <Lock className="w-3 h-3 text-sky-600" aria-hidden="true" />
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              Logout
            </button>
          </div>
        </header>

        {/* Live Franchise Portal Running Banner Bar (for Franchise & Branch Staff) */}
        {session.role !== 'SUPER_ADMIN' && (
          <RunningBannerBar
            banners={banners}
            surface="FRANCHISE_PORTAL"
            hubId={session.allottedHubId}
            hubs={hubs}
            onBannerAction={() => {
              if (canAccessModule(session, ActiveModule.FINANCE)) {
                setActiveModule(ActiveModule.FINANCE);
              }
            }}
          />
        )}

        {/* Active Module Workspace */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {effectiveModule === ActiveModule.OVERVIEW && (
            <OverviewFleetView
              hubs={scopedData.hubs}
              orders={scopedData.orders}
              riders={scopedData.riders}
              pricingRules={pricingRules}
              podLedger={scopedData.podLedger}
              selectedHubFilter={scopedData.effectiveHubFilter}
              onSelectHubFilter={(hubId) => {
                if (session.role === 'SUPER_ADMIN') {
                  setSuperAdminHubFilter(hubId);
                }
              }}
              onNavigate={setActiveModule}
              onDispatchRider={handleDispatchRider}
            />
          )}

          {effectiveModule === ActiveModule.KANBAN && (
            <WashFloorKanbanView
              orders={scopedData.orders}
              hubs={scopedData.hubs}
              pricingRules={pricingRules}
              discountSlabs={discountSlabs}
              activeRole={activeActorRole}
              selectedHubFilter={scopedData.effectiveHubFilter}
              onAdvanceOrderStatus={handleAdvanceOrderStatus}
              onOverrideWeight={handleOverrideWeight}
            />
          )}

          {effectiveModule === ActiveModule.CUSTOMER_PORTAL && (
            <CustomerBookingView
              hubs={scopedData.hubs}
              orders={scopedData.orders}
              riders={scopedData.riders}
              pricingRules={pricingRules}
              discountSlabs={discountSlabs}
              products={products}
              promos={promos}
              waitlist={waitlist}
              onCreateBooking={handleCreateBooking}
              onCancelOrder={handleCancelOrder}
              onJoinWaitlist={(entry) => {
                setWaitlist((prev) => [
                  { ...entry, waitlistId: `wl_${Date.now()}`, createdAt: new Date().toISOString() },
                  ...prev,
                ]);
                logAudit('WAITLIST_JOINED', 'WAITLIST', `${entry.customerName} requested expansion near ${entry.nearestHubName}.`);
              }}
            />
          )}

          {effectiveModule === ActiveModule.RIDER_CONSOLE && (
            <RiderDispatchView
              orders={scopedData.orders}
              riders={scopedData.riders}
              hubs={scopedData.hubs}
              pricingRules={pricingRules}
              discountSlabs={discountSlabs}
              offlineQueue={offlineQueue}
              onAcceptPickup={handleDispatchRider}
              onLockDoorstepWeight={handleLockDoorstepWeight}
              onSyncOfflineQueue={handleSyncOfflineQueue}
              onCompleteDeliveryOtp={handleCompleteDeliveryOtp}
            />
          )}

          {effectiveModule === ActiveModule.FINANCE && (
            <FinanceLedgerView
              hubs={scopedData.hubs}
              orders={scopedData.orders}
              podLedger={scopedData.podLedger}
              activeRole={activeActorRole}
              selectedHubFilter={scopedData.effectiveHubFilter}
              onSettlePodEntry={handleSettlePodEntry}
              onSettleAllForRider={handleSettleAllForRider}
            />
          )}

          {effectiveModule === ActiveModule.PRODUCT_MAKING && (
            <ProductMakingView
              products={products}
              batches={scopedData.batches}
              hubs={scopedData.hubs}
              onSaveProduct={handleSaveProduct}
              onDeleteProduct={handleDeleteProduct}
              onRunProductionBatch={handleRunProductionBatch}
            />
          )}

          {effectiveModule === ActiveModule.BANNERS_CMS && (
            <BannerAdsCmsView
              banners={banners}
              hubs={hubs}
              onSaveBanner={handleSaveBanner}
              onToggleBanner={handleToggleBanner}
              onDeleteBanner={handleDeleteBanner}
            />
          )}

          {effectiveModule === ActiveModule.STAFF_EXCEL && (
            <StaffExcelImportView
              session={session}
              hubs={hubs}
              staffAccounts={scopedData.staffAccounts}
              onImportStaffBatch={handleImportStaffBatch}
              onAddSingleStaff={handleAddSingleStaff}
              onUpdateStaffAccount={handleUpdateStaffAccount}
              onToggleStaffStatus={handleToggleStaffStatus}
            />
          )}

          {effectiveModule === ActiveModule.CONFIG_ENGINE && session.role === 'SUPER_ADMIN' && (
            <DynamicConfigView
              hubs={hubs}
              pricingRules={pricingRules}
              discountSlabs={discountSlabs}
              workflowStages={workflowStages}
              promos={promos}
              onSavePricingRule={handleSavePricingRule}
              onSaveDiscountSlabs={handleSaveDiscountSlabs}
              onSaveHub={handleSaveHub}
              onSaveWorkflowStages={(next) => {
                setWorkflowStages(next);
                logAudit('WORKFLOW_UPDATED', 'WORKFLOW', 'Updated canonical workflow stage labels and SLA timers.');
              }}
              onSavePromos={(nextPromos) => {
                setPromos(nextPromos);
                logAudit('PROMO_UPDATED', 'PROMO', 'Updated promotional campaigns in Dynamic Config Engine.');
              }}
            />
          )}

          {effectiveModule === ActiveModule.AUDIT_TRAIL && session.role === 'SUPER_ADMIN' && (
            <AuditBlueprintView
              auditEvents={auditEvents}
              weightAuditLogs={weightAuditLogs}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ErpWorkspace />
    </ErrorBoundary>
  );
}
