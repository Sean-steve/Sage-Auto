# ADR-001: Monorepo Architecture & Sprint 1 Foundation

## Status
Accepted

## Context
Sprint 0 established a working prototype. Sprint 1 migrates this prototype into the canonical monorepo architecture adhering to DEV-001, DEV-002, and DEV-003.

## Decision
1. Establish a pnpm + Turborepo workspace structure with `apps/` and `packages/`.
2. Encapsulate prototype domain state behind explicit compatibility adapters (`PROTOTYPE ADAPTER — TO BE REPLACED BY BACKEND APPLICATION SERVICES`) without breaking existing UI features.
3. Establish NestJS API foundation at `apps/api` and BullMQ worker foundation at `apps/worker`.
4. Isolate monetary types behind strict value contracts (`packages/types` / `packages/contracts`) in preparation for PostgreSQL `NUMERIC(19,4)` persistence in Sprint 2.

## Consequences
All existing operational views (Fleet, Bookings, Rentals, Inspections, Maintenance, Compliance, Finance, Settlements, SaaS Control Plane, and Public Storefront) remain 100% operational while repository architecture is aligned to production standards.
