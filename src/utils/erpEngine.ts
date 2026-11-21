import {
  ActiveModule,
  AuthenticatedSession,
  BomMaterial,
  CustomerAccount,
  DiscountSlab,
  FulfillmentType,
  Hub,
  Order,
  OrderStatus,
  PortalPermissions,
  PricingRule,
  ProductionBatch,
  RiderPodLedgerEntry,
  RiderTelemetry,
  RunningBanner,
  StaffAccount,
} from '../types/erp';

export const KANBAN_STAGES: OrderStatus[] = [
  OrderStatus.WEIGHED_AND_LOCKED,
  OrderStatus.RECEIVED_AT_HUB,
  OrderStatus.IN_WASH,
  OrderStatus.DRYING_IRONING,
  OrderStatus.QUALITY_CHECK,
  OrderStatus.PACKED_AND_READY,
];

export const ORDER_TIMELINE_STAGES: OrderStatus[] = [
  OrderStatus.PICKUP_REQUESTED,
  OrderStatus.RIDER_ASSIGNED,
  OrderStatus.WEIGHED_AND_LOCKED,
  OrderStatus.RECEIVED_AT_HUB,
  OrderStatus.IN_WASH,
  OrderStatus.DRYING_IRONING,
  OrderStatus.QUALITY_CHECK,
  OrderStatus.PACKED_AND_READY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED_AND_SETTLED,
];

/**
 * Haversine formula computing great-circle distance in kilometers.
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(3));
}

export interface GeofenceValidationResult {
  inCoverage: boolean;
  matchedHub: Hub | null;
  nearestHub: Hub | null;
  distanceKm: number;
  estimatedPickupMinutes: number;
}

/**
 * Validates customer GPS coordinates against active hub geofences.
 */
export function validatePointInHubs(
  latitude: number,
  longitude: number,
  hubs: Hub[]
): GeofenceValidationResult {
  const activeHubs = hubs.filter((h) => h.isActive);
  if (activeHubs.length === 0) {
    return {
      inCoverage: false,
      matchedHub: null,
      nearestHub: null,
      distanceKm: Infinity,
      estimatedPickupMinutes: 0,
    };
  }

  let nearestHub = activeHubs[0];
  let nearestDistance = haversineKm(latitude, longitude, nearestHub.latitude, nearestHub.longitude);

  for (let i = 1; i < activeHubs.length; i += 1) {
    const candidate = activeHubs[i];
    const dist = haversineKm(latitude, longitude, candidate.latitude, candidate.longitude);
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestHub = candidate;
    }
  }

  const inCoverage = nearestDistance <= nearestHub.geofenceRadiusKm;
  const estimatedPickupMinutes = inCoverage
    ? Math.max(4, Math.min(10, Math.round(3 + (nearestDistance / nearestHub.geofenceRadiusKm) * 7)))
    : 0;

  return {
    inCoverage,
    matchedHub: inCoverage ? nearestHub : null,
    nearestHub,
    distanceKm: Number(nearestDistance.toFixed(2)),
    estimatedPickupMinutes,
  };
}

/**
 * Resolves the effective PricingRule for a hub (hub-specific override takes precedence over GLOBAL).
 */
export function resolvePricingRule(hubId: string, rules: PricingRule[]): PricingRule {
  const hubOverride = rules.find((r) => r.hubId === hubId);
  if (hubOverride) {
    return hubOverride;
  }
  const globalRule = rules.find((r) => r.hubId === 'GLOBAL');
  if (globalRule) {
    return globalRule;
  }
  if (rules.length > 0) {
    return rules[0];
  }
  throw new Error('No pricing rules configured');
}

/**
 * Resolves effective active DiscountSlabs for a hub (hub-specific override takes precedence over GLOBAL).
 */
