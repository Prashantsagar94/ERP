import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateUnifiedAccount,
  calculateOrderBill,
  canAccessModule,
  computeFranchiseSettlement,
  computeProductMakingMetrics,
  computeWeightLockHash,
  getDefaultPermissionsForRole,
  getNextKanbanStage,
  hashStaffPassword,
  haversineKm,
  resolveActiveBannersForSurface,
  scopeEntitiesBySession,
  validateBulkStaffRows,
  validatePointInHubs,
  validateWeightOverride,
  verifyStaffPassword,
} from './erpEngine';
import {
  ActiveModule,
  CustomerAccount,
  DiscountSlab,
  FranchiseTier,
  FulfillmentType,
  Hub,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PricingRule,
  RunningBanner,
  StaffAccount,
} from '../types/erp';

const testHubs: Hub[] = [
  {
    hubId: 'hub_bbk',
    code: 'BBK-01',
    name: 'Barabanki Central Hub',
    city: 'Barabanki',
    latitude: 26.9258,
    longitude: 81.1916,
    geofenceRadiusKm: 2.5,
    franchiseTier: FranchiseTier.STANDARD_HUB,
    partnerSharePercent: 80,
    royaltyPercent: 20,
    openHours: '07:00 - 22:00',
    isActive: true,
  },
  {
    hubId: 'hub_ayd',
    code: 'AYD-01',
    name: 'Ayodhya Express Hub',
    city: 'Ayodhya',
    latitude: 26.7922,
    longitude: 82.1998,
    geofenceRadiusKm: 2.5,
    franchiseTier: FranchiseTier.EXPRESS_MICRO,
    partnerSharePercent: 75,
    royaltyPercent: 25,
    openHours: '07:00 - 22:00',
    isActive: true,
  },
];

const testRules: PricingRule[] = [
  {
    ruleId: 'rule_global',
    hubId: 'GLOBAL',
    ratePerKg: 149,
    homeDeliveryFee: 30,
    officePickupFee: 0,
    freeDeliveryThreshold: 0,
    minOrderEnabled: false,
    minOrderKg: 1.5,
    minOrderAmount: 200,
    codEnabled: true,
    upiEnabled: true,
    cardsEnabled: true,
    maxRiderCodLimit: 15000,
    cancellationPenalty: 25,
    slaPickupAlertMinutes: 8,
    updatedAt: '2026-11-20T00:00:00Z',
  },
  {
    ruleId: 'rule_ayd',
    hubId: 'hub_ayd',
    ratePerKg: 159,
    homeDeliveryFee: 40,
    officePickupFee: 0,
    freeDeliveryThreshold: 1200,
    minOrderEnabled: true,
    minOrderKg: 2.0,
    minOrderAmount: 250,
    codEnabled: true,
    upiEnabled: true,
    cardsEnabled: true,
    maxRiderCodLimit: 12000,
    cancellationPenalty: 25,
    slaPickupAlertMinutes: 8,
    updatedAt: '2026-11-20T00:00:00Z',
  },
];

const testSlabs: DiscountSlab[] = [
  { slabId: 's1', hubId: 'GLOBAL', label: 'Base (< ₹300)', minAmount: 0, maxAmount: 299.99, discountPercent: 0, isActive: true, sortOrder: 1 },
  { slabId: 's2', hubId: 'GLOBAL', label: 'Mid Tier (₹300–₹999)', minAmount: 300, maxAmount: 999.99, discountPercent: 10, isActive: true, sortOrder: 2 },
  { slabId: 's3', hubId: 'GLOBAL', label: 'Bulk Saver (≥ ₹1,000)', minAmount: 1000, maxAmount: 999999, discountPercent: 30, isActive: true, sortOrder: 3 },
];

