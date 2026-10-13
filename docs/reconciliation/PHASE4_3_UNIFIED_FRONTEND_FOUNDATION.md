# Phase 4.3 — Unified Frontend Architecture & Integration Foundation

**Baseline:** `feat/phase4-2-contracts-ci-repair` / Draft PR #17. **Implementation:** `feat/phase4-3-unified-frontend-foundation`.

## Working React foundation
- Canonical route stays `src/App.tsx` → `AccessApp` → `RestoredWorkspace`. Original production API modules, role portals and saved workflows have not been removed.
- `src/experience/registry.ts` defines 18 known company modules, projects navigation from **server-granted** `portal.sections`, and preserves unrecognized/old-only sections under Additional modules. It never infers access from a V2 demo role.
- `src/experience/gateway.ts` is a typed, tenant-aware request adapter using the canonical JWT/session-refresh client and client-side permission gating. Backend permission enforcement remains mandatory. It is a pattern for **future** screen integrations, not an assertion that all legacy calls are migrated.
- `src/experience/booking-queue.ts` sorts real booking records without mutating them. `DepartureBoard.tsx` replaces the Overview recent-booking list with responsive V2-inspired Work Mode filters, statuses and routing to the existing Bookings module. The data source is the existing `apiClient.bookings.listBookings` invocation, not a V2 mock state store.
- `src/experience/unified.css` scopes Motion Studio's graphite, porcelain, electric iris, lime and peach to the authenticated company workspace. It leaves public, renter, driver, owners, platform and original operational component code intact.
- `packages/database/test/phase4-3-frontend-foundation.test.ts` validates preservation, portal-section projection and read-only queue sorting. Run with `pnpm test:frontend-foundation`.

## Explicitly outstanding
- 215 V2 design contracts and 251 original API methods **are not all integrated**. This is the shared foundation increment.
- Auth, tenant and permission behavior must be browser-tested against real API responses including 403, expired sessions and tenant switches.
- No local mock booking, payment, ledger, rental possession or owner-payout status was promoted into production. V2 JS continues to be a design reference only.
- Validate `pnpm typecheck`, `pnpm build`, and the full 59-suite / restoration matrix against the Phase 4.3 commit before merging.
- Manual 1440/1024/768/390/360 responsive, focus/keyboard and light/dark visual QA outstanding.
- PR #17's independent **positive settled-revenue worker and payout replay integration** release gate remains open, even though its mock regression matrix is green.
- Continue frontend screen integration in domain dependency order, starting with verified auth/tenancy/permissions and cross-role state refresh, and maintain old-only controls at each stage.

## Visual and contract references
`Sage-Auto-v2/docs/MOTION_STUDIO_REDESIGN.md`, `docs/P3F_OPERATIONS_HARDENING.md`, `Sage-Auto/docs/reconciliation/PHASE4_2_CORE_DATA_CONTRACTS.md`.
