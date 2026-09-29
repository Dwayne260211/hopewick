# Hopewick Plus — accounts and Stripe

Individual subscriptions are a **3-day free trial, then AU$20 per month** (AUD). The marketing site and companion stay static HTML. Sign-in, Stripe Checkout, the Customer Portal, and the webhook run in a small Node server (`server/index.js`) with no extra npm packages.

Chats, memories, and readings stay in the browser. The account file stores **email and subscription status only**.

Crisis lines, domestic and family violence support, Get help, Hope chat at the free daily cap, the public demo, and **today’s** Word for the day and Just for today stay free. SMART goals, the journal, the resume builder, and education libraries (nutrition, gut health, neuroplasticity, and ice baths and recovery spas) need Hopewick Plus.

Organisation and clinic seat plans are **not** for sale here. They remain “coming soon”. The existing pilot sheet (`pilot-pricing.html`) is unchanged as a conversation starter for services.

## Free and paid

| | Free | Hopewick Plus (3 days free, then AU$20/month) |
|---|---|---|
| Website | Yes | Yes |
| Crisis, domestic and family violence, Get help | Always | Always |
| Hope chat | 5 messages/day | No daily message limit |
| Chat history | Latest conversation on a free account | Saved chat history on this device |
| Daily message limit (marketing policy) | 5 messages/day | No daily message limit (active, trialing, and founder) |
| Reading library (any day of the year) | Today only | Yes |
| SMART goals | Tease only | Full weekly editor, on this device |
| Journal | Tab with an upgrade | Write, edit, deepen |
| Resume builder | Tease only | Builder and PDF, on this device |
| Education libraries | Names and an upgrade | Nutrition, gut health, neuroplasticity, and ice baths and recovery spas. Free sees the names only |
| Account and Stripe Customer Portal | Sign-in optional | Manage card, cancel, invoices |

Signing in is required before Checkout. A free account does not delete older chats; it only keeps the latest one open until Plus is active. People who never sign in keep Today’s Readings, crisis support, Get help, and Hope chat when the account service is reachable. Scripted sample conversations stay at `app/?demo=1` for organisation trials. The demo is not Plus, so SMART goals, the journal, and the resume builder show the trial screen there too.

The free daily message limit (5 messages/day) is enforced by the account server on hosted Hope (`POST /api/hope/chat`). Hopewick Plus, a 3-day trial, and complimentary founder emails have no daily message cap. Crisis and Get help replies are not counted and are not refused for the free cap. The marketing site and the Hopewick Plus screen use the same numbers. `HOPEWICK_FREE_DAILY` can override the free number. `HOPEWICK_PLUS_DAILY` is not used.

## Environment variables

Copy `.env.example` to `.env` in the repo root (gitignored).

