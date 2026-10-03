# Restoration hardening baseline — 10 controls

Status: implementation baseline for the account-foundation/original-interface restoration. This document does not authorize the next business module.

Baseline branch: `restoration-baseline-2026-10-03` at the repository state that preceded these controls.
Implementation branch: `restoration-hardening-10-controls`.

## 1. Formal source and data baseline

- Git history is protected by the baseline branch before restoration hardening.
- The current durable account foundation uses SQLite through `SQLITE_PATH`; the isolated review database remains `.review/access/review.sqlite`.
- Run `pnpm restoration:checkpoint` only against the intended non-review development database with `RESTORATION_CHECKPOINT_ACK=I_UNDERSTAND`.
- The command performs a SQLite checkpoint plus `VACUUM INTO`, then records database SHA-256, logical-record SHA-256, namespace counts and stable keys.
- Local data snapshots live under ignored `.checkpoints/local-data/`; never commit customer/account data.
- No reset, reseed or automatic import is part of restoration.

## 2. Screen/action connection ledger

The authoritative screen status lives in `RESTORATION_SCREEN_CONNECTIONS` and the detailed ledger is `docs/restoration-screen-action-matrix.md`.
A restored layout is not evidence that its writes work.

## 3. Legacy store quarantine

The original `AppProvider` remains a compatibility presentation adapter while screens are restored. In restoration mode:
- mock plans/local entitlement state are not authoritative,
- unverified mutations are disabled at the screen boundary,
- a business mutation may be enabled only through the mutation gate below,
- server data and server authorization remain authoritative.

The long-term goal is to shrink this compatibility layer as each module becomes server-backed.

## 4. Workspace-switch isolation

Leaving a portal, losing membership, session expiry and logout clear the API tenant ID and selected portal.
Restoration data loaders are keyed by portal and reject late responses after unmount.
Any future module must also clear selected records/dialog state before cross-workspace use.

## 5. Platform control-plane verification

Platform roles currently use the server-backed access/control-plane foundation for companies, team, plans/billing summaries, support and platform sections according to server permissions.
The original `SaaSControlPlaneView` contains prototype/local mutations and is **not** accepted as an authoritative production control plane merely because the layout exists.
It must be reintroduced screen/action-by-screen/action through the same ledger and mutation gate rather than bypassing the new platform authorization foundation.

## 6. Mutation activation gate

An original action may be marked `mutationsEnabled: true` only when all applicable evidence exists:

1. exact backend endpoint/command is identified;
2. server permission/resource policy is enforced;
3. input validation is server-side;
4. successful mutation persists after reload;
5. successful mutation persists after logout/login;
6. failed request cannot show success;
7. wrong-role request is denied;
8. wrong-company request is denied;
9. concurrent/retry behavior is safe where relevant;
10. selected-company change cannot redirect the old action into another company;
11. no localStorage/mock state is the business source of truth;
12. regression test exists;
13. screen/action ledger is updated with evidence.

Until then the action stays disabled with a reason.

## 7. Personal portal isolation

Driver, Vehicle Owner and Renter portals stay outside the broad restored company-data loader.
Their personal sections use server-scoped records and linked-record checks. The personal-portal matrix must independently verify positive and negative access for every linked record type.

## 8. Data preservation proof

Before and after any restoration module:
- compare checkpoint namespace counts,
- compare stable User/Tenant/Vehicle/Customer/Booking keys,
- investigate any unexpected create/delete/change,
- preserve business identifiers,
- never restore by reseeding.

A planned mutation module may legitimately change counts only after the baseline comparison has been captured.

## 9. Honest per-action UI

The restored company workspace is read-only by default. Each screen displays its connection status and read source.
Unsupported actions remain disabled; empty prototype totals are not presented as authoritative business values.
Future partial screens must distinguish connected controls from disabled controls rather than enabling the whole screen.

## 10. Real email acceptance dependency

The access milestone remains incomplete until verification, password reset and invitation delivery are exercised through configured staging email over an HTTPS application URL and the authorized recipient confirms receipt/link completion.
The isolated review mailbox is test infrastructure only.

## Acceptance before choosing the next module

- baseline branch exists;
- local checkpoint command exists and refuses review data;
- screen/action ledger is current;
- all unverified restored mutations are disabled;
- tenant context is cleared on portal exit/access loss/logout;
- all 20 role navigation tests still pass;
- personal portals remain record-scoped;
- platform support access remains explicit/read-only/audited;
- restoration hardening regression passes;
- typecheck/build/access/public-booking regressions pass;
- real staging email is listed separately if still unavailable.

Only after this gate should Fleet → Customers → Booking → Rental be planned.
