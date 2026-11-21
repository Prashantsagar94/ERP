export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  FRANCHISE_PARTNER = 'FRANCHISE_PARTNER',
  HUB_OPERATOR = 'HUB_OPERATOR',
  RIDER = 'RIDER',
  CUSTOMER = 'CUSTOMER',
}

export enum FranchiseTier {
  EXPRESS_MICRO = 'EXPRESS_MICRO',
  STANDARD_HUB = 'STANDARD_HUB',
  MASTER_DISTRICT = 'MASTER_DISTRICT',
}

export enum FulfillmentType {
  HOME_DELIVERY = 'HOME_DELIVERY',
  OFFICE_PICKUP = 'OFFICE_PICKUP',
}

export enum PaymentMethod {
  POD_CASH = 'POD_CASH',
  POD_UPI = 'POD_UPI',
  ONLINE_PREPAID = 'ONLINE_PREPAID',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  REFUNDED = 'REFUNDED',
}

export enum OrderStatus {
  PICKUP_REQUESTED = 'PICKUP_REQUESTED',
  RIDER_ASSIGNED = 'RIDER_ASSIGNED',
  WEIGHED_AND_LOCKED = 'WEIGHED_AND_LOCKED',
  RECEIVED_AT_HUB = 'RECEIVED_AT_HUB',
  IN_WASH = 'IN_WASH',
  DRYING_IRONING = 'DRYING_IRONING',
  QUALITY_CHECK = 'QUALITY_CHECK',
  PACKED_AND_READY = 'PACKED_AND_READY',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED_AND_SETTLED = 'DELIVERED_AND_SETTLED',
  CANCELLED = 'CANCELLED',
}

export enum ProductCategory {
  LAUNDRY_SERVICE = 'LAUNDRY_SERVICE',
  DRY_CLEAN = 'DRY_CLEAN',
  ADDON_TREATMENT = 'ADDON_TREATMENT',
  RETAIL_CARE = 'RETAIL_CARE',
}

export enum ActiveModule {
  OVERVIEW = 'OVERVIEW',
  KANBAN = 'KANBAN',
  CUSTOMER_PORTAL = 'CUSTOMER_PORTAL',
  RIDER_CONSOLE = 'RIDER_CONSOLE',
  FINANCE = 'FINANCE',
  PRODUCT_MAKING = 'PRODUCT_MAKING',
  BANNERS_CMS = 'BANNERS_CMS',
  STAFF_EXCEL = 'STAFF_EXCEL',
  CONFIG_ENGINE = 'CONFIG_ENGINE',
  AUDIT_TRAIL = 'AUDIT_TRAIL',
}

export type BannerPlacement = 'PUBLIC_WEBSITE' | 'FRANCHISE_PORTAL' | 'BOTH';
export type BannerTheme = 'OCEAN' | 'SLATE' | 'AMBER' | 'EMERALD';

