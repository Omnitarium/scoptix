# SCOPTIX

SCOPTIX is a passive reconnaissance and attack surface exploration tool that helps analysts identify exposed content, potentially sensitive information, and application endpoints that may warrant further investigation. It aggregates subdomains, URLs, IP addresses, and archived web assets from external data sources to support security analysis and exposure discovery.

Data is currently sourced from **VirusTotal** and the Internet Archive's **Wayback Machine**.

![Dashboard — target overview and scan history](./img/1-dashboard.png)

-----

## Key Features

* **Asset Discovery:** Discover subdomains, URLs, IP addresses, and archived web assets from multiple external data sources. IP resolutions come from VirusTotal passive DNS (hostname ↔ IP history for the apex and discovered subdomains). Each scan keeps an observed IP list for that run; the target view aggregates the same addresses across all scans with hostname timelines and historical resolution detail.
* **Exposure Discovery:** Identify potentially exposed credentials, API keys, tokens, cloud secrets, and configuration artifacts across discovered assets using customizable detection rules.
* **Content Analysis:** Automatically discover potentially sensitive files, including documents, archives, binaries, backups, and other analyst-defined categories.
* **Endpoint Discovery:** Explore parameters, application endpoints, authentication-related resources, and other security-relevant application assets.
* **Scan Comparison:** Track changes across scans and quickly identify newly discovered subdomains, URLs, IP addresses, archived assets, and exposure findings.

![Scan summary — compare results across scans](./img/2-scan-summary.png)

![Historical hostnames — passive DNS timeline per IP](./img/3-historicalhostnames.png)

![All findings — exposure and content analysis results](./img/4-all-findings.png)

-----

## Real-World Examples

SCOPTIX was built around methodologies demonstrated by **Urwah Atiyat (OrwaGodFather)** in the following presentations:

* Art of VirusTotal Hacking – https://www.youtube.com/watch?v=Xosa-1o-01M
* Essence of Recon in Bug Bounty and Pentesting – https://www.youtube.com/watch?v=CJnXjWXXB1Y

Real-world examples discussed in these presentations include:

* Identifying exposed origin infrastructure behind WAF.
* Discovering publicly accessible sensitive documents, including identity records, passports, and other personal information.
* Finding forgotten backup archives (such as `backup.7z`) exposing source code, credentials, configuration files, or other sensitive internal information.
* Identifying password reset URLs that remain valid beyond their intended lifetime, potentially leading to account compromise.

-----

## Typical Workflow

1. Discover subdomains, URLs, and IP resolution history from external data sources.
2. Review identified assets (including per-IP hostname history on the target) and archived content.
3. Analyze URLs and content for exposed credentials, secrets, and sensitive files.
4. Investigate application endpoints and other security-relevant findings.
5. Compare results across scans to identify newly discovered exposures.

-----

## Important Notice

- **Not for production:** This tool focuses on functionality over hardened security. Use it exclusively in isolated, trusted environments.
- **No built-in authentication:** Anyone with network access can view findings and trigger scans. Do NOT expose SCOPTIX to the public internet without your own access controls (e.g., VPN, reverse proxy).
- **Third-party APIs and data:** VirusTotal and the Internet Archive impose their own terms, rate limits, and acceptable-use policies. This repository orchestrates queries and stores results locally; it is not a redistribution of upstream datasets.

-----

## Prerequisites

- Node.js (LTS recommended) and npm
- Git (to clone the repository)
- **Either** Docker (recommended for Postgres + Redis) **or** your own PostgreSQL and Redis instances

**Tested platform:** Ubuntu 26.04 (Docker and local dev workflows above). Other Linux distributions and macOS may work but are not routinely verified.

Optional:

