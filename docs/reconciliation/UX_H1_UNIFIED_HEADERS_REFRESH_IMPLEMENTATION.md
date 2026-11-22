# UX-H1 — Unified Headers and Smart Refresh

**Date:** 23 November 2026  
**Scope:** H1.1 through H1.5  
**Branch:** `feature/ux-h1-unified-headers-smart-refresh-20261123`  
**Base:** `main`  
**Status:** Source implementation committed; certification gated on GitHub Actions and seven-role Chromium checks. No deploy.

## H1.1 — Company workspace header consolidation
- Removed the shared second `sage-page-context` banner that repeated the active page title on every non-Overview Company Owner screen.
- Global topbar displays *Company workspace* + company identity with global search, theme and account controls.
- Individual screens retain their own meaningful headings, descriptions, buttons and domain-specific context. No function or navigation was deleted.

## H1.2 — Cross-portal audit
- Platform Owner: static *Platform workspace* utility header replaces repeated dynamic section title; each panel retains its own distinct title, content and actions.
- Independent Vehicle Owner: static *Vehicle owner workspace* utility header replaces repeated panel title; individual panels retain their headings and descriptions.
- Renter tracker: original business branding header and page-specific *Track your rental journey* heading are not duplicate messages, so both remain.
- Company Settings onboarding, SaaS platform controls, multi-role navigation and owner settlement safety remain unchanged.

## H1.3 — Smart refresh and request safety
- Removed Bookings' `setInterval(..., 5000)` that reloaded the entire list and open dossier every five seconds.
- Initial page load, applied search filters, explicit Refresh and successful mutations still load authoritative records immediately.
- A visible tab returning to foreground silently refreshes only if its last successful register read is at least 60 seconds old; hidden tabs never poll.
- A selected *pending financial booking* alone can quietly poll every 30 seconds, only while visible, and not during editing, confirming, amending or a lifecycle action.
- Silent refreshes preserve the current register and open dossier, do not trigger a full-page loading skeleton, do not overlap an in-flight register request, and protect against stale responses.
- Renter public booking tracking retains its 30-second update cadence only while a live reservation is open and visible. Completed, rejected and cancelled journeys stop polling. A failed background check preserves the last verified booking and displays a non-destructive warning.
- Existing manual refresh remains available; the frontend does not fabricate payment completion or business totals.

## H1.4 — Honest empty and error states
- No saved results with no active filters: **No bookings yet.** Shows a Create first booking action to users with `booking.create`.
- No matches for active filters: **No bookings match these filters.** Shows Clear filters.
- API error / unverifiable response: **Bookings are temporarily unavailable.** Shows Try again. This is not falsely represented as zero.
- Background refresh failure: current records remain visible and an error explicitly marks them as last successfully loaded.
- Permission to create remains checked before rendering creation buttons.

## H1.5 — Certification and visual checks

Required actions from repo root:

    pnpm install --frozen-lockfile
    pnpm typecheck
    pnpm test:ux-h1
    pnpm test:bookings
    pnpm test:phase4
    pnpm build

Automated browser acceptance in `scripts/stage4-browser-acceptance.mjs` extends existing seven-role Chromium review to assert:
- Company Bookings renders its heading once; second company banner does not exist.
- No new booking-list API request occurs after 6.4 seconds of ordinary idle viewing.
- Explicit Refresh does request new backend data.
- Company Bookings has no horizontal overflow at 390px, 768px and 1280px; screenshots are captured in isolated CI artifacts.
- Platform Owner and Vehicle Owner utility headers no longer repeat changing panel titles.
- Existing seven-role authorization and historical UX-D6 chart tests still pass.

Full `main` CI, Postgres foundation and cross-portal acceptance remain release gates. **This phase does not alter PostgreSQL authority, deployment, finance allocation, or Issue #33.** Business records remain SQLite-backed in local dev until the separately tracked cross-process migration is completed.

## Release recommendation
Merge to `main` **for local testing only** after the clean PR head passes unit, frontend, seven-role browser and repository regression gates. Staging/production deployment remains explicit manual workflow gated by repository approval.
