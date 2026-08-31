# One Click School Solutions — Full Stack (React + Node.js + MySQL)

A multi-tenant school certificate management SaaS: Super Admin, School Admin,
and Distributor roles, a prepaid wallet per school, Razorpay payments,
email-based password setup/reset, student records with camera/upload photo
capture, and PDF generation (with QR verification) for Leaving Certificates,
Bonafide Certificates, and Student ID Cards.

**This build preserves the visual design of the approved One Click School
Solutions prototype exactly** — same layout, same colors, same CSS classes, same
Marathi/Hindi/English translation keys — re-implemented as React components
talking to a real Node.js + Express + MySQL backend instead of the
prototype's LocalStorage mock.

---

## IMPORTANT — honest note on verification

This code was written in a sandboxed environment with **no internet
access**, so `npm install` could not be run and the app was never actually
booted end-to-end here. Every file was verified for **real syntax
correctness** using Node's own module loader (which fails loudly on bad
syntax) plus an independent bracket-balance pass — not a superficial
check — but the first true test of dependency installation and runtime
behavior happens on your machine. The troubleshooting table near the bottom
exists specifically so you can get unstuck fast if something doesn't start
cleanly the first time.

---

## Architecture overview

```
backend/
  src/
    config/      db pool (mysql2), schema.sql, migrate.js, seed.js
    controllers/ one file per resource: auth, school, distributor, student,
                 certificate, wallet, payment, masterData
    middleware/  auth (JWT + refresh), attachSchool (multi-tenant scoping),
                 upload (multer: student photos + school branding)
    routes/      Express routers, one per resource
    utils/       jwt, email (nodemailer), idCardPdf, certificatePdf (LC/Bonafide),
                 qrPayload, audit (security log)
    server.js    app entry point (helmet, rate limiting, Swagger, webhook raw body)
  docs/
    swagger.yaml      OpenAPI 3.0 spec, 27 documented endpoints
    ER_DIAGRAM.mmd     Mermaid ER diagram, 13 tables
  tests/
    auth.test.js, wallet.test.js, certificate.test.js — Jest + Supertest

frontend/
  src/
    api/client.js             axios instance with automatic refresh-token retry
    context/                  AuthContext, TranslationContext
    components/               Header, Sidebar, Layout, ProtectedRoute
    pages/                    one file per screen (listed below)
    translations.js           extracted verbatim from the prototype - same keys
    styles/main.css           copied verbatim from the prototype
```

---

## Prerequisites

- Node.js 18+
- MySQL 8.0+ (required for `UUID()` column defaults and enforced `CHECK`
  constraints used in the schema — both need 8.0.13+ / 8.0.16+ respectively;
  any current MySQL 8 install satisfies this)
- A free Razorpay account — https://dashboard.razorpay.com/signup
- An email account for sending mail (Gmail with an App Password is easiest)

---

## STEP 1 — Database

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS certifypro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

(The migration script below also creates the database if it doesn't exist
yet, so this step is a convenience, not a hard requirement.)

## STEP 2 — Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in:

1. **DB_PASSWORD** (and `DB_USER`/`DB_HOST`/`DB_PORT` if different from defaults)
2. **JWT_SECRET** and **JWT_REFRESH_SECRET** — two different long random
   strings, e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` twice
3. **SMTP_USER / SMTP_PASSWORD** — for Gmail: enable 2-Step Verification,
   then create an App Password at https://myaccount.google.com/apppasswords
   and use that 16-character password (not your normal Gmail password).

There is no payment gateway to configure — wallet recharges are manual bank
transfers verified by Super Admin (see "Wallet system" below), so no
Razorpay or similar keys are needed anywhere.

### If this is a brand-new database

```bash
npm run migrate    # creates the database (if needed) and all current tables
npm run seed       # creates Super Admin + demo accounts + placeholder bank details
npm run dev        # starts the server with auto-reload
```

### If you have an existing One Click School Solutions database from before this update

Run all three incremental migrations, in this exact order, before starting
the server — each one is safe to re-run and only changes what's actually
missing:

```bash
npm run migrate:idcard-design   # adds ID Card Designer + cert header/footer columns
npm run migrate:soft-delete     # adds deleted_at columns, removes the hard
                                 # UNIQUE constraints that caused "delete a
                                 # record, re-add the same name, told it
                                 # already exists"
