# Sage Auto — Local payment worker and connected Rental Operations

## Exact cause and fix

The former background simulation used BookingService.simulatePayment, which
toggled Booking.depositStatus to HELD **without** recording a Payment,
PaymentAllocation or funded DepositPosition. RentalService correctly refused
to dispatch the vehicle (required 25000, held 0). The scheduling job was
also disabled unless LOCAL_PAYMENT_WORKER_ENABLED=true; its 5-second timer
shared a one-minute deduplication key.

The revised **opt-in, development-only** worker:
1. Reads unpaid QUOTED/AWAITING_PAYMENT/CONFIRMED bookings from its local DB.
2. Creates an inbound fake-provider attempt and **server-verifies** it.
3. Projects verified rental charges to the Booking payment state.
4. Allocates a separate fake-provider VERIFIED Payment to the
   RENTAL_DEPOSIT DepositPosition; HELD is set by PaymentService only after
   full funding.
5. Retries/reconciles safely; fully funded bookings do not mint more
   money. Booking confirmation remains subject to the usual Availability
   allocation and state-machine rules.
6. Runs every configured interval without waiting for a one-minute
   scheduled deduplication bucket.

There are no fake provider credentials to configure. This is synthetic
money and **must never be used for production accounting or customer payouts**.

## Run locally (Ubuntu, from repo root)

```bash
git switch main
git pull origin main
pnpm install --frozen-lockfile
# terminal 1: API and UI
pnpm dev
# terminal 2: payment simulator + all other background jobs
pnpm dev:workers
```

The plural `pnpm dev:workers` explicitly enables local simulation.
Alternatively use `pnpm dev:worker:payments`. The singular
`pnpm dev:worker` remains a background worker **without** automatically
creating synthetic money unless enabled in your local environment.

Both API and worker must point to the **same** SQLite file. Default is
`.data/carhire.sqlite` under the project root. The worker prints its
effective path and `Local payment simulation: ENABLED`. If different
terminal environments/working directories are used, set an absolute
`SQLITE_PATH` to the same file in both processes.

Only **APP_ENV/NODE_ENV development or test** allows this simulator;
production and staging reject it even if the flag is set.

Once a completed handover is present, **Rental Operations** refreshes
outstanding payment/deposit blockers automatically every 10 seconds.
If the deposit is still unfunded, the workflow card takes an authorized
operator to **Finance**. Start Rental becomes active only when the full
authoritative readiness rules pass.

The workflow navigation across Booking, Handover, Rental Operations, Return
and Finance directs the operator to the next workspace. It does **not** skip
authorization, contract, inspection, allocation, payment or settlement checks.

## Diagnostics

```bash
# Worker should print the local job status every scan.
curl http://localhost:3002/health
pnpm exec tsx packages/database/test/local-payment-dispatch.test.ts
```

If a booking remains blocked, inspect the worker log for
`[Worker:LocalPayment] <booking-number>: <error>`. A missing payment
allocation, misconfigured SQLite path, another in-flight local payment,
or a legitimate Availability conflict must be resolved; do not manually
change Booking.depositStatus to HELD in the database. Do not run the
simulator against real financial ledgers or production data.