| Variable | Required | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | Yes, for Checkout | Secret API key. Use `sk_test_...` locally. |
| `STRIPE_PUBLISHABLE_KEY` | Yes, for a complete setup | `pk_test_...`. Returned by `GET /api/billing/config`. Checkout redirect does not need Stripe.js. |
| `STRIPE_PRICE_ID` | Yes, for Checkout | Price ID of a **recurring monthly AUD** price. The test price already in Stripe is `price_1UKDd4PoYudRr3bcBe7IIdTH` (AU$20/month). A live-mode price has a different id. |
| `STRIPE_WEBHOOK_SECRET` | Yes, to activate Plus | Signing secret for `POST /api/billing/webhook` (`whsec_...`). |
| `PUBLIC_BASE_URL` | Recommended | Origin used in magic links and Checkout return URLs. Local: `http://127.0.0.1:8787`. Production: `https://hopewick.com.au`. |
| `PORT` | No | Defaults to `8787`. Render sets this itself (usually `10000`); do not pin it in the Dashboard. |
| `HOST` | Production | Local default `127.0.0.1`. Production must be `0.0.0.0` so the platform can reach the process. `NODE_ENV=production` already does that when `HOST` is unset. |
| `NODE_ENV` | Production | `production` on the host. Turns developer mode off unless `HOPEWICK_DEV=1` (the process refuses to start in that combination). |
| `HOPEWICK_DEV` | Local only | `1` shows the magic link in the app and the server log, and enables `POST /api/billing/dev-set`. Set `0` in production. Defaults on unless `NODE_ENV=production`. |
| `RESEND_API_KEY` | Production email | Required in production. With `MAGIC_LINK_FROM`, sign-in links are emailed via [Resend](https://resend.com). Without both, production sign-in returns 503 and does not reveal the link. |
| `MAGIC_LINK_FROM` | With Resend | Verified from-address, e.g. `Hopewick <hello@hopewick.com.au>`. |
| `BILLING_STORE` | No | JSON file for accounts. Default `server/data/users.json`. On Render: `/var/data/users.json` (the persistent disk). |
| `COOKIE_SECURE` | No | `1` forces the `Secure` cookie flag. `0` forces it off. When unset, the cookie is `Secure` if `PUBLIC_BASE_URL` is `https://` or the request is HTTPS. |
| `FOUNDER_PLUS_EMAILS` | No | Comma-separated emails that receive Hopewick Plus without Checkout. When unset, the only address is `dwaynesimons1990@gmail.com` (Dwayne Stevens). `admin@bridge-bite-co.com` is the organisations and clinics contact and is ignored on this list. Set the variable empty to grant complimentary Plus to nobody. Complimentary Plus is not sent to Stripe Checkout. The same list is the only one that can see Settings → Developer in the companion. |
| `OPENAI_API_KEY` | Yes, for hosted Hope | Server-only model key. Same secret already configured on the Azure app `hopewick-api`. Never commit it and never send it to the browser. |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini`. |
| `OPENAI_BASE_URL` | No | Default `https://api.openai.com/v1`. Must be `https`. |

Do not commit real keys. Placeholders in `.env.example` are not live credentials.

Settings → Developer (API key, model endpoint, own provider, and invite redeem when that control is enabled) stays hidden unless the signed-in Hopewick account email is on `FOUNDER_PLUS_EMAILS`. The companion reads the `founder` flag from `GET /api/auth/me`, which uses the same check as complimentary Plus. Guest, free, and other Plus accounts do not see it and cannot add, edit, or paste a personal API key. A key already stored in this browser does not replace hosted Hope for those accounts. `admin@bridge-bite-co.com` does not see it. The name typed on a local profile does not unlock it. Crisis support and domestic and family violence resources stay free.

In the Stripe Dashboard (test mode):

1. The test-mode product price is already created: **`price_1UKDd4PoYudRr3bcBe7IIdTH`** (AU$20.00 / month, AUD). Put that in `STRIPE_PRICE_ID` while you are in test mode. For real charges, create the same monthly AUD 20 price in **live** mode and use that live `price_...` id instead.
2. Turn on the [Customer Portal](https://dashboard.stripe.com/test/settings/billing/portal) (cancel, update payment method) in the same mode as the keys (test or live).
3. Add a webhook endpoint. Production URL: **`https://hopewick.com.au/api/billing/webhook`**. Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Copy the endpoint’s `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

The server marks Plus **active** for Stripe statuses `active` and `trialing`. `canceled`, `past_due`, `unpaid`, `incomplete`, and `paused` do not unlock paid features. Cancellation comes from `customer.subscription.deleted` (and from `updated` when Stripe reports a non-Plus status).

## 3-day trial (code, not a Dashboard setting)

New Checkout sessions set `subscription_data[trial_period_days]=3` on the existing recurring price (`STRIPE_PRICE_ID`). The live or test price id does not change. Stripe collects a card at Checkout (`payment_method_collection=always`) and bills that price when the 3 days end. `trialing` already counts as Plus, so the webhook turns Plus on before the first invoice. When the trial ends, `customer.subscription.updated` moves the status to `active` or `past_due`.

A person who already has a Stripe subscription id on the account — including after they cancel — does not get a second trial. The founder address (`dwaynesimons1990@gmail.com`, unless `FOUNDER_PLUS_EMAILS` overrides it) never goes through Checkout.

**Stripe Dashboard:** you do not need to add a trial on the Price, Product, or Billing settings. Leave any default trial at none / 0 days. Do not also turn on a free trial on the AU$20 price. A second trial on the price can make Checkout reject `trial_period_days` or apply a different length. If Checkout returns an error that the price already has a trial, remove that trial in the Dashboard and keep the code setting.

The Customer Portal does not need a change. A trialing subscription can be canceled there the same way as a paid one, when cancellation is enabled. Webhook events stay `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

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

1. In the companion, open **Hopewick Plus**.
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

## Production

GitHub Pages serves https://hopewick.com.au today (apex `A` records to GitHub’s IPs, `www` `CNAME` to `dwayne260211.github.io`). Pages is static, so `https://hopewick.com.au/api/billing/*` returns a GitHub **404** page. The companion calls `/api/...` on the same origin (`SameSite=Lax`, host-only cookie). The process in `server/index.js` already serves the HTML and `/api` together. Production is that one process, on [Render](https://render.com), in Singapore.

Hosted Hope for signed-in Free and Plus accounts runs on this same service: `POST /api/hope/chat`. Set `OPENAI_API_KEY` on the server (the key already used by `hopewick-api` is the one to copy). Do not put that key in the browser or in git. Free is 5 messages a day. Plus, a 3-day trial, and complimentary founder emails have no daily message limit. The count is the Australia/Brisbane calendar day and is stored beside the account, not the conversation.

The older invite-code proxy stays at `https://hopewick-api.azurewebsites.net/api` for Developer / organisation pilots. It is not the path a paying customer uses.

Accounts are a JSON file. Render’s free instance sleeps and has no disk, so a restart would drop sign-ins and subscription status and Stripe would miss webhooks. The blueprint uses a paid instance (`0.5c-512mb`) and a 1 GB disk mounted at `/var/data`. Keep the service at **one instance**. The disk is not shared across instances.

Start command: `node server/index.js` (`npm start`, the Dockerfile `CMD`, and the `Procfile`).

### What you set on Render

Create these in the Render Dashboard when the blueprint asks. Do not put the secret values in git.

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` (already in `render.yaml`) |
| `HOPEWICK_DEV` | `0` (already in `render.yaml`) |
| `PUBLIC_BASE_URL` | `https://hopewick.com.au` (already in `render.yaml`) |
| `HOST` | `0.0.0.0` (already in `render.yaml`) |
| `BILLING_STORE` | `/var/data/users.json` (already in `render.yaml`) |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys. Test: `sk_test_...`. Real charges: `sk_live_...`. |
| `STRIPE_PUBLISHABLE_KEY` | Same page. Test: `pk_test_...`. Live: `pk_live_...`. |
| `STRIPE_PRICE_ID` | Test: `price_1UKDd4PoYudRr3bcBe7IIdTH`. Live: the live-mode price id. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the endpoint below (`whsec_...`). |
| `RESEND_API_KEY` | Resend → API keys (`re_...`). |
| `MAGIC_LINK_FROM` | `Hopewick <hello@hopewick.com.au>` after that domain is verified in Resend. |
| `OPENAI_API_KEY` | The key already set on the Azure function app `hopewick-api`. Server only. |
| `OPENAI_MODEL` | Optional. `gpt-4o-mini` if unset. |

`PORT` is set by Render. Leave it alone.

Test keys and the test price charge nothing. Live keys, a live price, and a live webhook secret are what charge real cards. Use one mode all the way through (keys, price, portal, webhook). The publishable key and the price id are not secret; the secret key, webhook secret, and Resend key are.

### Deploy (after this pull request is on `main`)

You need a Render login and access to the GitHub repo. This repository cannot be switched over from here.

1. Merge the pull request so `main` contains `Dockerfile` and `render.yaml`.
2. In Render: **New → Blueprint**. Connect GitHub and choose `Dwayne260211/hopewick`. Apply `render.yaml`. Region is Singapore. The service name is `hopewick`.
3. Paste the environment variables above. If the form requires `STRIPE_WEBHOOK_SECRET` before the endpoint exists, use a placeholder such as `whsec_pending` and replace it in step 8. Saving a variable redeploys.
4. Wait until the deploy is live. Open the service’s `onrender.com` URL (Render may add a suffix if `hopewick` is taken) and check:
   - `/api/health` returns `{"ok":true}`
   - `/` is the marketing page
   - `/app/` is the companion
5. The blueprint requests certificates for `hopewick.com.au` and `www.hopewick.com.au`. In the Dashboard, confirm both show under Custom Domains. `www` is redirected to the apex so the sign-in cookie stays on one host. Leave the `onrender.com` hostname in place until the custom domain works.

Checkout return URLs and magic links use `PUBLIC_BASE_URL`, so a full sign-in and card test belongs on `https://hopewick.com.au` after DNS, not on the `onrender.com` hostname.

### DNS cutover (GoDaddy)

The domain’s nameservers are GoDaddy (`ns61.domaincontrol.com`, `ns62.domaincontrol.com`). Edit DNS there. Do not turn on GoDaddy domain forwarding.

Today:

| Host | Type | Value |
|---|---|---|
| `@` | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |
| `www` | CNAME | `dwayne260211.github.io` |

Replace them with:

| Host | Type | Value |
|---|---|---|
| `@` | A | `216.24.57.1` |
| `www` | CNAME | the service’s `onrender.com` hostname, from the Render Dashboard |

Delete all four GitHub `A` records. Do not leave them next to Render’s `A` record. There should be no `AAAA` record. The `www` target is a hostname only (no `https://`, no path). Render’s load-balancer address is documented as `216.24.57.1`; if the Dashboard shows a different record when you add the domain, use that.

Then in Render, **Verify** the custom domain and wait until the certificate is issued. Check:

```bash
curl -sS https://hopewick.com.au/api/health
curl -sS https://hopewick.com.au/api/billing/config
```

Both must be JSON. A GitHub HTML 404 means DNS still points at Pages.

`www.hopewick.com.au` should land on `https://hopewick.com.au`. The app also redirects `www` with HTTP 308 if a request reaches the process, so the session cookie stays on the apex.

### Turn off GitHub Pages for this domain

Do this only after the curls above return JSON. While DNS still points at GitHub, removing the domain takes the site offline.

1. GitHub → `Dwayne260211/hopewick` → **Settings → Pages**. Remove the custom domain `hopewick.com.au`, or disable Pages. The `github.io` URL can stay.
2. Delete the `CNAME` file in a follow-up commit. Pages reads that file on every publish and will put the custom domain back if Pages is still enabled.

### Stripe webhook

After `https://hopewick.com.au` reaches this server:

1. Stripe → Developers → Webhooks → **Add endpoint**.
2. Endpoint URL: `https://hopewick.com.au/api/billing/webhook`
3. Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. Open the endpoint, reveal the signing secret, and set `STRIPE_WEBHOOK_SECRET` on Render.
5. Confirm the Customer Portal is on for this mode.

Plus becomes active when the webhook is accepted, not when the browser returns from Checkout. Until `STRIPE_WEBHOOK_SECRET` is the real `whsec_...`, payments will not unlock the account.

Send a test event from the Stripe Dashboard (or pay with test card `4242 4242 4242 4242`, any future expiry, any CVC, postcode `2000`) and confirm the delivery is **2xx**. Then sign in on https://hopewick.com.au/app/ and confirm Hopewick Plus shows as active.

### Resend (required for sign-in)

`HOPEWICK_DEV=0` never shows the magic link. Production sign-in needs email.

1. In Resend, add the domain `hopewick.com.au` and copy the DNS records it displays into GoDaddy. They are extra `TXT` / `CNAME` rows. Do not change the apex `A` record or the `www` `CNAME`. The domain has no mail records today, so these do not replace an existing inbox.
2. Wait until Resend marks the domain verified.
3. Set `RESEND_API_KEY` and `MAGIC_LINK_FROM=Hopewick <hello@hopewick.com.au>`.
4. On https://hopewick.com.au/app/ , open **Hopewick Plus**, enter an email you can read, and open the link in that message. It expires in 30 minutes and works once.

`admin@bridge-bite-co.com` can be the from-address only if `bridge-bite-co.com` is verified in Resend. The product domain is the clearer sender.

### Real charges

When a test payment on https://hopewick.com.au unlocks Plus:

1. In Stripe **live** mode, create Hopewick Plus at AU$20.00 / month AUD and turn on the live Customer Portal.
2. Replace `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and `STRIPE_PRICE_ID` with the live values.
3. Add a **second** webhook endpoint in live mode, same URL and events, and replace `STRIPE_WEBHOOK_SECRET` with the live `whsec_...`. Test and live secrets are not interchangeable.
4. Pay with a real card, then cancel it from **Manage subscription** to confirm the portal and the `customer.subscription.deleted` webhook.

Company on the Stripe account and invoices: **BRIDGE&BITE.CO PTY LTD**, ABN **83 692 080 792**, admin@bridge-bite-co.com.

### If the site needs to come back to GitHub Pages

Point the apex `A` records at `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`, and point `www` at `dwayne260211.github.io`. Put `hopewick.com.au` back in the `CNAME` file and in Pages settings. `/api` will 404 again. The Render disk still holds the account file if you point DNS back later.

## Home screen

Add to Home Screen is available now. `app/manifest.webmanifest`, with icons in `app/`, opens Hopewick as a standalone web app. The Play Store app is not ready yet.

TODO: a service worker is not included. Do not add one until caching of `app/index.html` is thought through. `theme-color` is already set.

## Security

Magic links expire after 30 minutes and work once. Sessions are random tokens stored as SHA-256 hashes, in an `HttpOnly` cookie, for 30 days. Webhooks require a valid `Stripe-Signature`. Do not put secret keys in HTML or in git.
