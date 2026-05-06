# MyBizOne Self-Hosted Deployment

Instructions for shop owners to run MyBizOne on a local PC using Docker.

## Prerequisites

- **Docker Desktop** (Windows/Mac) or **Docker Engine + Docker Compose** (Linux)
  - Download: https://www.docker.com/products/docker-desktop/
- **Minimum 2 GB RAM** available for containers
- **Port 3000** and **5432** not in use (app and database)

## Quick Start (5 minutes)

### 1. Create a deployment folder

```bash
mkdir mybizone-app
cd mybizone-app
```

### 2. Download `docker-compose.yml`

Copy the root `docker-compose.yml` from the MyBizOne distribution into your folder.

### 3. Create `.env` file

Create a file named `.env` in the same folder with:

```env
# Required for production: generate with `openssl rand -base64 32`
BETTER_AUTH_SECRET=your-random-secret-here

# Local LAN mode (skip HTTPS, non-Secure cookies)
LAN_MODE=true

# Storage backend: local (default) or r2
STORAGE_BACKEND=local

# Production
NODE_ENV=production
```

**Note:** Keep `BETTER_AUTH_SECRET` safe — use a strong random string.

### 4. Start the app

```bash
docker compose up -d
```

This will:
- Download PostgreSQL 16 image
- Build the MyBizOne app image
- Start both services
- Create a `storage/` volume for file uploads

### 5. Access the app

Open your browser and go to:
```
http://localhost:3000
```

## Daily Use

### View logs
```bash
docker compose logs -f app
```

### Restart (after updates)
```bash
docker compose restart
```

### Stop (without deleting data)
```bash
docker compose stop
```

### Full cleanup (deletes database + uploads)
```bash
docker compose down -v
```

## Backup

Database and file uploads are in Docker volumes:
- **Database:** `mybizone-app_dbdata`
- **Uploads:** `mybizone-app_storage`

To backup manually:
```bash
docker run --rm -v mybizone-app_dbdata:/dbdata -v $(pwd):/backup postgres:16-alpine \
  pg_dump -h mybizone-db -U mybizone -d mybizone > backup.sql
```

## Troubleshooting

### App won't start
```bash
docker compose logs app
```
Check if `BETTER_AUTH_SECRET` is set and strong enough (>= 16 chars).

### Port 3000 already in use
Change the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"  # Access at http://localhost:8080
```

### Database connection refused
Wait 10–15 seconds for the database to initialize. The app waits for the health check.

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `BETTER_AUTH_SECRET` | — | **Required.** Generate: `openssl rand -base64 32` |
| `LAN_MODE` | `false` | Set to `true` for local shop network (skips HTTPS) |
| `STORAGE_BACKEND` | `local` | `local` = files on disk; `r2` = AWS S3-compatible (advanced) |
| `NODE_ENV` | `production` | Leave as-is |

## Support

For issues or questions, contact support@mybizone.com