test('Dynamic billing engine computes 0%, 10%, and 30% discount slabs accurately', () => {
  // 1.5 Kg * 149 = 223.50 -> 0% discount + 30 home delivery = 253.50
  const low = calculateOrderBill({
    weightKg: 1.5,
    hubId: 'hub_bbk',
    fulfillmentType: FulfillmentType.HOME_DELIVERY,
    pricingRules: testRules,
    discountSlabs: testSlabs,
  });
  assert.equal(low.grossAmount, 223.5);
  assert.equal(low.discountPercent, 0);
  assert.equal(low.deliveryFee, 30);
  assert.equal(low.finalPayable, 253.5);

  // 3.5 Kg * 149 = 521.50 -> 10% discount (-52.15) + 0 office pickup = 469.35
  const mid = calculateOrderBill({
    weightKg: 3.5,
    hubId: 'hub_bbk',
    fulfillmentType: FulfillmentType.OFFICE_PICKUP,
    pricingRules: testRules,
    discountSlabs: testSlabs,
  });
  assert.equal(mid.grossAmount, 521.5);
  assert.equal(mid.discountPercent, 10);
  assert.equal(mid.discountAmount, 52.15);
  assert.equal(mid.deliveryFee, 0);
  assert.equal(mid.finalPayable, 469.35);

  // 7.5 Kg * 149 = 1117.50 -> 30% discount (-335.25) + 30 home delivery = 812.25
  const bulk = calculateOrderBill({
    weightKg: 7.5,
    hubId: 'hub_bbk',
    fulfillmentType: FulfillmentType.HOME_DELIVERY,
    pricingRules: testRules,
    discountSlabs: testSlabs,
  });
  assert.equal(bulk.grossAmount, 1117.5);
  assert.equal(bulk.discountPercent, 30);
  assert.equal(bulk.discountAmount, 335.25);
  assert.equal(bulk.finalPayable, 812.25);
});

test('Hub-specific pricing overrides and minimum order thresholds take precedence', () => {
  // Ayodhya hub has minOrderEnabled=true, minOrderKg=2.0, rate=159 => 1.0 kg billed as 2.0 kg = 318 (10% off = 31.8) + 40 fee = 326.20
  const ayd = calculateOrderBill({
    weightKg: 1.0,
    hubId: 'hub_ayd',
    fulfillmentType: FulfillmentType.HOME_DELIVERY,
    pricingRules: testRules,
    discountSlabs: testSlabs,
  });
  assert.equal(ayd.billableWeightKg, 2.0);
  assert.equal(ayd.ratePerKg, 159);
  assert.equal(ayd.grossAmount, 318);
  assert.equal(ayd.discountPercent, 10);
  assert.equal(ayd.finalPayable, 326.2);
});

test('Geofence validator approves inside 2.5km and rejects outside coverage', () => {
  const inside = validatePointInHubs(26.932, 81.198, testHubs);
  assert.equal(inside.inCoverage, true);
  assert.equal(inside.matchedHub?.hubId, 'hub_bbk');
  assert.ok(inside.distanceKm <= 2.5);
  assert.ok(inside.estimatedPickupMinutes >= 4 && inside.estimatedPickupMinutes <= 10);

  const outside = validatePointInHubs(26.8467, 80.9462, testHubs); // Lucknow (~26km away)
  assert.equal(outside.inCoverage, false);
  assert.equal(outside.matchedHub, null);
  assert.ok(haversineKm(26.8467, 80.9462, 26.9258, 81.1916) > 20);
});

