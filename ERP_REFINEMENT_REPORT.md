# PharmaFlow ERP Refinement Report

Date: 23 July 2026  
Target branch: `staging/security-hardening`  
Firebase project used by the current staging configuration: `testing-pharmaflow`

## 1. Existing architecture

- React 19, TypeScript and Vite frontend.
- Firebase Authentication with Google sign-in and persistent browser sessions.
- Cloud Firestore as the transactional store.
- Firebase Storage for product images and store logos.
- Firebase Hosting configuration with security headers and SPA rewrites.
- Tenant isolation based on the authenticated Firebase UID resolving to a stable `users/{uid}` profile containing `tenantId`.
- Product stock is stored as a product total plus embedded batch records; `stockMovements` provides the audit ledger.
- Route-level lazy loading is already used for major modules.

## 2. Firestore collections used

Existing/core collections:

- `users`
- `tenants`
- `tenants/{tenantId}/users`
- `tenants/{tenantId}/logs`
- `settings`
- `products`
- `brands`
- `customers`
- `suppliers`
- `invoices`
- `purchases`
- `purchaseItems`
- `stockMovements`
- `counters`

Transaction and ledger collections added/refined:

- `receipts`
- `supplierPayments`
- `ledgerEntries`
- `saleReturns`
- `saleReturnSummaries`
- `purchaseReturns`
- `purchaseReturnSummaries`

## 3. Data relationships discovered

- A user profile resolves one stable `tenantId`; all business documents carry the same tenant ID.
- Invoice items reference products and retain batch deductions so returns can restore the exact original batch.
- Purchase items reference their purchase, product and inward batch.
- Product total quantity is the aggregate of its batch quantities.
- Invoice posting deducts stock and creates stock movements in one Firestore transaction.
- Purchase posting increases stock, writes purchase items and stock movements atomically.
- Receipts reduce invoice/customer outstanding and create customer ledger entries.
- Supplier payments reduce purchase/supplier payable and create supplier ledger entries.
- Sale returns reference the original invoice and returned line quantities.
- Purchase returns reference the original purchase items and exact inward batches.
- Reports and dashboard totals use posted source transactions instead of UI placeholders.

## 4. Important bugs found

- Quick bills and normal invoices could be blocked by overly narrow counter/security-rule assumptions.
- Batch selection and deduction were not consistently FEFO-safe.
- Repeated submit/network retry protection was incomplete.
- Transaction cancellation and return workflows could not reliably reverse all financial/stock effects.
- Supplier and customer outstanding did not have complete receipt/payment workflows.
- Dashboard contained misleading placeholder trends and incomplete real totals.
- Gross-profit reporting did not consistently account for return impact.
- Returning login needed stable UID-to-tenant resolution without creating duplicate stores.
- Product brand autofill could overwrite or populate unrelated batch data.
- Product entry required unnecessary mouse travel for repeated entry.
- Fake store phone, address, GSTIN and email defaults were present.
- A demo medicine catalog could be silently seeded in the browser.
- Storage uploads were not namespaced by tenant.
- `firebase.json` referenced Storage rules but the working source archive did not contain the rules file.
- Print view performed no explicit application-side tenant verification.
- Date presentation mixed US and Indian locales.
- Production builds could fall back to the old Google AI Studio Firebase project instead of `testing-pharmaflow`.

## 5. Sections refined

- Authentication/profile persistence
- Shared INR and decimal-safe financial utilities
- Batch/FEFO stock utilities
- Dashboard
- Product and batch inventory
- Product repeat-entry workflow
- Purchase posting and cancellation
- Fast billing and invoice cancellation
- Customer receipts and outstanding
- Supplier payments and payable
- Sale returns
- Purchase returns
- Customer/supplier ledger source records
- Reports and gross-profit calculations
- Store settings
- Invoice print templates
- Tenant-scoped file storage
- Sidebar/routes for implemented ERP workflows

## 6. New or materially completed features

- Stable returning-login tenant restoration.
- INR formatting with Indian grouping throughout financial UI.
- Integer-paise arithmetic helpers.
- FEFO allocation with expired-batch blocking.
- Atomic invoice/purchase stock mutation and audit movements.
- Idempotent transaction request IDs for sensitive writes.
- Sale return with original invoice/batch provenance.
- Purchase return with supplier payable/credit adjustment.
- Customer receipt and supplier payment workflows.
- Customer/supplier ledger entries linked to source vouchers.
- Real dashboard sales, purchase, gross-profit, stock value and outstanding KPIs.
- Real report handling for purchases and sale-return impact.
- `Save & Add Another` product workflow.
- Product-to-brand autofill without overwriting a manually edited brand.
- Tenant-scoped logo and product-image paths.
- Print-view tenant check.
- Firebase fallback configuration aligned with the staging Firebase project and `(default)` database.

## 7. Main files changed

Business services:

- `src/services/invoiceService.ts`
- `src/services/purchaseService.ts`
- `src/services/receiptService.ts`
- `src/services/supplierPaymentService.ts`
- `src/services/saleReturnService.ts`
- `src/services/purchaseReturnService.ts`
- `src/services/dashboardService.ts`
- `src/services/userService.ts`
- `src/services/tenantService.ts`
- `src/services/medicineMasterService.ts`

Shared utilities and tests:

- `src/utils/currency.ts`
- `src/utils/stock.ts`
- `src/utils/transactions.ts`
- `src/utils/date.ts`
- `src/utils/storage.ts`
- `src/utils/currency.test.ts`
- `src/utils/stock.test.ts`
- `src/utils/transactions.test.ts`

UI/routes:

