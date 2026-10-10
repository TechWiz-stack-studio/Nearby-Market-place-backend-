# NEARBUY — Paystack production setup

This build changes NEARBUY from frontend-only Paystack initialization to a server-initialized payment flow using Netlify Functions.

## Files added
- `netlify/functions/paystack-initialize.js`
- `netlify/functions/paystack-verify.js`
- `netlify/functions/paystack-webhook.js`
- `netlify/functions/_shared.js`
- `netlify.toml`
- `package.json`

## Netlify environment variables
Set these in Netlify before deploying:

- `PAYSTACK_PUBLIC_KEY` = your Paystack public key (`pk_test_...` while testing, later `pk_live_...`)
- `PAYSTACK_SECRET_KEY` = your Paystack secret key (`sk_test_...` while testing, later `sk_live_...`)
- `FIREBASE_PROJECT_ID` = your Firebase project ID
- `FIREBASE_CLIENT_EMAIL` = Firebase service-account client email
- `FIREBASE_PRIVATE_KEY` = Firebase service-account private key. Keep the value private; if entered as one line, preserve `\\n` line breaks.

Never put `PAYSTACK_SECRET_KEY` in `index.html`, GitHub, or any browser-side JavaScript.

## Paystack webhook
Set the Paystack webhook URL to:

`https://YOUR-NETLIFY-DOMAIN.netlify.app/api/paystack-webhook`

The webhook handler validates Paystack's `x-paystack-signature` using HMAC-SHA512 before changing an order to `Payment Confirmed`.

## Testing order
1. Deploy this build with Paystack TEST keys first.
2. Make a test payment.
3. Confirm the order changes from `Payment Pending Verification` to `Payment Confirmed`.
4. Confirm the seller gets a paid-order notification only after confirmation.
5. Test failed/cancelled payments.
6. Only after successful testing, replace the Paystack public/secret environment variables with LIVE keys and activate the Paystack account.

The backend also recalculates the cart total from Firestore product prices instead of trusting the browser's price values.


## NEARBUY vendor wallet setup

Add `NEARBUY_WALLET_ADMIN_TOKEN` as a long, random secret in Netlify environment variables. Never put it in HTML, browser JavaScript, GitHub, or chat. It protects the server-side wallet earnings-release and manual-withdrawal processing endpoints.

- `POST /api/wallet-summary`: requires seller ID, registered phone and 4-digit seller PIN; returns the seller's ledger balance, pending paid-order earnings, bank details and recent transactions.
- `POST /api/wallet-bank-save`: verifies seller credentials before saving bank details.
- `POST /api/wallet-withdrawal-request`: verifies seller credentials, checks available ledger funds atomically, reserves the requested amount and creates a pending review request.
- `POST /api/wallet-admin-release`: requires `Authorization: Bearer <NEARBUY_WALLET_ADMIN_TOKEN>` and releases seller earnings only for a verified paid order marked Completed. Repeated calls are idempotent.
- `GET /api/wallet-admin-list-withdrawals`: requires the same server-only admin token and lists recent withdrawal requests.
- `POST /api/wallet-admin-process-withdrawal`: requires the same server-only admin token. Admins should make the approved bank transfer manually, then mark the request `paid`; if a request failed, the endpoint reverses the reserved amount.

Wallet earnings are based on the seller's product subtotal only; delivery charges and NEARBUY's service fee are not credited to the seller. Before production use, ensure Firestore Security Rules prevent unauthenticated browser clients from reading/writing wallet collections and prevent seller clients from changing payment status or marking orders Completed without the required confirmation. The current seller login is a custom phone/PIN flow, so review these rules carefully before enabling real-money withdrawals.


## Important deployment check for API 404 errors

If the browser reports `POST /api/paystack-initialize 404`, check the deployed Netlify site before changing payment logic:

1. Ensure the Netlify publish/base directory is the project directory containing `index.html`, `netlify.toml`, `_redirects`, `package.json`, and `netlify/functions/`. In this ZIP that directory is `Nearby-Market-place-backend--main/`. If deploying from a Git repository with this folder nested inside it, set the Netlify base directory to `Nearby-Market-place-backend--main` or move the project contents to the repository root.
2. Redeploy the site so Netlify detects `netlify.toml` and publishes the functions in `netlify/functions/`.
3. API redirects in `_redirects` must come before the `/* /index.html 200` fallback. This build orders them that way.
4. Test `GET /api/paystack-initialize`: a deployed function should respond with HTTP 405 and a JSON `Method not allowed` message, because this endpoint accepts POST only. A 404 means the function route/deployment is still not active.
5. Once routing works, test a POST using Paystack test keys and inspect Netlify Function logs for any Firebase or Paystack configuration errors.

Do not put Paystack secret keys or Firebase service-account credentials in browser code or public files.