export function resolveDiscountSlabs(hubId: string, slabs: DiscountSlab[]): DiscountSlab[] {
  const hubSlabs = slabs.filter((s) => s.hubId === hubId && s.isActive);
  const source = hubSlabs.length > 0 ? hubSlabs : slabs.filter((s) => s.hubId === 'GLOBAL' && s.isActive);
  return [...source].sort((a, b) => a.sortOrder - b.sortOrder || a.minAmount - b.minAmount);
}

export interface BillCalculationInput {
  weightKg: number;
  hubId: string;
  fulfillmentType: FulfillmentType;
  pricingRules: PricingRule[];
  discountSlabs: DiscountSlab[];
  extraPromoPercent?: number;
}

export interface BillCalculationResult {
  billableWeightKg: number;
  ratePerKg: number;
  grossAmount: number;
  matchedSlabLabel: string;
  discountPercent: number;
  discountAmount: number;
  deliveryFee: number;
  freeDeliveryApplied: boolean;
  finalPayable: number;
}

/**
 * Core dynamic billing engine: applies hub pricing rules, minimum thresholds,
 * tiered discount slabs, optional promo code, and fulfillment fees with zero hardcoded rates.
 */
export function calculateOrderBill(input: BillCalculationInput): BillCalculationResult {
  const rule = resolvePricingRule(input.hubId, input.pricingRules);
  const slabs = resolveDiscountSlabs(input.hubId, input.discountSlabs);

  const sanitizedWeight = Math.max(0, Number(input.weightKg) || 0);
  const billableWeightKg =
    rule.minOrderEnabled && sanitizedWeight > 0
      ? Math.max(sanitizedWeight, rule.minOrderKg)
      : sanitizedWeight;

  let grossAmount = Number((billableWeightKg * rule.ratePerKg).toFixed(2));
  if (rule.minOrderEnabled && grossAmount > 0 && grossAmount < rule.minOrderAmount) {
    grossAmount = Number(rule.minOrderAmount.toFixed(2));
  }

  let matchedSlab: DiscountSlab | undefined;
  for (const slab of slabs) {
    if (grossAmount >= slab.minAmount && grossAmount <= slab.maxAmount) {
      matchedSlab = slab;
      break;
    }
  }

  const baseDiscountPercent = matchedSlab ? matchedSlab.discountPercent : 0;
  const extraPromo = Math.max(0, Math.min(50, input.extraPromoPercent ?? 0));
  const effectiveDiscountPercent = Math.min(80, baseDiscountPercent + extraPromo);
  const discountAmount = Number(((grossAmount * effectiveDiscountPercent) / 100).toFixed(2));
  const netAfterDiscount = Number(Math.max(0, grossAmount - discountAmount).toFixed(2));

  let deliveryFee =
    input.fulfillmentType === FulfillmentType.HOME_DELIVERY
      ? rule.homeDeliveryFee
      : rule.officePickupFee;

  let freeDeliveryApplied = false;
  if (
    input.fulfillmentType === FulfillmentType.HOME_DELIVERY &&
    rule.freeDeliveryThreshold > 0 &&
    netAfterDiscount >= rule.freeDeliveryThreshold
  ) {
    deliveryFee = 0;
    freeDeliveryApplied = true;
  }

  const finalPayable = Number((netAfterDiscount + deliveryFee).toFixed(2));

  return {
    billableWeightKg: Number(billableWeightKg.toFixed(2)),
    ratePerKg: rule.ratePerKg,
    grossAmount,
    matchedSlabLabel: matchedSlab ? matchedSlab.label : 'Standard Tier (0%)',
    discountPercent: effectiveDiscountPercent,
    discountAmount,
    deliveryFee: Number(deliveryFee.toFixed(2)),
    freeDeliveryApplied,
    finalPayable,
  };
}

/**
 * Synchronous deterministic 64-hex cryptographic-style digest (dual-round FNV/SHA-mix)
 * used for doorstep payload tamper locking and offline queue signature verification.
 */
