# Codebase guide

What every file does, and what every API route does. For setup and deployment, see [README.md](README.md).

```
Receivables/
├── package.json          Root scripts that run backend and frontend together
├── render.yaml           Render Blueprint for the API
├── backend/              Express API
├── frontend/             React PWA
├── shared/               Code used by both backend and frontend
└── supabase/migrations/  Database schema (SQL)
```

---

## API routes

Every route lives under `/api`. **Auth** means a valid Supabase access token in `Authorization: Bearer <token>`.

| Access level | Meaning |
| --- | --- |
| Public | No login |
| Signed in | Any logged-in user, even without a business yet |
| Member | Signed in **and** belongs to a business (any role) |
| Writer | Member with role `owner` or `employee` (read-only users get `403`) |
| Owner | Member with role `owner` |

| Method | Path | Access | What it does | File |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | Public | Liveness check for the host; returns `{ ok: true }` | `app.js` |
| GET | `/api/me` | Signed in | Current user, their role and business (`membership: null` if not onboarded yet) | `routes/authRoutes.js` |
| POST | `/api/onboard` | Signed in | Creates a business and makes the caller its owner (`{ businessName }`) | `routes/authRoutes.js` |
| GET | `/api/dashboard/metrics` | Member | Total outstanding, overdue, due today (IST) and received this month | `routes/dashboard.js` |
| GET | `/api/dashboard/action-plan` | Member | Top 15 due/overdue invoices ranked by urgency, with reason and next step | `routes/dashboard.js` |
| POST | `/api/dashboard/record-promise` | Writer | Saves a promise to pay (`invoiceId`, `promisedAmount`, `promisedDate`, `notes`) | `routes/dashboard.js` |
| POST | `/api/dashboard/flag-dispute` | Writer | Opens a dispute and pauses follow-ups for the invoice (`invoiceId`, `reason`, `description`) | `routes/dashboard.js` |
| GET | `/api/invoices` | Member | Lists the business's invoices from the ledger view (optional `status`, `search`) | `routes/invoices.js` |
| GET | `/api/invoices/:id/timeline` | Member | One invoice plus its payments, promises, disputes and messages, newest first | `routes/invoiceDetailRoutes.js` |
| POST | `/api/import/preview` | Writer | Validates rows and splits them into `valid` / `duplicates` / `errors` (nothing saved) | `routes/importRoutes.js` |
| POST | `/api/import/commit` | Writer | Re-validates on the server, then saves all rows atomically; rejects the whole batch if any row is bad | `routes/importRoutes.js` |
| POST | `/api/payments/record` | Writer | Records a payment against an invoice (rejects overpayment and duplicate UTR) | `routes/paymentsRoutes.js` |
| POST | `/api/payments/reverse` | Owner | Reverses a payment with a reason; the invoice balance reopens | `routes/paymentsRoutes.js` |
| GET | `/api/messages` | Member | Message history (optional `invoiceId` / `customerId`) | `routes/messages.js` |
| POST | `/api/messages/send-reminder` | Writer | Sends a WhatsApp payment reminder for an invoice (opt-out and 24-hour duplicate checks; mock mode without credentials) | `routes/messages.js` |
| GET | `/api/reports/ageing` | Member | Outstanding totals by age bucket (not due, 1–30, 31–60, 61–90, 90+ days) | `routes/reportsRoutes.js` |
| GET | `/api/team` | Owner | Lists team members | `routes/team.js` |
| POST | `/api/team` | Owner | Creates a login for a new employee or read-only member | `routes/team.js` |
| GET | `/api/webhook/whatsapp` | Public (Meta) | Meta's webhook verification handshake | `routes/webhookRoutes.js` |
| POST | `/api/webhook/whatsapp` | Public (signed by Meta) | Inbound WhatsApp messages; logs them and handles **STOP** opt-outs. Rejects unsigned requests | `routes/webhookRoutes.js` |

Errors always come back as `{ "error": "message" }` with a meaningful status: `400` invalid input, `401` not logged in, `403` no business or wrong role, `404` not found **or belongs to another business**, `422` import rows failed validation, `429` reminder sent too recently.