- One or more [VirusTotal](https://www.virustotal.com/) API keys (required for VT-powered discovery)
- SOCKS proxy (if outbound API or deep-fetch traffic must route through a proxy)

## Getting started

Choose one of two workflows:

| Workflow | Best for | Command |
|----------|----------|---------|
| **Local dev (hot reload)** | Changing UI/worker code | `npm run dev:local` |
| **Full Docker** | Try production-like stack without Node on host | `bash docker-start.sh` |

Both use the same `.env` file with **localhost** URLs for Postgres and Redis when developing on your machine. Docker Compose maps containers to `localhost:5432` and `localhost:6379`.

### 1. Clone and install

```bash
git clone <your-clone-url>
cd scoptix
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

The helper scripts can create `.env` automatically on first run (`scripts/ensure-env.sh`).

Edit `.env` and set at minimum:

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (`postgresql://recon:recon@localhost:5432/recon?schema=public` with Docker infra) |
| `REDIS_URL` | Yes | Redis connection string (`redis://127.0.0.1:6379` with Docker infra) |
| `APP_ENCRYPTION_KEY` | Recommended | 32-byte key (base64 or hex) for encrypting stored API keys |
| `VT_SEED_API_KEY` | Optional | Seed a VirusTotal key during `npm run db:seed` (dev convenience) |

Generate an encryption key (Linux/macOS):

```bash
openssl rand -base64 32
```

If `APP_ENCRYPTION_KEY` is omitted, the app can auto-provision a key in the database on first use—but setting it explicitly is recommended so keys remain decryptable across deployments.

### 3. Start services

#### Option A — Local development (recommended)

One command starts Postgres + Redis in Docker, runs migrations on first use, then the Next.js dev server and scan worker with hot reload:

```bash
npm run dev:local
```

Or step by step:

```bash
npm run docker:infra          # Postgres + Redis only
npm run docker:wait           # wait until both are healthy
npm run setup                 # first time: migrate + seed
npm run dev:all               # dev server + worker
```

Equivalent shell wrapper: `bash docker-start-infra.sh` then `npm run dev:all`.

#### Option B — Full stack in Docker

Builds and runs the app, worker, database setup, Postgres, and Redis in containers (no hot reload):

```bash
bash docker-start.sh
```

Open [http://localhost:3000](http://localhost:3000).

- Check status: `./docker-status.sh`
- Logs: `npm run docker:logs`
- Stop: `bash docker-stop.sh` or `npm run docker:down`

#### Option C — Manual Postgres / Redis

If you already run Postgres and Redis (not via this repo’s Compose file), point `DATABASE_URL` and `REDIS_URL` in `.env` at your instances, then:

```bash
npm run setup
npm run dev:all
```

### 4. First scan

1. Open **Settings → API & network** and add at least one VirusTotal API key (unless seeded).
2. Confirm **VirusTotal** (and optionally **Wayback Machine**) are enabled under scan engines.
3. Go to **Scans**, enter a domain, optionally enable deep scan, and start.

## Docker & permissions

Development and Docker helper scripts in this repo were validated on **Ubuntu 26.04**.

- **Postgres data** is stored in a named Docker volume (`scoptix_pg`), not a host bind mount—so you avoid UID/GID permission issues on `./data` folders.
- **Linux:** add your user to the `docker` group so you do not need `sudo` for Compose: `sudo usermod -aG docker $USER`, then log out and back in.
- **Ports:** defaults are `5432` (Postgres) and `6379` (Redis). Override with `POSTGRES_PORT` / `REDIS_PORT` in `.env` if those ports are already in use.

## Useful npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev:local` | Docker infra + migrate (if needed) + `dev:all` (one-shot local dev) |
| `npm run docker:infra` | Start only Postgres + Redis |
| `npm run docker:infra:setup` | Infra + wait + `setup` |
| `npm run docker:up` / `docker:down` | Full stack in Docker |
| `npm run dev` | Next.js dev server |
| `npm run worker` | BullMQ scan worker (required for scans to run) |
| `npm run dev:all` | Dev server + worker via `concurrently` |
| `npm run build` / `npm run start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:push` | Push schema without migration files (dev shortcut) |
| `npm run db:seed` | Seed extension rules and default settings |
| `npm run setup` | `db:migrate` + `db:seed` |

### Database migrations

The schema ships as a single Prisma migration: `prisma/migrations/0001_init`. Fresh installs (`npm run setup`, `bash docker-start.sh`) apply that file automatically.

## Scan pipeline (overview)

When both engines are enabled for a root-domain scan, the worker roughly follows:

1. **VirusTotal — apex:** domain report, URL harvest, and passive DNS resolutions for the root domain.
2. **VirusTotal — subdomains:** BFS expansion up to `maxSubdomains` (URLs and passive DNS per hostname).
3. **VirusTotal — IP resolutions:** persist observed IPs for the scan and merge hostname↔IP sightings into the target’s global IP directory.
4. **Wayback — apex:** CDX URL list for the root domain.
5. **Wayback — subdomains:** CDX per discovered subdomain (rate-limited).
6. **Consolidate:** dedupe URLs, assign extension categories, update target caches.
7. **Analysis:** regex scan on URL strings; optional deep fetch + body scan for selected categories.

Subdomain-only scans skip full apex expansion but still run enabled engines against the input hostname.

## Contributing

Improvements, bug reports, and security feedback are welcome as issues or pull requests. Please respect VirusTotal and Internet Archive terms of use when testing against live APIs.