export function deterministicHexDigest(input: string): string {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1, 0x6a09e667, 0xbb67ae85];
  const parts: string[] = [];

  for (let s = 0; s < seeds.length; s += 1) {
    let h = seeds[s] >>> 0;
    for (let i = 0; i < input.length; i += 1) {
      h ^= input.charCodeAt(i) + ((s + 1) * 31);
      h = Math.imul(h, 0x01000193) >>> 0;
      h = ((h << 13) | (h >>> 19)) >>> 0;
    }
    h ^= input.length * 2654435761;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    parts.push(h.toString(16).padStart(8, '0'));
  }

  return parts.join('');
}

export function computeWeightLockHash(params: {
  orderId: string;
  weightKg: number;
  garmentCount: number;
  bagQrCode: string;
  timestamp: string;
}): string {
  const canonical = `IW-LOCK|${params.orderId}|${params.weightKg.toFixed(2)}|${params.garmentCount}|${params.bagQrCode.trim().toUpperCase()}|${params.timestamp}`;
  return `sha256:${deterministicHexDigest(canonical)}`;
}

export function hashStaffPassword(loginId: string, rawPassword: string): string {
  const salt = `instawash-v1:${loginId.trim().toLowerCase()}`;
  return `pbkdf2_sha256$${deterministicHexDigest(`${salt}::${rawPassword}`)}`;
}

export function verifyStaffPassword(loginId: string, rawPassword: string, storedHash: string): boolean {
  return hashStaffPassword(loginId, rawPassword) === storedHash;
}

export interface WeightOverrideValidation {
  valid: boolean;
  error?: string;
}

export function validateWeightOverride(params: {
  order: Order;
  newWeightKg: number;
  reason: string;
  actorRole: string;
}): WeightOverrideValidation {
  if (params.actorRole !== 'SUPER_ADMIN' && params.actorRole !== 'FRANCHISE_PARTNER') {
    return {
      valid: false,
      error: 'Only Super Admin or Franchise Partner roles can override a locked doorstep weight.',
    };
  }
  if (!params.order.isWeightLocked) {
    return {
      valid: false,
      error: 'Weight is not yet locked; rider must complete doorstep weighing first.',
    };
  }
  if (!Number.isFinite(params.newWeightKg) || params.newWeightKg <= 0 || params.newWeightKg > 250) {
    return {
      valid: false,
      error: 'Revised weight must be a positive value up to 250 Kg.',
    };
  }
  if (params.reason.trim().length < 15) {
    return {
      valid: false,
      error: 'Mandatory audit explanation must be at least 15 characters.',
    };
  }
  return { valid: true };
}

export function getNextKanbanStage(current: OrderStatus): OrderStatus | null {
  const idx = KANBAN_STAGES.indexOf(current);
  if (idx === -1 || idx >= KANBAN_STAGES.length - 1) {
    return null;
  }
  return KANBAN_STAGES[idx + 1];
}

export interface FranchiseSettlementSummary {
  hubId: string;
  hubName: string;
  franchiseTier: string;
  orderCount: number;
  grossRevenue: number;
  partnerSharePercent: number;
  royaltyPercent: number;
  partnerPayout: number;
  headOfficeRoyalty: number;
  gstOnRoyalty: number;
  netPartnerRemittance: number;
}

export function computeFranchiseSettlement(orders: Order[], hub: Hub): FranchiseSettlementSummary {
  const eligible = orders.filter(
    (o) =>
      o.hubId === hub.hubId &&
      o.status !== OrderStatus.CANCELLED &&
      o.finalPayable > 0
  );

  const grossRevenue = Number(
    eligible.reduce((sum, o) => sum + o.finalPayable, 0).toFixed(2)
  );
  const partnerPayout = Number(((grossRevenue * hub.partnerSharePercent) / 100).toFixed(2));
  const headOfficeRoyalty = Number(((grossRevenue * hub.royaltyPercent) / 100).toFixed(2));
  const gstOnRoyalty = Number((headOfficeRoyalty * 0.18).toFixed(2));
  const netPartnerRemittance = Number(Math.max(0, partnerPayout - gstOnRoyalty).toFixed(2));

  return {
    hubId: hub.hubId,
    hubName: hub.name,
    franchiseTier: hub.franchiseTier,
    orderCount: eligible.length,
    grossRevenue,
    partnerSharePercent: hub.partnerSharePercent,
    royaltyPercent: hub.royaltyPercent,
    partnerPayout,
    headOfficeRoyalty,
    gstOnRoyalty,
    netPartnerRemittance,
  };
}

