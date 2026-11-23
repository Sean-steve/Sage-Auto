import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {CustomerRepository} from '../src/repositories/customer.repository';
import {closeRecordStore,queryRecordTransaction,withRecordTransaction} from '../src/record-store';
import {TransactionManager} from '../src/transaction-manager';

async function main(){
 const url=new URL(process.env.SAGE_TEST_DATABASE_URL||'');
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.pathname.endsWith('_test'),'Use an empty isolated local _test database');
 const admin=new Pool({connectionString:url.toString()});const role='customer_test_'+randomUUID().replaceAll('-','');
 const password=randomBytes(24).toString('hex');
 try {
  for(const file of ['20261111_006_normalized_rental_core.sql','20261111_007_customer_details.sql'])await admin.query(readFileSync('infrastructure/database/migrations/'+file,'utf8'));
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`);
  await admin.query(`GRANT USAGE ON SCHEMA rental_domain TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA rental_domain TO ${role}`);
  await admin.query("INSERT INTO rental_domain.tenants VALUES('tenant-a','A','a','KES'),('tenant-b','B','b','KES')");
  process.env.RECORD_STORE_BACKEND='postgres';process.env.CUSTOMER_REPOSITORY_BACKEND='normalized';
  url.username=role;url.password=password;process.env.DATABASE_URL=url.toString();
  const repo=new CustomerRepository();
  const input={tenantId:'tenant-a',customerType:'VIP' as const,fullName:'Verified Customer',email:' Person@Example.Test ',phone:'+254 700 123 456',idOrPassportNumber:' ID-A ',licenseNumber:' LIC-A ',licenseExpiryDate:'2028-11-11',status:'ACTIVE' as const,verificationStatus:'VERIFIED' as const,nationality:'Kenyan',address:'Customer address',city:'Nairobi',country:'KE',rating:4.5,taxPinNumber:'TAX-A',emergencyContactName:'Contact',emergencyContactPhone:'0700123000',emergencyContactRelationship:'Sibling',notes:'Preserved notes',tags:['VIP','repeat','VIP']};
  const a=await repo.create(input);
  assert.equal(a.customerNumber,`CUS-${new Date().getFullYear()}-000101`);assert.equal(a.email,'person@example.test');assert.deepEqual(a.tags,input.tags);assert.equal(a.licenseExpiryDate,input.licenseExpiryDate);assert.equal(a.notes,input.notes);
  for(const field of ['nationality','address','city','country','rating','taxPinNumber','emergencyContactName','emergencyContactPhone','emergencyContactRelationship'] as const)assert.equal(a[field],input[field]);
  await closeRecordStore();assert.deepEqual(await new CustomerRepository().findById(a.id,'tenant-a'),a);
  assert.equal(await repo.findById(a.id,'tenant-b'),null);
  await repo.delete(a.id,'tenant-b');assert.ok(await repo.findById(a.id,'tenant-a'));
  await assert.rejects(repo.update(a.id,'tenant-b',{notes:'unauthorized'}),(e:any)=>e.code==='RECORD_NOT_FOUND');
  assert.equal((await repo.findById(a.id,'tenant-a'))?.notes,input.notes);
  assert.equal((await repo.findAll('tenant-b')).total,0);
  const b=await repo.create({...input,tenantId:'tenant-b'});assert.equal(b.customerNumber,a.customerNumber);
  for(const patch of [{email:'PERSON@example.test'},{phone:'254700123456'},{idOrPassportNumber:'id-a'},{licenseNumber:'lic-a'}])await assert.rejects(repo.create({...input,email:'other@example.test',phone:'0700999999',idOrPassportNumber:'other-id',licenseNumber:'other-lic',...patch}),(e:any)=>e.code==='UNIQUE_CONSTRAINT_VIOLATION');
  const updated=await repo.update(a.id,'tenant-a',{notes:'Updated',tags:['new'],tenantId:'tenant-b',id:'forged'},a.version);
  assert.equal(updated.id,a.id);assert.equal(updated.tenantId,'tenant-a');assert.equal(updated.version,2);assert.deepEqual(updated.tags,['new']);
  await assert.rejects(repo.update(a.id,'tenant-a',{notes:'stale'},1));assert.equal((await repo.findById(a.id,'tenant-a'))?.notes,'Updated');
  assert.equal((await repo.findByEmail(' PERSON@example.test ','tenant-a'))?.id,a.id);
  assert.equal((await repo.findByIdOrPassport('id-a','tenant-a'))?.id,a.id);
  assert.equal((await repo.findByCustomerNumber(a.customerNumber.toLowerCase(),'tenant-a'))?.id,a.id);
  assert.equal((await repo.findAll('tenant-a',{search:'verified',customerType:'VIP'})).total,1);
  await assert.rejects(TransactionManager.withTenantTransaction('tenant-a',async()=>{await repo.update(a.id,'tenant-a',{notes:'rollback'});throw new Error('injected');}));assert.equal((await repo.findById(a.id,'tenant-a'))?.notes,'Updated');
  await withRecordTransaction(async()=>{assert.equal((await queryRecordTransaction('SELECT * FROM rental_domain.customers')).rowCount,0);await assert.rejects(queryRecordTransaction('SELECT * FROM application_records'));});
  const results=await Promise.allSettled([1,2].map(i=>repo.create({...input,email:`parallel${i}@example.test`,phone:`070000000${i}`,idOrPassportNumber:`parallel-id-${i}`,licenseNumber:`parallel-lic-${i}`})));
  const created=results.filter((r):r is PromiseFulfilledResult<typeof a>=>r.status==='fulfilled').map(r=>r.value);assert.ok(created.length>=1);assert.equal(new Set(created.map(c=>c.customerNumber)).size,created.length);
  for(const result of results)if(result.status==='rejected')assert.match(String(result.reason),/serializ|concurr|transaction/i);
  await repo.delete(a.id,'tenant-a');assert.equal(await repo.findById(a.id,'tenant-a'),null);assert.equal(Number((await admin.query('SELECT count(*) FROM rental_domain.customer_tags WHERE customer_id=$1',[a.id])).rows[0].count),0);
  await closeRecordStore();process.env.DATABASE_URL=process.env.SAGE_TEST_DATABASE_URL;await assert.rejects(repo.list('tenant-a'),(e:any)=>/restricted non-owner/.test(e.cause?.message||e.message));
  console.log('PASS: routed normalized CRUD, full fields and tags, restart, tenant isolation, duplicate constraints, numbering, version conflict, rollback and restricted-role enforcement; no compatibility table exists');
 }finally{await closeRecordStore();await admin.query(`DROP OWNED BY ${role}`).catch(()=>{});await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(()=>{});await admin.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
