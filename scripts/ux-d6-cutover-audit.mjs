#!/usr/bin/env node
/**
 * UX-D6 repository authority audit. Reads actual source, not milestone labels.
 * --require-complete is intentionally fail-closed until every synchronous
 * Map-backed business repository is migrated to native transactional SQL.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(process.cwd(), "packages/database/src/repositories");
const files = readdirSync(root).filter(name => name.endsWith(".repository.ts")).sort();
const legacy = [];
for (const file of files) {
  const text = readFileSync(join(root,file),"utf8");
  const stores = [...text.matchAll(/createRecordStore\s*<[^;\n]+\(/g)].length;
  const raw = [...text.matchAll(/\bcreateRecordStore\s*\(/g)].length;
  if (stores || raw) legacy.push({repository:file,synchronousStores:stores+raw});
}
const critical = [
  "user.repository.ts","tenant.repository.ts","tenant-membership.repository.ts",
  "vehicle.repository.ts","vehicle-allocation.repository.ts","booking.repository.ts",
  "contract.repository.ts","handover.repository.ts","rental.repository.ts",
  "payment.repository.ts","payment-attempt.repository.ts",
  "payment-allocation.repository.ts","deposit-position.repository.ts",
  "operational-invoice.repository.ts","journal-transaction.repository.ts",
  "journal-entry.repository.ts","refund.repository.ts","owner-settlement.repository.ts",
  "outbox.repository.ts","idempotency.repository.ts",
];
const criticalRemaining = critical.filter(file => legacy.some(entry => entry.repository===file));
const sqliteBackend = readFileSync(resolve("packages/database/src/record-store.ts"),"utf8")
  .includes('from "node:sqlite"');
const report = {
  phase: "UX-D6",
  verdict: legacy.length === 0 && !sqliteBackend ? "READY_FOR_E2E_CERTIFICATION" : "NOT_POSTGRES_AUTHORITATIVE",
  totalRepositoryFiles: files.length,
  repositoriesWithSynchronousRecordStores: legacy.length,
  synchronousStoreDeclarations: legacy.reduce((n,x)=>n+x.synchronousStores,0),
  criticalUnmigrated: criticalRemaining,
  sqliteRecordStoreStillPresent: sqliteBackend,
  remaining: legacy,
  requiredAfterCodeCutover: [
    "dedicated PG17 role with RLS, negative tenant access",
    "API and workers on one PostgreSQL database; no SQLite fallback",
    "payment verified -> deposit HELD -> reservation -> handover -> rental -> return -> owner settlement",
    "ledger/refund/payout recovery and cross-process crash/restart",
    "seven-role browser journey with live PG/RLS, not isolated SQLite test DB",
    "backup/restore with reconciled balances",
  ],
};
console.log(JSON.stringify(report,null,2));
if (process.argv.includes("--require-complete") && report.verdict !== "READY_FOR_E2E_CERTIFICATION") {
  console.error("PRODUCTION NO-GO: "+legacy.length+" synchronous-record repository files and SQLite backend remain.");
  process.exitCode = 2;
}
