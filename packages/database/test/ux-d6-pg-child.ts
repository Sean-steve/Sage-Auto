import { withTenantPgTransaction, PgTenantRecords, closeBusinessPgPool, claimPgOperation } from "../src/postgres/tenant-business-store";

async function main() {
  const [, , tenantId, recordId, action = "read"] = process.argv;
  if (!tenantId || !recordId) throw new Error("Tenant and record ID required");
  const repo = new PgTenantRecords<{tenantId:string;status:string;bookingNumber:string}>("BOOKING");
  const record = await withTenantPgTransaction(tenantId,()=>repo.find(tenantId,recordId));
  if (!record) throw new Error("Independent process could not see committed PostgreSQL booking");
  if (record.value.bookingNumber !== "PG-BOOKING-001" || record.version !== 2) {
    throw new Error("Independent process read wrong authoritative booking version");
  }
  if(action==="write"){
    const updated=await withTenantPgTransaction(tenantId,async()=>{
      const changed=await repo.update(tenantId,recordId,2,{
        ...record.value,status:"ACTIVE",
      });
      const claim=await claimPgOperation(tenantId,"PROVIDER_CALLBACK","callback-A","sha256:1");
      if(claim!=="REPLAY")throw new Error("Idempotency claim not visible across processes");
      return changed;
    });
    process.stdout.write(JSON.stringify({id:recordId,version:updated.version,status:updated.value.status})+"\\n");
    return;
  }
  process.stdout.write(JSON.stringify({id:record.id,version:record.version,tenantId:record.tenantId})+"\\n");
}
main().then(()=>closeBusinessPgPool()).catch(error=>{console.error(error);process.exitCode=1;});