---

## Root

| File | What it does |
| --- | --- |
| `package.json` | Scripts for the whole repo: `install:all`, `dev:backend`, `dev:frontend`, `test`, `lint`, `build`, `check` |
| `render.yaml` | Render Blueprint: Node web service in Singapore on an always-on plan, with build/start commands, health check and env vars. Secrets are declared with `sync: false`, so values are entered in Render, never stored here |
| `.gitignore` | Keeps `node_modules`, builds, `.env` files, keys and local tool folders out of git |
| `README.md` | Product overview, features, PWA, security, local setup and deployment |
| `CODEBASE.md` | This file |

---

## Backend (`backend/`)

| File | What it does |
| --- | --- |
| `package.json` | API dependencies and scripts (`start`, `dev` with nodemon, `test`) |
| `.env.example` | Every environment variable the API reads, with placeholder values |
| `vitest.config.js` | Test runner settings: Node environment, IST timezone, placeholder Supabase values (tests use a fake, never a real database) |

### `backend/src/`

| File | What it does |
| --- | --- |
| `index.js` | Entry point: starts the daily cron jobs and the HTTP server on `PORT` (default 5001) |
| `app.js` | Builds the Express app: proxy trust, security headers (helmet), CORS allow-list, rate limit (300 requests per 15 minutes per IP), JSON body parser that keeps the raw body for webhook signatures, `/api/health`, mounting of every router, and the error handler (turns validation errors into readable `400`s and hides internal errors) |
| `supabase.js` | Loads `.env` and creates the server-side Supabase client with the service-role key; stops with a clear message if the URL or key is missing |

### `backend/src/middleware/`

| File | What it does |
| --- | --- |
| `auth.js` | The security layer. `requireAuth` verifies the Supabase token and loads the user's active business and role. `requireBusiness` blocks users who haven't onboarded. `requireRole(...)` checks the role. The shortcuts `canRead`, `canWrite` and `ownerOnly` combine these for routes. `assertInvoiceInBusiness` and `assertCustomerInBusiness` return `404` if an ID belongs to another business (tenant isolation). `audit()` writes to the audit log |

### `backend/src/routes/`

| File | What it does |
| --- | --- |
| `authRoutes.js` | `/me` (who am I, which business, which role) and `/onboard` (create business + owner membership; rolls back the business if the membership fails) |
| `dashboard.js` | Dashboard numbers, today's action plan, recording promises and flagging disputes. Promise and dispute routes take the customer from the invoice, never from the request |
| `invoices.js` | Invoice list from `invoice_ledger_view`, with status filter and search that is sanitised against filter injection |
| `invoiceDetailRoutes.js` | One invoice's activity timeline (payments via allocations, promises, disputes, messages) |
| `importRoutes.js` | Import `preview` and `commit`. Loads existing invoice numbers (paged, so large businesses dedupe correctly), validates with `lib/importValidation.js`, commits through the `commit_import_batch` database function, then saves extra fields (dates, currency, tax, line items, vendor) |
| `paymentsRoutes.js` | Record a payment (`record_payment_atomic` database function) and reverse a payment (`reverse_payment` database function, owner only) |
| `messages.js` | Message history and WhatsApp reminders. Checks balance, disputes, phone, opt-out and the 24-hour cooldown. Sends a Meta template when `META_REMINDER_TEMPLATE` is set, otherwise text; mock mode without credentials. Logs every send |
| `reportsRoutes.js` | Ageing report; `bucketAgeing()` puts each outstanding balance into exactly one bucket |
| `team.js` | Owner-only team management: list members, create a login (email, temporary password, role, phone) and undo the login if adding the membership fails |
| `webhookRoutes.js` | Meta WhatsApp webhook: verification handshake, HMAC signature check (`isValidSignature`), logging inbound messages per business, and STOP/UNSUBSCRIBE opt-out |

### `backend/src/engine/`

