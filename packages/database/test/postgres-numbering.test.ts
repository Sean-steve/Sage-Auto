import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRecordStore,nextRecordNumber,closeRecordStore,withRecordTransaction} from '../src/record-store';
async function main(){
 assert.equal(process.env.RECORD_STORE_BACKEND,'postgres');
 const namespace=process.argv[3]||`number-test:${randomUUID()}`;
 const prefix='TEST-2026-';
 if(process.argv[2]==='worker'){console.log(await nextRecordNumber(namespace,'number',prefix));await closeRecordStore();return;}
 const records=createRecordStore<string,{number:string}>(namespace);
 await records.set('retained',{number:prefix+'001500'});
 assert.equal(await nextRecordNumber(namespace,'number',prefix),prefix+'001501');
 const worker=()=>new Promise<string>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx',fileURLToPath(import.meta.url),'worker',namespace],{env:process.env});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve(out.trim()):reject(new Error(err)));});
 const values=await Promise.all(Array.from({length:4},worker));
 assert.equal(new Set(values).size,4);
 await closeRecordStore();
 assert.equal(await nextRecordNumber(namespace,'number',prefix),prefix+'001506');
 await assert.rejects(withRecordTransaction(async()=>{await nextRecordNumber(namespace,'number',prefix);throw Error('rollback');}),/rollback/);
 assert.equal(await nextRecordNumber(namespace,'number',prefix),prefix+'001507');
 await records.clear();await createRecordStore<string,number>('record-number-sequences').delete(namespace+':'+prefix);
 await closeRecordStore();console.log('PASS: retained numbering, four processes, reconnect and transaction rollback');
}
main().catch(async e=>{console.error(e);await closeRecordStore();process.exitCode=1;});
