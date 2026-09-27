# Hopewick Plus — accounts and Stripe

Individual subscriptions are **AU$20 per month** (AUD). The marketing site and companion stay static HTML. Sign-in, Stripe Checkout, the Customer Portal, and the webhook run in a small Node server (`server/index.js`) with no extra npm packages.

Chats, memories, and readings stay in the browser. The account file stores **email and subscription status only**.

Crisis lines, domestic and family violence support, Get help, the public demo, and **today’s** Word for the day and Just for today stay free.

Organisation and clinic seat plans are **not** for sale here. They remain “coming soon”. The existing pilot sheet (`pilot-pricing.html`) is unchanged as a conversation starter for services.

## Free and paid

| | Free | Hopewick Plus (AU$20/month) |
|---|---|---|
| Website | Yes | Yes |
| Crisis, domestic and family violence, Get help | Always | Always |
| Companion demo, including today’s readings | Yes | Yes |
| Chat | Demo, plus the latest conversation on a free account | Full chat history on this device |
| Reading library (any day of the year) | Today only | Yes |
| Account and Stripe Customer Portal | Sign-in optional | Manage card, cancel, invoices |

Signing in is required before Checkout. A free account does not delete older chats; it only keeps the latest one open until Plus is active. People who never sign in keep the companion as it works today, including the demo for organisation trials.

## Environment variables

Copy `.env.example` to `.env` in the repo root (gitignored).

| Variable | Required | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | Yes, for Checkout | Secret API key. Use `sk_test_...` locally. |
| `STRIPE_PUBLISHABLE_KEY` | Yes, for a complete setup | `pk_test_...`. Returned by `GET /api/billing/config`. Checkout redirect does not need Stripe.js. |
| `STRIPE_PRICE_ID` | Yes, for Checkout | Price ID of a **recurring monthly AUD** price. Set the amount to **AU$20** in the Stripe Dashboard so the charge matches the page. |
| `STRIPE_WEBHOOK_SECRET` | Yes, to activate Plus | Signing secret for `POST /api/billing/webhook`. |
| `PUBLIC_BASE_URL` | Recommended | Origin used in magic links and Checkout return URLs, e.g. `http://127.0.0.1:8787`. |
| `PORT` | No | Defaults to `8787`. |
| `HOPEWICK_DEV` | Local only | `1` shows the magic link in the app and the server log, and enables `POST /api/billing/dev-set`. Set `0` in production. Defaults on unless `NODE_ENV=production`. |
| `RESEND_API_KEY` | Production email | Optional. With `MAGIC_LINK_FROM`, sign-in links are emailed via [Resend](https://resend.com). |
| `MAGIC_LINK_FROM` | With Resend | Verified from-address, e.g. `Hopewick <hello@hopewick.com.au>`. |
| `BILLING_STORE` | No | JSON file for accounts. Default `server/data/users.json`. |

Do not commit real keys. Placeholders in `.env.example` are not live credentials.

In the Stripe Dashboard (test mode):

1. Create a product such as “Hopewick Plus” with a **monthly** price of **A$20.00 AUD**. Copy the `price_...` id into `STRIPE_PRICE_ID`.
2. Turn on the [Customer Portal](https://dashboard.stripe.com/test/settings/billing/portal) (cancel, update payment method).
3. Add a webhook endpoint: `https://<your-host>/api/billing/webhook` listening for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

The server marks Plus **active** for Stripe statuses `active` and `trialing`. `canceled`, `past_due`, `unpaid`, `incomplete`, and `paused` do not unlock paid features. Cancellation comes from `customer.subscription.deleted` (and from `updated` when Stripe reports a non-Plus status).

## Run it locally

From the repo root (Node 20+):

```bash
cp .env.example .env
# edit .env with your Stripe test keys and price id
npm start
```

Open **http://127.0.0.1:8787/** (plans are on the home page) and **http://127.0.0.1:8787/app/** for the companion.

Use this server, not `python3 -m http.server`, when you want sign-in or Stripe. The Python server still serves the static demo; `/api` will not be there.

### Sign in without email

With `HOPEWICK_DEV=1` (the local default):

1. In the companion, open **Plans & account**.
2. Enter an email and request a link.
3. Click the link shown on screen (it is also printed in the server log).
4. You are signed in. Checkout stays disabled until Stripe keys and a price id are set.

### Stripe test mode

In another terminal, with the [Stripe CLI](https://stripe.com/docs/stripe-cli) logged into the same test account:

```bash
stripe listen --forward-to localhost:8787/api/billing/webhook
```

Put the CLI’s `whsec_...` value in `STRIPE_WEBHOOK_SECRET` and restart `npm start`.

Then, signed in, choose **Subscribe — AU$20/month**. On Checkout use test card `4242 4242 4242 4242`, any future expiry, any CVC, and postcode `2000`. You should return to the app, and the webhook should show Hopewick Plus as active. **Manage subscription** opens the Customer Portal.

To exercise gating without a card payment, while `HOPEWICK_DEV=1` and signed in:

```bash
curl -s -X POST http://127.0.0.1:8787/api/billing/dev-set \
  -H 'Content-Type: application/json' \
  -H "Cookie: hopewick_session=PASTE" \
  -d '{"status":"active"}'
```

`{"status":"canceled"}` locks Plus features again. This route is not available when developer mode is off.

### What to look at in the companion

- **Free / signed out:** Today’s readings, demo, Get help, and domestic and family violence stay available. Existing local chats are not deleted.
- **Signed in, not subscribed:** the latest conversation opens; older ones show a Plus note and a soft plans prompt. Today’s reading stays. Other days in the reading library do not.
- **Plus active:** any day in the reading library, and the full conversation list.
- Get help and the crisis card are never blocked.

## Tests

```bash
npm run test:billing
```

That checks magic-link sign-in, Checkout refusing anonymous users, a mocked Stripe Checkout session, webhook signature failure, and active/canceled updates. It does not call Stripe’s network.

## Production notes

- Set `NODE_ENV=production` and `HOPEWICK_DEV=0`.
- Set `RESEND_API_KEY` and `MAGIC_LINK_FROM`, or another mail path you add later. Without them, production will not reveal magic links.
- Put the Node server on a host that can receive Stripe webhooks. GitHub Pages can still serve the static site only if `PUBLIC_BASE_URL` and the companion’s requests point at this API on the **same site** (the cookie is `SameSite=Lax` and first-party). The simplest deployment is this server serving both the HTML and `/api`.
- Invite-code live AI is still the separate Azure Functions app (`https://hopewick-api.azurewebsites.net/api`). Plus does not replace that.

## PWA

TODO: a web app manifest, icons, and a service worker are not included. `theme-color` is already set. Add a manifest when real icons exist; do not add a service worker until caching of `app/index.html` is thought through.

## Security

Magic links expire after 30 minutes and work once. Sessions are random tokens stored as SHA-256 hashes, in an `HttpOnly` cookie, for 30 days. Webhooks require a valid `Stripe-Signature`. Do not put secret keys in HTML or in git.
