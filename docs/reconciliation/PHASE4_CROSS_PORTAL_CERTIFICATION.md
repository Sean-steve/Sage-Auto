# Sage Auto — Phase 4 Cross-Portal Integration & Product Certification

**Scope:** Unified Phase 2 SaaS-owner + Phase 3 independent vehicle-owner + existing company operations, finance, driver and renter portals.  
**Environment:** Isolated local review database and automated browser/HTTP tests. No external staging server, real payments or production certification.  
**Source branch:** `feature/phase4-cross-portal-integration-20261030`.

## 1. Product actor and authority map

| Actor | Portal / source of truth | Must see | Must NOT see |
|---|---|---|---|
| SaaS Platform Owner | `/platform/*`, platform role permissions and tenant subscription store | Tenants, plans, SaaS invoices, platform analytics, support and audit | Company rental operations or any partner's private owner records without separate authorized support session |
| Company Owner / Tenant Admin | Tenant `/fleet`, `/vehicle-owners`, `/rentals`, `/finance`, `/owner-settlements` | Company vehicles, ownership agreements, bookings, rental state, settlement lifecycle; **non-sensitive** owner-portal connection status | SaaS billing administration, private external owner payment OTP |
| Fleet Manager | Tenant-guarded `vehicle_owner.read` | Operator assigned owners and agreement acceptance/readiness | Independent owner dashboard, any other tenant |
| Finance Manager | Finance and settlement permission model | Rental invoices, reconciled payouts, dispute queue and approval status | SaaS billing and secrets; payout changes without owner email confirmation |
| Independent Vehicle Owner | `/access/owner/*` with active tenant membership and explicit linked owner record | Their vehicles, historical rental periods, terms, signatures, documents, own statements and payout-status proof | Other owners, customer PII, tenant-wide Finance approvals/payments or other companies |
| Driver | Driver personal `/access/records` via active linked driver record | Assigned trips and inspections | Operator Finance, external owner data |
| Renter | Renter personal booking status and public checkout | Own bookings, pickup/return progress and receipts | Fleet administration, unrelated customers, operator Finance |

## 2. Canonical shared workflow: product state, not mirrored mock state

1. Platform provisions a rental company and nominates its first Company Owner. Invitation acceptance activates a tenant membership only after login verification.
2. Company Owner registers real vehicles, owner records and ownership terms. Vehicle ownership is authoritative in tenant fleet/ownership repositories, not duplicated into a new owner-portal database.
3. Company assigns a verified `VEHICLE_OWNER` team member to a specific active owner record in the same tenant. The independent portal resolves this record on **every** request.
4. Owner reviews the commercial terms. Agreement signature persists with typed registered name, exact terms hash and version. Operator `GET /api/v1/access/owner-connections?portal=<tenantId>&page=N&limit=M` reflects the same record immediately.
5. If terms change, the operator read model flags the old signature as `STALE_TERMS`; it does **not** claim the new terms are accepted. Owner must use the legitimate new-agreement/revision workflow.
6. Owner requests a payout destination change. The old beneficiary stays active until the six-digit email challenge succeeds; operator status reflects whether an actual destination is configured, but never returns bank account or mobile number.
7. Operator rental and financial lifecycle updates remain in canonical booking, rental, ledger, settlement, payable repositories. Owner views derive restricted, per-record state from them and cannot authorize settlement/payout.
8. Cross-role and tenant suspensions, link removal and owner suspension revoke personal API access immediately, even with a previously issued JWT.

## 3. Implemented Phase 4 integration changes

