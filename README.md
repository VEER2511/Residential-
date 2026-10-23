# Residential Operations & Management System (ROMS)

A beginner-friendly full-stack web application for managing a PG / rental building. Tenants create accounts, report maintenance problems with optional photo attachments, read notices from the owner, see visitors logged for their room, and track their monthly rent status. The Owner logs in with dedicated credentials configured locally to manage complaints, post and delete notices, keep the visitor log with check-in/check-out times, generate monthly rent entries, and mark rent as Paid or Unpaid. Data and login sessions are persisted using a local MongoDB database.

Built with the same architecture and stack as a classic Express + MongoDB classroom project: plain HTML, CSS, and JavaScript on the frontend and a single Express server file on the backend.

## Project Structure

```text
index.html          Sign-in landing page
signup.html         Tenant registration page
tenant.html         Tenant workspace (complaints, notices, visitors, rent)
owner.html          Owner workspace (complaints, notices, visitor log, rent tracker, tenants)
profile.html        User profile name, room number, and password management page
style.css           Shared cohesive responsive stylesheet
auth.js             Sign-in, registration, and initial redirect handling
tenant.js           Tenant workspace logic
owner.js            Owner workspace logic
profile.js          Profile update and password change handling
server.js           Express server, routes, session store, upload handler, MongoDB connection
.env.example        Environment variable template for local configuration
.gitignore          Git rules ignoring .env, node_modules, and uploaded photos
package.json        Project dependencies and start script
PROJECT_REPORT.md   Project summary report
README.md           Setup and usage documentation
uploads/            Local directory where uploaded complaint photos are saved
```

## Prerequisites

- **Node.js** (v18 or higher recommended) and **npm**
- **MongoDB Community Server** installed and running locally at `mongodb://127.0.0.1:27017`

---

## Setup and Run Instructions

### 1. Start MongoDB

Make sure local MongoDB is running. If installed as a Windows service:

```powershell
net start MongoDB
```

Or start the daemon manually with your data directory:

```powershell
mongod --dbpath "C:\data\db"
```

### 2. Install Dependencies

Open a terminal in the project directory and run:

```powershell
npm install
```

### 3. Create and Configure `.env`

Copy the provided `.env.example` to create your private `.env` file:

```powershell
Copy-Item .env.example .env
```

Open `.env` in any text editor and configure:
- `PORT`: Server port (default: `3000`).
- `MONGO_URI`: MongoDB connection string (default: `mongodb://127.0.0.1:27017`).
- `SESSION_SECRET`: A secure random secret string of at least 32 characters.
- `OWNER_EMAIL`: Email for the owner account (e.g. `owner@roms.local`).
- `OWNER_PASSWORD`: Owner password of at least 8 characters.

> Note: `.env` is ignored by Git. Never commit production secrets or real passwords to version control.

### 4. Start the Application

```powershell
npm start
```

When started, you should see:
```text
Residential Operations & Management System running at http://localhost:3000
```

### 5. Open in Browser

Open your browser and navigate to:
```text
http://localhost:3000
```

---

## Demo Accounts

| Role | Email | Password | How it is created |
|------|-------|----------|-------------------|
| Owner | value of `OWNER_EMAIL` in `.env` | value of `OWNER_PASSWORD` | Auto-created at server start |
| Tenant (demo) | `demo@pg.local` | `Tenant@123` | Auto-created at server start |

---

## User Roles and Workflows

### Tenant Workflow
1. Navigate to `http://localhost:3000` and click **Create an account** (or visit `/signup.html`).
2. Fill in your name, email, room number, and password (minimum 8 characters) to register. Public registrations are automatically assigned the `tenant` role.
3. Sign in at `index.html`. You are directed to `/tenant.html`.
4. The summary cards at the top show your open complaints, this month's rent status, and the latest notice.
5. In the **Report a maintenance problem** form, submit a complaint:
   - **Title**: 3 to 100 characters.
   - **Category**: Plumbing, Electrical, Housekeeping, Security, or Other.
   - **Room**: 1 to 20 characters.
   - **Description**: 10 to 1000 characters.
   - **Photo attachment (optional)**: JPEG, PNG, or WebP up to 2 MB.
