# Receivables

Track what customers owe you, import invoices in any common format, and work a prioritized collections queue.

## Project structure

```
.
├── backend/                 Express API (Node 20+, ESM)
│   ├── src/
│   │   ├── app.js           Express app: middleware + route mounting (imported by tests)
│   │   ├── index.js         Server entry: starts HTTP server and cron jobs
│   │   ├── supabase.js      Service-role Supabase client
│   │   ├── middleware/      Auth, business/role guards, tenant checks, audit log
│   │   ├── routes/          One router per resource (/api/...)
│   │   ├── engine/          Collection rules, action plan ranking, daily cron jobs
│   │   └── lib/             Dates (IST) and import validation
│   └── test/                Vitest + Supertest (in-memory Supabase fake, no network)
├── frontend/                React 19 + Vite SPA
│   └── src/
│       ├── app/             App root, auth provider, hash router, responsive shell
│       ├── components/ui/   Design-system primitives (Button, Modal, Toast, Icon, ...)
│       ├── features/        auth · dashboard · invoices · import · team
│       │   └── import/      Multi-format import: parsers/ (one file per format),
│       │                    extract/ (text heuristics, structured + e-invoice mapping)
│       ├── lib/             API client, Supabase client, formatters, data hook
│       └── styles/          tokens.css (design tokens) + base/components/layout/features
├── shared/                  Pure parsers used by both backend and frontend
└── supabase/migrations/     SQL migrations
```

## Getting started

```bash
npm run install:all
cp backend/.env.example backend/.env      # then fill in values
cp frontend/.env.example frontend/.env    # then fill in values
npm run dev:backend                       # http://localhost:5001
npm run dev:frontend                      # http://localhost:5173 (proxies /api to the backend)
```

`npm run check` runs lint, all tests and the production build.

## Environment variables

| Where | Variable | Required | Purpose |
| --- | --- | --- | --- |
| backend | `SUPABASE_URL` | yes | Supabase project URL |
| backend | `SUPABASE_SERVICE_KEY` | yes | Service-role key (server only) |
| backend | `ALLOWED_ORIGINS` | prod | Comma-separated CORS origins |
| backend | `PORT` | no | Defaults to 5001 |
| backend | `META_WHATSAPP_TOKEN`, `META_PHONE_ID` | no | WhatsApp Cloud API; mock mode when unset |
| backend | `META_REMINDER_TEMPLATE`, `META_TEMPLATE_LANG` | prod | Approved template for reminders |
| backend | `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | webhook | Inbound webhook signature + verification |
| frontend | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Browser auth |
| frontend | `VITE_API_BASE_URL` | no | Defaults to `/api` |
| frontend | `VITE_BACKEND_URL` | no | Dev proxy target, defaults to `http://localhost:5001` |

## Invoice import

Supported: PDF (text and scanned), JPG/PNG/WEBP/HEIC (OCR), XLSX/XLS/CSV, DOCX, JSON, and XML
including UBL 2.1 (Peppol) and CII (Factur-X / ZUGFeRD). Files are parsed in the browser, reviewed
and edited by the user, then re-validated on the server and committed atomically.

To add a format: register it in `frontend/src/features/import/fileTypes.js` and add a parser in
`parsers/` that returns raw fields; `extract/draft.js` handles normalization and validation.

OCR uses Tesseract.js, which downloads its engine and English language data from the jsDelivr CDN
on first use and caches it in the browser.
