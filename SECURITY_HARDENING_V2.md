# PharmaFlow Security Hardening V2

## Implemented

- Strict free-tier tenant creation; plan, status and limits cannot be forged by a modified browser client.
- Invoice creator binding, item-count ceiling, total/outstanding arithmetic validation and role-restricted counters.
- Verified-email staff invitation claim flow. Staff membership is linked to the Firebase Auth UID.
- Tenant-scoped Storage paths and rules; only authenticated tenant users can access images, with role, MIME type and 5 MB limits.
- Optional Firebase App Check integration using reCAPTCHA Enterprise.
- AI history moved from persistent local storage to tab session storage and cleared at logout.
- Production console calls removed from compiled builds and Firestore diagnostic logging disabled outside development.
- Firebase Hosting CSP, clickjacking, MIME-sniffing, referrer, permissions and cache headers.
- Public privacy/data policy and login-page link.
- Email API origin restrictions, hidden Express signature, authenticated invoice access, PDF signature/size checks, safe filenames and rate limits.
- Email UI now fails safely when no backend URL is configured instead of sending to the SPA hosting route.

## Console configuration still required

1. Create a Firebase App Check web app with reCAPTCHA Enterprise.
2. Add its site key as `VITE_FIREBASE_APP_CHECK_SITE_KEY` before building.
3. Monitor App Check metrics, then enforce Firestore, Authentication and Storage after legitimate traffic is confirmed.
4. Initialize Cloud Storage if it is not already initialized, then deploy `storage.rules`.
5. Email requires a separately deployed Cloud Run/Functions backend, SMTP secrets and `VITE_API_BASE_URL`.
6. Replace the generic privacy contact with the operator's legal business name, email and postal address before public launch.

## Validation

- `npm run lint`: passed
- `npm run build:staging`: passed
- Firebase rules require an authenticated CLI dry-run because the rules compiler is a Firebase service in this environment.

## Safe deployment order

```powershell
npx firebase-tools deploy --dry-run --only firestore,storage --project testing-pharmaflow
npx firebase-tools deploy --only firestore,storage --project testing-pharmaflow
npm ci
npm run build:staging
npx firebase-tools deploy --only hosting --project testing-pharmaflow
```

Do not deploy this branch to the production Firebase project until owner login, invited staff login, viewer permissions, inventory, purchase, billing, cancellation, logo upload and product image upload smoke tests pass.
