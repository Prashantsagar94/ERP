# InstaWash ERP Firestore Security Specification

## 1. Data Invariants
1. All writes require verified authentication (`request.auth != null && request.auth.token.email_verified == true`).
2. Privileged collections (`hubs`, `pricing_rules`, `discount_slabs`, `staff_accounts`, `products`, `production_batches`, `weight_audit_logs`, `rider_pod_ledger`, `audit_events`) enforce strict ownership (`ownerUid == request.auth.uid`) or verified Super Admin status (`isAdmin()`).
3. `staff_accounts` strictly stores salted `passwordHash` values (`<= 128` chars) and forbids blanket reads by non-owners/non-admins to protect PII and credentials.
4. `weight_audit_logs` and `audit_events` are append-only (`allow update, delete: if false`) with mandatory `reason.size() >= 15` on weight dispute overrides.
5. `orders` enforces terminal-state locking once `status` reaches `DELIVERED_AND_SETTLED` or `CANCELLED` (except Super Admin override), locks weight fields from non-admin modification once `isWeightLocked == true`, and enforces immutable `customerUid`, `orderId`, and `createdAt`.
6. Every document ID path variable is hardened via `isValidId()` (`^[a-zA-Z0-9_\-]+$`, `<= 128` chars), and every string enforces explicit `.size()` bounds.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read/Write**: Attempting to read `/staff_accounts/stf_1` or create `/orders/ord_1` without auth -> `PERMISSION_DENIED`.
2. **Unverified Admin Email Spoof**: Token with `email == 'prashantsagarmepl@gmail.com'` and `email_verified == false` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Hub Create**: Adding undocumented `isMasterOverride: true` to `/hubs/hub_test` -> `PERMISSION_DENIED` (`hasOnly`).
4. **Cross-Tenant PII Leak on Staff Accounts**: Non-admin signed-in user calling `get` or `list` on another tenant's `/staff_accounts/{staffId}` -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Order Create**: Setting `customerUid` to another user's UID -> `PERMISSION_DENIED`.
6. **Path ID Poisoning**: Creating `/orders/invalid$id!with*spaces` or a 200-char ID -> `PERMISSION_DENIED`.
7. **Post-Lock Weight Tampering**: Non-admin updating `weightKg` on an order where `existing().isWeightLocked == true` -> `PERMISSION_DENIED`.
8. **Terminal State Resurrection**: Non-admin mutating an order with `existing().status == 'DELIVERED_AND_SETTLED'` -> `PERMISSION_DENIED`.
9. **Short Dispute Reason Bypass**: Writing a `/weight_audit_logs/{logId}` with `reason: "fixed"` (< 15 chars) -> `PERMISSION_DENIED`.
10. **Audit Log Deletion/Tampering**: Attempting `update` or `delete` on `/weight_audit_logs/{logId}` or `/audit_events/{eventId}` -> `PERMISSION_DENIED`.
11. **Value Poisoning on Update**: Updating `ratePerKg` in `/pricing_rules/{ruleId}` with a string `"free"` instead of a number -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: Creating a document with a backdated `createdAt` not equal to `request.time` -> `PERMISSION_DENIED`.
