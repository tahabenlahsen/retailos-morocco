# Setup Guide for Friends — RetailOS Morocco

This guide will help you run RetailOS Morocco on your PC in 5 minutes.
No PostgreSQL or Docker needed — it uses SQLite (a file-based database) for local testing.

## Prerequisites

You need **Node.js 20+** installed. Download it from:
- https://nodejs.org (choose "LTS")

Check it's installed:
```bash
node --version    # should show v20 or higher
npm --version
```

## Step-by-step setup

### 1. Clone the project

```bash
git clone https://github.com/tahabenlahsen/retailos-morocco.git
cd retailos-morocco
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your .env file

```bash
cp .env.example .env
```

The defaults are fine for local testing — no changes needed.
The app will use SQLite (a local file database) so you don't need PostgreSQL.

### 4. Create the database and seed demo data

```bash
npm run db:push
npm run db:seed
```

This creates the database schema and fills it with demo data:
- 2 businesses (Demo Mini Market + Boutique Zahra)
- 4 stores, 6 users, 28 products, 600+ sales

### 5. Start the app

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

## Demo accounts

Password for all accounts: **Demo12345**

| Email | Role | Business |
|---|---|---|
| `owner@demo.ma` | OWNER | Demo Mini Market (2 stores) |
| `manager@demo.ma` | MANAGER | Demo Mini Market |
| `cashier@demo.ma` | CASHIER | Demo Mini Market (store 1 only) |
| `owner@boutique.ma` | OWNER | Boutique Zahra (separate tenant) |

## What to try

1. **POS** — Go to "Caisse (POS)", scan/search a product, complete a cash sale
2. **Dashboard** — View revenue, profit, sales trends
3. **Products** — Browse the 28 demo products
4. **Customers** — See customer balances and loyalty points
5. **Analytics** — P&L, sales by category, payment methods
6. **Barcode labels** — Print barcode labels for products
7. **Switch language** — Top right corner → Arabic (RTL), English, French
8. **AI assistant** — Ask "Quel produit se vend le plus ce mois ?"

## Test on your phone/tablet (same WiFi)

1. Start the server with: `npm run dev -- -H 0.0.0.0`
2. Find your PC's IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
3. On your phone, open `http://YOUR_PC_IP:3000`

## Troubleshooting

**"EPERM: operation not permitted"** (Windows only)
- Close all Node processes and retry
- Or restart your PC

**Port 3000 already in use**
- Use a different port: `npm run dev -- -p 3001`

**Database errors**
- Delete the database and re-seed:
```bash
rm prisma/dev.db
npm run db:push
npm run db:seed
```

**Want to use PostgreSQL instead?**
- See README.md → "Database" section
- Or DEPLOYMENT.md for full Docker deployment

## Questions?

Ask Taha, or check the full documentation:
- README.md — full feature list and architecture
- DEPLOYMENT.md — how to deploy to a real server
- docs/PAYMENTS.md — Moroccan payment provider integration