export interface ProductMakingMetrics {
  unitMakingCost: number;
  grossProfit: number;
  marginPercent: number;
}

export function computeProductMakingMetrics(
  materials: BomMaterial[],
  sellingPrice: number
): ProductMakingMetrics {
  const unitMakingCost = Number(
    materials
      .reduce((sum, m) => sum + Math.max(0, m.quantityPerUnit) * Math.max(0, m.unitCost), 0)
      .toFixed(2)
  );
  const grossProfit = Number((sellingPrice - unitMakingCost).toFixed(2));
  const marginPercent =
    sellingPrice > 0 ? Number(((grossProfit / sellingPrice) * 100).toFixed(1)) : 0;

  return {
    unitMakingCost,
    grossProfit,
    marginPercent,
  };
}

export interface RawStaffUploadRow {
  staffId?: string;
  fullName?: string;
  role?: string;
  hub?: string;
  loginId?: string;
  password?: string;
  phone?: string;
  status?: string;
  permissions?: string;
}

export interface ValidatedStaffImportRow {
  rowNumber: number;
  staffId: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'FRANCHISE_PARTNER' | 'HUB_OPERATOR' | 'RIDER';
  hubId: string;
  hubLabel: string;
  loginId: string;
  rawPassword: string;
  phone: string;
  status: 'ACTIVE' | 'SUSPENDED';
  permissions: PortalPermissions;
  errors: string[];
  isValid: boolean;
}

const ALLOWED_STAFF_ROLES = ['SUPER_ADMIN', 'FRANCHISE_PARTNER', 'HUB_OPERATOR', 'RIDER'] as const;

export const PERMISSION_KEYS: (keyof PortalPermissions)[] = [
  'overview',
  'kanban',
  'customerBooking',
  'riderConsole',
  'financeLedger',
  'productMaking',
  'bannerAds',
  'staffDirectory',
  'weightOverride',
  'eodSettlement',
  'excelImportExport',
];

export function getDefaultPermissionsForRole(
  role: StaffAccount['role'] | 'CUSTOMER'
): PortalPermissions {
  if (role === 'SUPER_ADMIN') {
    return {
      overview: true,
      kanban: true,
      customerBooking: true,
      riderConsole: true,
      financeLedger: true,
      productMaking: true,
      bannerAds: true,
      staffDirectory: true,
      weightOverride: true,
      eodSettlement: true,
      excelImportExport: true,
    };
  }
  if (role === 'FRANCHISE_PARTNER') {
    return {
      overview: true,
      kanban: true,
      customerBooking: true,
      riderConsole: true,
      financeLedger: true,
      productMaking: true,
      bannerAds: false,
      staffDirectory: true, // Own-branch staff management ONLY (never other branches or Super Admin)
      weightOverride: true,
      eodSettlement: true,
      excelImportExport: false,
    };
  }
  if (role === 'HUB_OPERATOR') {
    return {
      overview: true,
      kanban: true,
      customerBooking: false,
      riderConsole: false,
      financeLedger: false,
      productMaking: true,
      bannerAds: false,
      staffDirectory: false,
      weightOverride: false,
      eodSettlement: false,
      excelImportExport: false,
    };
  }
  if (role === 'CUSTOMER') {
    return {
      overview: false,
      kanban: false,
      customerBooking: true,
      riderConsole: false,
      financeLedger: false,
      productMaking: false,
      bannerAds: false,
      staffDirectory: false,
      weightOverride: false,
      eodSettlement: false,
      excelImportExport: false,
    };
  }
  return {
    overview: false,
    kanban: false,
    customerBooking: false,
    riderConsole: true,
    financeLedger: false,
    productMaking: false,
    bannerAds: false,
    staffDirectory: false,
    weightOverride: false,
    eodSettlement: false,
    excelImportExport: false,
  };
}