npm run migrate:wallet-system   # adds wallet_requests + bank_details tables,
                                 # removes the old razorpay_orders table
npm run dev
```

You should see:
```
Super Admin created:
  Email: admin@certifypro.in
  Password: Admin@123
Demo School Admin created: SCH001 / School@123
Demo Distributor created: dist01 / Dist@123
One Click School Solutions backend running on http://localhost:5000
API docs available at http://localhost:5000/api-docs
```

**Verify it's alive:** open http://localhost:5000/api/health — you should
see `{"status":"ok",...}`. Open http://localhost:5000/api-docs for the
interactive Swagger UI covering every endpoint.

## STEP 3 — Frontend setup

New terminal, keep the backend running:

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

Opens http://localhost:3000 automatically, landing on the login page with
the same three role tabs (Super Admin / School Admin / Distributor) as the
approved prototype.

---

## STEP 4 — First run walkthrough

**Super Admin** (`admin@certifypro.in` / `Admin@123`)
1. **Dashboard** — totals, revenue chart, certificate usage chart, recent schools, pending approvals, and a **Pending Wallet Requests** counter that links straight to the Wallet page.
2. **Schools** — add, edit, or soft-delete a school (deleting and re-adding the same name/email now works correctly — see "Soft delete" below); export the list to Excel/CSV with status and date-range filters; click any school name to open its Detail page (hero card, student/certificate stats, 4 tabs).
3. **Requested Schools** — approve or reject pending submissions. Approving sends a real email with the school's Login ID.
4. **Distributors** — add a distributor with a password set directly (they can log in immediately, no email round-trip needed) or leave it blank to email a setup link instead; edit or soft-delete; export to Excel/CSV.
5. **Settings** — manage all 11 master data categories. Each item can now be edited inline, deleted (soft delete — the same value can be re-added without an "already exists" error), exported, or bulk-imported from an Excel/CSV template with a Success/Duplicate/Failed count and a row-level error report.
6. **Reports** — platform overview, 6-month revenue trend, certificate-type breakdown, top schools, distributor performance; an **Export Users** button covering all three roles.
7. **Wallet** — the manual recharge approval dashboard: every school's submitted UTR/screenshot/amount, with Approve (credits the wallet atomically, sends a notification + email) or Reject (with a required reason). A second tab manages the bank account details and QR code schools see when recharging — changing the QR sends an email alert to every Super Admin and writes an audit log entry.

**School Admin** (demo: `SCH001` / `School@123`, or via the setup email link for a school you created)
8. **Dashboard** — school banner, quick actions, stats, charts, recent students.
9. **Students** — add/edit/delete (soft delete), camera capture or file upload for photos, a Detail page per student, and Excel/CSV bulk import with a downloadable template and per-row validation.
10. **Certificates** — pick a type (LC ₹50 / Bonafide ₹30 / ID Card ₹20), see the GST-inclusive order summary, pay from the wallet. The QR code on every certificate and ID card now points to a real, scannable public verification page (`/verify/:id`) — no login required to check authenticity. ID cards are landscape (CR80, matching a real physical ID card) with photo, QR, class/section, roll number, parent name, and emergency contact. Export certificate history to Excel/CSV.
11. **Settings** — school profile; logo/signature/stamp upload plus a rich-text editor for custom certificate header/footer text; the **ID Card Designer** (color, custom text, which fields appear) with a live landscape preview; and the **Wallet** tab — current balance, the bank details + QR to transfer to, a recharge submission form (amount, UTR, payment date, optional screenshot), your own request history with status, and a full ledger (opening/closing balance per row) with both a quick CSV receipt and a server-generated Excel export.

**Distributor** (demo: `dist01` / `Dist@123`)
12. **Dashboard** — school counts by status, commission summary.
13. **My Schools** — add a school (submitted as Pending); while still pending, edit or withdraw it; filter by status tab.
14. **Commission** — total commission calculated live from actual certificate sales, monthly and per-school breakdowns.
15. **Settings** — edit own profile, change own password.

### Soft delete — why "delete and re-add" now works

Schools, distributors, and master data items are never actually removed
from the database when you delete them — a `deleted_at` timestamp (or
`is_active = 0` for master data) is set instead, and every list/lookup
query filters those out. This is what makes "delete ABC School, then
create a new ABC School with the same name and admin email" work
correctly: the old row's presence no longer blocks the new one. A school
with certificates already issued can still be safely deleted this way,
since nothing referencing it is actually destroyed.

### Logout, session expiry, and multi-tab behavior

Logging out now properly clears all client-side auth state *before*
attempting the (best-effort) server-side token revocation, so there's no
window where a slow network request could leave a stale session behind.
Logging out in one browser tab signals every other open tab to log out too
via a `storage` event. If your refresh token itself expires or is
revoked, you're shown a "Your session has expired" message on the login
screen rather than being silently redirected.

---

## Database schema (MySQL)

15 tables — see `backend/docs/ER_DIAGRAM.mmd` (Mermaid format; paste into
https://mermaid.live to view, or open with any Mermaid-compatible Markdown
viewer) for the entity-relationship diagram. Note: the diagram predates the
`wallet_requests`/`bank_details` tables and the `deleted_at` columns added
since — the table list below is the accurate, current one.

| Table | Purpose |
|---|---|
| `users` | All three roles in one table, distinguished by `role`. No hard-unique email constraint (see soft delete above) |
| `password_tokens` | Setup/reset link tokens, 30-minute expiry |
| `refresh_tokens` | JWT refresh token rotation (hashed, revocable) |
| `distributors` | Profile data 1:1 with a distributor user |
| `schools` | Core school record; `status`: pending/active/rejected/suspended |
| `wallets` | One per school; balance has a `CHECK (balance >= 0)` constraint |
| `wallet_transactions` | Append-only ledger — source of truth for balance |
| `wallet_requests` | Manual bank-transfer recharge submissions awaiting Super Admin approval |
| `bank_details` | Super-Admin-managed account/UPI/QR shown to schools for recharging |
| `students` | Scoped to one school |
| `certificates` | `type`: lc/bonafide/idcard; includes GST amount, serial, expiry |
| `master_data` | All 11 Settings categories in one table, grouped by `category` |
| `notifications` | In-app notification bell |
| `audit_logs` | Security-relevant action log (logins, etc.) |

---

## API documentation

Full OpenAPI 3.0 spec at `backend/docs/swagger.yaml` — 27 documented
endpoints across auth, schools, students, certificates, wallet, payments,
distributors, and master data. Browse it interactively at
`http://localhost:5000/api-docs` once the backend is running.

