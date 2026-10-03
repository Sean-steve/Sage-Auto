import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

async function main(){
  const dir=mkdtempSync(join(tmpdir(),'carhire-transaction-'));
  process.env.SQLITE_PATH=join(dir,'test.sqlite');
  const {createRecordStore,withRecordTransaction,claimRecord}=await import('../src/record-store');
  const records=createRecordStore<string,any>('test:atomic');
  records.set('preserved',{car:'Existing car'});
  try {
    await assert.rejects(withRecordTransaction(async()=>{records.set('partial',{value:1});assert.ok(claimRecord('test:claims','one',{user:'test'}));throw new Error('failure');}));
    assert.equal(records.has('partial'),false);
    assert.ok(claimRecord('test:claims','one',{user:'retry'}));
    let resume!:()=>void;
    const gate=new Promise<void>(resolve=>{resume=resolve;});
    const pending=withRecordTransaction(async()=>{records.set('pending',{value:2});await gate;});
    records.set('other-request',{value:3});resume();
    await assert.rejects(pending,(error:any)=>error.statusCode===409);
    assert.equal(records.has('pending'),false);assert.equal(records.get('other-request').value,3);
    const moduleUrl=pathToFileURL(resolve('packages/database/src/record-store.ts')).href;
    const crash=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`import {createRecordStore,withRecordTransaction} from ${JSON.stringify(moduleUrl)}; await withRecordTransaction(async()=>{const records=createRecordStore('test:atomic');records.delete('preserved');records.set('crashed',{value:4});process.exit(12);});`],{env:process.env,encoding:'utf8'});
    assert.equal(crash.status,12,crash.stderr);assert.equal(records.has('crashed'),false);assert.equal(records.get('preserved').car,'Existing car');
    await withRecordTransaction(async()=>{records.set('committed',{value:5});});
    const restart=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`import assert from 'node:assert/strict';import {createRecordStore} from ${JSON.stringify(moduleUrl)};assert.equal(createRecordStore('test:atomic').get('committed').value,5);`],{env:process.env,encoding:'utf8'});
    assert.equal(restart.status,0,restart.stderr);
    console.log('PASS: rollback, claim recovery, concurrent-write conflict, crash preservation and restart persistence');
  } finally {rmSync(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
