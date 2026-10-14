/**
 * Sage Auto Stage 3: read-only historic Return -> Finance -> Fleet integrity audit.
 * Usage: SQLITE_PATH=/path/to/sage.sqlite pnpm audit:closure -- --all-tenants
 *        SQLITE_PATH=/path/to/sage.sqlite pnpm audit:closure -- --tenant-id=TENANT_ID
 * No repairs or SQL updates. Identifiers are one-way hashed before output.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { deserialize } from "node:v8";

type RecordEntity = Record<string, any>;

export interface ClosureAuditSnapshot {
  rentals: RecordEntity[];
  bookings: RecordEntity[];
  contracts: RecordEntity[];
  vehicles: RecordEntity[];
  allocations: RecordEntity[];
  calculations: RecordEntity[];
  returnRecords: RecordEntity[];
  invoices: RecordEntity[];
  settlements: RecordEntity[];
  payables: RecordEntity[];
}

export interface ClosureAuditFinding {
  code: string;
  tenantToken: string;
  recordToken: string;
}

const TERMINAL = new Set(["COMPLETED", "RETURN_COMPLETED"]);
const BLOCKING = new Set(["ACTIVE", "HELD", "CONFIRMED"]);
const SEALED = new Set(["REFUNDED", "CHARGED", "SETTLED", "WAIVED"]);

function token(raw: unknown): string {
  return createHash("sha256").update(String(raw || "unknown")).digest("hex").slice(0, 12);
}

export function scanClosureIntegrity(
  snapshot: ClosureAuditSnapshot,
  tenantFilter?: string
): ClosureAuditFinding[] {
  const findings: ClosureAuditFinding[] = [];
  const eligible = (items: RecordEntity[]) =>
    items.filter(item => !tenantFilter || item.tenantId === tenantFilter);
  const owned = (items: RecordEntity[], id: string, tenantId: string) =>
    items.find(item => item.id === id && item.tenantId === tenantId);
  const add = (code: string, entity: RecordEntity) => {
    findings.push({
      code,
      tenantToken: token(entity.tenantId),
      recordToken: token(entity.id || entity.rentalId),
    });
  };

  for (const rental of eligible(snapshot.rentals)) {
    const tenantId = String(rental.tenantId);
    const finished = TERMINAL.has(rental.state);
    const sealedPending = rental.state === "DEPOSIT_PROCESSING";
    if (!finished && !sealedPending) continue;

    const calc = snapshot.calculations.find(
      c => c.rentalId === rental.id && c.tenantId === tenantId
    );
    if (!calc || calc.isImmutable !== true || !SEALED.has(calc.depositSettlementStatus)) {
      add("RENTAL_MISSING_SEALED_SETTLEMENT", rental);
    }
    if (sealedPending) continue;

    const returnRecord = snapshot.returnRecords.find(
      r => r.rentalId === rental.id && r.tenantId === tenantId
    );
    if (!returnRecord || !TERMINAL.has(returnRecord.status)) {
      add("RENTAL_MISSING_COMPLETED_RETURN_RECORD", rental);
    }
    if (rental.bookingId && owned(snapshot.bookings, rental.bookingId, tenantId)?.status !== "COMPLETED") {
      add("RENTAL_BOOKING_NOT_COMPLETED", rental);
    }
    if (rental.contractId && owned(snapshot.contracts, rental.contractId, tenantId)?.status !== "COMPLETED") {
      add("RENTAL_CONTRACT_NOT_COMPLETED", rental);
    }
    if (rental.bookingId && snapshot.allocations.some(
      allocation => allocation.tenantId === tenantId &&
        allocation.sourceType === "BOOKING" &&
        allocation.sourceId === rental.bookingId &&
        allocation.vehicleId === rental.vehicleId &&
        BLOCKING.has(allocation.status)
    )) {
      add("RENTAL_ALLOCATION_STILL_BLOCKING", rental);
    }

    const vehicle = owned(snapshot.vehicles, rental.vehicleId, tenantId);
    // An ON_RENT vehicle is not a problem if subsequently dispatched to
    // another rental. Flag only when no live rental references it.
    const hasLiveRental = snapshot.rentals.some(
      another => another.tenantId === tenantId &&
        another.vehicleId === rental.vehicleId &&
        !TERMINAL.has(another.state) &&
        !["DEPOSIT_PROCESSING", "FINAL_CALCULATION", "FINAL_SETTLEMENT_PENDING"].includes(another.state)
    );
    if (vehicle?.availabilityStatus === "ON_RENT" && !hasLiveRental) {
      add("COMPLETED_RENTAL_VEHICLE_STILL_ON_RENT", rental);
    }
  }

  for (const invoice of eligible(snapshot.invoices)) {
    if (invoice.status === "PAID" && Number(invoice.amountOutstanding || 0) > 0.0001) {
      add("PAID_INVOICE_HAS_OUTSTANDING_BALANCE", invoice);
    }
    if (invoice.rentalId) {
      const linkedRental = owned(snapshot.rentals, invoice.rentalId, invoice.tenantId);
      if (!linkedRental) add("INVOICE_REFERENCES_MISSING_OR_FOREIGN_RENTAL", invoice);
    }
  }

  for (const settlement of eligible(snapshot.settlements)) {
    if (settlement.status !== "PAID") continue;
    const paidPayables = snapshot.payables.filter(
      payable => payable.settlementId === settlement.id &&
        payable.tenantId === settlement.tenantId &&
        payable.status === "PAID"
    );
    if (!paidPayables.length) add("PAID_SETTLEMENT_LACKS_PAID_PAYABLE", settlement);
  }

  return findings.sort(
    (a, b) => a.code.localeCompare(b.code) ||
      a.tenantToken.localeCompare(b.tenantToken) ||
      a.recordToken.localeCompare(b.recordToken)
  );
}

const namespaces: Record<keyof ClosureAuditSnapshot, string> = {
  rentals: "rental.repository:rentalStore",
  bookings: "booking.repository:bookingStore",
  contracts: "contract.repository:contractStore",
  vehicles: "vehicle.repository:vehicleStore",
  allocations: "vehicle-allocation.repository:allocationStore",
  calculations: "rental.repository:finalCalculationStore",
  returnRecords: "rental.repository:returnRecordStore",
  invoices: "operational-invoice.repository:store",
  settlements: "owner-settlement.repository:store",
  payables: "owner-settlement.repository:payables",
};

function scanFile(filePath: string, tenantId?: string): ClosureAuditFinding[] {
  const filepath = resolve(filePath);
  if (!existsSync(filepath)) throw new Error("The configured SQLITE_PATH does not exist.");
  const database = new DatabaseSync(filepath, { readOnly: true });
  try {
    database.exec("PRAGMA query_only=ON");
    const snapshot = {} as ClosureAuditSnapshot;
    for (const [entity, namespace] of Object.entries(namespaces)) {
      const rows = database.prepare("SELECT value FROM records WHERE namespace=?").all(namespace);
      (snapshot as any)[entity] = rows.map(row => deserialize(row.value as Uint8Array));
    }
    return scanClosureIntegrity(snapshot, tenantId);
  } finally {
    database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const rawPath = process.env.SQLITE_PATH;
  const tenantArg = process.argv.slice(2).find(arg => arg.startsWith("--tenant-id="));
  const tenantId = tenantArg?.slice("--tenant-id=".length).trim();
  const all = process.argv.includes("--all-tenants");
  try {
    if (!rawPath) throw new Error("Set SQLITE_PATH to the existing Sage Auto SQLite database.");
    if (!all && !tenantId) throw new Error("Choose --all-tenants or --tenant-id=ID.");
    const findings = scanFile(rawPath, tenantId);
    const counts = Object.fromEntries(
      [...new Set(findings.map(f => f.code))].map(
        code => [code, findings.filter(f => f.code === code).length]
      )
    );
    console.log(JSON.stringify({
      readOnly: true,
      findingCount: findings.length,
      counts,
      samples: findings.slice(0, 50),
      advisory: "No records changed. Review historical inconsistencies before planning corrections."
    }, null, 2));
    if (findings.length) process.exitCode = 2;
  } catch (error: any) {
    console.error("Closure audit could not start: " + (error.message || String(error)));
    process.exitCode = 1;
  }
}
