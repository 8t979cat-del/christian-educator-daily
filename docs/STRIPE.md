# Stripe: Billing and Invoicing for ed180.org

This guide sets up Stripe for Everyday Devotional. It follows the plan from Stripe's
implementation planner, applied to how this site already works. Do everything in a **sandbox
(test mode)** first, then repeat it in live mode.

## The plan, in one table

| Decision | What we use | Why |
|---|---|---|
| How people pay | **Stripe-hosted Checkout** (already built) | Stripe's default; no card data touches this site |
| Pricing | **Educator Plus**: flat rate, monthly and yearly. **School License**: **per seat** (per teacher), monthly and yearly | Matches the two offers |
| Free access | **Freemium**: the daily devotional is free with no card; paid plans are an upgrade | Already how the site works |
| Changes and cancellation | **Stripe Customer Portal** (already linked from Settings → Billing) | No custom code; cancels at period end |
| Failed payments | **Smart Retries + automated emails + automatic card updates** | Dashboard settings, no code |
| Schools that need an invoice | **Quotes** for school licenses, invoices **sent** (net terms), paid on Stripe's **Hosted Invoice Page** by card, ACH or bank transfer | Schools pay by purchase order and invoice |
| Invoice look | **Branding** plus an **invoice template** with a PO number field | Schools need their PO on the invoice |
| Tax | **Stripe Tax threshold monitoring** (free) | Alerts you before you owe sales tax anywhere |
| Reconciliation | **Stripe Dashboard** | The site's own records stay current through the webhook |
| API version | **2026-11-18.endive**, set on every request (`src/lib/billing/stripe.ts`) | Your account's default can change without changing the site |

## 1. Products and prices

Dashboard → **Product catalog** → **Add product**:

1. **Educator Plus**: two recurring prices, monthly and yearly, flat rate.
2. **School License**: two recurring prices, monthly and yearly, **per unit** (one unit is one teacher seat).
3. On each product, set the **tax category** to *Digital products / software as a service* (needed for tax monitoring).
4. Copy the four `price_…` ids.

## 2. Keys and webhook (Vercel)

1. Developers → **API keys**: copy the secret key. In Vercel → Settings → Environment Variables, set
   `STRIPE_SECRET_KEY`. Use `sk_test_…` now and `sk_live_…` later; the environment check refuses the wrong one.
2. Developers → **Webhooks** → **Add endpoint**:
   - URL: `https://ed180.org/api/stripe/webhook`
   - **API version: 2026-11-18.endive**, the same version the site sends. This matters, because the
     event shape follows the endpoint's version.
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.finalized`.
3. Copy the endpoint's signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` in Vercel.
4. Make sure `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel (the webhook writes with it). Then **Redeploy**.

## 3. Customer Portal, emails and failed payments (Dashboard only)

- Settings → Billing → **Customer portal**: allow updating payment methods, viewing invoices,
  switching between monthly and yearly, changing quantity (school seats) and cancelling **at the end of
  the period**.
- Settings → Billing → **Subscriptions and emails**: turn on **Smart Retries**, failed-payment emails,
  emails about expiring cards, and **automatic card updates**. After all retries fail, choose
  **cancel the subscription** (the site removes access when the period ends).
- Settings → **Emails**: turn on receipts for successful payments.

## 4. Invoices for schools

- Settings → **Branding**: logo, brand colour (#2350cc), and the footer text.
- Settings → Billing → **Invoice template**: add a **custom field "PO number"** and a memo, for example
  "Thank you for using Everyday Devotional in your classrooms."
- Settings → Billing → **Invoices**: default **payment terms of Net 30**, and turn on **invoice reminders**.
- Settings → **Payment methods** (for invoices): turn on **cards**, **ACH Direct Debit** and
  **bank transfers**. Stripe gives each school its own virtual account number for bank transfers.

### Selling a school license with a quote

1. **Customers → Add customer**: the school's name and its billing contact's email.
2. On this site, go to **Admin → Plans and billing → "Schools billed by quote or invoice"**. Choose the
   school, paste the customer's `cus_…` id, and press **Link school**. Do this before the quote is
   accepted. Without the link, the site cannot tell which school the subscription belongs to.
3. **Quotes → Create quote** for that customer: the School License price, quantity = number of teachers,
   **Email invoice** with Net 30, and the PO number in the invoice's custom field.
4. When the school accepts, Stripe creates the subscription. The webhook turns on the school's license,
   and its teachers get access. Invoices appear under the school's billing page.

A one-off invoice (for example, extra seats mid-year) works the same way: link the customer first, then
create the invoice in the Dashboard.

## 5. Tax

Settings → **Tax**: confirm the head-office address. Leave collection off and use **threshold
monitoring**, which is free. Stripe alerts you before sales in any state cross a registration threshold.
Ask an accountant before turning on collection, since many states exempt or treat sales to schools differently.

## 6. Enter prices on the site and open checkout

1. **Admin → Plans and billing → Prices**: paste each `price_…`, press **Save and read amount from
   Stripe**, then tick **Offer this price**.
2. **Admin → Launch**: switch on **Paid subscriptions**.

## 7. Test (sandbox), then go live

- Test card `4242 4242 4242 4242` (any future date, any CVC). Card `4000 0000 0000 0341` attaches but
  fails on renewal, which is useful to see Smart Retries and the past-due notice.
- Check the Plus account unlocks the AI tools, then cancel in the Customer Portal and check that access
  lasts to the period end.
- Run the school path with a quote and pay its invoice on the Hosted Invoice Page with the test bank
  account.
- For live mode, create the products, prices, webhook (same API version) and settings again (sandbox
  objects do not carry over). Swap in the live keys, paste the live price ids, redeploy, make one real
  small purchase, and refund it.

## Code that implements this

- `src/lib/billing/stripe.ts`: the REST client. Every request carries an idempotency key on writes and
  `Stripe-Version: 2026-11-18.endive`.
- `src/app/api/stripe/webhook/route.ts`: verifies the signature, then hands the event to the database
  function `billing_apply_event`, which is idempotent and order-aware.
- `src/app/actions/billing.ts`: Checkout, the Customer Portal, seat and interval changes, and cancel at period end.
- `src/app/actions/billing-admin.ts`: prices, plans, complimentary access, and linking a school to its Stripe customer.

When Stripe starts a new major version, read its changelog before changing `STRIPE_API_VERSION`.
Then upgrade the webhook endpoint to the same version.
