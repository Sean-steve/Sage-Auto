import { withTenantPgTransaction, PgTenantRecords, closeBusinessPgPool } from "../src/postgres/tenant-business-store";

async function main() {
  const [, , tenantId, recordId] = process.argv;
  if (!tenantId || !recordId) throw new Error("Tenant and record ID required");
  const repo = new PgTenantRecords<{tenantId:string;status:string;bookingNumber:string}>("BOOKING");
  const record = await withTenantPgTransaction(tenantId,()=>repo.find(tenantId,recordId));
  if (!record) throw new Error("Independent process could not see committed PostgreSQL booking");
  if (record.value.bookingNumber !== "PG-BOOKING-001" || record.version !== 2) {
    throw new Error("Independent process read wrong authoritative booking version");
  }
  process.stdout.write(JSON.stringify({id:record.id,version:record.version,tenantId:record.tenantId})+"\n");
}
main().then(()=>closeBusinessPgPool()).catch(error=>{console.error(error);process.exitCode=1;});
