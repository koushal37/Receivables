<p align="center">
  <img src="frontend/public/icon-192.png" width="72" alt="Receivables app icon" />
</p>

<h1 align="center">Receivables</h1>

<p align="center">
  Import invoices in any format, see exactly who to follow up with today, and get paid on time.<br/>
  An installable Progressive Web App for small and mid-sized businesses, built for Indian receivables (₹, GST, dd/mm/yyyy) and ready for international invoices.
</p>

---

## Contents

1. [What it does](#what-it-does)
2. [Features](#features)
3. [Why it's different (advantages)](#why-its-different-advantages)
4. [How it works](#how-it-works)
5. [How the PWA works](#how-the-pwa-works)
6. [Security and data isolation](#security-and-data-isolation)
7. [Tech stack](#tech-stack)
8. [Run it locally](#run-it-locally)
9. [Deploy to production (step by step)](#deploy-to-production-step-by-step)
10. [Environment variables](#environment-variables)
11. [Scripts and testing](#scripts-and-testing)
12. [Project structure](#project-structure)

---

## What it does

Most small businesses track who owes them money in spreadsheets and chase payments from memory. **Receivables** replaces that with one place to:

- **Get invoices in**, from whatever format they already have: PDFs, scanned bills, phone photos, Excel/Tally exports, Word files or e-invoice XML.
- **Know who to chase today**, through a ranked action plan built from due dates, amounts and broken payment promises.
- **Act in one click**: record payments, log promises to pay, send WhatsApp reminders, and flag disputes.
- **Work as a team**, with owner, employee and read-only roles.

## Features

### Invoice import in any format
| Format | How it's read |
| --- | --- |
| **PDF** (digital) | Text layer extracted instantly with PDF.js |
| **PDF** (scanned) | Pages rendered and read with OCR (Tesseract) |
| **Images**: JPG, PNG, WEBP, **HEIC** (iPhone) | OCR; HEIC is converted in the browser first |
| **Excel / CSV**: XLSX, XLS, CSV | One invoice per row; Tally and accounting headers are recognised automatically (`Voucher No`, `Party Name`, `Grand Total`...) |
| **Word**: DOCX | Text extraction |
| **JSON** | Arrays, `{ invoices: [...] }` wrappers, nested objects, camelCase keys |
| **XML e-invoices** | **UBL 2.1 / Peppol**, **CII / Factur-X / ZUGFeRD / XRechnung**, plus generic XML |

- **Extracted fields:** invoice number, invoice date, due date, customer, vendor, phone, email, line items (description, qty, rate, amount), subtotal, tax (CGST + SGST + IGST summed), total and currency.
- **Smart parsing:**
  - Indian amounts (`₹1,50,000`, `Rs. 500`) and day-first dates (`03/04/2026` is 3 April).
  - Month names (`15 Oct 2026`) and Excel serial dates, read without timezone off-by-one errors.
  - Payment terms (`Net 30`) used to compute the due date.
- **Drag and drop**, or a file picker for **up to 25 files at once** (20 MB each), with a progress bar per file.
- **Review and edit screen:** every extracted invoice is shown in an editable table. Problems are highlighted inline, warnings explain anything uncertain (OCR, calculated totals, mismatched sums), and a full editor covers line items.
- **Safe commit:** the server re-validates every row and rejects duplicates (within the file and against existing invoices). The batch is saved **all-or-nothing**.
- **Clear errors** for unsupported, empty, oversized, corrupt, renamed or password-protected files.
- Downloadable **CSV template**.

### Collections
- **Dashboard** with total outstanding, overdue, due today and received this month (in India time). Each card links to the filtered invoice list.
- **Today's action plan:** due and overdue invoices ranked *critical → important → routine*. Missed promises rank first, then age and amount. Each item says why it's ranked there and what to do next.
- **Record payments** (bank transfer, UPI, cheque, cash, card) with UTR. Overpayment and duplicate UTRs are rejected.
- **Promises to pay:** a daily job marks missed promises automatically.
- **Disputes** pause follow-ups for an invoice.
- **WhatsApp reminders** through Meta's Cloud API, with approved templates. Customers who opted out are skipped, there's a 24-hour no-duplicate rule, and replying **STOP** opts a customer out. Mock mode applies until credentials are set.
- **Invoice timeline:** payments, promises, disputes and messages on one screen.
- **Ageing report** buckets: not due, 1–30, 31–60, 61–90, 90+ days.

### Team and access
- **Roles:** *Owner* has full access and manages the team. *Employee* can record and follow up. *Read-only* can view everything and change nothing.
- **Onboarding:** a new signup creates a business and becomes its owner.
- **Audit log** of every change (who, what, before and after).

### Experience
- Calm, premium light design with one accent colour, the Inter typeface, soft cards and an 8px spacing grid.
- **Fully responsive:** sidebar on desktop, slide-out drawer on tablet and phone, and tables become cards on small screens.
- **Accessible:** keyboard navigation, visible focus rings, labelled controls, focus-trapped dialogs, screen-reader announcements and WCAG AA contrast.
- Skeleton loaders, toast notifications, helpful empty states and inline form validation.
- **Installable PWA:** add it to your home screen or desktop, and it opens like a native app.

## Why it's different (advantages)

- **Files never leave the browser.** Invoices are parsed and OCR'd on the user's device; only the reviewed fields are sent to the server. Nothing is uploaded or stored, so documents stay private and server costs stay low.
- **Accepts what customers already have.** There's no required template: PDF, photo, Tally export or e-invoice all work.
- **Human-in-the-loop accuracy.** Automatic extraction is always followed by a review step, so OCR mistakes never silently enter your books.
- **Built for India, works globally:** lakh/crore number formatting, day-first dates, GST components, +91 phone handling, and IST-correct "today". Foreign phone numbers, currencies and European e-invoice standards are supported too.
- **Trustworthy money logic:** atomic database functions for imports and payments, overpayment and duplicate-UTR protection, and a ledger view that derives every balance from payments and adjustments.
- **Multi-tenant by design.** Every query is scoped to the caller's business, and automated tests prove one business can't touch another's data.
- **Fast:** the heavy readers (PDF, OCR, Excel, Word, HEIC) load only when a file of that type is dropped. The core app is about 70 KB of code plus React and Supabase.

## How it works

```
 Browser (React PWA)                         Server (Express API)                  Supabase
 ───────────────────                         ────────────────────                  ────────
 Drop files ─► parser per format             POST /api/import/preview ─► validate  Postgres
   (PDF.js / Tesseract / SheetJS /             (zod, Indian formats,               ├─ invoices, customers,
    mammoth / DOMParser)                        duplicates)                         │  payments, promises...
 ─► extract fields ─► draft                  POST /api/import/commit  ─► re-validate├─ invoice_ledger_view
 ─► user reviews & edits                        ─► commit_import_batch() (atomic) ─►│  (balances, overdue)
 ─► send reviewed rows ───────────────────►                                        └─ RPCs: payments, import
                                             Auth: Supabase JWT ─► membership ─► role
 Dashboard / invoices / team  ◄── JSON ───── tenant-scoped queries                 Auth (email + password)
                                             Cron 06:00 IST: missed promises,
                                             daily collection actions
```

1. **Sign in** with Supabase Auth (email and password). The browser holds the session; every API call sends the access token.
2. **The API verifies the token**, looks up the user's business membership and role, and scopes every query to that business.
3. **Import:** files are parsed in the browser into *drafts*. The user reviews them, then the server re-validates and commits them atomically.
4. **Balances are never stored by hand.** The `invoice_ledger_view` computes outstanding amount, status, days overdue and ageing from invoices, payments and adjustments.
5. **Every morning at 06:00 IST** a scheduled job marks missed promises and builds the day's collection actions.

## How the PWA works

Receivables is a **Progressive Web App**: a website that installs and behaves like an app.

- **Installable.** `manifest.webmanifest` gives the app its name, icons (including a maskable icon for Android), theme colour and standalone display. Chrome, Edge and Android show **Install app**; on iPhone, use **Share → Add to Home Screen**. Long-pressing the installed icon offers shortcuts to *Import invoices* and *Overdue invoices*.
- **Opens instantly.** A service worker (`public/sw.js`) caches the app shell and the versioned build files. Repeat visits load from the device, not the network.
- **Always up to date.** The page itself is fetched network-first, so a new deployment shows up on the next open. The cached copy is used only when offline.
- **Offline-safe by design.** The app *opens* offline, but it **never caches financial data**: `/api` calls and Supabase requests always go to the network. Without a connection you see a clear "can't reach the server" message instead of stale balances.
- **OCR engine caching.** The first OCR scan downloads the Tesseract engine and English language data (from the jsDelivr CDN, a few MB); the browser caches them for later scans.
- The service worker is registered only in production builds, so it never interferes with local development.

## Security and data isolation

- **Service-role key stays on the server.** The browser only ever has the public (publishable) Supabase key.
- **Tenant isolation is enforced in the API.** IDs sent by the browser are checked against the caller's business; customers are derived from the invoice, never trusted from the request.
- **Role checks on every write;** read-only users get `403` on all mutations.
- **Validation:** every input is validated with `zod`. Imports and payments run inside database transactions.
- **Hardening:** `helmet` security headers, a CORS allow-list, rate limiting (proxy-aware), a 5 MB body limit, and PostgREST filter-injection protection on search.
- **WhatsApp webhook:** verified with Meta's `X-Hub-Signature-256` HMAC (constant-time compare); there is no default verify token.
- **Secrets:** read from environment variables only. `.env` files are git-ignored; `.env.example` files hold placeholders.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, hand-written CSS design tokens (no CSS framework), Inter Variable (self-hosted) |
| File parsing | PDF.js, Tesseract.js (OCR), SheetJS, mammoth, heic2any, native DOMParser |
| Backend | Node.js 22+, Express 5, zod, helmet, express-rate-limit, node-cron |
| Database and auth | Supabase (Postgres, Auth, row-level security, SQL functions) |
| Messaging | Meta WhatsApp Cloud API |
| Testing | Vitest, Supertest, jsdom |
| Hosting | Render (API), Vercel (frontend), Supabase (DB) |

## Run it locally

Requirements: **Node.js 22+** (24 recommended) and a Supabase project.

```bash
git clone https://github.com/koushal37/Receivables.git
cd Receivables
npm run install:all

cp backend/.env.example backend/.env       # fill in SUPABASE_URL and SUPABASE_SERVICE_KEY
cp frontend/.env.example frontend/.env     # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
```

Apply the database migrations: open **Supabase → SQL Editor** and run the files in `supabase/migrations/` in numeric order (skip any already applied; `009` is safe to re-run).

Start both servers in two terminals:

```bash
npm run dev:backend      # API on http://localhost:5001
npm run dev:frontend     # App on http://localhost:5173 (proxies /api to the API)
```

## Deploy to production (step by step)

Final layout:

| Part | Host | Example URL |
| --- | --- | --- |
| Database + Auth | Supabase | `https://<project>.supabase.co` |
| API | Render (Web Service, Singapore) | `https://receivables-api.onrender.com` |
| App (PWA) | Vercel | `https://receivables.vercel.app` |

### Step 0: check everything locally

```bash
npm run check            # lint + all tests + production build must pass
git push origin main
```

### Step 1: prepare Supabase

1. **SQL Editor:** make sure all files in `supabase/migrations/` have been run, including `009_invoice_document_fields.sql`.
2. **Project Settings → API:** note three values:
   - **Project URL**: used by both the API and the app.
   - **publishable / anon key**: for the app only.
   - **service_role / secret key**: for the API only. Never put it in the frontend.
3. Leave the Authentication URLs for now; you'll set them in Step 4 once you know the app's URL.

### Step 2: deploy the API on Render

Pick **one** of the two options.

**Option A: Blueprint (uses `render.yaml`, fastest)**
1. Render dashboard → **New → Blueprint** → connect GitHub → choose `koushal37/Receivables`, branch `main`.
2. Render reads `render.yaml` and creates `receivables-api` (Node 24, Singapore, always-on *Starter* plan, health check `/api/health`).
3. It asks for the three secret values:
   - `SUPABASE_URL`: your Project URL
   - `SUPABASE_SERVICE_KEY`: the service_role / secret key
   - `ALLOWED_ORIGINS`: enter `https://example.com` for now; you'll replace it in Step 4.
4. Click **Apply** and wait for the deploy to show **Live**.

**Option B: Manual Web Service**
1. **New → Web Service** → connect `koushal37/Receivables`, branch `main`.
2. Fill in:
   - **Name:** `receivables-api` · **Region:** **Singapore** (closest to India; can't be changed later) · **Runtime:** Node
   - **Root Directory: leave it EMPTY.** The API imports the shared `shared/` folder from the repo root.
   - **Build Command:** `npm --prefix backend ci --omit=dev`
   - **Start Command:** `npm --prefix backend start`
   - **Instance type:** *Starter* or higher. The free plan sleeps after 15 minutes and skips the 06:00 IST daily job; it's fine for a trial only.
3. **Advanced → Health Check Path:** `/api/health`
4. **Environment variables:**

   | Key | Value |
   | --- | --- |
   | `NODE_VERSION` | `24` (must be 22 or newer) |
   | `TRUST_PROXY` | `1` |
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_SERVICE_KEY` | service_role / secret key |
   | `ALLOWED_ORIGINS` | `https://example.com` (placeholder until Step 4) |

5. **Create Web Service.**

**Verify:** open `https://<your-api>.onrender.com/api/health`. It should show `{"ok":true}`.
If the deploy fails, open **Logs**:
- `Node.js detected but native WebSocket not found`: `NODE_VERSION` is below 22. Set it to `24` and redeploy.
- A message naming `SUPABASE_URL` or `SUPABASE_SERVICE_KEY`: that variable is missing.
- `npm ci` printing its help text: Root Directory isn't empty.

### Step 3: deploy the app on Vercel

1. Vercel → **Add New → Project** → import `koushal37/Receivables`.
2. **Root Directory:** click *Edit* and choose **`frontend`**. Framework is detected as **Vite**; build settings come from `frontend/vercel.json`.
3. Make sure **"Include files outside the root directory in the Build Step"** is enabled. It's on by default, and the app needs the shared parsers from `shared/`.
4. **Environment variables:**

   | Key | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable / anon key |
   | `VITE_API_BASE_URL` | `https://<your-api>.onrender.com/api` |

   These are baked in at build time. If you change one later, **redeploy**.
5. **Deploy**, then copy the production URL (for example `https://receivables.vercel.app`).

### Step 4: connect the pieces

1. **Render → your API service → Environment:** set `ALLOWED_ORIGINS` to the address you open the app from, for example `https://receivables.vercel.app`. Separate several with commas. To also allow Vercel preview URLs, add a wildcard: `https://receivables.vercel.app,https://receivables-*.vercel.app`. Save; Render redeploys.

   > **"Cannot reach the server" in the app?** That's almost always CORS. Open Render → **Logs** and look for `[CORS] Blocked request from origin "…"`, then add that exact address to `ALLOWED_ORIGINS`.
2. **Supabase → Authentication → URL Configuration:**
   - **Site URL:** your Vercel URL
   - **Redirect URLs:** add `https://<your-vercel-url>/**`

   Without this, signup confirmation emails link to `localhost`.

### Step 5: test the live app

- [ ] `https://<your-api>.onrender.com/api/health` returns `{"ok":true}`
- [ ] Sign up → confirmation email → link opens your Vercel URL → create a business
- [ ] The dashboard loads, and the browser console shows no CORS errors
- [ ] Import the CSV template and a PDF → invoices appear in the list
- [ ] Record a part payment → the outstanding amount drops
- [ ] Add a read-only team member → log in as them → no edit buttons are shown
- [ ] Chrome shows **Install app** in the address bar; installing opens Receivables in its own window

### Step 6 (optional): custom domains

- **Vercel → Settings → Domains:** `app.yourdomain.com`
- **Render → Settings → Custom Domains:** `api.yourdomain.com`
- Then update `VITE_API_BASE_URL` (and redeploy Vercel), `ALLOWED_ORIGINS` on Render, and the Supabase Site / Redirect URLs.

### Step 7 (optional): WhatsApp reminders

1. In Meta Business Manager, create a WhatsApp **message template** with 4 body variables (customer name, invoice number, amount, due date) and get it approved.
2. Add these to Render: `META_WHATSAPP_TOKEN`, `META_PHONE_ID`, `META_REMINDER_TEMPLATE`, `META_TEMPLATE_LANG` (for example `en`), `META_APP_SECRET`, and `META_WEBHOOK_VERIFY_TOKEN` (any long random string).
3. **Meta → Webhooks:** callback URL `https://<your-api>/api/webhook/whatsapp`, with the same verify token; subscribe to `messages`.

Until this is done, reminders run in **mock mode**: they're logged, but no message is sent.

### Updating later

- Push to `main` → Render and Vercel redeploy automatically. Run `npm run check` first.
- Run new SQL migrations in Supabase **before** deploying code that needs them.
- Rollback: Render → *Deploys → Rollback*; Vercel → *Deployments → Promote to Production*.

## Environment variables

| Where | Variable | Required | Purpose |
| --- | --- | --- | --- |
| API | `SUPABASE_URL` | yes | Supabase project URL |
| API | `SUPABASE_SERVICE_KEY` | yes | Service-role key (server only) |
| API | `ALLOWED_ORIGINS` | production | Comma-separated frontend URLs allowed by CORS; `*` wildcards allowed (e.g. `https://receivables-*.vercel.app`) |
| API | `TRUST_PROXY` | production | Proxy hops in front of the API (`1` on Render) |
| API | `PORT` | no | Defaults to 5001; Render sets it automatically |
| API | `META_WHATSAPP_TOKEN`, `META_PHONE_ID` | no | WhatsApp sending; mock mode when unset |
| API | `META_REMINDER_TEMPLATE`, `META_TEMPLATE_LANG` | for WhatsApp | Approved reminder template |
| API | `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | for WhatsApp | Webhook signature + verification |
| App | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Sign-in |
| App | `VITE_API_BASE_URL` | production | Full API URL ending in `/api` (defaults to `/api` locally) |
| App | `VITE_BACKEND_URL` | no | Local dev proxy target only |

## Scripts and testing

Run from the repository root:

| Command | What it does |
| --- | --- |
| `npm run install:all` | Install backend and frontend dependencies |
| `npm run dev:backend` / `npm run dev:frontend` | Start the API / the app in development mode |
| `npm test` | Run all backend and frontend tests |
| `npm run lint` | Lint the frontend |
| `npm run build` | Production build of the app |
| `npm run check` | Lint + tests + build (run before every deploy) |

**86 automated tests** cover:
- Indian amount and date parsing, plus Excel serial dates without timezone off-by-one.
- Import validation, including a 200-row file with exactly 10 bad rows reported.
- Tenant isolation, the full role matrix, and the CORS allow-list.
- Onboarding, collection rules and ageing buckets, and webhook signatures.
- Invoice extraction from GST/US text invoices, CSV/XLSX/XLS, JSON, UBL and CII XML.

The tests use an in-memory database fake, so they never touch your real data.

## Project structure

```
backend/      Express API (routes, auth & roles, rules engine, daily jobs, tests)
frontend/     React PWA (app shell, design system, features: auth, dashboard, invoices, import, team)
shared/       Parsers used by both sides (amounts, dates, phones, header aliases)
supabase/     SQL migrations
render.yaml   Render Blueprint for the API
```