test('Cryptographic weight lock hash is deterministic and weight override enforces role & 15+ char reason', () => {
  const h1 = computeWeightLockHash({
    orderId: 'ord_101',
    weightKg: 3.5,
    garmentCount: 12,
    bagQrCode: 'IW-BBK-901',
    timestamp: '2026-11-20T10:00:00Z',
  });
  const h2 = computeWeightLockHash({
    orderId: 'ord_101',
    weightKg: 3.5,
    garmentCount: 12,
    bagQrCode: 'iw-bbk-901',
    timestamp: '2026-11-20T10:00:00Z',
  });
  assert.equal(h1, h2);
  assert.ok(h1.startsWith('sha256:'));
  assert.equal(h1.length, 7 + 64);

  const lockedOrder: Order = {
    orderId: 'ord_101',
    orderNumber: 'IW-2601',
    customerName: 'Aarav',
    customerPhone: '+91-9811100001',
    customerAddress: 'Civil Lines',
    customerLat: 26.93,
    customerLng: 81.19,
    hubId: 'hub_bbk',
    riderId: 'rid_1',
    riderName: 'Ravi',
    bagQrCode: 'IW-BBK-901',
    fulfillmentType: FulfillmentType.HOME_DELIVERY,
    paymentMethod: PaymentMethod.POD_CASH,
    paymentStatus: PaymentStatus.PENDING,
    weightKg: 3.5,
    garmentCount: 12,
    isWeightLocked: true,
    weightLockHash: h1,
    grossAmount: 521.5,
    discountPercent: 10,
    discountAmount: 52.15,
    deliveryFee: 30,
    finalPayable: 499.35,
    deliveryOtp: '4821',
    status: OrderStatus.WEIGHED_AND_LOCKED,
    elapsedMinutes: 6,
    serviceName: 'Wash & Fold Standard',
    createdAt: '2026-11-20T10:00:00Z',
    updatedAt: '2026-11-20T10:05:00Z',
  };

  assert.equal(
    validateWeightOverride({ order: lockedOrder, newWeightKg: 4.0, reason: 'Scale recalibrated at hub intake', actorRole: 'RIDER' }).valid,
    false
  );
  assert.equal(
    validateWeightOverride({ order: lockedOrder, newWeightKg: 4.0, reason: 'Too short', actorRole: 'SUPER_ADMIN' }).valid,
    false
  );
  assert.equal(
    validateWeightOverride({ order: lockedOrder, newWeightKg: 4.0, reason: 'Verified moisture variance on calibrated plant scale', actorRole: 'SUPER_ADMIN' }).valid,
    true
  );
  assert.equal(getNextKanbanStage(OrderStatus.WEIGHED_AND_LOCKED), OrderStatus.RECEIVED_AT_HUB);
  assert.equal(getNextKanbanStage(OrderStatus.PACKED_AND_READY), null);
});

