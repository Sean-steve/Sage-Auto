# Car Hire OS — Enterprise Fleet & Rental Platform

Car Hire OS is an enterprise-grade car rental and fleet management operating system designed for vehicle hire companies, peer-to-peer fleet aggregators, and multi-tenant rental operators.

## Monorepo Architecture (DEV-001 / DEV-002)

```
carhire-platform/
├── apps/
│   ├── api/             # NestJS REST API application (/api/v1, /health)
│   ├── worker/          # BullMQ background job processing & scheduling engine
│   ├── platform-admin/  # Multi-tenant SaaS control plane & subscription engine
│   ├── tenant-admin/    # Car hire operational management suite (Fleet, Bookings, Finance)
│   └── public-web/      # Public customer vehicle booking storefront & portal
│
├── packages/
│   ├── ui/              # Reusable UI presentation primitives (Button, Input, Card, Modal)
│   ├── types/           # Canonical TypeScript domain & contract interfaces
│   ├── contracts/       # REST & event contract definitions
│   ├── validation/      # Zod validation schemas
│   ├── config/          # Type-safe environment & application configuration
│   ├── constants/       # Business constants, permissions & status enums
│   ├── utils/           # Pure utility helpers
│   ├── eslint-config/   # Shared ESLint configuration
│   └── tsconfig/        # Shared TypeScript configs
│
├── infrastructure/
│   ├── docker/          # Dockerfiles & container configurations
│   ├── database/        # Prisma schema foundation & migrations
│   ├── deployment/      # Deployment definitions
│   ├── monitoring/      # Prometheus & observability configurations
│   └── storage/         # S3-compatible storage abstractions
│
├── docs/                # Architecture, API & Business documentation
├── scripts/             # Development & build automation scripts
└── tooling/             # Workspace tooling
```

## Quick Start & Local Development

### 1. Start Infrastructure (PostgreSQL, Redis, MinIO)
```bash
docker compose up -d
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Run Development Server
```bash
pnpm dev
```

### Standard Commands
- `pnpm dev` — Start the unified development server
- `pnpm build` — Build all applications and packages
- `pnpm lint` — Run workspace linting
- `pnpm typecheck` — Verify strict TypeScript compilation
- `pnpm test` — Run unit and integration tests
- `pnpm dev:api` — Run NestJS API in watch mode
- `pnpm dev:worker` — Run BullMQ Worker in watch mode
- `pnpm db:migrate` — Run database migrations

## Sprint 1 Foundation Note
Sprint 1 establishes the canonical monorepo architecture, application boundaries, strict typing, and local infrastructure while preserving 100% of the prototype UI and domain behavior behind explicit compatibility adapters.

## Isolated workflow certification

Run `pnpm local:review:certify` to start the review API and website, wait for readiness, and run the API lifecycle, simulated financial, seven-role browser, and return/finance browser checks. The command refuses staging/production, an externally supplied SQLite database, and occupied review ports (3510/3511). It stops dependent checks on failure and shuts down only its own child processes.

Node 24+ and Chrome/Chromium are required. Set `STAGE4_CHROME_BIN` and `STAGE5_CHROME_BIN` to an installed executable if the system Chrome launcher is unsuitable. Results and service logs are retained under `.review/certification/<timestamp>/`; screenshots are under `.review/overview/`. Review accounts and records are reused in `.review/access/` and are not production data. This is not a fresh-tenant UI or PostgreSQL certification.

Run `pnpm test:postgres-transactions` with `SAGE_TEST_DATABASE_URL` set to a dedicated local PostgreSQL database whose name ends in `_test`. The test creates and removes uniquely named tables and a restricted role, so its setup connection needs role-creation permissions. It verifies commits, rollbacks, tenant read/write isolation and reconnect persistence. The standalone executor tests cover its own tenant policies; they do not establish row-level security for the application record table.

### PostgreSQL application persistence

Normal API and worker startup now requires `DATABASE_URL` and defaults to `RECORD_STORE_BACKEND=postgres`. Run `pnpm db:migrate` before startup. The async repositories store their existing record payloads in PostgreSQL's `application_records` table. HTTP mutations and worker jobs share PostgreSQL transactions; successful mutation responses follow commit. SQLite and in-memory adapters remain for legacy tests and migration compatibility.

To preserve an existing SQLite database, stop API and workers, back up the source, and set `SQLITE_IMPORT_PATH` plus `DATABASE_URL` pointing to a migrated, empty application store. Run `pnpm db:import:sqlite` to preview, then `pnpm db:import:sqlite --apply` to import. The import refuses a nonempty target, verifies every copied value, and leaves SQLite unchanged. Keep the backup until acceptance is complete.

Run `test:postgres-record-store`, `test:postgres-http`, and `test:postgres-import` with an explicit disposable `DATABASE_URL`; the first two also require `RECORD_STORE_BACKEND=postgres`. These checks cover persistence, concurrency, rollback and import safety. They are not a fresh-company paid-UI certificate. The compatibility table does not yet have domain-level foreign keys or tenant RLS; existing tenant authorization checks remain essential.