6. Your complaints appear in **My complaints** with status badges (`Reported`, `In Progress`, or `Resolved`).
7. **Notices** shows announcements posted by the owner (read-only).
8. **My visitors** shows visitor entries logged by the owner for your room only.
9. **Rent history** shows your monthly rent amount and payment status.
10. Click **Refresh** at any time to pull the latest updates.

### Owner Workflow
1. Sign in at `index.html` using the `OWNER_EMAIL` and `OWNER_PASSWORD` credentials configured in your `.env` file.
2. The server automatically routes owners to `/owner.html`.
3. The dashboard shows live summary cards: **Total tenants**, **Open complaints**, **Visitors inside**, and **Unpaid rents**.
4. **Tenant complaints**: read every complaint (with reporter name and room) and change status using the dropdown — `Reported`, `In Progress`, or `Resolved` — then click **Save status**.
5. **Notices**: post a new notice with a title and details, or delete an old one. All tenants see notices instantly on their next refresh.
6. **Visitor log**: log a visitor with name, optional phone, room, and purpose. Click **Check out** when the visitor leaves to record the exit time.
7. **Rent tracker**: choose a month and amount and click **Generate rent entries** — the server creates one rent record per tenant that does not have one yet. Use **Mark as Paid / Mark as Unpaid** to update each record.
8. **Registered tenants**: view all tenant accounts with their room numbers.

### Profile Management
- Both tenants and owners can click **My Profile** in the top navigation bar to access `/profile.html`.
- Users can update their display name, (tenants) their room number, and change their password by verifying the current password.

### Sample Seed Data
- When the server starts for the first time with empty collections, it automatically seeds sample complaints, notices, visitor entries, and rent records (including one paid and one unpaid month) so every screen has realistic data for demonstration.

---

## API Overview

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/api/auth/signup` | Public | Create a tenant account |
| POST | `/api/auth/login` | Public | Sign in |
| GET | `/api/auth/me` | Logged in | Current session user |
| POST | `/api/auth/logout` | Logged in | End session |
| PATCH | `/api/auth/profile` | Logged in | Update name and room |
| PATCH | `/api/auth/password` | Logged in | Change password |
| GET | `/api/tenant/complaints` | Tenant | List own complaints |
| POST | `/api/tenant/complaints` | Tenant | Submit complaint (multipart, optional photo) |
| GET | `/api/owner/complaints` | Owner | List all complaints |
| PATCH | `/api/owner/complaints/:id/status` | Owner | Update complaint status |
| GET | `/api/notices` | Logged in | List notices |
| POST | `/api/notices` | Owner | Post a notice |
| DELETE | `/api/notices/:id` | Owner | Delete a notice |
| GET | `/api/owner/visitors` | Owner | Full visitor log |
| POST | `/api/owner/visitors` | Owner | Log visitor entry |
| PATCH | `/api/owner/visitors/:id/checkout` | Owner | Record check-out time |
| GET | `/api/tenant/visitors` | Tenant | Visitors for own room |
| GET | `/api/owner/tenants` | Owner | List tenant accounts |
| GET | `/api/owner/rents` | Owner | All rent records |
| POST | `/api/owner/rents/generate` | Owner | Generate monthly rent entries |
| PATCH | `/api/owner/rents/:id/status` | Owner | Mark rent Paid/Unpaid |
| GET | `/api/tenant/rents` | Tenant | Own rent history |

---

## Security and Verification Details

- **Role-Based Access Control**: Pages (`tenant.html`, `owner.html`) and API endpoints (`/api/tenant/*`, `/api/owner/*`) require active sessions and verify the user's role. Tenants cannot access owner controls, and the owner account cannot be self-registered.
- **Password Security**: Passwords are encrypted with `bcryptjs` using 10 salt rounds before storage.
- **Session Management**: Session cookies are managed securely with `express-session` and persisted in MongoDB via `connect-mongo`. The session ID is regenerated on every login to prevent session fixation.
- **File Upload Protection**: Complaint photos are restricted to JPEG, PNG, and WebP formats up to 2 MB, and Multer saves files with random UUID filenames.
- **Data Integrity**: A compound unique index on `tenantId + month` prevents duplicate rent entries, and the email index prevents duplicate accounts.