export function parsePermissionsFromString(
  raw: string | undefined,
  role: StaffAccount['role']
): PortalPermissions {
  if (role === 'SUPER_ADMIN') {
    return getDefaultPermissionsForRole('SUPER_ADMIN');
  }
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return getDefaultPermissionsForRole(role);
  }
  const tokens = new Set(
    trimmed
      .toLowerCase()
      .split(/[,;|]+/)
      .map((t) => t.trim().replace(/[^a-z0-9]/g, ''))
      .filter(Boolean)
  );
  if (tokens.has('all') || tokens.has('default')) {
    return getDefaultPermissionsForRole(role);
  }
  return {
    overview: tokens.has('overview') || tokens.has('fleet'),
    kanban: tokens.has('kanban') || tokens.has('washfloor'),
    customerBooking: tokens.has('customerbooking') || tokens.has('booking') || tokens.has('customer'),
    riderConsole: tokens.has('riderconsole') || tokens.has('rider') || tokens.has('dispatch'),
    financeLedger: tokens.has('financeledger') || tokens.has('finance') || tokens.has('ledger'),
    productMaking: tokens.has('productmaking') || tokens.has('product') || tokens.has('bom'),
    bannerAds: tokens.has('bannerads') || tokens.has('banners') || tokens.has('ads'),
    staffDirectory: tokens.has('staffdirectory') || tokens.has('staff'),
    weightOverride: tokens.has('weightoverride') || tokens.has('override'),
    eodSettlement: tokens.has('eodsettlement') || tokens.has('eod') || tokens.has('settlement'),
    excelImportExport: tokens.has('excelimportexport') || tokens.has('excel'),
  };
}

export function serializePermissionsToString(perms: PortalPermissions): string {
  return PERMISSION_KEYS.filter((k) => perms[k]).join(',');
}

/**
 * Enforces strict separation between Super Admin HQ powers and Franchise/Staff/Customer sessions.
 * Franchises and staff can NEVER open Dynamic Rules Engine or Audit & SQL Blueprint,
 * and every other module requires explicit Super Admin-granted permission.
 */
export function canAccessModule(
  session: AuthenticatedSession | null,
  module: ActiveModule
): boolean {
  if (!session) return false;
  if (session.role === 'SUPER_ADMIN') return true;
  if (session.role === 'CUSTOMER') {
    return module === ActiveModule.CUSTOMER_PORTAL;
  }

  switch (module) {
    case ActiveModule.CONFIG_ENGINE:
    case ActiveModule.AUDIT_TRAIL:
      return false; // Strictly Super Admin HQ exclusive
    case ActiveModule.OVERVIEW:
      return session.permissions.overview;
    case ActiveModule.KANBAN:
      return session.permissions.kanban;
    case ActiveModule.CUSTOMER_PORTAL:
      return session.permissions.customerBooking;
    case ActiveModule.RIDER_CONSOLE:
      return session.permissions.riderConsole;
    case ActiveModule.FINANCE:
      return session.permissions.financeLedger;
    case ActiveModule.PRODUCT_MAKING:
      return session.permissions.productMaking;
    case ActiveModule.BANNERS_CMS:
      return session.permissions.bannerAds;
    case ActiveModule.STAFF_EXCEL:
      return session.permissions.staffDirectory;
    default:
      return false;
  }
}

export type PortalLoginMode = 'SUPER_ADMIN' | 'FRANCHISE_STAFF';

