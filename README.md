# AI Receivables Recovery Assistant — Prototype & Supabase Setup Guide

## Why You Were Getting the `HTTP 502 Bad Gateway` Error (And How It Was Fixed)

1. **Missing `.env` & Unhandled Supabase Crash on Boot**:
   - Previously, `backend/src/supabase.js` called `createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)` without checking if `.env` existed or contained valid URLs. That caused the Node backend on port `5001` to crash immediately on startup, so Vite's `/api` proxy returned **HTTP 502 Bad Gateway**.
   - **Fixed**: Added `dotenv` initialization and validation in `backend/src/supabase.js` and `frontend/src/supabaseClient.js`. If Supabase keys aren't filled in yet, the backend automatically runs in **Interactive Prototype Store Mode** (seeded with realistic Indian B2B steel & manufacturing receivables data) so it **never crashes with 502**.

2. **Broken Import in `backend/src/route/team.js`**:
   - `team.js` imported `requireUser`, `requireMembership`, and `requireOwner` from `middleware/auth.js`, which only exported `requireAuth`, `requireBusiness`, and `requireRole`.
   - **Fixed**: Exported all required middleware functions and mounted `/api/team` properly.

3. **Unmounted Routes in `backend/src/index.js`**:
   - `index.js` never mounted `dashboard.js` (`/api/dashboard`), `invoices.js` (`/api/invoices`), `messages.js` (`/api/messages`), or `team.js` (`/api/team`).
   - **Fixed**: Mounted all routes cleanly in `backend/src/index.js`.

4. **Frontend Prop & URL Mismatches (`OverviewPage.jsx`, `App.jsx`, `InvoicesPage.jsx`)**:
   - `OverviewPage.jsx` had hardcoded `http://localhost:5001/api/...` calls with `Bearer undefined` and expected `onNavigateToInvoices`, while `App.jsx` passed `onNavigateInvoices`.
   - `InvoicesPage.jsx` expected `/api/invoices` to return an array, while `invoices.js` returned `{ invoices: [...] }`.
   - **Fixed**: Unified all API calls through `src/api.js` using relative `/api/...` routes and aligned all React props.

5. **Database Schema Conflicts Across Migrations `001`–`008`**:
   - Earlier migrations used `business_memberships`, `original_amount`, `payment_promises`, `message_logs`, and `invoice_ledger_view`, while later migrations (`006`–`008`) used `memberships`, `amount`, `promises`, `communication_logs`, and `invoice_summary_view`.
   - **Fixed**: Created `supabase/migrations/009_unified_schema_fix.sql`, a single idempotent SQL script that creates/repairs all tables, synchronization triggers, compatibility views, and atomic RPC functions (`commit_import_batch` and `record_payment_atomic`).

---

## Quick Start (Run in 2 Minutes)

Open **two terminals** in your project folder:

### Terminal 1 — Start the Backend API (Port 5001)
```bash
cd backend
npm install
npm run dev
```
You will see:
`✅ Receivables Recovery Backend running on http://localhost:5001`

### Terminal 2 — Start the Frontend App (Port 5173)
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser.
- You can click **"Enter as Business Owner"** or **"Enter as Collector Staff"** on the login screen for instant prototype access during your pitch!

---

## How to Connect Your Own Supabase Database (5-Minute Setup)

### Step 1: Create a Project on Supabase
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and click **New Project**.
2. Give it a name (e.g., `Receivables-Assistant`), set a database password, and select your closest region (e.g., `South Asia (Mumbai)`).

### Step 2: Run the Unified SQL Schema Script
1. In your Supabase Dashboard left sidebar, click **SQL Editor** → **New Query**.
2. Open the file **`supabase/migrations/009_unified_schema_fix.sql`** from this project, copy its entire contents, paste it into the Supabase SQL Editor, and click **Run**.
3. You should see `Success. No rows returned.` — this creates all tables, views (`invoice_ledger_view` & `invoice_summary_view`), triggers, RLS policies, and RPC functions (`commit_import_batch`, `record_payment_atomic`).

### Step 3: Copy Your Supabase API Keys
1. In your Supabase Dashboard left sidebar, go to **Project Settings (⚙️)** → **API**.
2. Copy three values:
   - **Project URL** (looks like `https://abcdefghijklm.supabase.co`)
   - **`anon` `public` key** (under Project API keys)
   - **`service_role` `secret` key** (click Reveal next to `service_role`)

### Step 4: Paste Keys into `backend/.env` and `frontend/.env`
1. Open **`backend/.env`** and update:
   ```env
   PORT=5001
   ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_SECRET_KEY
   ```
2. Open **`frontend/.env`** and update:
   ```env
   VITE_BACKEND_URL=http://localhost:5001
   VITE_API_BASE_URL=/api
   VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_PUBLIC_KEY
   ```

### Step 5: Disable Email Confirmation for Fast Testing (Recommended for Demo)
1. In Supabase Dashboard, go to **Authentication** → **Providers** → **Email**.
2. Toggle **OFF** `"Confirm email"` and click **Save** so new signups log in immediately without waiting for verification emails.
3. Restart both `npm run dev` terminals. Your app is now connected to live Supabase PostgreSQL!