| File | What it does |
| --- | --- |
| `rules.js` | Collection priority rules as data, where the first match wins: missed promise → high value overdue (₹1,00,000+) → 30+ days overdue → overdue → due today |
| `actionPlan.js` | `buildActionPlan()` turns due/overdue invoices into ranked action cards (critical → important → routine, missed promises first, then days overdue, then amount) with a reason and a recommended next step |
| `dailyJobs.js` | Cron at 06:00 IST: marks past-date promises as `missed`, then writes one collection action per due/overdue invoice per day (idempotent upsert) |

### `backend/src/lib/`

| File | What it does |
| --- | --- |
| `dates.js` | `todayInTz()` and `startOfMonthInTz()`, the IST calendar date (avoids the UTC "yesterday" bug between midnight and 5:30 AM) |
| `importValidation.js` | `normalizeRowKeys()` maps any header spelling to canonical fields. `validateImportRows()` checks every row (required fields, amount, dates, phone, due-before-invoice date, duplicates within the file and against the database) and returns `valid` / `duplicates` / `errors` with row numbers and reasons |

### `backend/test/`

| File | What it covers |
| --- | --- |
| `helpers/fakeSupabase.js` | In-memory stand-in for the Supabase client so tests run offline and never touch real data |
| `tenant_isolation.test.js` | API-level tests: cross-business access returns `404`, the role matrix (read-only `403` on every write, employee limits), onboarding, and that import commit re-validates and stays all-or-nothing |
| `importValidation.test.js` | Header mapping, the 200-row file with exactly 10 bad rows, duplicates, Indian formats, line items and tax |
| `parsing.test.js` | Amounts (`1,50,000`, `Rs. 500`), dates (day-first, month names, Excel serials in IST), phones, currencies |
| `engine.test.js` | IST dates, rule order, action plan ranking, ageing buckets, webhook signature checks |

---

## Shared (`shared/`)

Pure functions with no Node or browser APIs, imported by both the API and the app so both sides parse values identically.

| File | What it does |
| --- | --- |
| `parsing.js` | `parseAmount()` (₹/Rs/INR/$/€/£ and Indian comma grouping), `parseDate()` (dd/mm/yyyy, ISO, `15 Oct 2026`, Excel serials, Date objects; impossible dates return `null`), `excelSerialToIso()`, `normalizePhone()` (+91 for Indian numbers, keeps foreign codes), `normalizeCurrency()` |
| `fieldAliases.js` | Every known header spelling for each invoice field (`Voucher No`, `Party Name`, `Grand Total`...), `headerKey()` (normalises headers including camelCase) and `fieldForHeader()` |

---

## Frontend (`frontend/`)

| File | What it does |
| --- | --- |
| `package.json` | App dependencies and scripts (`dev`, `build`, `lint`, `test`, `preview`) |
| `.env.example` | Every `VITE_*` variable the app reads, with placeholders |
| `index.html` | HTML shell: title, description, theme colour, manifest and Apple touch icon links |
| `vite.config.js` | `@shared` alias to `../shared`, dev proxy for `/api`, code splitting (PDF, OCR, Excel, Word, HEIC, React and Supabase in separate chunks) and test settings |
| `vercel.json` | Vercel build settings plus caching headers: the service worker is never cached, hashed assets are cached for a year |
| `eslint.config.js` | Lint rules (React hooks and Fast Refresh) |

### `frontend/public/` (served as-is)

| File | What it does |
| --- | --- |
| `manifest.webmanifest` | PWA manifest: name, icons, theme colour, standalone display and home-screen shortcuts (Import, Overdue) |
| `sw.js` | Service worker: caches the app shell (network-first) and hashed assets (cache-first) for instant loads and offline opening; never caches `/api` or cross-origin data |
| `favicon.svg` | Browser tab icon |
| `icon-192.png`, `icon-512.png` | App icons for install and the home screen |
| `icon-maskable-512.png` | Android adaptive icon (safe area for circle and squircle masks) |
| `apple-touch-icon.png` | iPhone/iPad home-screen icon |

### `frontend/src/` (entry and app shell)

