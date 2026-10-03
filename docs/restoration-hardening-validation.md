# Restoration hardening validation

Date: 2026-10-03  
Working branch: `restoration-hardening-10-controls`  
Baseline branch: `restoration-baseline-2026-10-03`

## Restoration acceptance result

The dedicated **Restoration Acceptance** workflow is green on the reconstructed Fleet branch state.

Passed gates:

- frozen dependency install;
- Node 24 typecheck;
- `pnpm test:restoration`;
- `pnpm test:fleet-experience`;
- `pnpm test:access` covering the 20-role access foundation;
- public-booking regression;
- email-adapter regression;
- production frontend build.

Real external email delivery over a configured HTTPS staging environment remains a separate acceptance dependency.

## Canonical matrix status

The canonical full automated matrix now executes **49 suites**:

- **49 passed**
- **0 failed**

The matrix includes:

- `fleet-and-vehicle-owners.test.ts` — PASS
- `fleet-experience-contract.test.ts` — PASS

The six previously exposed failures in authorization, deployment readiness, Domains, CRM pricing, manual refund handling and CMS maintenance resolution were repaired and remain green.

## Fleet reconstruction status

Fleet is the first operational experience allowed through the restoration mutation gate.

Server-backed Fleet capabilities now include:

- list/search/filter;
- Register Vehicle;
- Vehicle Asset Profile / digital twin;
- canonical vehicle edit;
- lifecycle and availability status commands;
- mileage and fuel telemetry;
- ownership assignment, transfer and terms changes;
- Fleet document metadata;
- permission-scoped Maintenance, Compliance and Inspection context;
- primary image persistence;
- status/telemetry/ownership history;
- responsive desktop/mobile presentation.

The legacy Fleet screen/store is no longer the reachable Fleet authority in the restored company workspace.

The backend digital twin no longer publishes fabricated utilization/revenue figures. Rental history count/days are repository-backed; revenue/utilization stay unavailable until a canonical cross-domain metric is defined.

## Controls still enforced

- source baseline branch exists;
- local data checkpoint tool refuses the review SQLite database;
- checkpoints capture counts, stable keys and hashes without committing data;
- only reconstructed/accepted actions may become writable;
- all other restored operational screens remain read-only;
- tenant context clears on portal exit, access loss, session expiry and logout;
- personal Driver, Vehicle Owner and Renter portals remain record-scoped;
- prototype SaaS control-plane mutations remain quarantined;
- server permissions remain authoritative;
- real staging email remains separately tracked.

## Current development boundary

Fleet core is reconstructed and accepted as **PARTIAL / RECONSTRUCTED** because Maintenance, Compliance and Inspection execution intentionally remains owned by those dedicated bounded contexts.

The next Product Experience Master Blueprint wave is **Customers & Drivers**. It must receive its own screen contract and mutation acceptance gate rather than inheriting Fleet's writable status.
