import {
  deleteDoc,
  doc,
  DocumentReference,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  AuditEvent,
  DiscountSlab,
  Hub,
  Order,
  PricingRule,
  ProductFormula,
  ProductionBatch,
  RiderPodLedgerEntry,
  RunningBanner,
  StaffAccount,
  WeightAuditLog,
} from '../types/erp';
import { computeProductMakingMetrics } from '../utils/erpEngine';

function getVerifiedUid(): string | null {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return null;
  }
  return user.uid;
}

/**
 * Safely creates or updates a Firestore document while preserving immutable fields
 * (`createdAt`, `customerUid`/`ownerUid`, document ID) on updates so security rules
 * enforcing `incoming().createdAt == existing().createdAt` always pass.
 */
async function upsertDocument(
  ref: DocumentReference,
  createPayload: Record<string, unknown>,
  updatePayload: Record<string, unknown>
): Promise<void> {
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, {
      ...updatePayload,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      ...createPayload,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function syncOrderToFirestore(order: Order): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `orders/${order.orderId}`;
  const ref = doc(db, 'orders', order.orderId);
  const mutableFields = {
    riderId: (order.riderId || 'unassigned').slice(0, 64),
    bagQrCode: order.bagQrCode.slice(0, 100),
    fulfillmentType: order.fulfillmentType,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    weightKg: order.weightKg,
    garmentCount: order.garmentCount,
    isWeightLocked: order.isWeightLocked,
    weightLockHash: order.weightLockHash.slice(0, 128),
    grossAmount: order.grossAmount,
    discountPercent: order.discountPercent,
    discountAmount: order.discountAmount,
    deliveryFee: order.deliveryFee,
    finalPayable: order.finalPayable,
    status: order.status,
  };
  try {
    await upsertDocument(
      ref,
      {
        orderId: order.orderId,
        orderNumber: order.orderNumber.slice(0, 32),
        customerName: order.customerName.slice(0, 100),
        customerUid: uid,
        hubId: order.hubId,
        deliveryOtp: order.deliveryOtp.slice(0, 6),
        ...mutableFields,
        createdAt: serverTimestamp(),
      },
      mutableFields
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncPricingRuleToFirestore(rule: PricingRule): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `pricing_rules/${rule.ruleId}`;
  const ref = doc(db, 'pricing_rules', rule.ruleId);
  const mutableFields = {
    ratePerKg: rule.ratePerKg,
    homeDeliveryFee: rule.homeDeliveryFee,
    officePickupFee: rule.officePickupFee,
    freeDeliveryThreshold: rule.freeDeliveryThreshold,
    minOrderEnabled: rule.minOrderEnabled,
    minOrderKg: rule.minOrderKg,
    minOrderAmount: rule.minOrderAmount,
    codEnabled: rule.codEnabled,
    upiEnabled: rule.upiEnabled,
    cardsEnabled: rule.cardsEnabled,
    maxRiderCodLimit: rule.maxRiderCodLimit,
    cancellationPenalty: rule.cancellationPenalty,
    slaPickupAlertMinutes: rule.slaPickupAlertMinutes,
  };
  try {
    await upsertDocument(
      ref,
      {
        ruleId: rule.ruleId,
        hubId: rule.hubId,
        ownerUid: uid,
        ...mutableFields,
      },
      mutableFields
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncDiscountSlabToFirestore(slab: DiscountSlab): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `discount_slabs/${slab.slabId}`;
  const ref = doc(db, 'discount_slabs', slab.slabId);
  const mutableFields = {
    label: slab.label.slice(0, 80),
    minAmount: slab.minAmount,
    maxAmount: slab.maxAmount,
    discountPercent: slab.discountPercent,
    isActive: slab.isActive,
    sortOrder: slab.sortOrder,
  };
  try {
    await upsertDocument(
      ref,
      {
        slabId: slab.slabId,
        hubId: slab.hubId,
        ownerUid: uid,
        ...mutableFields,
      },
      mutableFields
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncHubToFirestore(hub: Hub): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `hubs/${hub.hubId}`;
  const ref = doc(db, 'hubs', hub.hubId);
  const mutableFields = {
    name: hub.name.slice(0, 100),
    city: hub.city.slice(0, 100),
    latitude: hub.latitude,
    longitude: hub.longitude,
    geofenceRadiusKm: hub.geofenceRadiusKm,
    franchiseTier: hub.franchiseTier,
    partnerSharePercent: hub.partnerSharePercent,
    royaltyPercent: hub.royaltyPercent,
    openHours: hub.openHours.slice(0, 64),
    isActive: hub.isActive,
  };
  try {
    await upsertDocument(
      ref,
      {
        hubId: hub.hubId,
        code: hub.code.slice(0, 24),
        ownerUid: uid,
        ...mutableFields,
        createdAt: serverTimestamp(),
      },
      mutableFields
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncStaffAccountToFirestore(staff: StaffAccount): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `staff_accounts/${staff.staffId}`;
  const ref = doc(db, 'staff_accounts', staff.staffId);
  const mutableFields = {
    fullName: staff.fullName.slice(0, 100),
    role: staff.role,
    hubId: staff.hubId,
    passwordHash: staff.passwordHash.slice(0, 128),
    status: staff.status,
  };
  try {
    await upsertDocument(
      ref,
      {
        staffId: staff.staffId,
        loginId: staff.loginId.slice(0, 100),
        ownerUid: uid,
        ...mutableFields,
        createdAt: serverTimestamp(),
      },
      mutableFields
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncProductToFirestore(product: ProductFormula): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `products/${product.productId}`;
  const ref = doc(db, 'products', product.productId);
  const metrics = computeProductMakingMetrics(product.materials, product.sellingPrice);
  const mutableFields = {
    name: product.name.slice(0, 100),
    category: product.category,
    unitType: product.unitType.slice(0, 24),
    sellingPrice: product.sellingPrice,
    makingCost: metrics.unitMakingCost,
    stockUnits: product.stockUnits,
    isPublished: product.isPublished,
  };
  try {
    await upsertDocument(
      ref,
      {
        productId: product.productId,
        sku: product.sku.slice(0, 32),
        ownerUid: uid,
        ...mutableFields,
        createdAt: serverTimestamp(),
      },
      mutableFields
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncProductionBatchToFirestore(batch: ProductionBatch): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `production_batches/${batch.batchId}`;
  try {
    await setDoc(doc(db, 'production_batches', batch.batchId), {
      batchId: batch.batchId,
      productId: batch.productId,
      hubId: batch.hubId,
      quantityProduced: batch.quantityProduced,
      totalCost: batch.totalCost,
      status: batch.status,
      ownerUid: uid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncWeightAuditToFirestore(log: WeightAuditLog): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `weight_audit_logs/${log.logId}`;
  try {
    await setDoc(doc(db, 'weight_audit_logs', log.logId), {
      logId: log.logId,
      orderId: log.orderId,
      orderNumber: log.orderNumber.slice(0, 32),
      oldWeight: log.oldWeight,
      newWeight: log.newWeight,
      changedByRole: log.changedByRole,
      changedByUid: uid,
      reason: log.reason.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncPodLedgerToFirestore(entry: RiderPodLedgerEntry): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `rider_pod_ledger/${entry.entryId}`;
  const ref = doc(db, 'rider_pod_ledger', entry.entryId);
  const mutableFields = {
    settlementStatus: entry.settlementStatus,
    settledWithUid: entry.settlementStatus === 'SETTLED_WITH_HUB' ? uid : '',
  };
  try {
    await upsertDocument(
      ref,
      {
        entryId: entry.entryId,
        riderId: entry.riderId,
        riderName: entry.riderName.slice(0, 100),
        hubId: entry.hubId,
        orderId: entry.orderId,
        collectionMode: entry.collectionMode,
        amountCollected: entry.amountCollected,
        ownerUid: uid,
        ...mutableFields,
        createdAt: serverTimestamp(),
      },
      mutableFields
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncBannerToFirestore(banner: RunningBanner): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `banners/${banner.bannerId}`;
  const ref = doc(db, 'banners', banner.bannerId);
  const mutableFields = {
    title: banner.title.slice(0, 100),
    tickerText: banner.tickerText.slice(0, 400),
    placement: banner.placement,
    hubId: banner.hubId,
    ctaLabel: banner.ctaLabel.slice(0, 60),
    promoCode: banner.promoCode.slice(0, 32),
    theme: banner.theme,
    speedSeconds: banner.speedSeconds,
    priority: banner.priority,
    isActive: banner.isActive,
  };
  try {
    await upsertDocument(
      ref,
      {
        bannerId: banner.bannerId,
        ownerUid: uid,
        ...mutableFields,
        createdAt: serverTimestamp(),
      },
      mutableFields
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteBannerFromFirestore(bannerId: string): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `banners/${bannerId}`;
  try {
    await deleteDoc(doc(db, 'banners', bannerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncAuditEventToFirestore(event: AuditEvent): Promise<void> {
  const uid = getVerifiedUid();
  if (!uid) return;
  const path = `audit_events/${event.eventId}`;
  try {
    await setDoc(doc(db, 'audit_events', event.eventId), {
      eventId: event.eventId,
      actorUid: uid,
      actorRole: event.actorRole.slice(0, 40),
      action: event.action.slice(0, 80),
      entityType: event.entityType.slice(0, 40),
      summary: event.summary.slice(0, 400),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
