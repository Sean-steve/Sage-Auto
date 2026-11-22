import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  businessPgPool, closeBusinessPgPool, withTenantPgTransaction,
  PgTenantRecords, claimPgOperation, reservePgVehicle,
} from "../src/postgres/tenant-business-store";

type BookingDoc={tenantId:string;status:string;bookingNumber:string};
type PaymentDoc={tenantId:string;provider:string;providerTransactionId:string;amount:string;currency:string};

async function main(){
  if(!process.env.PG_BUSINESS_DATABASE_URL)throw Error("Explicit non-superuser PG_BUSINESS_DATABASE_URL required");
  const a=randomUUID(),b=randomUUID();
  const bookings=new PgTenantRecords<BookingDoc>("BOOKING");
  const payments=new PgTenantRecords<PaymentDoc>("PAYMENT");
  const bookingId=randomUUID();

  await assert.rejects(
    withTenantPgTransaction(a,async()=>withTenantPgTransaction(b,async()=>true)),
    /Cross-tenant nested SQL/
  );
  await assert.rejects(bookings.find(a,bookingId),/active tenant transaction/);

  await withTenantPgTransaction(a,async()=>{
    const created=await bookings.create(a,bookingId,{
      tenantId:a,status:"DRAFT",bookingNumber:"PG-BOOKING-001",
    });
    assert.equal(created.version,1);
    assert.equal((await bookings.list(a)).total,1);
    assert.equal(await bookings.find(a,bookingId).then(r=>r?.value.status),"DRAFT");
    await bookings.update(a,bookingId,created.version,{
      tenantId:a,status:"CONFIRMED",bookingNumber:"PG-BOOKING-001",
    });
    assert.equal(await claimPgOperation(a,"PROVIDER_CALLBACK","callback-A","sha256:1"),"CREATED");
    assert.equal(await claimPgOperation(a,"PROVIDER_CALLBACK","callback-A","sha256:1"),"REPLAY");
    assert.equal(await claimPgOperation(a,"PROVIDER_CALLBACK","callback-A","sha256:other"),"CONFLICT");
    assert.equal(await bookings.find(b,bookingId).catch(e=>e.statusCode),403);
  });

  const fromSecondProcess=spawnSync(
    process.execPath,["--import","tsx","packages/database/test/ux-d6-pg-child.ts",a,bookingId],
    {encoding:"utf8",env:process.env,timeout:15_000}
  );
  assert.equal(fromSecondProcess.status,0,
    "Separate Node process must read committed booking: "+fromSecondProcess.stderr);
  assert.equal(JSON.parse(fromSecondProcess.stdout.trim()).version,2);

  await withTenantPgTransaction(b,async()=>{
    assert.equal(await bookings.find(b,bookingId),null,"Foreign tenant cannot see booking");
    assert.equal((await bookings.list(b)).total,0,"RLS excludes foreign tenant rows");
    assert.equal(await claimPgOperation(b,"PROVIDER_CALLBACK","callback-A","sha256:1"),"CREATED",
      "Idempotency keys are scoped to the tenant");
  });

  await assert.rejects(withTenantPgTransaction(a,async()=>{
    await bookings.update(a,bookingId,1,{
      tenantId:a,status:"CANCELLED",bookingNumber:"PG-BOOKING-001",
    });
  }),/version conflict/i);
  await withTenantPgTransaction(a,async()=>{
    assert.equal((await bookings.find(a,bookingId))?.value.status,"CONFIRMED");
  });

  const rolledBackId=randomUUID();
  await assert.rejects(withTenantPgTransaction(a,async()=>{
    await bookings.create(a,rolledBackId,{
      tenantId:a,status:"DRAFT",bookingNumber:"ROLLBACK-BOOKING",
    });
    await claimPgOperation(a,"PROVIDER_CALLBACK","rollback-key","sha256:rollback");
    throw new Error("Injected database failure");
  }),/Injected database failure/);
  await withTenantPgTransaction(a,async()=>{
    assert.equal(await bookings.find(a,rolledBackId),null,"Failed transaction must be rolled back");
    assert.equal(await claimPgOperation(a,"PROVIDER_CALLBACK","rollback-key","sha256:rollback"),"CREATED",
      "Failed transaction must roll back idempotency claim");
  });

  await withTenantPgTransaction(a,async()=>{
    await payments.create(a,randomUUID(),{
      tenantId:a,provider:"MPESA",providerTransactionId:"MPESA-TX-001",
      amount:"25000.00",currency:"KES",
    });
  });
  await assert.rejects(withTenantPgTransaction(a,async()=>{
    await payments.create(a,randomUUID(),{
      tenantId:a,provider:"mpesa",providerTransactionId:"mpesa-tx-001",
      amount:"25000.00",currency:"KES",
    });
  }),/Duplicate business identifier/);
  await withTenantPgTransaction(b,async()=>{
    await payments.create(b,randomUUID(),{
      tenantId:b,provider:"MPESA",providerTransactionId:"MPESA-TX-001",
      amount:"500.00",currency:"KES",
    });
  });

  const allocation=(tenantId:string,id:string,start:string,end:string)=>({
    tenantId,allocationId:id,vehicleId:"vehicle-1",bookingId:bookingId,
    pickupAt:start,returnAt:end,status:"RESERVED" as const,
  });
  await withTenantPgTransaction(a,async()=>{
    await reservePgVehicle(allocation(a,"alloc-1","2026-12-01T10:00:00Z","2026-12-04T10:00:00Z"));
  });
  await assert.rejects(withTenantPgTransaction(a,async()=>{
    await reservePgVehicle(allocation(a,"alloc-2","2026-12-03T10:00:00Z","2026-12-05T10:00:00Z"));
  }),/overlapping vehicle reservation/);
  await withTenantPgTransaction(a,async()=>{
    await reservePgVehicle(allocation(a,"alloc-3","2026-12-04T10:00:00Z","2026-12-05T10:00:00Z"));
  });

  // A custom GUC must never grant platform-level bypass to an ordinary role.
  const client=await businessPgPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant_id',$1,true)",[b]);
    await client.query("SELECT set_config('app.is_platform_bypass','true',true)");
    const visible=await client.query(
      "SELECT count(*)::int AS n FROM sage_business_records WHERE record_id=$1",
      [bookingId]
    );
    assert.equal(visible.rows[0].n,0,"Spoofed bypass flag must not expose foreign rows");
    const bypass=await client.query("SELECT app_is_platform_bypass() AS allowed");
    assert.equal(bypass.rows[0].allowed,false,"Break-glass requires DBA-granted membership");
    await client.query("ROLLBACK");
  }finally{client.release();}

  console.log("UX-D6 PG FOUNDATION PASS: non-superuser RLS, cross-process visibility, serializable tx, CAS, rollback, claims, duplicate provider, allocation exclusion, no GUC bypass.");
}
main().then(()=>closeBusinessPgPool()).catch(error=>{console.error(error);process.exitCode=1;});