export interface RunningBanner {
  bannerId: string;
  title: string;
  tickerText: string;
  placement: BannerPlacement;
  hubId: string; // 'GLOBAL' or specific hubId
  ctaLabel: string;
  promoCode: string;
  theme: BannerTheme;
  speedSeconds: number;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PortalPermissions {
  overview: boolean;
  kanban: boolean;
  customerBooking: boolean;
  riderConsole: boolean;
  financeLedger: boolean;
  productMaking: boolean;
  bannerAds: boolean;
  staffDirectory: boolean;
  weightOverride: boolean;
  eodSettlement: boolean;
  excelImportExport: boolean;
}

export interface CustomerAccount {
  customerId: string;
  loginId: string;
  fullName: string;
  phone: string;
  address: string;
  passwordHash: string;
  createdAt: string;
}

export interface AuthenticatedSession {
  staffId: string;
  loginId: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'FRANCHISE_PARTNER' | 'HUB_OPERATOR' | 'RIDER' | 'CUSTOMER';
  allottedHubId: string; // 'ALL' for SUPER_ADMIN/CUSTOMER, specific hubId for branch staff/franchise
  permissions: PortalPermissions;
  authMethod: 'HQ_SUPER_ADMIN' | 'GOOGLE_SUPER_ADMIN' | 'STAFF_ID_PASSWORD' | 'CUSTOMER_ACCOUNT';
  phone?: string;
  address?: string;
}

export interface Hub {
  hubId: string;
  code: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  geofenceRadiusKm: number;
  franchiseTier: FranchiseTier;
  partnerSharePercent: number;
  royaltyPercent: number;
  openHours: string;
  isActive: boolean;
}

export interface PricingRule {
  ruleId: string;
  hubId: string; // 'GLOBAL' or specific hubId
  ratePerKg: number;
  homeDeliveryFee: number;
  officePickupFee: number;
  freeDeliveryThreshold: number;
  minOrderEnabled: boolean;
  minOrderKg: number;
  minOrderAmount: number;
  codEnabled: boolean;
  upiEnabled: boolean;
  cardsEnabled: boolean;
  maxRiderCodLimit: number;
  cancellationPenalty: number;
  slaPickupAlertMinutes: number;
  updatedAt: string;
}

export interface DiscountSlab {
  slabId: string;
  hubId: string; // 'GLOBAL' or specific hubId
  label: string;
  minAmount: number;
  maxAmount: number;
  discountPercent: number;
  isActive: boolean;
  sortOrder: number;
}

export interface WorkflowStageConfig {
  status: OrderStatus;
  label: string;
  customerTemplate: string;
  slaMinutes: number;
}

export interface PromoItem {
  promoId: string;
  code: string;
  title: string;
  description: string;
  hubId: string; // 'GLOBAL' or specific hubId
  extraDiscountPercent: number;
  status: 'ACTIVE' | 'SCHEDULED' | 'PAUSED';
  validUntil: string;
}

export interface RiderTelemetry {
  riderId: string;
  name: string;
  phone: string;
  hubId: string;
  latitude: number;
  longitude: number;
  status: 'AVAILABLE' | 'EN_ROUTE_PICKUP' | 'AT_DOORSTEP' | 'OUT_FOR_DELIVERY';
  activeOrderId?: string;
  batteryPercent: number;
}

export interface Order {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerLat: number;
  customerLng: number;
  hubId: string;
  riderId: string;
  riderName: string;
  bagQrCode: string;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  weightKg: number;
  garmentCount: number;
  isWeightLocked: boolean;
  weightLockedAt?: string;
  weightLockHash: string;
  scalePhotoUrl?: string;
  grossAmount: number;
  discountPercent: number;
  discountAmount: number;
  deliveryFee: number;
  finalPayable: number;
  deliveryOtp: string;
  status: OrderStatus;
  elapsedMinutes: number;
  isCorrectedByManager?: boolean;
  serviceName: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeightAuditLog {
  logId: string;
  orderId: string;
  orderNumber: string;
  oldWeight: number;
  newWeight: number;
  oldPayable: number;
  newPayable: number;
  changedByRole: 'SUPER_ADMIN' | 'FRANCHISE_PARTNER';
  changedByName: string;
  reason: string;
  createdAt: string;
}

export interface RiderPodLedgerEntry {
  entryId: string;
  riderId: string;
  riderName: string;
  hubId: string;
  orderId: string;
  orderNumber: string;
  collectionMode: 'CASH' | 'RIDER_UPI_QR';
  amountCollected: number;
  settlementStatus: 'UNSETTLED' | 'SETTLED_WITH_HUB';
  settledWithAdmin?: string;
  settledAt?: string;
  createdAt: string;
}

export interface StaffAccount {
  staffId: string;
  loginId: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'FRANCHISE_PARTNER' | 'HUB_OPERATOR' | 'RIDER';
  hubId: string;
  phone: string;
  passwordHash: string;
  status: 'ACTIVE' | 'SUSPENDED';
  importSource: 'SEED' | 'MANUAL' | 'EXCEL_BULK';
  permissions: PortalPermissions;
  createdAt: string;
}

export interface BomMaterial {
  materialId: string;
  name: string;
  unit: string;
  quantityPerUnit: number;
  unitCost: number;
}

export interface ProductFormula {
  productId: string;
  sku: string;
  name: string;
  category: ProductCategory;
  unitType: string; // 'Kg' | 'Garment' | 'Bottle (500ml)' | 'Kit'
  sellingPrice: number;
  stockUnits: number;
  turnaroundHours: number;
  isPublished: boolean;
  materials: BomMaterial[];
  updatedAt: string;
}

export interface ProductionBatch {
  batchId: string;
  batchCode: string;
  productId: string;
  productName: string;
  hubId: string;
  quantityProduced: number;
  unitMakingCost: number;
  totalCost: number;
  status: 'PLANNED' | 'IN_PRODUCTION' | 'QC_PASSED';
  createdBy: string;
  createdAt: string;
}

export interface OfflineWeightQueueItem {
  queueId: string;
  orderId: string;
  orderNumber: string;
  weightKg: number;
  garmentCount: number;
  bagQrCode: string;
  localHash: string;
  capturedAt: string;
  isSynced: boolean;
}

export interface WaitlistEntry {
  waitlistId: string;
  customerName: string;
  phone: string;
  latitude: number;
  longitude: number;
  nearestHubName: string;
  distanceKm: number;
  createdAt: string;
}

export interface AuditEvent {
  eventId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  summary: string;
  createdAt: string;
}
