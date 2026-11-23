import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';

async function main(){
 const url=new URL(process.env.SAGE_TEST_DATABASE_URL||'');
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.pathname.endsWith('_test'),'Use an isolated local _test database');
 const admin=new Pool({connectionString:url.toString()});
 const role='normalized_test_'+randomUUID().replaceAll('-','');
 const password=randomBytes(24).toString('hex');
 let runtime:Pool|undefined;
 try{
  await admin.query(readFileSync('infrastructure/database/migrations/20261111_006_normalized_rental_core.sql','utf8'));
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`);
  await admin.query(`GRANT USAGE ON SCHEMA rental_domain TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA rental_domain TO ${role}`);
  url.username=role;url.password=password;runtime=new Pool({connectionString:url.toString(),max:4});
  const authority=(await runtime.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  assert.equal(authority.rolsuper,false);assert.equal(authority.rolbypassrls,false);
  async function tenant<T>(id:string|undefined,work:(c:PoolClient)=>Promise<T>){const c=await runtime!.connect();try{await c.query('BEGIN');if(id)await c.query("SELECT set_config('app.current_tenant_id',$1,true)",[id]);const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
  const rejects=(work:()=>Promise<unknown>,code:string)=>assert.rejects(work,(e:any)=>e.code===code);
  async function seed(id:string){await tenant(id,async c=>{
   await c.query('INSERT INTO rental_domain.tenants VALUES($1::text,$2,$1::text,$3)',[id,'Test tenant','KES']);
   await c.query("INSERT INTO rental_domain.customers VALUES($1,'customer','CUS-1','Test customer','ACTIVE')",[id]);
   await c.query("INSERT INTO rental_domain.vehicles VALUES($1,'vehicle','TEST 001','Toyota','Corolla',10000,100,'ACTIVE','AVAILABLE')",[id]);
   await c.query("INSERT INTO rental_domain.bookings VALUES($1,'booking','BKG-1','customer','vehicle','2026-11-11','2026-11-12','KES',100,1000,'CONFIRMED')",[id]);
   await c.query("INSERT INTO rental_domain.rentals VALUES($1,'rental','RNT-1','booking','customer','vehicle','2026-11-11','2026-11-12',NULL,NULL,10000,NULL,'ACTIVE')",[id]);
   await c.query("INSERT INTO rental_domain.invoices VALUES($1,'invoice','INV-1','customer','booking','rental','KES','PAID',100,0,100,100,0,0,1)",[id]);
   await c.query("INSERT INTO rental_domain.invoice_lines VALUES($1,'line','invoice','RENTAL_BASE','Rental',1,100,100,0,100,0)",[id]);
   await c.query("INSERT INTO rental_domain.payments VALUES($1,'rent-payment','PMT-1','CUSTOMER_INVOICE','INBOUND','KES','MANUAL_RECORD','cash-rent','ALLOCATED',100,100,0,0,1)",[id]);
   await c.query("INSERT INTO rental_domain.payments VALUES($1,'deposit-payment','PMT-2','RENTAL_DEPOSIT','INBOUND','KES','MANUAL_RECORD','cash-deposit','ALLOCATED',1000,1000,0,0,1)",[id]);
   await c.query("INSERT INTO rental_domain.deposits VALUES($1,'deposit','customer','booking','rental','KES','HELD',1000,1000,1000,0,1000,0,0,1)",[id]);
   await c.query("INSERT INTO rental_domain.allocations VALUES($1,'rent-allocation','rent-payment','CUSTOMER_INVOICE','KES','invoice',NULL,100)",[id]);
   await c.query("INSERT INTO rental_domain.allocations VALUES($1,'deposit-allocation','deposit-payment','RENTAL_DEPOSIT','KES',NULL,'deposit',1000)",[id]);
  });}
  await seed('tenant-a');await seed('tenant-b');
  const tables=['tenants','customers','vehicles','bookings','rentals','invoices','invoice_lines','payments','deposits','refunds','allocations','source_archive'];
  await tenant(undefined,async c=>{for(const t of tables)assert.equal(Number((await c.query(`SELECT count(*) FROM rental_domain.${t}`)).rows[0].count),0,t+' must fail closed without context');await c.query("SET LOCAL app.is_platform_bypass='true'");assert.equal((await c.query('SELECT * FROM rental_domain.tenants')).rowCount,0);});
  await tenant('tenant-a',async c=>{
   assert.deepEqual((await c.query('SELECT tenant_id FROM rental_domain.tenants')).rows,[{tenant_id:'tenant-a'}]);
   assert.equal((await c.query("UPDATE rental_domain.customers SET full_name='Changed' WHERE tenant_id='tenant-b'")).rowCount,0);
   assert.equal((await c.query("DELETE FROM rental_domain.customers WHERE tenant_id='tenant-b'")).rowCount,0);
  });
  await rejects(()=>tenant('tenant-a',c=>c.query("INSERT INTO rental_domain.customers VALUES('tenant-b','bad','BAD','Wrong tenant','ACTIVE')")),'42501');
  await rejects(()=>tenant(undefined,c=>c.query("INSERT INTO rental_domain.tenants VALUES('no-context','No context','no-context','KES')")),'42501');
  await tenant('tenant-b',c=>c.query("INSERT INTO rental_domain.customers VALUES('tenant-b','b-only','CUS-B','Other tenant','ACTIVE')"));
  await rejects(()=>tenant('tenant-a',c=>c.query("UPDATE rental_domain.bookings SET customer_id='b-only' WHERE id='booking'")),'23503');
  await rejects(()=>tenant('tenant-a',c=>c.query("UPDATE rental_domain.bookings SET return_at=pickup_at WHERE id='booking'")),'23514');
  await rejects(()=>tenant('tenant-a',c=>c.query("UPDATE rental_domain.rentals SET return_odometer=1 WHERE id='rental'")),'23514');
  await rejects(()=>tenant('tenant-a',c=>c.query("UPDATE rental_domain.payments SET amount='NaN' WHERE id='rent-payment'")),'23514');
  await rejects(()=>tenant('tenant-a',c=>c.query("UPDATE rental_domain.payments SET amount=-1 WHERE id='rent-payment'")),'23514');
  await rejects(()=>tenant('tenant-a',c=>c.query("UPDATE rental_domain.allocations SET currency='USD' WHERE id='rent-allocation'")),'23503');
  await rejects(()=>tenant('tenant-a',c=>c.query("DELETE FROM rental_domain.customers WHERE id='customer'")),'23503');
  console.log('PASS: actual restricted login; all-table fail-closed RLS, ignored bypass flag, tenant FKs, money/date/mileage/currency constraints');
  await rejects(()=>tenant('tenant-a',c=>c.query("UPDATE rental_domain.invoice_lines SET net_amount=101,gross_amount=101 WHERE id='line'")),'23514');
  await rejects(()=>tenant('tenant-a',c=>c.query("UPDATE rental_domain.payments SET allocated_amount=99,unallocated_amount=1 WHERE id='rent-payment'")),'23514');
  await rejects(()=>tenant('tenant-a',c=>c.query("UPDATE rental_domain.deposits SET held_amount=0,refunded_amount=1000,refund_due_amount=0 WHERE id='deposit'")),'23514');
  const refund=(c:PoolClient,id:string,amount:number)=>c.query("INSERT INTO rental_domain.refunds VALUES(current_setting('app.current_tenant_id'),$1::text,$1::text,'deposit-payment','RENTAL_DEPOSIT','RENTAL_DEPOSIT','deposit',NULL,'KES',$2,'PENDING','requester',NULL,NULL)",[id,amount]);
  await tenant('tenant-a',c=>refund(c,'refund',1000));
  await rejects(()=>tenant('tenant-a',c=>refund(c,'excess',1)),'23514');
  await rejects(()=>tenant('tenant-a',c=>c.query("UPDATE rental_domain.refunds SET approved_by='requester' WHERE id='refund'")),'23514');
  await tenant('tenant-a',async c=>{
   await c.query("UPDATE rental_domain.refunds SET status='COMPLETED',approved_by='approver',provider_reference='CASH-REFUND' WHERE id='refund'");
   await c.query("UPDATE rental_domain.payments SET refunded_amount=1000,status='REFUNDED' WHERE id='deposit-payment'");
   await c.query("UPDATE rental_domain.deposits SET held_amount=0,refunded_amount=1000,refund_due_amount=0,status='REFUNDED' WHERE id='deposit'");
  });
  await tenant('tenant-a',async c=>assert.equal((await c.query("SELECT held_amount FROM rental_domain.deposits WHERE id='deposit'")).rows[0].held_amount,'0.0000'));
  await seed('tenant-c');
  const concurrent=await Promise.allSettled([tenant('tenant-c',c=>refund(c,'competing-one',700)),tenant('tenant-c',c=>refund(c,'competing-two',700))]);
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.filter(r=>r.status==='rejected'&&(r.reason as any).code==='23514').length,1);
  console.log('PASS: deferred invoice/payment/deposit reconciliation, separate refund approver, atomic refund completion, concurrent reservation cap');
  await tenant(undefined,async c=>assert.equal((await c.query('SELECT * FROM rental_domain.customers')).rowCount,0));
  console.log('PASS: pooled connections do not retain tenant context after commit');
 }finally{await runtime?.end();await admin.query(`DROP OWNED BY ${role}`).catch(()=>{});await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(()=>{});await admin.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
