# Security Specification: PharmaFlow

## 1. Data Invariants
- A **Product** must belong to a `userId`. SKU and Barcode must be unique per user. `stockQuantity` cannot be negative.
- A **Customer** must belong to a `userId`. Phone must be unique per user.
- An **Invoice** must belong to a `userId`. All items in an invoice must exist and belong to the same `userId`.
- **Settings** are per-user, keyed by `userId`.
- Users can only read/write their own data.

## 2. The "Dirty Dozen" Payloads

### P1: Identity Spoofing (Product)
```json
{
  "name": "Aspirin",
  "sku": "ASP001",
  "sellingPrice": 10,
  "stockQuantity": 100,
  "userId": "SOMEONE_ELSES_UID"
}
```
*Expected: PERMISSION_DENIED*

### P2: Resource Poisoning (Product SKU)
```json
{
  "name": "Aspirin",
  "sku": "A".repeat(2000),
  "sellingPrice": 10,
  "stockQuantity": 100,
  "userId": "CURRENT_USER_UID"
}
```
*Expected: PERMISSION_DENIED*

### P3: State Shortcutting (Negative Stock)
```json
{
  "name": "Aspirin",
  "sku": "ASP001",
  "sellingPrice": 10,
  "stockQuantity": -50,
  "userId": "CURRENT_USER_UID"
}
```
*Expected: PERMISSION_DENIED*

### P4: Identity Spoofing (Customer)
```json
{
  "name": "John Doe",
  "phone": "1234567890",
  "userId": "SOMEONE_ELSES_UID"
}
```
*Expected: PERMISSION_DENIED*

### P5: Unauthorized Read (Customer)
*Action: GET /customers/SOMEONE_ELSES_CUSTOMER_ID*
*Expected: PERMISSION_DENIED*

### P6: Ghost Field Injection (User)
```json
{
  "role": "admin",
  "status": "active",
  "ghostField": "maliciousValue"
}
```
*Expected: PERMISSION_DENIED*

### P7: Privilege Escalation (User Role)
*Action: UPDATE /users/CURRENT_USER_UID*
```json
{
  "role": "admin"
}
```
*Expected: PERMISSION_DENIED (Unless admin)*

### P8: Orphaned Record (Invoice without Items)
```json
{
  "invoiceNumber": "INV-001",
  "items": [],
  "grandTotal": 100,
  "userId": "CURRENT_USER_UID"
}
```
*Expected: PERMISSION_DENIED*

### P9: PII Blanket Read (Users)
*Action: LIST /users*
*Expected: PERMISSION_DENIED*

### P10: System-Only Field Modification (Invoice Number)
*Action: UPDATE /invoices/INV_ID*
```json
{
  "invoiceNumber": "MALICIOUS_INV_999"
}
```
*Expected: PERMISSION_DENIED (Immutable after creation)*

### P11: Denial of Wallet (Customer Name)
```json
{
  "name": "X".repeat(1000000),
  "phone": "1234567890",
  "userId": "CURRENT_USER_UID"
}
```
*Expected: PERMISSION_DENIED*

### P12: Temporal Integrity Spoofing
```json
{
  "name": "Aspirin",
  "sku": "ASP001",
  "sellingPrice": 10,
  "stockQuantity": 100,
  "userId": "CURRENT_USER_UID",
  "createdAt": "2000-01-01T00:00:00Z"
}
```
*Expected: PERMISSION_DENIED (Must be request.time)*

## 3. The Test Runner (Conceptual)
A `firestore.rules.test.ts` would be used to verify these payloads against the rules.