---

## Running tests

```bash
cd backend
# Point .env at a disposable test database first (do NOT run against
# production data — the wallet race-condition test fires real concurrent
# debits against a throwaway school record)
npm test
```

Covers: login success/failure, role-based access control (403 on wrong
role, 401 on no token), GST calculation correctness, certificate serial
format, and — most importantly — the wallet's core safety property: **a
balance can never go negative, even under concurrent debit requests**,
verified by firing 10 simultaneous debit calls against a wallet that can
only afford 3 of them and asserting the final balance stays at or above
zero.

---

## Production deployment notes

- **Environment**: set `NODE_ENV=production` in the backend `.env`.
- **Database**: use a managed MySQL instance (AWS RDS, PlanetScale, etc.)
  with regular backups; the schema's `CHECK` constraints and foreign keys
  are your last line of defense against data corruption, but backups are
  still essential.
- **File storage**: the `uploads/` directory (student photos, school
  branding, generated certificate PDFs) is local disk by default. For any
  multi-server deployment, move this to S3 or equivalent object storage and
  update the `UPLOAD_ROOT` path resolution in `middleware/upload.js`
  accordingly — the rest of the code only cares that `fs.existsSync(path)`
  and `doc.image(path)` work, so swapping in a cloud-storage-backed path
  resolver is a contained change.
- **Process manager**: run the backend under PM2 or systemd, not directly
  via `node src/server.js`, so it restarts automatically on crash.
- **Reverse proxy**: put Nginx (or similar) in front of both the Express
  API and the React build's static files, terminating TLS there.
- **React build**: `cd frontend && npm run build` produces a static
  `build/` folder — serve this via Nginx/Express static or a CDN; it is
  **not** meant to run via `npm start` in production.
- **Razorpay**: switch `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` to live keys,
  and register the webhook URL (`https://yourdomain.com/api/payments/webhook`)
  in the Razorpay dashboard with the matching `RAZORPAY_WEBHOOK_SECRET`.
- **Rate limiting**: already configured (300 req/15min general, 20
  req/15min on login) via `express-rate-limit` — tune these in `server.js`
  if your traffic patterns need different thresholds.

