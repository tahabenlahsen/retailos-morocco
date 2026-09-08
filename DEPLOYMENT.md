# Production Deployment Guide — RetailOS Morocco

This guide covers deploying RetailOS Morocco to a VPS (Virtual Private Server)
with Docker, Caddy (automatic HTTPS), PostgreSQL, and Redis.

## Prerequisites

### What you need

1. **A VPS** with at least 2 GB RAM and 20 GB disk:
   - DigitalOcean, Hetzner, OVH, or a Moroccan host (Arbor, HebergeMaroc)
   - Ubuntu 22.04+ or Debian 12+
   - Docker and Docker Compose installed

2. **A domain name** (e.g. `retailos.yourshop.ma`):
   - Point an A record to your VPS IP address
   - Caddy will automatically provision a Let's Encrypt TLS certificate

3. **SMTP credentials** (for password reset emails):
   - Gmail with an app password, or a service like Brevo/SendGrid
   - Optional but recommended for production

4. **OpenAI API key** (for the AI business assistant):
   - Optional; the app works without it
   - Requires a paid OpenAI account with billing enabled

### What you do NOT need

- Docker on your local PC (the app is built on the server)
- A separate database server (PostgreSQL runs in Docker)

---

## Step 1: Prepare the server

SSH into your VPS and install Docker:

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Log out and back in for the group change to take effect
```

---

## Step 2: Clone the repository

```bash
git clone https://github.com/tahabenlahsen/retailos-morocco.git
cd retailos-morocco
```

---

## Step 3: Configure environment

Copy the example and fill in your production values:

```bash
cp .env.example .env
nano .env
```

**Critical settings to change:**

```env
# Generate a strong random secret (run: openssl rand -base64 32)
NEXTAUTH_SECRET="your-generated-secret-here"

# Your domain (Caddy will use this for HTTPS)
NEXTAUTH_URL="https://retailos.yourshop.ma"

# PostgreSQL password (change from the default)
POSTGRES_PASSWORD="a-strong-password-here"
DATABASE_URL="postgresql://retailos:a-strong-password-here@db:5432/retailos?schema=public"

# Redis (runs in Docker, no password needed for internal network)
REDIS_URL="redis://redis:6379"

# SMTP (optional but recommended)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="RetailOS <your-email@gmail.com>"

# OpenAI (optional)
OPENAI_API_KEY="sk-..."

# Rate limiting
LOGIN_RATE_LIMIT="10"
```

---

## Step 4: Configure Caddy (HTTPS)

Edit `docker/Caddyfile` and replace the domain:

```caddyfile
retailos.yourshop.ma {
    reverse_proxy app:3000
    encode gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

---

## Step 5: Build and start

```bash
# Build and start all services (app + PostgreSQL + Redis + Caddy)
docker compose up -d --build

# Run database migrations
docker compose exec app npx prisma migrate deploy

# Seed the demo data (optional — skip for production)
# docker compose exec app npm run db:seed
```

---

## Step 6: Verify

```bash
# Check all containers are running
docker compose ps

# Check the app is healthy
curl https://retailos.yourshop.ma/api/health

# Check logs if something is wrong
docker compose logs app --tail 50
docker compose logs caddy --tail 50
```

You should see:
```json
{"status":"ok","database":"ok","timestamp":"..."}
```

---

## Step 7: Create your first shop

1. Open `https://retailos.yourshop.ma` in your browser
2. Click "Sign up" and create your business account
3. Choose your business type (mini-market, café, boutique, etc.)
4. Add your stores, products, and employees
5. Start selling!

---

## Backups

### Database backup (daily recommended)

```bash
# On the server, create a backup:
docker compose exec db pg_dump -U retailos -Fc retailos > backups/retailos-$(date +%Y%m%d).sql.gz

# Or use the built-in script:
docker compose exec app npm run db:backup

# Download to your PC:
scp user@your-vps:retailos-morocco/backups/retailos-*.sql.gz ./backups/
```

### Restore from backup

```bash
# Upload the backup to the server:
scp ./backups/retailos-20260908.sql.gz user@your-vps:retailos-morocco/

# Restore into a verification database first:
docker compose exec app node scripts/db-restore.mjs --file retailos-20260908.sql.gz --target retailos_restore --create
```

### Automated daily backup (cron)

```bash
# On the server:
crontab -e
# Add this line for a daily 2 AM backup:
0 2 * * * cd /home/user/retailos-morocco && docker compose exec -T db pg_dump -U retailos -Fc retailos > backups/retailos-$(date +\%Y\%m\%d).sql.gz
```

---

## Updates

To update to a new version:

```bash
cd retailos-morocco
git pull origin master
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
```

---

## Troubleshooting

### Container won't start
```bash
docker compose logs app --tail 100
```

### Database connection failed
- Check `DATABASE_URL` in `.env` matches `POSTGRES_PASSWORD`
- Ensure the `db` container is running: `docker compose ps db`

### Caddy can't get HTTPS certificate
- Ensure your domain's A record points to the server IP
- Ensure port 80 and 443 are open on the firewall
- Check Caddy logs: `docker compose logs caddy`

### WebUSB thermal printing doesn't work
- WebUSB requires HTTPS (Caddy provides this automatically)
- Use Chrome or Edge (Firefox doesn't support WebUSB)
- Click the "Thermal printer" button on the receipt dialog
- If WebUSB is unavailable, the "Print receipt" button opens the PDF in a new tab

---

## Security checklist

- [ ] `NEXTAUTH_SECRET` is a strong random value (not the default)
- [ ] `POSTGRES_PASSWORD` is changed from the default
- [ ] `.env` is NOT committed to Git (it's in `.gitignore`)
- [ ] Domain uses HTTPS (Caddy provisions automatically)
- [ ] Firewall allows only ports 80 and 443 (close 5432, 6379, 3000)
- [ ] Database backups run daily
- [ ] Demo accounts are disabled or removed in production
- [ ] SMTP is configured for password reset emails
