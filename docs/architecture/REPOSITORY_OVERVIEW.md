# Car Hire OS — Canonical Monorepo Architecture (DEV-001 / DEV-002)

## Overview
Car Hire OS is structured as a canonical Turborepo & pnpm workspace modular monolith.

### Monorepo Structure
- `apps/api`: NestJS REST API application exposing `/api/v1` routes and `/health`.
- `apps/worker`: BullMQ job execution and scheduling engine.
- `apps/platform-admin`: Multi-tenant SaaS control plane, tenant management, billing & analytics.
- `apps/tenant-admin`: Car rental operations desk, fleet management, reservations, inspections, maintenance, compliance, and double-entry ledger.
- `apps/public-web`: Direct-to-consumer storefront, vehicle catalogue, and customer reservation portal.

### Shared Packages
- `packages/ui`: Pure visual presentation components (Button, Input, Card, Modal, Badge, etc.).
- `packages/types`: Canonical TypeScript domain interfaces and value contracts.
- `packages/contracts`: Canonical REST & Event contracts.
- `packages/validation`: Zod schemas and validation helpers.
- `packages/config`: Type-safe environment validation and runtime configuration.
- `packages/constants`: Static business constants, permissions, and status enums.
- `packages/utils`: Pure utility and date formatting functions.
- `packages/eslint-config`: Shared ESLint configurations.
- `packages/tsconfig`: Shared TypeScript compiler configurations.
