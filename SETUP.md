# Varco CRM — Setup & Deployment Guide

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm 8+

### Step 1: Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL and JWT secrets
```

backend/.env example:
```
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/varco_callcentre
JWT_SECRET=my-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=my-super-secret-refresh-key-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
```

### Step 2: Create PostgreSQL Database

```sql
CREATE DATABASE varco_callcentre;
```

### Step 3: Install & Start Backend

```bash
cd backend
npm install
npm run dev
# Server starts on http://localhost:5000
# Database migrations run automatically on startup
```

### Step 4: Install & Start Frontend

```bash
cd frontend
npm install
npm run dev
# App opens on http://localhost:5173
```

### Step 5: Seed Demo Data

```bash
cd backend
npm run seed
```

### Demo Credentials

| Role    | Email                | Password     |
|---------|---------------------|--------------|
| Manager | manager@varco.in    | Manager@123  |
| Caller  | priya@varco.in      | Caller@123   |
| Caller  | amit@varco.in       | Caller@123   |
| Caller  | sneha@varco.in      | Caller@123   |
| Caller  | rohit@varco.in      | Caller@123   |
| Caller  | ananya@varco.in     | Caller@123   |

---

## Docker Deployment (Local)

```bash
# Copy root .env
cp .env.example .env
# Edit .env — set DB_PASSWORD, JWT secrets

# Build and start all services
docker-compose up --build -d

# Run migrations + seed
docker-compose exec backend npm run seed

# Access app at http://localhost:80
```

---

## Render Deployment

### Option A: Separate Services (Recommended)

#### 1. PostgreSQL on Render
- Go to render.com → New → PostgreSQL
- Name: varco-db
- Note the **Internal Database URL**

#### 2. Backend Web Service
- New → Web Service → Connect your GitHub repo
- Root directory: `backend`
- Build command: `npm install`
- Start command: `node src/index.js`
- Environment variables:
  ```
  NODE_ENV=production
  DATABASE_URL=<your-render-internal-db-url>
  JWT_SECRET=<generate-random-32-char-string>
  JWT_REFRESH_SECRET=<generate-random-32-char-string>
  JWT_EXPIRES_IN=15m
  JWT_REFRESH_EXPIRES_IN=7d
  FRONTEND_URL=https://your-frontend.onrender.com
  ```
- After first deploy: open Shell → run `node seeds/seed.js`

#### 3. Frontend Static Site
- New → Static Site → Connect your GitHub repo
- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment variables:
  ```
  VITE_API_URL=https://your-backend.onrender.com
  ```

⚠️ **Important**: Update `vite.config.js` proxy target and `FRONTEND_URL` env var to point to your actual Render backend URL.

For the frontend to proxy API calls correctly on Render (static site), you need to set the base URL in axios. Update `frontend/src/services/api.js`:
```js
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  ...
});
```
And `vite.config.js` proxy handles local dev automatically.

### Option B: Docker on Render
- Use Render's Docker deploy with the `docker-compose.yml`
- Set all environment variables in Render dashboard

---

## Database Backups

### Schedule Automated Backups (Linux/cron)
```bash
# Add to crontab: crontab -e
0 2 * * * /path/to/backend/scripts/backup.sh >> /var/log/varco-backup.log 2>&1
```

### Manual Backup
```bash
cd backend
bash scripts/backup.sh
```

### Restore from Backup
```bash
cd backend
bash scripts/restore.sh /var/backups/varco-callcentre/backup_20240101_020000.sql.gz
```

### Render / External Storage Backup
1. Install Render's PostgreSQL add-on (automatic daily backups included)
2. Or export manually: `pg_dump $DATABASE_URL | gzip > backup.sql.gz`
3. Upload to S3 or Google Cloud Storage via the backup script (extend with `aws s3 cp` or `gsutil cp`)

---

## Production Checklist

- [ ] Change all default passwords
- [ ] Set strong JWT_SECRET (32+ random characters)
- [ ] Set strong JWT_REFRESH_SECRET
- [ ] Configure FRONTEND_URL to your actual domain
- [ ] Enable HTTPS (Render handles this automatically)
- [ ] Set up database backups
- [ ] Monitor logs in Render dashboard
- [ ] Configure custom domain in Render

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  React Frontend │────▶│  Express Backend │────▶│   PostgreSQL    │
│  (Vite/Nginx)   │     │  (Node.js)       │     │   Database      │
│  Port 5173/80   │     │  Port 5000       │     │   Port 5432     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/refresh | Refresh token |
| POST | /api/auth/logout | Logout |
| GET | /api/users | List users (manager) |
| POST | /api/users | Create user (manager) |
| GET | /api/leads | List leads |
| POST | /api/leads | Create lead (manager) |
| GET | /api/leads/:id | Get lead detail |
| PUT | /api/leads/:id | Update lead |
| POST | /api/leads/import | Import CSV (manager) |
| GET | /api/leads/export | Export leads |
| POST | /api/attendance/login | Clock in |
| POST | /api/attendance/logout | Clock out |
| GET | /api/calls/stats/team | Team stats (manager) |
| GET | /api/reports/daily | Daily report |
| GET | /api/alerts | List alerts (manager) |
| GET | /api/activity-logs | Audit trail (manager) |
