# Restoration hardening validation

Date: 2026-10-03  
Working branch: `restoration-hardening-10-controls`  
Baseline branch: `restoration-baseline-2026-10-03`

## Restoration acceptance result

GitHub Actions workflow: **Restoration Acceptance**, run #1 — **PASS**.

Passed gates:

- frozen `pnpm install --frozen-lockfile`
- Node 24 typecheck
- `pnpm test:restoration`
- `pnpm test:access` (20-role account/access regression)
- `pnpm test:public-booking`
- email delivery adapter regression
- production build

The restoration-specific milestone is therefore technically accepted on this branch, subject to the separate real staging email delivery dependency described in `docs/access-milestone-review.md`.

## Full historical matrix status

The canonical full test matrix executed 48 suites on the same branch:

- 42 passed
- 6 failed
- the new `restoration-hardening.test.ts` passed

Failing suites are outside the files/domains changed by the restoration hardening work and remain visible as broader repository defects:

1. `authorization.test.ts` — authorization cache expectation
2. `deployment-and-cicd-architecture.test.ts` — expected 200, received 503
3. `domains-and-host-resolution.test.ts` — expected domain count/state mismatch
4. `leads-sales-quotes-and-crm.test.ts` — booking fixture lacks required daily rate/rate plan
5. `payments-and-provider-contracts.test.ts` — `MANUAL_RECORD` provider not registered for refund path
6. `tenant-website-cms-and-branding.test.ts` — test resolves a website that remains unpublished

These failures were **not hidden or waived**. They prevent treating the entire repository regression matrix as green and should be triaged separately before declaring whole-system readiness.

## Controls now enforced

- source baseline branch exists;
- local data checkpoint tool exists and refuses review SQLite;
- checkpoint stores counts, stable keys and SHA-256 evidence locally without committing data;
- all restored legacy company mutations are centrally disabled by default;
- Fleet, Bookings and Customers are explicitly marked READ_VERIFIED only for their current read paths;
- unsupported original screens are marked UNCONNECTED rather than showing fabricated authority;
- tenant context is cleared on portal exit, access loss, session expiry and logout;
- personal Driver, Vehicle Owner and Renter portals remain outside the broad company loader;
- prototype SaaS control-plane mutations remain quarantined;
- mutation activation gate is documented;
- real staging email remains an external acceptance dependency.

## Merge recommendation

Do not merge merely because the restoration-specific workflow is green if repository policy requires the canonical full matrix to be green.

The PR is suitable for review as the completed restoration-hardening milestone. The six broader failures should be triaged explicitly rather than bundled silently into Fleet/Customers/Booking/Rental implementation.