| File | What it does |
| --- | --- |
| `main.jsx` | Entry point: loads the font and styles, shows a clear message if Supabase env vars are missing, mounts the providers and `App`, and registers the service worker in production |
| `app/App.jsx` | Top-level screen choice: loading → login → error → onboarding → app pages. Maps routes to pages and hides pages the role can't use |
| `app/AppShell.jsx` | Layout around every page: sidebar navigation (drawer on mobile), business name and role, user chip, sign out, skip-to-content link |
| `app/AuthProvider.jsx` | Holds the Supabase session, loads `/api/me` once per user, and exposes `user`, `role`, `business`, `refresh`, `signOut` and `can('write' \| 'manageTeam')` |
| `app/authContext.js` | The auth React context and `useAuth()` hook |
| `app/router.js` | Tiny hash router (`#/invoices?status=overdue`): `useRoute()`, `href()`, `navigate()`. Hash URLs need no server rewrite rules |

### `frontend/src/lib/`

| File | What it does |
| --- | --- |
| `api.js` | Single `fetch` wrapper: adds the session token, sends JSON, and turns failures into `ApiError` with a readable message (including "can't reach the server") |
| `supabaseClient.js` | Browser Supabase client using the public key; reports missing env vars |
| `useApi.js` | `useApi(endpoint)` hook returning `{ data, error, loading, reload }` |
| `format.js` | `formatMoney()` (₹ en-IN grouping and other currencies), `formatDate()`, `formatBytes()`, `initials()` and invoice status labels/colours |

### `frontend/src/components/ui/` (design system)

| File | What it does |
| --- | --- |
| `Button.jsx` | Button with variants (primary, secondary, ghost, danger), sizes, icon and loading spinner |
| `Modal.jsx` | Accessible dialog: labelled, Escape to close, focus trapped inside and restored after, bottom sheet on phones |
| `ToastProvider.jsx` | Toast notifications (success, error, info) with auto-dismiss, announced to screen readers |
| `toastContext.js` | Toast context and `useToast()` hook |
| `Feedback.jsx` | `Skeleton`, `EmptyState`, `Alert`, `Badge`, `StatusBadge` and `Field` (label, hint and error wiring for inputs) |
| `Icon.jsx` | Built-in line icon set (no icon library to download) |

### `frontend/src/features/` (screens)