- Operator `/access/owner-connections` is read-only, permission-checked, tenant-scoped, paginated (maximum 100/page). It returns owner ID, linked portal state, number of active agreements, signed/unsigned counts, stale signature flag, payout destination *setup boolean*. It does not return bank, M-Pesa or OTP details.
- The operator Vehicle Owners screen no longer shows cached/demo local owners when the authoritative API returns zero or fails. API errors render as errors, and an empty collection means truly empty.
- Independent owner identity is `owner.id`, not inferred or collapsed by email/phone. Distinct owner records stay distinct.
- Operator owner cards reflect saved owner portal connection and agreement signature state, and hide full payout destination numbers.
- Owner agreement acceptance, payout verification, partner link and tenant suspension are tested across **both** operator and independent-owner API reads on the same isolated database.
- Compatibility `/access/records?section=myVehicles|mySettlements` also revalidates the authoritative linked active owner; it cannot bypass a suspension.
- Seven-role headless-Chromium contract includes SaaS Platform Owner, Company Owner, Finance Manager, Booking Agent, Vehicle Owner, Driver and Renter, with negative Finance/owner API checks.
- Dedicated CI `phase4-cross-portal-certification.yml` runs TypeScript/build, Phase 4 role and live state tests, Phase 2 platform tests and settlement safety tests. Full canonical matrix and Stage 4–7 integration suite remain parallel CI requirements.

## 4. Acceptance / evidence matrix

| Control | Evidence in code / CI | Certification boundary |
|---|---|---|
| SaaS Platform Owner identity and tenant status | `test:platform-portal`, platform review API, seven-role Chromium | Review simulation only |
| Company vs. platform billing authorization | `phase4-cross-portal-contract.test.ts`, Stage 4 HTTP boundary | Reviewed; external provider billing not certified |
| Company↔Vehicle Owner signature synchronization | `access-onboarding.test.ts` checks unsigned → signed → stale-terms → restored | Repository truth, no duplicated local state |
| Owner payout verification synchronization | `access-onboarding.test.ts`, email challenge, operator setup/read-only status | Real provider email remains configured at deployment |
| Owner link revocation and suspension | `access-onboarding.test.ts` verifies owner and compatibility route 403 and operator connection change | Review API tokens |
| Owner financial privacy & settlement separation | `test:owner-settlements`, Phase 3 suite, Stage 7 financial safety | Real provider payout webhooks not certified |
| Driver and renter permissions | Seven-role Chromium, `test:access` | Isolated review mode |
| Full regression | `test:matrix`, lint, production build, OCI image workflow | Code integration only; no live rollout |

## 5. Release decision

**Phase 4 review certification** may be accepted only if all new and existing CI checks are green and the seven-role browser suite passes against a disposable review DB.

**Production certification: NOT CLAIMED.** The user explicitly deferred deployment. Remain gated on real staging and browser deployment testing; HTTPS/domain/security settings; Postmark/SendGrid delivery proof; S3/MinIO + real malware scanning; provider-signed billing/payment/refund and payout callback/reconciliation; rollback drill; legal agreement countersignature/e-signature policy review; live performance and migration monitoring. Keep non-integrated SaaS incident/compliance/notification/health pages marked unavailable rather than fabricated.

## 6. How to run without staging

From the Sage-Auto repository on a machine with Node 24, pnpm 9, and Chromium:

```bash
pnpm install --frozen-lockfile
pnpm test:phase4
pnpm test:owner-settlements
pnpm test:platform-portal
pnpm typecheck
pnpm build
```

The CI Stage 4–7 workflow launches a disposable review API and Vite and runs `node scripts/stage4-browser-acceptance.mjs` with seven roles. For manual review, run `pnpm review:api`, `pnpm review:web` separately and follow isolated review instructions; never use live data for review mode.

## 7. Remaining design/product work

- Dedicated indexed owner-first rental pagination for high-volume SQL/Postgres; current record-store query is complete but scans records.
- Owner document countersignature and legal acceptance policy, richer verified maintenance records.
- Real SaaS incident/compliance/notification management plus persistent operational health, without mock telemetry.
- Live cross-device polling or push subscriptions across concurrent browser tabs; current API data refreshes from canonical state on workspace mount/explicit refresh and is not a realtime event stream.
- End-to-end real provider money movement and operational production certification remain deferred.
