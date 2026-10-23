# Residential Operations & Management System

## Motivation for Selection

Tenants living in paying guest accommodations and rental buildings frequently face unorganized day-to-day operations: complaints about plumbing or electrical faults are reported verbally and forgotten, notices about water supply or rent deadlines reach tenants late or not at all, visitor entries are maintained in paper registers that cannot be searched, and rent payment tracking depends on manual notebooks. These gaps create disputes and poor communication between the property owner and tenants. The Residential Operations & Management System provides a unified, accessible web platform where tenants report problems with optional photo evidence, read official notices, view visitor entries for their room, and check their rent status, while the owner manages all residential operations from a single dashboard with live summary counts.

## Objectives

- Enable tenants to register securely with their room number, report maintenance problems with optional photo attachments, and track the progress of their complaints.
- Provide the owner with a protected management dashboard to inspect tenant complaints, post and delete notices, and maintain a visitor log with check-in and check-out times.
- Allow the owner to generate monthly rent entries for all tenants in one step and mark each month as Paid or Unpaid with immediate status recalculation.
- Implement role-based access control protecting tenant and owner pages and API endpoints, with the owner account provisioned only through local environment configuration.
- Build a lightweight, beginner-friendly full-stack application using HTML5, Vanilla CSS, JavaScript, Node.js, Express, and local MongoDB storage.

## Customer Base / Target Users

- **Tenants**: Students and working professionals living in PG accommodations or rental buildings who need a simple self-service channel to report problems, read notices, and verify their rent and visitor records.
- **Property Owners & Managers**: PG owners, landlords, and building managers responsible for handling tenant complaints, communicating announcements, keeping visitor records for security, and tracking monthly rent payments.

## Project Summary

Residential Operations & Management System is a responsive full-stack web application designed for PG and rental building management. The application features user authentication with two roles, role-based dashboards, multipart file uploads, and persistent MongoDB storage.

Tenants create accounts via a public registration form (`signup.html`), which stores their room number and assigns the `tenant` role, and authenticate via a session-backed login form (`index.html`). In the tenant workspace (`tenant.html`), tenants submit complaints specifying title, category (Plumbing, Electrical, Housekeeping, Security, Other), room, description, and an optional image attachment (JPEG, PNG, WebP up to 2 MB) stored safely on disk and referenced in MongoDB. The tenant homepage shows summary cards for open complaints, the current month's rent status, and the latest notice. Tenants can read notices, see visitors logged for their own room only, and view their complete rent history.

The owner authenticates using pre-provisioned credentials defined in local environment variables. The owner workspace (`owner.html`) displays live summary cards (Total tenants, Open complaints, Visitors inside, Unpaid rents) and provides complete control over operations: updating complaint statuses across Reported, In Progress, and Resolved; posting and deleting notices; logging visitor entries and recording check-out times; generating monthly rent entries for all tenants with a single action; and marking rent records as Paid or Unpaid. A unique compound index on tenant and month guarantees that no duplicate rent entries can be created.

The backend is built with Express, `express-session`, and `connect-mongo`, with passwords securely hashed using `bcryptjs`. Data validation occurs on both client and server, ensuring input constraints and preventing unauthorized role escalation.

## Module List

1. **Authentication & Profile** - signup, login, logout, profile name/room update, password change
2. **Complaint Management** - tenant submissions with photo evidence, owner status workflow
3. **Notice Board** - owner announcements visible to all tenants
4. **Visitor Log** - gate entries with check-in/check-out, room-wise tenant visibility
5. **Rent Tracker** - monthly rent generation, payment status tracking

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js, Express |
| Database | MongoDB (local) |
| Sessions | express-session + connect-mongo |
| Password Security | bcryptjs |
| File Uploads | Multer |
| Configuration | dotenv |
