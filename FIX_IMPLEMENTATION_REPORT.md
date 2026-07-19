# PharmaFlow Fix Implementation Report

Date: 18 July 2026  
Source: latest uploaded `pharmaflow (2).zip`  
Deployment status: **not deployed**; production Firebase/Cloud Run data was not modified.

## Validation

| Check | Result |
|---|---|
| ZIP integrity | Pass |
| `npm ci` after lockfile synchronization | Pass |
| `npm run lint` / TypeScript | Pass |
| `npm run build` | Pass |
| JSON configuration parsing | Pass |
| Firestore Emulator rules execution | Blocked: available runtime has Java < 21; current Firebase CLI requires Java 21+ |
| Live-data migration | Not run intentionally |

The production build still reports large chunks (main ~1.03 MB and InvoiceDetail ~627 KB before gzip). This is not a correctness blocker but remains a mobile-performance task.

## Implemented fixes

### Security and tenancy

- Replaced broad Firestore rules with tenant-scoped rules.
- Prevented users from changing their own `uid`, `tenantId`, `role`, or `status`.
- Restricted user profile updates to display name, photo and last login.
- Added immutable `tenantId` enforcement to tenant-owned documents.
- Added `tenantId` to new purchase-item records and secured reads/deletes by tenant.
- Scoped counters using an immutable `tenantId`.
- Made stock movements append-only.
- Restricted invoice updates to cancellation metadata and owner/admin roles.
- Blocked client-side subscription plan/limit changes through tenant document updates; a trusted backend must perform subscription changes.
- Added basic non-negative invoice/payment invariants to rules.

### Purchase and inventory integrity

- Reordered purchase transaction reads before writes.
- Added product tenant-ownership validation.
- Added quantity, price and batch validation.
- Added tenant ownership to purchase counter documents.
- Fixed purchase deletion to query tenant-owned items and pre-read all products before transaction writes.
- Safely blocks duplicate product rows that would otherwise cause lost stock updates; the UI/data model should later merge them explicitly.

### Invoice and batch integrity

- Aggregates duplicate invoice-line quantities before stock validation.
- Validates both aggregate stock and summed batch stock.
- Removed negative-batch fallback.
- Captures exact per-batch deductions and historical purchase cost on invoice items.
- Recalculates stored price, GST, subtotal, discount, total, amount received and outstanding amount in the service from current product data.
- Invoice deletion now pre-reads every dependent document and restores exact recorded batches.
- Legacy invoices without batch provenance are blocked from destructive deletion and require reviewed adjustment.
- Added stable server-side chronological invoice pagination and required index.

### Dues, profit and export

- Partial dues now use `outstandingAmount`; the 50% guess was removed.
- Historical profit now uses the invoice-item cost snapshot instead of the current product cost.
- CSV fields are quoted/escaped and spreadsheet-formula prefixes are neutralized.
- Object URLs are released after export.

### Email and Cloud Run server

- Email endpoint now requires a Firebase ID token.
- Server verifies user status and invoice tenant ownership with Firebase Admin.
- Added per-user rate limiting, email/content/attachment validation and generic server errors.
- Disabled Ethereal fallback in production.
- Client now sends the ID token and invoice ID.
- Server respects Cloud Run's `PORT` environment variable.

### Build and configuration

- Synchronized `package-lock.json`; clean `npm ci` now succeeds.
- Added `firestore.indexes.json` and connected rules/indexes in `firebase.json`.

## Files changed

- `firestore.rules`
- `firestore.indexes.json` (new)
- `firebase.json`
- `package-lock.json`
- `server.ts`
- `src/types/index.ts`
- `src/services/userService.ts`
- `src/services/purchaseService.ts`
- `src/services/invoiceService.ts`
- `src/pages/reports/Reports.tsx`
- `src/pages/billing/InvoiceDetail.tsx`

## Remaining blocked/partial items

1. **Trusted billing boundary:** calculations are hardened in the shared service, but invoice/stock writes still originate from the browser. A malicious authenticated user can bypass UI code. Full production security requires moving invoice finalization, stock adjustment, purchase posting, cancellation, subscription changes, and user-role administration to Cloud Run/Cloud Functions with Firebase token and App Check verification.
2. **Legacy migration:** existing `purchaseItems` need `tenantId`; existing invoices need `amountReceived`, `outstandingAmount`, `purchaseCost`, and `batchDeductions`. Do not guess these values. Generate a dry-run migration report and manually reconcile ambiguous records.
3. **Rules tests:** deploy nothing until Firebase Emulator tests pass on Java 21+.
4. **Subscription/user administration:** current client service methods for plan upgrades/invites conflict with safer rules. Replace them with authenticated admin backend endpoints before enabling those screens.
5. **Bundle performance:** PDF/HTML canvas and chart code still produce large chunks. Lazy import and production diagnostic-log removal remain.
6. **Vercel:** this live app is Cloud Run-based. The included `vercel.json` is not a valid deployment path for the Express API; do not deploy this app to Vercel without converting `/api` to functions.
7. **Automated application tests:** no test framework existed in the source. Add transaction, money, reconciliation and E2E tests in addition to rules tests.

## Required migration sequence

1. Back up/export Firestore.
2. Deploy a staging Cloud Run revision connected to a staging Firebase project.
3. Run Firebase Emulator rules tests on Java 21+.
4. Dry-run a script that maps each legacy `purchaseItem` to its parent purchase tenant.
5. Dry-run invoice classification: exact data available vs ambiguous legacy cost/batch/payment records.
6. Backfill only deterministic fields; export ambiguous rows for manual reconciliation.
7. Deploy indexes and wait until they finish building.
8. Deploy rules only after staged app flows pass.
9. Deploy the Cloud Run application revision.
10. Smoke-test login, product, purchase, billing, partial payment, invoice PDF/email and reports.

## Rollback

- Keep the current Cloud Run revision available and route traffic back if smoke tests fail.
- Save the existing Firestore rules and index configuration before deployment.
- Do not roll back data by deleting new fields; the added fields are additive. Restore Firestore only from the verified pre-migration export if a migration corrupts data.

## Production verdict

**Improved but not yet approved for production deployment.** Local compile/build validation passes. The next mandatory checkpoint is staging + Firebase Emulator security tests + deterministic legacy-data migration. No live deployment should occur directly from this ZIP.
