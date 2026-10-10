# NEARBUY update notes — 10 October 2026

## Included in this working update

- Fixed initial product loading so the app waits for the Firebase module to finish registering its product loader and real-time listener before initializing the product grid. Added loading and failure states.
- Added a horizontal Shop by brand menu that filters the product grid alongside the existing category chips. Product brand falls back to the seller's business/name for older listings.
- New admin-created and seller-created listings now save brand/business metadata consistently. Admin category choices now match the seller's category choices.
- Seller order cards show the customer contact, delivery address, area/state, delivery note, payment status, item quantities and line totals. Seller ownership checks accept legacy seller ID variants.
- Paystack checkout no longer exits before calling the backend when the inline SDK is unavailable. It falls back to Paystack's server-provided authorization URL, and the backend provides a return URL so the app can verify a redirect payment.
- Added a seller wallet panel with available/pending amounts, bank details, transaction history, withdrawal request submission and withdrawal request status.
- Added server-side wallet functions for seller PIN verification, saving bank details, atomically reserving available balance for withdrawals, listing withdrawal requests, releasing earnings for paid/completed orders, and recording paid/failed manual withdrawal processing. Added `wallet-admin.html` as a separate admin console that requires the server-only admin token to list/process requests and release eligible earnings.
- `/seller.html` now forwards to the integrated seller dashboard so there is one seller experience to maintain.

## Important deployment steps

1. Deploy using Paystack test keys first. Configure `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in Netlify. Netlify's `URL` is used to construct the Paystack return URL when available.
2. Add a long random `NEARBUY_WALLET_ADMIN_TOKEN` in Netlify. It is required by server-side admin wallet endpoints and must never be placed in frontend code.
3. Before enabling real wallet funds, update the existing Firestore Security Rules so browser clients cannot read or write `walletTransactions`, `withdrawalRequests`, or `vendorBankAccounts`, and cannot spoof payment verification or trusted delivery confirmation. The ZIP did not contain your current Firestore rules, so they were not replaced.
4. The wallet only credits available earnings through the protected `wallet-admin-release` endpoint after the order is marked paid and Completed. The endpoint is idempotent. The admin must independently confirm delivery/collection before calling it. Withdrawal requests reserve the amount and are manual: make the bank transfer first, then mark the request paid. Failed requests are reversed.
5. The current ₦100-per-product-unit service-fee calculation is unchanged in this update. It should not be assumed to cover Paystack fees for every order; compare it with your account's actual Paystack pricing before deciding whether to revise the fee or pass processing fees through. The Paystack payment amount verification currently expects the exact order total, so do not enable a Paystack fee pass-through setting without updating and testing that verification logic too.

## Testing status

- JavaScript syntax checks passed for the page scripts and Netlify function files.
- Live Firebase/Paystack transactions, Netlify deployment, Firestore rules and real bank payouts were not run in this local environment.
