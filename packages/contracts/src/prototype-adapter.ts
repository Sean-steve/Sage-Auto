/**
 * ============================================================================
 * PROTOTYPE COMPATIBILITY ADAPTER NOTICE (SPRINT 1)
 * ============================================================================
 *
 * This file and the client-side state machine in `src/lib/store.tsx` represent
 * TEMPORARY PROTOTYPE ADAPTERS established during Sprint 0 prototyping.
 *
 * SPRINT CARRY-FORWARD CONTRACT:
 * 1. Storage & Persistence:
 *    - Currently held in React state / localStorage.
 *    - To be replaced in Sprint 2 with PostgreSQL schemas, Prisma ORM, and PostgreSQL RLS.
 * 2. Backend & Concurrency:
 *    - Concurrency and double-booking checks are currently client-evaluated.
 *    - To be replaced in Sprint 3 with NestJS backend services, database transactions,
 *      Pessimistic Locking / PostgreSQL EXCLUDE constraints.
 * 3. Outbox & Workers:
 *    - Outbox dispatcher is simulated in memory.
 *    - To be replaced in Sprint 4 with PostgreSQL transactional outbox table and BullMQ workers.
 *
 * All UI applications consume this interface to maintain 100% operational fidelity
 * while backend micro-modules are incrementally delivered.
 */

export interface PrototypeAdapterMetadata {
  isPrototypeAdapter: true;
  sprintOrigin: "Sprint-0";
  targetDecommissionSprint: "Sprint-2-to-4";
  persistenceLayer: "InMemory / Browser LocalStorage (Temporary)";
  concurrencyModel: "Optimistic Single-Thread Client Evaluation (Temporary)";
}

export const PROTOTYPE_ADAPTER_METADATA: PrototypeAdapterMetadata = {
  isPrototypeAdapter: true,
  sprintOrigin: "Sprint-0",
  targetDecommissionSprint: "Sprint-2-to-4",
  persistenceLayer: "InMemory / Browser LocalStorage (Temporary)",
  concurrencyModel: "Optimistic Single-Thread Client Evaluation (Temporary)",
};