test('Franchise revenue split, BOM making metrics, and bulk Excel staff validation work accurately', () => {
  const sampleOrders: Order[] = [
    {
      orderId: 'o1',
      orderNumber: 'IW-1',
      customerName: 'Test',
      customerPhone: '999',
      customerAddress: 'Addr',
      customerLat: 26.92,
      customerLng: 81.19,
      hubId: 'hub_bbk',
      riderId: 'r1',
      riderName: 'Rider',
      bagQrCode: 'QR1',
      fulfillmentType: FulfillmentType.HOME_DELIVERY,
      paymentMethod: PaymentMethod.POD_CASH,
      paymentStatus: PaymentStatus.PAID,
      weightKg: 5,
      garmentCount: 10,
      isWeightLocked: true,
      weightLockHash: 'sha256:abc',
      grossAmount: 1000,
      discountPercent: 0,
      discountAmount: 0,
      deliveryFee: 0,
      finalPayable: 1000,
      deliveryOtp: '1234',
      status: OrderStatus.DELIVERED_AND_SETTLED,
      elapsedMinutes: 5,
      serviceName: 'Wash & Fold',
      createdAt: '2026-11-20T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    },
  ];
  const settlement = computeFranchiseSettlement(sampleOrders, testHubs[0]);
  assert.equal(settlement.partnerPayout, 800);
  assert.equal(settlement.headOfficeRoyalty, 200);
  assert.equal(settlement.gstOnRoyalty, 36);
  assert.equal(settlement.netPartnerRemittance, 764);

  const bom = computeProductMakingMetrics(
    [
      { materialId: 'm1', name: 'Detergent', unit: 'ml', quantityPerUnit: 40, unitCost: 0.45 },
      { materialId: 'm2', name: 'Softener', unit: 'ml', quantityPerUnit: 20, unitCost: 0.6 },
      { materialId: 'm3', name: 'QR Bag', unit: 'pcs', quantityPerUnit: 1, unitCost: 12 },
    ],
    149
  );
  assert.equal(bom.unitMakingCost, 42);
  assert.equal(bom.grossProfit, 107);
  assert.equal(bom.marginPercent, 71.8);

  const existing: StaffAccount[] = [
    {
      staffId: 'STF-001',
      loginId: 'admin@instawash.in',
      fullName: 'Head Admin',
      role: 'SUPER_ADMIN',
      hubId: 'hub_bbk',
      phone: '9999999999',
      passwordHash: hashStaffPassword('admin@instawash.in', 'Secret#123'),
      status: 'ACTIVE',
      importSource: 'SEED',
      permissions: getDefaultPermissionsForRole('SUPER_ADMIN'),
      createdAt: '2026-11-20T00:00:00Z',
    },
  ];
  assert.equal(verifyStaffPassword('admin@instawash.in', 'Secret#123', existing[0].passwordHash), true);
  assert.equal(verifyStaffPassword('admin@instawash.in', 'WrongPass', existing[0].passwordHash), false);

  const validated = validateBulkStaffRows(
    [
      { staffId: 'STF-201', fullName: 'Neha Verma', role: 'HUB_OPERATOR', hub: 'BBK-01', loginId: 'neha.bbk@instawash.in', password: 'Wash@2026', phone: '+91-9839001122' },
      { staffId: 'STF-001', fullName: 'Dup User', role: 'INVALID_ROLE', hub: 'UNKNOWN', loginId: 'admin@instawash.in', password: '123' },
    ],
    testHubs,
    existing
  );
  assert.equal(validated[0].isValid, true);
  assert.equal(validated[0].hubId, 'hub_bbk');
  assert.equal(validated[1].isValid, false);
  assert.ok(validated[1].errors.length >= 4);
});

test('Unified login, own-branch franchise isolation, RBAC boundaries, and running banner targeting', () => {
  const staffPool: StaffAccount[] = [
    {
      staffId: 'STF-HQ',
      loginId: 'hq@instawash.in',
      fullName: 'HQ Admin',
      role: 'SUPER_ADMIN',
      hubId: 'hub_bbk',
      phone: '999',
      passwordHash: hashStaffPassword('hq@instawash.in', 'HqPass@1'),
      status: 'ACTIVE',
      importSource: 'SEED',
      permissions: getDefaultPermissionsForRole('SUPER_ADMIN'),
      createdAt: '2026-11-20T00:00:00Z',
    },
    {
      staffId: 'STF-BBK',
      loginId: 'bbk@instawash.in',
      fullName: 'BBK Franchise',
      role: 'FRANCHISE_PARTNER',
      hubId: 'hub_bbk',
      phone: '888',
      passwordHash: hashStaffPassword('bbk@instawash.in', 'BbkPass@1'),
      status: 'ACTIVE',
      importSource: 'SEED',
      permissions: getDefaultPermissionsForRole('FRANCHISE_PARTNER'),
      createdAt: '2026-11-20T00:00:00Z',
    },
    {
      staffId: 'STF-AYD',
      loginId: 'ayd@instawash.in',
      fullName: 'AYD Operator',
      role: 'HUB_OPERATOR',
      hubId: 'hub_ayd',
      phone: '777',
      passwordHash: hashStaffPassword('ayd@instawash.in', 'AydPass@1'),
      status: 'ACTIVE',
      importSource: 'SEED',
      permissions: getDefaultPermissionsForRole('HUB_OPERATOR'),
      createdAt: '2026-11-20T00:00:00Z',
    },
  ];

  const customers: CustomerAccount[] = [
    {
      customerId: 'CUST-1',
      loginId: 'riya@gmail.com',
      fullName: 'Riya Verma',
      phone: '9839000001',
      address: 'Civil Lines',
      passwordHash: hashStaffPassword('riya@gmail.com', 'CustPass@1'),
      createdAt: '2026-11-20T00:00:00Z',
    },
  ];

  // Unauthenticated / invalid password rejected
  assert.equal(
    authenticateUnifiedAccount({ loginId: 'bbk@instawash.in', password: 'Wrong', staffAccounts: staffPool, customerAccounts: customers }).ok,
    false
  );

  // Franchise logs in -> locked to hub_bbk, blocked from Super Admin modules
  const frnAuth = authenticateUnifiedAccount({
    loginId: 'bbk@instawash.in',
    password: 'BbkPass@1',
    staffAccounts: staffPool,
    customerAccounts: customers,
  });
  assert.equal(frnAuth.ok, true);
  assert.equal(frnAuth.session?.role, 'FRANCHISE_PARTNER');
  assert.equal(frnAuth.session?.allottedHubId, 'hub_bbk');
  assert.equal(canAccessModule(frnAuth.session!, ActiveModule.CONFIG_ENGINE), false);
  assert.equal(canAccessModule(frnAuth.session!, ActiveModule.AUDIT_TRAIL), false);
  assert.equal(canAccessModule(frnAuth.session!, ActiveModule.BANNERS_CMS), false);
  assert.equal(canAccessModule(frnAuth.session!, ActiveModule.STAFF_EXCEL), true);

  // Own-branch staff isolation: BBK Franchise NEVER sees AYD operator or HQ Super Admin
  const scoped = scopeEntitiesBySession({
    session: frnAuth.session!,
    hubs: testHubs,
    orders: [],
    riders: [],
    podLedger: [],
    batches: [],
    staffAccounts: staffPool,
    superAdminHubFilter: 'ALL',
  });
  assert.equal(scoped.hubs.length, 1);
  assert.equal(scoped.hubs[0].hubId, 'hub_bbk');
  assert.deepEqual(
    scoped.staffAccounts.map((s) => s.staffId),
    ['STF-BBK']
  );

  // Customer login routes strictly to CUSTOMER_PORTAL
  const custAuth = authenticateUnifiedAccount({
    loginId: 'riya@gmail.com',
    password: 'CustPass@1',
    staffAccounts: staffPool,
    customerAccounts: customers,
  });
  assert.equal(custAuth.ok, true);
  assert.equal(custAuth.session?.role, 'CUSTOMER');
  assert.equal(canAccessModule(custAuth.session!, ActiveModule.CUSTOMER_PORTAL), true);
  assert.equal(canAccessModule(custAuth.session!, ActiveModule.OVERVIEW), false);

  // Running banner filtering respects surface and location
  const sampleBanners: RunningBanner[] = [
    {
      bannerId: 'b1',
      title: 'Public Ad',
      tickerText: 'Public offer text',
      placement: 'PUBLIC_WEBSITE',
      hubId: 'GLOBAL',
      ctaLabel: 'Book',
      promoCode: 'INSTA10MIN',
      theme: 'OCEAN',
      speedSeconds: 25,
      priority: 1,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      bannerId: 'b2',
      title: 'AYD Franchise Notice',
      tickerText: 'Ayodhya branch update',
      placement: 'FRANCHISE_PORTAL',
      hubId: 'hub_ayd',
      ctaLabel: '',
      promoCode: '',
      theme: 'SLATE',
      speedSeconds: 25,
      priority: 2,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
  ];
  assert.deepEqual(
    resolveActiveBannersForSurface(sampleBanners, 'PUBLIC_WEBSITE', 'hub_bbk').map((b) => b.bannerId),
    ['b1']
  );
  assert.deepEqual(
    resolveActiveBannersForSurface(sampleBanners, 'FRANCHISE_PORTAL', 'hub_bbk').map((b) => b.bannerId),
    []
  );
  assert.deepEqual(
    resolveActiveBannersForSurface(sampleBanners, 'FRANCHISE_PORTAL', 'hub_ayd').map((b) => b.bannerId),
    ['b2']
  );
});
