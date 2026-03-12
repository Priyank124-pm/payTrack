# NexPortal — Node.js + Express + MySQL

Full-stack self-hostable project management portal.

---

## 📦 Project Structure

```
nexportal/
├── server/                     ← Express API
│   ├── index.js                ← Entry point
│   ├── .env                    ← Your config (edit this)
│   ├── db/
│   │   ├── pool.js             ← MySQL connection pool
│   │   └── init.js             ← Auto-creates tables on start
│   ├── middleware/
│   │   └── auth.js             ← JWT verify + role guards
│   └── routes/
│       ├── auth.js             ← /api/auth/*
│       ├── users.js            ← /api/users/*
│       ├── projects.js         ← /api/projects/*
│       ├── milestones.js       ← /api/milestones/*
│       ├── changeRequests.js   ← /api/change-requests/*
│       └── reports.js          ← /api/reports/*
└── client/                     ← React frontend
    └── src/
        ├── api.js              ← All HTTP calls
        ├── context/AuthContext.js
        ├── hooks/useData.js
        ├── pages/…
        └── components/UI.js
```

---

## 🚀 Setup

### 1. Create MySQL Database

```sql
CREATE DATABASE nexportal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Configure Server

Edit `server/.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=nexportal

JWT_SECRET=pick-a-long-random-string-here-min-32-chars
JWT_EXPIRES_IN=7d

PORT=4000
CLIENT_URL=http://localhost:3000
```

### 3. Install & Start Server

```bash
cd server
npm install
npm run dev       # development (nodemon auto-reload)
npm start         # production
```

The server auto-creates all MySQL tables on first start.

### 4. Install & Start Client

```bash
cd client
npm install
npm start         # dev server at http://localhost:3000
```

### 5. Create First Super Admin

Open http://localhost:3000 → click **"First time? Create Super Admin account"** → fill in name/email/password → Create.

This calls `POST /api/users/seed-admin` which only works when the users table is empty.

---

## 🌐 API Reference

All endpoints prefixed with `/api`. Protected routes require:
```
Authorization: Bearer <jwt_token>
```

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | ❌ | `{ email, password }` → `{ token, user }` |
| GET  | `/api/auth/me` | ✅ | Returns current user profile |
| POST | `/api/auth/change-password` | ✅ | `{ currentPassword, newPassword }` |

### Users

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET    | `/api/users` | Any | List all users |
| GET    | `/api/users/:id` | Any | Get user by ID |
| POST   | `/api/users` | Admin | Create user `{ name, email, password, role, manager_id? }` |
| PATCH  | `/api/users/:id` | Admin | Update `{ name?, role?, manager_id? }` |
| DELETE | `/api/users/:id` | SuperAdmin | Delete user |
| POST   | `/api/users/seed-admin` | ❌ | One-time first admin setup |

### Projects

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET    | `/api/projects` | Any | List projects (scoped by role) |
| GET    | `/api/projects/:id` | Any | Get project + total_achieved |
| POST   | `/api/projects` | Any | Create `{ name, client, type, portal, manager_id, target_payment }` |
| PATCH  | `/api/projects/:id` | Any | Update project fields |
| PATCH  | `/api/projects/:id/mark-received` | Any | Mark all payments received → hides from projections |
| DELETE | `/api/projects/:id` | Admin | Delete project + cascade |

**Portals:** `Upwork`, `Fiverr`, `Toptal`, `PeoplePerHour`, `Freelancer`, `Direct`
**Types:** `Monthly`, `Hourly`, `Milestone`
> Upwork & Fiverr automatically apply 20% commission in the frontend display.

### Milestones

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET    | `/api/milestones` | Any | List, with optional `?project_id=&month=&year=` filters |
| POST   | `/api/milestones` | Any | Create `{ project_id, month, year, label, amount, target_date?, achieved?, status? }` |
| PATCH  | `/api/milestones/:id` | Any | Update `{ label?, amount?, target_date?, achieved?, status? }` |
| DELETE | `/api/milestones/:id` | Any | Delete milestone |

**Status values:** `Pending`, `Partial`, `Paid`, `Overdue`

### Change Requests

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET    | `/api/change-requests` | Any | List CRs (scoped by role) |
| POST   | `/api/change-requests` | Any | Create `{ project_id, title, amount, description? }` |
| PATCH  | `/api/change-requests/:id/approve` | Admin | Approve → adds amount to project target + reactivates |
| PATCH  | `/api/change-requests/:id/reject` | Admin | Reject CR |

### Reports

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET    | `/api/reports/monthly?month=&year=` | Any | PM performance summary + project detail |

---

## 👥 Roles

| Role | Permissions |
|------|-------------|
| `super_admin` | Full access including user delete, sub-admin creation |
| `sub_admin` | Same as super_admin except cannot delete users or create sub_admins |
| `project_manager` | See/manage own projects and milestones only |
| `coordinator` | Same data access as their assigned PM |

---

## 🏭 Production Deployment

### Option A: Same server, PM2

```bash
# Install PM2
npm install -g pm2

# Start API
cd server && pm2 start index.js --name nexportal-api

# Build React and serve with Nginx
cd client && npm run build
# serve build/ folder via Nginx (see below)
```

### Option B: Nginx config

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # React frontend (static)
    root /var/www/nexportal/client/build;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Set `REACT_APP_API_URL=` (empty — Nginx proxies) and `CLIENT_URL=https://yourdomain.com` in production.

### Option C: Docker Compose (quick start)

```yaml
version: '3.8'
services:
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: secret
      MYSQL_DATABASE: nexportal
    volumes:
      - db_data:/var/lib/mysql
    ports:
      - "3306:3306"

  api:
    build: ./server
    environment:
      DB_HOST: db
      DB_USER: root
      DB_PASSWORD: secret
      DB_NAME: nexportal
      JWT_SECRET: change-me-to-something-long
      CLIENT_URL: http://localhost:3000
    ports:
      - "4000:4000"
    depends_on:
      - db

  client:
    build: ./client
    ports:
      - "3000:80"
    environment:
      REACT_APP_API_URL: http://localhost:4000

volumes:
  db_data:
```

---

## 🔑 Business Rules

1. **Commission**: Fiverr & Upwork deduct 20% — displayed as gross → net on every milestone, subtotal, and report
2. **Monthly projections**: Each `month + year` combo is independent; navigate freely between months
3. **Project completion**: "Mark Done" hides project from current month's projections
4. **Change Requests**: PM submits → Admin approves → project target increases + reactivates in projections
5. **Coordinator sync**: Coordinators read/write the same project and milestone data as their assigned PM
