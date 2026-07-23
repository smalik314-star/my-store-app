# PharmaFlow ERP audit — Phase 1

Audit date: 23 July 2026  
Scope: current `staging/security-hardening` application, without production data migration or deployment.

## Architecture

- React 19, TypeScript and Vite single-page application.
- React Router protected routes under a shared application layout.
- Firebase Authentication (Google), Cloud Firestore and Firebase Storage.
- Tenant isolation is based on the authenticated user's stable `tenantId`.
- Returning users load `users/{uid}`; first-time owners use the deterministic tenant ID `tenant_{uid}`.
- Firestore services contain the current business operations. There is no separate trusted server/API transaction layer.
- Financial and stock reporting is calculated from source collections in the browser.

## Existing routes

- Authentication: `/login`
- Dashboard: `/dashboard`
- Inventory: `/inventory`, `/expiry-alerts`, `/low-stock`
- Parties: `/customers`, `/customers/:id`
- Sales: `/billing`, `/invoices`, `/invoice/:id`, `/invoice/:id/print`
- Purchases: `/purchases`, `/purchases/new`, `/purchases/:id`
- Reports and administration: `/reports`, `/settings`, `/subscription`, `/users`

Return, receipt, payment, supplier-ledger, customer-ledger, expense and stock-adjustment routes do not yet exist.

## Existing Firestore model

| Collection/path | Current purpose | Key relationships |
| --- | --- | --- |
| `users/{uid}` | Auth profile, role, status and tenant membership | UID is the document ID |
| `tenants/{tenantId}` | Store, owner, plan, limits and usage counters | `ownerId -> users.uid` |
| `tenants/{tenantId}/users/{uid}` | Tenant user membership | Tenant and UID scoped |
| `tenants/{tenantId}/logs/{logId}` | Sensitive-operation audit log | Tenant scoped |
| `settings/{tenantId}` | Store and invoice settings | Document ID is tenant ID |
| `products/{productId}` | Product master, total stock and embedded `batches[]` | `tenantId`; batch stock is embedded |
| `brands/{brandId}` | Brand master | `tenantId` |
| `customers/{customerId}` | Customer details and aggregate sales/outstanding fields | `tenantId` |
| `suppliers/{supplierId}` | Supplier master | `tenantId` |
| `purchases/{purchaseId}` | Purchase header | `supplierId`, `tenantId` |
| `purchaseItems/{itemId}` | Purchase lines | `purchaseId`, `productId`, `tenantId` |
| `invoices/{invoiceId}` | Invoice header with embedded item and batch allocations | `customerId`, `productId`, `tenantId` |
| `stockMovements/{movementId}` | Stock audit movements | Source invoice/purchase and product |
| `counters/{counterId}` | Invoice and purchase sequences | `tenantId` |

No production collections for sales returns, purchase returns, receipts, payments, expenses or ledger entries were found.

## Transaction dependency map

### Product creation

1. Writes `products`.
2. Increments `tenants.usage.productsCount`.
3. These two operations were separate at audit time, so a partial write is possible.

### Purchase posting

One Firestore transaction:

1. Updates purchase counter.
2. Creates `purchases`.
3. Creates `purchaseItems`.
4. Updates product summary and embedded batches.
5. Creates `PURCHASE_IN` stock movements.

It does not currently update supplier payable or a supplier ledger.

### Purchase deletion

The audited implementation reverses product/batch stock, creates reversal movements, then hard-deletes the purchase and its lines. This loses business-document audit history and must be replaced by status-based cancellation before the workflow is considered ERP-safe.

### Invoice posting

1. Invoice number is reserved in a separate counter transaction.
2. A second transaction validates tenant, products and customer.
3. It creates the invoice.
4. It deducts product and batch stock using FEFO.
5. It captures batch allocations and actual purchase cost on invoice items.
6. It creates stock movements.
7. It updates customer aggregate paid/outstanding values.
8. It updates tenant usage and creates a tenant audit log.

The separate number reservation can leave a harmless sequence gap after a failed save. It does not create a duplicate invoice, but number allocation and posting are not one atomic operation.

### Invoice cancellation

Phase 2 replaces hard deletion with an atomic status transition:

1. Verifies the invoice is posted and tenant-owned.
2. Restores the captured batch allocations exactly once.
3. Restores product totals.
4. Reverses customer aggregate amounts.
5. Decrements tenant invoice usage.
6. Creates reversal stock movements and an audit log.
7. Marks the invoice `cancelled`; it is retained in history.

Dashboard and reports exclude cancelled invoices from active financial totals.

### Reports

- Dashboard: `products`, `customers`, `invoices`.
- Reports: `invoices`, `products`, `customers`.
- Inventory intelligence: `invoices` and `products`.
- Purchases are not yet included in the main report dashboard.
- Supplier payable, receipts/payments and ledgers have no source model yet.

## Critical findings

1. Invoice and purchase deletion were destructive.
2. Billing previously counted expired batch quantity as available stock.
3. Product, expiry and low-stock screens expose direct product deletion rather than audited adjustment/inactivation.
4. Dashboard and several reports use unbounded tenant collection listeners.
5. Product selector search loads all tenant products and filters in the browser.
6. No complete sale-return, purchase-return, payment, receipt, ledger or expense model exists.
7. Supplier payable is not updated by purchase posting.
8. Invoice numbering is committed before the invoice transaction and can develop sequence gaps.
9. Product creation and usage-counter update can partially succeed.
10. The AI service contains an estimated-profit path; it must not be presented as accounting profit.
11. Several UI locations construct `₹` strings directly instead of using the shared formatter.
12. No automated tests existed before Phase 2.
13. Production build has large chunks, principally invoice detail and the main bundle.

## Baseline verification

- TypeScript check: passed before implementation.
- Production build: passed before implementation.
- Existing automated tests: none.
- Existing build warning: chunks above 500 kB.

## Compatibility policy

- Existing collections and document IDs remain unchanged.
- New fields are optional for legacy records.
- No bulk rewrite or automatic migration will be run.
- Old invoices without `status` are read as active/posted.
- Rule/index changes remain repository-only until explicitly approved for deployment.