---

## If something doesn't start

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot find module 'express'` etc. | `npm install` didn't finish | Re-run `npm install` in `backend/` |
| Backend crashes, mentions `ECONNREFUSED` on MySQL's port | MySQL isn't running, or wrong host/port | Start MySQL; confirm `DB_HOST`/`DB_PORT` in `.env` |
| `Access denied for user` | Wrong `DB_USER`/`DB_PASSWORD` | Fix `.env`, re-run `npm run migrate` |
| Migration fails on `UUID()` default | MySQL version older than 8.0.13 | Upgrade MySQL — this schema requires MySQL 8.0.13+ |
| Emails never arrive | Wrong SMTP credentials, or Gmail rejecting a plain password | Use an **App Password**, not your real password; check spam folder |
| Razorpay checkout popup won't open | Placeholder keys still in `.env` | Paste your real test keys |
| "Payment signature verification failed" | Key mismatch between order creation and verification | Don't mix live/test key pairs |
| Logo/signature/stamp missing from a certificate PDF | Branding was uploaded **after** that certificate was generated | Upload first in Settings, then regenerate — existing PDFs aren't retroactively updated |
| React shows a blank page | Backend not running, or wrong `REACT_APP_API_URL` | Confirm backend is up on port 5000 first; check browser console |
| Login with `SCH001` / `dist01` fails | Demo accounts not seeded | Re-run `npm run seed` in `backend/` |

---

## What's fully built vs. explicitly out of scope

**Fully built:** auth with refresh tokens and a correctly race-free logout
(client state clears before the server call, multi-tab logout via storage
events, session-expiry detection with a real message), password
setup/reset emails, Super Admin school + distributor management with
approval workflow and **soft delete everywhere it matters** (schools,
distributors, master data — delete and re-add the same name/email without
a false "already exists"), master data (11 categories, now editable,
exportable, and bulk-importable with a Success/Duplicate/Failed report),
a **manual wallet recharge system replacing Razorpay entirely** — bank
details + QR management with change-audit logging and email alerts, school
recharge submission with UTR/screenshot/date, Super Admin approve/reject
with atomic race-condition-safe wallet crediting, a full ledger with
opening/closing balance per row, low-balance and certificate-generated
email notifications, and a refund-on-failure safety net if PDF generation
fails after a certificate's wallet debit — student CRUD with camera-or-file
photo capture and bulk Excel/CSV import, all three certificate types as
real PDFs with GST breakdown and **working QR verification** (every QR
code is a real scannable URL to a public, no-login verification page,
not plain text), **landscape CR80 ID cards** with class/section, roll
number, parent name, and emergency contact, distributor self-service (add
school, track status, live commission calculation, profile editing,
password set directly at creation), the School Detail and Student Detail
pages, a real Notifications system wired to actual events, a Reports
module with platform analytics and a Users export, **Excel/CSV
export across Schools, Distributors, Certificates, Wallet Transactions,
Master Data, and Users** with filtering (status, date range, role) and
**Excel/CSV import with validation and downloadable error reports** for
Students and Master Data, rate limiting, helmet security headers, input
validation and XSS sanitization on every write route, audit logging
across logins, certificate generation, school/distributor deletion, wallet
top-ups, and bank-detail changes, Swagger docs, ER diagram, and a Jest
test suite covering the highest-risk logic (wallet concurrency, auth, GST
math, Razorpay-style signature verification logic retained as a reference
test even though Razorpay itself is gone).

**Explicitly out of scope** (not built, not hidden):
- Distributor commission **payout** records (commission *earned* is
  calculated and shown live; a "paid out on this date" ledger is a natural
  next addition following the same pattern as everything above)
- Editing an already-active school's profile fields as Super Admin (status
  changes — approve/reject/suspend — are supported; full field editing
  after creation isn't)
- PDF export format (Excel and CSV are fully built across every module;
  PDF export specifically was not added — Excel opens natively in PDF-export-
  capable tools like Excel/LibreOffice, so the data itself isn't locked in)
- Public self-registration for any role
- Native mobile apps (this is a responsive web application)
- A dedicated standalone Users management page (Users today are managed
  through their respective role screens — Schools, Distributors, Settings
  for Super Admin — with a cross-role export available from Reports;
  there's no single "Users" list/edit page distinct from those)