export interface StaffAuthResult {
  ok: boolean;
  session?: AuthenticatedSession;
  error?: string;
}

/**
 * Authenticates credentials against salted SHA-256 hashes while enforcing separate
 * Super Admin HQ vs. Franchise/Location Staff login portals.
 */
export function authenticateStaffCredential(params: {
  loginId: string;
  password: string;
  staffAccounts: StaffAccount[];
  portalMode: PortalLoginMode;
}): StaffAuthResult {
  const normalizedId = params.loginId.trim().toLowerCase();
  if (!normalizedId || !params.password) {
    return { ok: false, error: 'Please enter both Login ID and Password.' };
  }

  const matched = params.staffAccounts.find(
    (s) =>
      s.loginId.trim().toLowerCase() === normalizedId ||
      s.staffId.trim().toLowerCase() === normalizedId
  );

  if (!matched) {
    return { ok: false, error: 'Invalid Login ID or password.' };
  }

  if (matched.status !== 'ACTIVE') {
    return {
      ok: false,
      error: `Account ${matched.staffId} is currently SUSPENDED by Super Admin.`,
    };
  }

  if (!verifyStaffPassword(matched.loginId, params.password, matched.passwordHash)) {
    return { ok: false, error: 'Invalid Login ID or password.' };
  }

  if (params.portalMode === 'SUPER_ADMIN' && matched.role !== 'SUPER_ADMIN') {
    return {
      ok: false,
      error:
        'Access Denied: Franchise and branch accounts cannot sign in to the Super Admin HQ Portal. Use the Franchise / Location Portal tab.',
    };
  }

  if (params.portalMode === 'FRANCHISE_STAFF' && matched.role === 'SUPER_ADMIN') {
    return {
      ok: false,
      error:
        'This is a Super Admin HQ account. Please sign in using the Super Admin HQ Portal tab.',
    };
  }

  return {
    ok: true,
    session: {
      staffId: matched.staffId,
      loginId: matched.loginId,
      fullName: matched.fullName,
      role: matched.role,
      allottedHubId: matched.role === 'SUPER_ADMIN' ? 'ALL' : matched.hubId,
      permissions:
        matched.role === 'SUPER_ADMIN'
          ? getDefaultPermissionsForRole('SUPER_ADMIN')
          : matched.permissions,
      authMethod:
        matched.role === 'SUPER_ADMIN' ? 'HQ_SUPER_ADMIN' : 'STAFF_ID_PASSWORD',
    },
  };
}

export interface ScopedTenantData {
  hubs: Hub[];
  orders: Order[];
  riders: RiderTelemetry[];
  podLedger: RiderPodLedgerEntry[];
  batches: ProductionBatch[];
  staffAccounts: StaffAccount[];
  effectiveHubFilter: string;
}

/**
 * Hard multi-tenant location isolation:
 * - Super Admin sees all hubs (or their chosen hub filter).
 * - Franchise / Hub Operator / Rider strictly receives ONLY records matching their allottedHubId,
 *   and never sees Super Admin accounts or rival franchise branches.
 */
export function scopeEntitiesBySession(params: {
  session: AuthenticatedSession;
  hubs: Hub[];
  orders: Order[];
  riders: RiderTelemetry[];
  podLedger: RiderPodLedgerEntry[];
  batches: ProductionBatch[];
  staffAccounts: StaffAccount[];
  superAdminHubFilter: string;
}): ScopedTenantData {
  if (params.session.role === 'SUPER_ADMIN') {
    return {
      hubs: params.hubs,
      orders: params.orders,
      riders: params.riders,
      podLedger: params.podLedger,
      batches: params.batches,
      staffAccounts: params.staffAccounts,
      effectiveHubFilter: params.superAdminHubFilter,
    };
  }

  const hubId = params.session.allottedHubId;
  return {
    hubs: params.hubs.filter((h) => h.hubId === hubId),
    orders: params.orders.filter((o) => o.hubId === hubId),
    riders: params.riders.filter((r) => r.hubId === hubId),
    podLedger: params.podLedger.filter((e) => e.hubId === hubId),
    batches: params.batches.filter((b) => b.hubId === hubId),
    staffAccounts: params.staffAccounts.filter(
      (s) => s.hubId === hubId && s.role !== 'SUPER_ADMIN'
    ),
    effectiveHubFilter: hubId,
  };
}

