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
