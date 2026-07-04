# SmartLedger SaaS — Accounting + Inventory + POS Starter

A modern **multi-tenant accounting, inventory, POS, sales, purchase, customer credit, supplier credit, user-role, and subscription-restricted SaaS starter** built with:

- React + Vite frontend
- Node.js + Express backend
- AWS Lambda + API Gateway using `serverless-http`
- PostgreSQL SQL database using Prisma ORM
- S3-ready document/file architecture
- JWT authentication
- Role-based authorization
- Subscription plan restrictions
- Tenant/business isolation

This is a production-style starter, not a small demo. It gives you a strong foundation to continue building a sellable system for shops, companies, service businesses, and personal/freelancer users.

---

## Project structure

```txt
accounting-saas-app/
  client/                 React + Vite UI
  server/                 Express + Lambda backend
  docker-compose.yml      Local PostgreSQL
  .env.example            Root environment sample
```

---

## Main modules included

### Frontend pages

- Login
- Register Company
- Dashboard
- Customers
- Suppliers
- Products
- Invoices
- POS
- Reports
- Users & Roles
- Subscription
- Settings

### Backend API modules

- Auth: register company, login, profile
- Tenants: company/business isolation
- Customers: CRUD
- Suppliers: CRUD
- Products: CRUD + stock quantity
- Invoices: create/list/read invoice + automatic stock movement + customer balance
- Dashboard: summary metrics
- Reports: basic sales, stock, outstanding customer report
- Users: invite/manage users
- Subscriptions: plan + feature restriction foundation
- Audit logs: track business actions

---

## Why PostgreSQL was selected

This app has connected financial data:

```txt
Customer -> Invoice -> Invoice Items -> Product -> Stock -> Payment -> Ledger -> Reports
```

SQL/PostgreSQL is better than DynamoDB for this because it supports joins, transactions, relationships, and accurate reporting.

---

## Local setup

### 1. Start PostgreSQL locally

```bash
docker compose up -d
```

### 2. Setup backend

```bash
cd server
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Backend runs on:

```txt
http://localhost:5000
```

### 3. Setup frontend

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Frontend runs on:

```txt
http://localhost:5173
```

---

## Test login

After seed:

```txt
Email: owner@demo.com
Password: Demo@12345
```

Or create a new business using the Register Company page.

---

## AWS serverless deployment idea

### Recommended architecture

```txt
React + Vite
  -> S3 + CloudFront
  -> API Gateway
  -> Lambda Node.js backend
  -> RDS Proxy
  -> Aurora Serverless v2 PostgreSQL
  -> S3 for PDF/documents/images
```

### Backend deploy

Edit `server/serverless.yml` and set environment variables from AWS Systems Manager Parameter Store or Secrets Manager.

```bash
cd server
npm install
npx prisma generate
serverless deploy --stage prod
```

For production, put Lambda in the same VPC as Aurora/RDS and use RDS Proxy.

---

## SaaS plan restriction examples

The starter has plan fields such as:

- max users
- max products
- max invoices per month
- POS allowed or not
- inventory allowed or not
- reports allowed or not
- advanced reports allowed or not
- branches allowed or not

You can use middleware like:

```js
planGuard('allowInventory')
limitGuard('products')
```

---

## Recommended next development order

1. Complete product/category/unit UI
2. Add purchase order + GRN full workflow
3. Add payment receipt and customer ledger
4. Add supplier bill and supplier ledger
5. Add double-entry accounting journal
6. Add PDF invoice printing
7. Add thermal POS receipt printing
8. Add WhatsApp invoice/reminder sharing
9. Add SaaS owner admin panel
10. Add AWS S3 document upload
11. Add branch/warehouse stock transfer
12. Add offline POS with local IndexedDB sync

---

## Important note

This is a starter foundation. A full accounting SaaS like Zoho/Odoo/QuickBooks requires many iterations, testing, financial validation, security review, and accountant verification before selling to real companies.
