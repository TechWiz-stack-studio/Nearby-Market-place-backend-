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
