import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRecordStore,withRecordTransaction,claimRecord,closeRecordStore} from '../src/record-store';
import {TransactionManager} from '../src/transaction-manager';

async function main(){
  assert.equal(process.env.RECORD_STORE_BACKEND,'postgres');
  assert.ok(process.env.DATABASE_URL,'An explicit disposable PostgreSQL database is required.');
  const namespace=`certification:${randomUUID()}`;
  const store=createRecordStore<string,{amount:number;date?:Date}>(namespace);
  try{
    await withRecordTransaction(async()=>{await store.set('committed',{amount:100,date:new Date('2026-11-09')});});
    await assert.rejects(withRecordTransaction(async()=>{
      await store.set('committed',{amount:200});
      await store.set('partial',{amount:10});
      throw new Error('Injected failure');
    }),/Injected failure/);
    assert.equal((await store.get('committed'))?.amount,100);
    assert.equal(await store.has('partial'),false);
    await closeRecordStore();
    assert.equal((await store.get('committed'))?.date?.toISOString(),'2026-11-09T00:00:00.000Z');
    console.log('PASS: commit, multi-record rollback, value types and reconnect persistence');

    const claims=await Promise.all(Array.from({length:8},()=>claimRecord(namespace,'claim',{amount:1})));
    assert.equal(claims.filter(Boolean).length,1);
    console.log('PASS: exactly one concurrent idempotency claim');

    await store.set('balance',{amount:0});
    let ready=0,release!:()=>void;
    const barrier=new Promise<void>(resolve=>{release=resolve;});
    const outcomes=await Promise.allSettled([1,2].map(()=>withRecordTransaction(async()=>{
      const balance=await store.get('balance');
      if(++ready===2)release();
      await barrier;
      await store.set('balance',{amount:balance!.amount+1});
    })));
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
    const rejected=outcomes.find(r=>r.status==='rejected') as PromiseRejectedResult;
    assert.equal(rejected.reason.code,'40001');
    assert.equal((await store.get('balance'))?.amount,1);
    console.log('PASS: concurrent updates reject a stale write rather than lose money');

    let releaseLate!:()=>void;
    const lateGate=new Promise<void>(resolve=>{releaseLate=resolve;});
    let late!:Promise<unknown>;
    await withRecordTransaction(async()=>{
      late=lateGate.then(()=>store.set('late',{amount:1}));
    });
    const lateAssertion=assert.rejects(late,/transaction has already ended/);
    releaseLate();await lateAssertion;
    assert.equal(await store.has('late'),false);
    console.log('PASS: detached work cannot write through a released transaction client');

    await TransactionManager.withTenantTransaction('certification-tenant',async tx=>{
      const rows=await tx.executor.query<{tenant:string}>("SELECT current_setting('app.current_tenant_id') AS tenant");
      assert.equal(rows[0].tenant,'certification-tenant');
      await store.set('manager',{amount:5});
    });
    await TransactionManager.withTenantTransaction('tenant-a',async tx=>{
      await TransactionManager.withTenantTransaction('tenant-a',async nested=>{
        assert.equal(nested.tenantId,'tenant-a');
      });
      await assert.rejects(TransactionManager.withTenantTransaction('tenant-b',async()=>{
        assert.fail('Cross-tenant nested callback must not execute');
      }), (error:any)=>error.code==='CROSS_TENANT_VIOLATION');
      assert.equal((await tx.executor.query<{tenant:string}>("SELECT current_setting('app.current_tenant_id') AS tenant"))[0].tenant,'tenant-a');
    });
    await TransactionManager.withTenantTransaction('tenant-b',async tx=>{
      assert.equal((await tx.executor.query<{tenant:string}>("SELECT current_setting('app.current_tenant_id') AS tenant"))[0].tenant,'tenant-b');
    });
    await withRecordTransaction(async()=>{
      const {queryRecordTransaction}=await import('../src/record-store');
      assert.ok(!(await queryRecordTransaction("SELECT current_setting('app.current_tenant_id',true) AS tenant")).rows[0].tenant);
    });
    console.log('PASS: nested tenant switching rejected and context cleared after commit');
    await assert.rejects(TransactionManager.run(async()=>{
      await store.set('manager',{amount:9});throw new Error('rollback manager');
    }));
    assert.equal((await store.get('manager'))?.amount,5);
    console.log('PASS: transaction manager executes real SQL and rolls back repository writes');
  }finally{await store.clear();await closeRecordStore();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
