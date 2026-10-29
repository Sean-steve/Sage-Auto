# Sage Auto — Phase 2 SaaS Platform Owner Implementation & Acceptance

**Branch:** \`feature/phase2-saas-platform-owner-20261029\`  
**PR:** https://github.com/Sean-steve/Sage-Auto/pull/28 (draft, proposed against main)  
**Source contract:** [Phase 1 two-portal audit](PHASE1_TWO_OWNER_PORTALS_AUDIT.md) and [33-screen matrix](PHASE1_TWO_OWNER_PORTALS_SCREEN_API_MATRIX.csv).  
**Scope:** SaaS Platform Owner and delegated platform staff only. The Independent Vehicle Owner portal remains **Phase 3**.

## Executed implementation

- \`src/components/AccessApp.tsx\`: platform-only \`PlatformOwnerWorkspace\` after authenticated portal selection; clears old tenant header when restoring the platform portal. Keeps company/renter/vehicle owner/driver flows separate.
- \`src/components/platform/PlatformOwnerWorkspace.tsx\`: premium and responsive platform shell, permission-scoped navigation, real records, loading/errors/empty states, company dossier, plan creation/archive, subscription suspend/reactivate, company suspend/reactivate/offboard with reasons, dead-letter retry with reason, team and support views reused from the existing authenticated portal.
- \`src/components/platform/PlatformControlData.ts\`: canonical API reads and protected platform-only writes; no fallback to sample cars, in-memory demo totals, mocked billing invoices or frontend subscription transitions.
- \`src/components/platform/platform-owner.css\`: responsive dark-navy/teal control plane style with keyboard focus, data tables and mobile navigation.
- \`packages/constants/src/access.ts\`: permission-filtered modules for integrations, entitlements, events, incidents, notifications and audit, extending—not replacing—the role matrix.
- \`apps/api/src/modules/platform-admin/application/services/platform-operations.service.ts\`: fake provider connectivity, fabricated queues and invented SSL dates removed. Only authoritative outbox repository counters are reported; provider/SSL diagnostics return an explicit empty set until real probes are implemented.
- \`apps/api/src/modules/platform-admin/application/services/platform-tenant-lifecycle.service.ts\`: no fake "Starter"/"ACTIVE" subscription fallback when a company has no subscription; no fictional default monthly-revenue estimate.
- \`packages/database/test/platform-admin-command-center.test.ts\` updates truthfulness expectations.
- \`packages/database/test/phase2-platform-portal-navigation.test.ts\`: owner/staff/platform/tenant access-navigation assertions.
- \`.github/workflows/phase2-platform-owner.yml\`: role, API, analytics, typecheck and frontend build acceptance.
- \`package.json\`: \`pnpm test:platform-portal\` command.

## S02 screen-contract status — no false sign-off

| ID | Contract | Integrated status | Work still required |
| --- | --- | --- | --- |
| S02-01 | Platform health dashboard | **Partial**: tenant/subscription counts and canonical SaaS analytics | Real provider/worker telemetry |
| S02-02 | Company directory | **Connected**: saved tenant registry | Browser UX signoff |
| S02-03 | Company account profile | **Connected**: tenant details and fleet/booking summaries | Deep tenant history |
| S02-04 | Provision tenant | **Connected**: persisted tenant/subscription and nominated first-owner invitation, activation and retry | Real mailbox delivery and staging browser certification |
| S02-05 | Subscription catalog | **Connected**: plan list/create/archive; subscription state actions | Full tier editing and approval lifecycle |
| S02-06 | Tenant billing operations | **Connected read-only** | Governed billing commands |
| S02-07 | Platform payment ledger | **Connected read-only** | Independent verified receipt reconciliation before action controls |
| S02-08 | Entitlement explorer | **Connected read-only** | Entitlement usage projection |
| S02-09 | Entitlement review | **Partial**: plan-feature reads | Controlled override approval/expiry/revocation UX |
| S02-10 | Integration health | **Unavailable honestly** | Real provider and verified-domain probes |
| S02-11 | Jobs and event monitor | **Connected**: authoritative outbox/DLQ and governed retry | Instrument other BullMQ queues |
| S02-12 | Incident command center | **Unavailable honestly** | Persisted incident lifecycle, escalation, notifications |
| S02-13 | Platform roles and identity | **Connected**: existing team and invitation workflows | Expanded roles editor/access review |
| S02-14 | Customer support queue | **Partial**: support grants | Ticket case-management service |
| S02-15 | Support access | **Connected**: existing time-limited audited grant UX | Cross-tenant browser acceptance |
| S02-16 | Platform activity/audit | **Connected read-only**: canonical audit records | Advanced filters/export |
| S02-17 | Compliance/policy center | **Unavailable honestly** | Verified policy/evidence lifecycle |
| S02-18 | Platform revenue/adoption | **Connected**: canonical analytics, MRR movement, cohorts, collections | KPI provenance QA and visual parity |
| S02-19 | Configuration and rollout flags | **Partial**: runtime server config shown read-only | Durable, validated configuration/rollback |
| S02-20 | Platform notifications | **Unavailable honestly** | Persisted platform notification service |

**Completed code foundation is not the same as all twenty contracts being certified.** No screen showing an "unavailable" message should be represented as live functionality. Tenant billing and finance are separate from rental-company finance.

## Safety constraints preserved

1. The platform portal requires server-issued \`portal.kind === "platform"\`; platform navigation is filtered by server permissions. Company owners, vehicle owners, renters and drivers do not get platform navigation.
2. All mutation endpoints apply backend RBAC. Client permission filtering is additional UI prevention, never authority.
3. No front-end invoice "mark paid" action; a provider intent, screenshot or simulated callback cannot establish cash receipt.
4. No provider gateway can appear healthy without an actual probe. No SSL certificate or notification delivery may be claimed from constructed data.
5. Platform provisioning now creates a workspace/subscription and nominates the first company owner using a guarded email invitation. The nominated owner must verify/sign in and accept; a failed email delivery is visible and retriable without provisioning a duplicate tenant.
6. Company status and subscription transitions use canonical server routes; all require an explicit reason entered in the portal, and existing backend mutation audit is retained.
7. Global config is currently runtime-only, so this control center deliberately does not offer persistent settings mutation.
8. No financial totals are added across currencies; all payment and invoice figures display their own source currency.
9. The Phase 1 baseline and all existing operational modules are retained; Phase 3 vehicle-owner changes are not mixed in.

## Validation

Dedicated GitHub Actions Phase 2 acceptance runs: TypeScript/lint, role access \`pnpm test:platform-portal\`, complete access onboarding/role tests, platform-admin contract test, SaaS analytics test and production frontend build.

**Additional closure work:** First-owner invitation/acceptance, retry/status and negative access tests, deduplicated nomination, and real-staging-only smoke test plus protected manual workflow. **Not certified:** real staging deployment, browser accessibility/visual parity for all twenty S02 contracts, certified provider sandbox billing, live provider/SSL probes, durable platform config, or full incident/policy/notification services. PR remains draft and unmerged; GitHub issue #29 tracks external release gates.

## Next safe action

Configure the genuine staging deployment and protected credentials, then run a two-account browser acceptance for \`PLATFORM_OWNER\` and \`COMPANY_OWNER\` on staging, plus suspended user and limited \`BILLING_ADMIN\` role. Phase 3 should then resolve owner identity/guard conflicts and connect the Independent Vehicle Owner workspace.

## Release certification (2026-10-29)

- New first-owner invitation endpoint is part of platform provisioning; failure is reported explicitly and the saved tenant is retained for a scoped resend. Owner activation requires acceptance of the token, not merely sending it.
- `scripts/platform-owner-staging-smoke.mjs` and `.github/workflows/platform-owner-staging-certification.yml` require actual remote staging user tokens; absent staging config fails closed.
- Current PR workflows test review-mode, isolated data and simulator providers. They do **not** prove a deployed site, HTTPS, real M-Pesa/Stripe events, real customer email, or a rollback rehearsal.
- Main repo has no `infrastructure/deployment/adapters/staging.sh`; `scripts/release-preflight.mjs staging` necessarily rejects promotion. Do not fabricate this adapter to greenwash CI.
- Release blocker issue: [#29](https://github.com/Sean-steve/Sage-Auto/issues/29). Do not claim 20/20 production-certified screens or merge PR #28 until linked staging and field evidence is present.