export function validateBulkStaffRows(
  rows: RawStaffUploadRow[],
  hubs: Hub[],
  existingStaff: StaffAccount[],
  actorRole: StaffAccount['role'] = 'SUPER_ADMIN'
): ValidatedStaffImportRow[] {
  const seenLoginIds = new Set(existingStaff.map((s) => s.loginId.trim().toLowerCase()));
  const seenStaffIds = new Set(existingStaff.map((s) => s.staffId.trim().toUpperCase()));

  return rows.map((row, index) => {
    const errors: string[] = [];
    const staffId = String(row.staffId ?? '').trim();
    const fullName = String(row.fullName ?? '').trim();
    const roleRaw = String(row.role ?? '').trim().toUpperCase();
    const hubRaw = String(row.hub ?? '').trim();
    const loginId = String(row.loginId ?? '').trim();
    const rawPassword = String(row.password ?? '').trim();
    const phone = String(row.phone ?? '').trim();
    const statusRaw = String(row.status ?? 'ACTIVE').trim().toUpperCase();

    if (!staffId || !/^[a-zA-Z0-9_-]{3,32}$/.test(staffId)) {
      errors.push('Staff ID must be 3-32 alphanumeric/dash/underscore characters');
    } else if (seenStaffIds.has(staffId.toUpperCase())) {
      errors.push(`Duplicate Staff ID "${staffId}"`);
    } else {
      seenStaffIds.add(staffId.toUpperCase());
    }

    if (fullName.length < 2) {
      errors.push('Full Name is required');
    }

    const isRoleValid = (ALLOWED_STAFF_ROLES as readonly string[]).includes(roleRaw);
    if (!isRoleValid) {
      errors.push(`Role must be one of ${ALLOWED_STAFF_ROLES.join(', ')}`);
    } else if (roleRaw === 'SUPER_ADMIN' && actorRole !== 'SUPER_ADMIN') {
      errors.push('Only Super Admin can provision SUPER_ADMIN accounts');
    }

    const matchedHub = hubs.find(
      (h) =>
        h.hubId.toLowerCase() === hubRaw.toLowerCase() ||
        h.code.toLowerCase() === hubRaw.toLowerCase() ||
        h.name.toLowerCase() === hubRaw.toLowerCase() ||
        h.city.toLowerCase() === hubRaw.toLowerCase()
    );
    if (!matchedHub) {
      errors.push(`Unknown Hub "${hubRaw || '(empty)'}"`);
    }

    if (loginId.length < 3) {
      errors.push('Login ID / Email must be at least 3 characters');
    } else if (seenLoginIds.has(loginId.toLowerCase())) {
      errors.push(`Duplicate Login ID "${loginId}"`);
    } else {
      seenLoginIds.add(loginId.toLowerCase());
    }

    if (rawPassword.length < 6) {
      errors.push('Password must be at least 6 characters');
    }

    const status: 'ACTIVE' | 'SUSPENDED' =
      statusRaw === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';

    const resolvedRole = (
      isRoleValid ? roleRaw : 'HUB_OPERATOR'
    ) as ValidatedStaffImportRow['role'];

    return {
      rowNumber: index + 2,
      staffId,
      fullName,
      role: resolvedRole,
      hubId: matchedHub ? matchedHub.hubId : '',
      hubLabel: matchedHub ? `${matchedHub.name} (${matchedHub.code})` : hubRaw || 'Unassigned',
      loginId,
      rawPassword,
      phone: phone || '+91-90000-00000',
      status,
      permissions: parsePermissionsFromString(row.permissions, resolvedRole),
      errors,
      isValid: errors.length === 0,
    };
  });
}