- `src/pages/dashboard/Dashboard.tsx`
- `src/pages/reports/Reports.tsx`
- `src/pages/billing/Billing.tsx`
- `src/pages/billing/InvoiceDetail.tsx`
- `src/pages/billing/PrintInvoice.tsx`
- `src/pages/purchases/PurchaseEntry.tsx`
- `src/pages/returns/SaleReturns.tsx`
- `src/pages/returns/PurchaseReturns.tsx`
- `src/pages/accounting/Receipts.tsx`
- `src/pages/accounting/SupplierPayments.tsx`
- `src/components/inventory/ProductForm.tsx`
- `src/components/billing/InvoiceTemplate.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/routes/AppRouter.tsx`
- `src/pages/settings/Settings.tsx`
- `src/context/SettingsContext.tsx`

Configuration:

- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`
- `firebase.json`

## 8. Backward-compatible schema additions

All additions are optional when old documents are read.

- Invoice: return totals/count, cancellation metadata, batch deductions and request/idempotency data.
- Purchase: paid amount, payable amount, payment status, return amount/count and `supplierLedgerTracked`.
- Customer/supplier: aggregate paid, outstanding/payable and credit balances.
- Return/payment/receipt documents: tenant, source voucher, request ID, actor and timestamp.
- Stock movement: reference IDs, exact batch, previous/new quantity, actor and reason.

Legacy purchases are not silently rewritten. Financial actions that require a reliable supplier ledger are blocked until the legacy purchase is reconciled.

## 9. Rules and indexes

- Firestore rules require authentication and verify tenant membership through `users/{uid}`.
- Cross-tenant reads/writes are blocked.
- Transaction collections use create-only or narrowly controlled update rules.
- Posted/cancelled state transitions are restricted.
- Existing owner access is preserved.
- Storage rules now allow image files under `tenants/{tenantId}/logos` and `tenants/{tenantId}/products`, with active membership, MIME and 5 MB limits.
- Existing index configuration is preserved; required transaction indexes are maintained in `firestore.indexes.json`.

Rules were not deployed automatically.

## 10. Stock-integrity protections

- FEFO allocation selects the nearest valid expiry.
- Expired or invalid-expiry batches are excluded.
- Insufficient stock aborts before invoice commit.
- Stock, invoice/purchase and movement records use Firestore transactions.
- Sale returns restore only proven original batches when resellable.
- Damaged returns do not re-enter saleable stock.
- Purchase returns deduct the exact original inward batch.
- Return quantities cannot exceed source quantities minus earlier returns.
- Cancelled records cannot be reversed twice.
- Deterministic request IDs prevent duplicate effects from retry/double click.

## 11. Financial protections

- Shared integer-paise rounding avoids common binary floating-point drift.
- Payment/receipt values cannot be zero, negative or exceed outstanding.
- Returns reduce outstanding/payable first, then create party credit.
- GST line calculations validate quantity, rate, GST and discount.
- Reports label gross profit and use recorded batch purchase cost where available.
- Sales returns reduce revenue, GST estimate and gross profit.

## 12. INR formatting

- Central formatter uses `Intl.NumberFormat('en-IN', { currency: 'INR' })`.
- Money output uses `₹` and two decimals.
- Dashboard, billing, purchases, returns, outstanding, reports and print templates use the shared formatter.
- Store currency is normalized and locked to `₹` when settings are loaded or saved.
- US currency presentation was not introduced.

## 13. Automated tests

Latest result: 14/14 passing.

- INR grouping and paise precision
- Intrastate CGST/SGST split
- Interstate IGST
- Invalid financial inputs
- Expiry-day behavior
- Expired stock exclusion
- FEFO selection/allocation
- Insufficient stock
- Cumulative return limits
- Whole-number return validation
- Return outstanding/credit settlement
- Payment over-allocation and paise precision

## 14. Build, lint and type-check

- `npm run lint`: passed (`tsc --noEmit`)
- `npm test -- --run`: passed, 3 files and 14 tests
- `npm run build`: passed

Non-blocking build warnings remain for large generated chunks, mainly the application entry and invoice detail bundle.

## 15. Manual testing status

Previously confirmed on staging during the refinement:

- Google login
- Same-store data after login
- Firestore rules deployment
- Product/batch creation
- Quick bill creation
- Hosting deployment

The latest source changes in this report were validated locally but were not deployed automatically. The live site therefore still requires a new authorized staging deployment and smoke test.

## 16. Remaining risks

- Firebase Storage must be enabled and `storage.rules` deployed before new tenant-scoped uploads work.
- Firestore/Storage rules should be tested with the Firebase Emulator Suite or authenticated staging dry-run.
- Older purchases without ledger tracking require an explicit reconciliation workflow.
- Current large bundles should be split further for slower mobile devices.
- Dashboard/report queries still need server-side aggregation for very large production datasets.
- Full concurrency tests require Firebase emulator integration rather than only pure unit tests.

## 17. Intentionally postponed

These were not presented as complete because the current schema does not safely support them yet:

- Full bill hold/reservation system
- Mixed-payment allocation
- Full double-entry accounting/cash-bank book
- Expense accounting
- Barcode label generation
- Stock transfer between multiple locations
- Bulk 250,000-row server import job with resumable audit processing
- Official GST return filing/export claims
- Advanced role matrix beyond existing owner/admin/staff enforcement
- Complete A4/thermal regulatory template certification

## 18. Deployment instructions

Run from the reviewed project folder after pulling the staging branch:

```powershell
npm ci
npm run lint
npm test -- --run
npm run build
npx firebase-tools deploy --only firestore,storage --project testing-pharmaflow
npx firebase-tools deploy --only hosting --project testing-pharmaflow
```

Deploy rules first, then hosting. After deployment, perform the workflow regression checklist with a real test tenant before promoting to a production Firebase project.