**auth/**
| File | What it does |
| --- | --- |
| `AuthLayout.jsx` | Two-column sign-in layout with product highlights (single column on mobile) |
| `AuthPage.jsx` | Log in / sign up with inline email and password validation |
| `OnboardingPage.jsx` | "Set up your business" form shown to users without a business |

**dashboard/**
| File | What it does |
| --- | --- |
| `OverviewPage.jsx` | Metric cards (each links to filtered invoices) and today's action plan with quick actions |
| `ActionDialogs.jsx` | Record payment, send reminder, record promise and flag dispute dialogs, with validation (for example, the payment can't exceed the balance and the promise date can't be in the past) |

**invoices/**
| File | What it does |
| --- | --- |
| `InvoicesPage.jsx` | Invoice list with status filter chips (in the URL), counts, search, responsive table and empty states |
| `InvoiceDetail.jsx` | Invoice details, activity timeline and action buttons |
| `invoiceStatus.js` | One status per invoice (overdue, open, part paid, paid, disputed, void) used for display and filters |

**team/**
| File | What it does |
| --- | --- |
| `TeamPage.jsx` | Member list and an "Add member" dialog with inline validation (owner only) |

**import/** (multi-format import)
| File | What it does |
| --- | --- |
| `ImportPage.jsx` | The import screen: drop or choose files, process them one by one with progress, review/edit table, "Needs attention" filter, server check, then atomic commit and a success summary. Warns before leaving with unsaved work |
| `Dropzone.jsx` | Drag-and-drop area plus a keyboard-accessible file picker (multiple files) |
| `FileQueue.jsx` | Per-file status: waiting, processing with stage and progress bar, invoices found, or a friendly error |
| `DraftEditor.jsx` | Full editor for one extracted invoice, including add/remove line items and totals checks |
| `fileTypes.js` | Supported formats, size and count limits, `validateFile()` and `sniffMismatch()` (catches renamed or damaged files by their first bytes) |
| `importPipeline.js` | `processFile()`: validate → load the right parser → extract → build drafts |
| `parsers/index.js` | Registry mapping each format to its lazily loaded parser. **Add a new format here** |
| `parsers/pdf.js` | Reads the PDF text layer and rebuilds lines and columns; if there's no text (a scan), renders pages and runs OCR (up to 10 pages). Clear messages for password-protected or damaged PDFs |
| `parsers/image.js` | Converts HEIC to JPEG, checks the image decodes, then runs OCR |
| `parsers/ocr.js` | Shared Tesseract.js worker with progress reporting (downloads the engine once, then the browser caches it) |
| `parsers/spreadsheet.js` | XLSX/XLS/CSV via SheetJS: one invoice per row when headers match, otherwise reads the sheet as a single invoice document. CSV is read as text so `01/04` stays 1 April |
| `parsers/docx.js` | Word documents to text via mammoth |
| `parsers/json.js` | JSON arrays, wrapped lists or a single (nested) invoice |
| `parsers/xml.js` | XML entry point: hands off to the e-invoice reader |
| `extract/textExtractor.js` | Finds fields in free text (PDF/OCR/Word): invoice number, dates, payment terms, customer block (phone, email), vendor, totals, tax (sums CGST+SGST+IGST), currency and line items |
| `extract/structured.js` | Maps spreadsheet rows and JSON objects to invoice fields, including nested `customer` / `seller` objects and item arrays |
| `extract/einvoice.js` | Reads UBL 2.1 (Peppol), CII (Factur-X/ZUGFeRD) and generic XML into invoice fields and line items |
| `extract/draft.js` | `makeDraft()` normalises extracted fields and adds warnings (calculated totals, Net-N due dates, unreadable dates, totals that don't add up). Also `validateDraft()` (inline errors), `draftToRow()` (API payload) and `amountOf()` |
| `__tests__/textExtractor.test.js` | Extraction tests on realistic Indian GST and US invoices, draft rules |
| `__tests__/structured.test.js` | CSV/XLSX/XLS, JSON, UBL and CII XML, file validation |

### `frontend/src/styles/` (design system CSS)

| File | What it does |
| --- | --- |
| `tokens.css` | **Design tokens**, the single source for colours, typography, spacing (8px grid), radii, shadows, motion and z-index |
| `base.css` | Reset, body typography, focus ring, skip link, screen-reader-only text, reduced-motion support |
| `components.css` | Buttons, cards, form fields, badges, tables, skeletons, empty states, alerts, modal, toasts, segmented control, progress bar |
| `layout.css` | App shell (sidebar, mobile drawer, top bar), page headers, toolbars, sign-in layout |
| `features.css` | Screen-specific styles (stat cards, action list, timeline, team list, dropzone, file queue, review table) and phone layouts that turn tables into cards |

---

## Database (`supabase/migrations/`)

Run in order in the Supabase SQL Editor.

| File | What it does |
| --- | --- |
| `001_square_table.sql` | Core tables: `businesses`, `business_memberships` (owner, employee or read_only), `customers`; row-level security on; grants for the server |
| `002_membership_contact.sql` | Adds name, phone and email to memberships (unique phone per business) |
| `003_invoices_customers_payments.sql` | `invoices`, `payments`, `payment_allocations`, `invoice_adjustments`, the **`invoice_ledger_view`** that computes balance, status, days overdue and ageing, and RLS policies |
| `004_collection_queue.sql` | `collection_actions`, `payment_promises`, `disputes` with RLS |
| `005_communication_logs.sql` | `message_logs` (WhatsApp in/out) with RLS |
| `006_foundations_fix.sql` | Grants, customer `opt_out`/`status` columns, `audit_logs` table, IST-aware summary view |
| `007_import_commit_rpc.sql` | `commit_import_batch()`: atomic import (match or create customer, insert invoice; any failure rolls back the whole batch) |
| `008_payments_rpc.sql` | `record_payment_atomic()`: locks the invoice, rejects overpayment and duplicate UTR, updates status, fulfils promises |
| `009_invoice_document_fields.sql` | Adds `subtotal`, `tax_amount`, `line_items`, `vendor_name` to invoices and a unique daily-action index. Additive and safe to re-run |