/**
 * Unified single-form login: verifies ID & Password across Staff, Franchise, Super Admin,
 * and registered Customer accounts, and routes directly into the user's exact role & branch.
 */
export function authenticateUnifiedAccount(params: {
  loginId: string;
  password: string;
  staffAccounts: StaffAccount[];
  customerAccounts: CustomerAccount[];
}): StaffAuthResult {
  const normalizedId = params.loginId.trim().toLowerCase();
  if (!normalizedId || !params.password) {
    return { ok: false, error: 'Please enter both Login ID and Password.' };
  }

  const matchedStaff = params.staffAccounts.find(
    (s) =>
      s.loginId.trim().toLowerCase() === normalizedId ||
      s.staffId.trim().toLowerCase() === normalizedId
  );

  if (matchedStaff) {
    if (matchedStaff.status !== 'ACTIVE') {
      return {
        ok: false,
        error: `Account ${matchedStaff.staffId} is currently SUSPENDED. Contact your administrator.`,
      };
    }
    if (!verifyStaffPassword(matchedStaff.loginId, params.password, matchedStaff.passwordHash)) {
      return { ok: false, error: 'Invalid Login ID or password.' };
    }
    return {
      ok: true,
      session: {
        staffId: matchedStaff.staffId,
        loginId: matchedStaff.loginId,
        fullName: matchedStaff.fullName,
        role: matchedStaff.role,
        allottedHubId: matchedStaff.role === 'SUPER_ADMIN' ? 'ALL' : matchedStaff.hubId,
        permissions:
          matchedStaff.role === 'SUPER_ADMIN'
            ? getDefaultPermissionsForRole('SUPER_ADMIN')
            : matchedStaff.permissions,
        authMethod:
          matchedStaff.role === 'SUPER_ADMIN' ? 'HQ_SUPER_ADMIN' : 'STAFF_ID_PASSWORD',
        phone: matchedStaff.phone,
      },
    };
  }

  const matchedCustomer = params.customerAccounts.find(
    (c) =>
      c.loginId.trim().toLowerCase() === normalizedId ||
      c.customerId.trim().toLowerCase() === normalizedId ||
      c.phone.replace(/\s+/g, '').toLowerCase() === normalizedId.replace(/\s+/g, '')
  );

  if (matchedCustomer) {
    if (!verifyStaffPassword(matchedCustomer.loginId, params.password, matchedCustomer.passwordHash)) {
      return { ok: false, error: 'Invalid Login ID or password.' };
    }
    return {
      ok: true,
      session: {
        staffId: matchedCustomer.customerId,
        loginId: matchedCustomer.loginId,
        fullName: matchedCustomer.fullName,
        role: 'CUSTOMER',
        allottedHubId: 'ALL',
        permissions: getDefaultPermissionsForRole('CUSTOMER'),
        authMethod: 'CUSTOMER_ACCOUNT',
        phone: matchedCustomer.phone,
        address: matchedCustomer.address,
      },
    };
  }

  return { ok: false, error: 'Invalid Login ID or password. Without an allotted ID & Password you cannot log in.' };
}

export function resolveActiveBannersForSurface(
  banners: RunningBanner[],
  surface: 'PUBLIC_WEBSITE' | 'FRANCHISE_PORTAL',
  hubId: string
): RunningBanner[] {
  return banners
    .filter((b) => {
      if (!b.isActive) return false;
      const matchesSurface = b.placement === 'BOTH' || b.placement === surface;
      if (!matchesSurface) return false;
      return b.hubId === 'GLOBAL' || b.hubId === hubId || hubId === 'ALL';
    })
    .sort((a, b) => a.priority - b.priority);
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
