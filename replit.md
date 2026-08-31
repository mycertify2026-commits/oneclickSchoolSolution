# One Click School Solutions

A multi-tenant school certificate management SaaS built with React + Node.js/Express + MySQL.

## Stack
- **Frontend**: React 18 (Create React App), port 5000 — shown in the Replit webview
- **Backend**: Node.js + Express, port 3001 — API server
- **Database**: MySQL 8.0+ (external — connect via Secrets)

## Running the app

Two workflows must be running:

| Workflow | Command | Port |
|---|---|---|
| Backend API | `cd backend && npm run dev` | 3001 |
| Start application | `cd frontend && npm start` | 5000 |

The React dev server proxies `/api/*` calls to `http://localhost:3001` automatically.

## Environment secrets (Replit Secrets panel)

| Secret | Description |
|---|---|
| `DB_HOST` | MySQL hostname |
| `DB_PORT` | MySQL port (usually 3306) |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |

Other env vars (JWT secrets, SMTP stubs, seed admin) are pre-configured as shared env vars.

## Database setup

Once DB credentials are added:

```bash
# Run from the Shell tab
cd backend && node src/config/migrate.js
cd backend && node src/config/seed.js
```

Default super-admin login after seed:
- **Email**: admin@certifypro.in
- **Password**: Admin@123

## Roles
- **Super Admin** — full platform management
- **School Admin** — manages one school's students and certificates
- **Distributor** — reseller who manages wallet top-ups for schools

## User Preferences
- Keep the project's existing React + Express + MySQL structure
- Do not migrate to PostgreSQL or restructure without explicit request
