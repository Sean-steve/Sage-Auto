import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createRecordStore,closeRecordStore} from '../src/record-store';
import {recordTransactionMiddleware} from '../../../apps/api/src/common/middleware/record-transaction.middleware';

async function main(){
  assert.equal(process.env.RECORD_STORE_BACKEND,'postgres');
  const store=createRecordStore<string,number>(`http-test:${randomUUID()}`);
  const app=express();app.use(recordTransactionMiddleware);
  app.post('/commit',async(_req,res,next)=>{try{await store.set('committed',1);res.status(201).json({saved:true});}catch(error){next(error);}});
  app.post('/reject',async(_req,res,next)=>{try{await store.set('partial',1);res.status(422).json({error:'Rejected'});}catch(error){next(error);}});
  app.post('/throw',async(_req,res,next)=>{try{await store.set('partial',2);throw new Error('Injected failure');}catch(error){next(error);}});
  app.use((_error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(500).json({error:'Failed'});});
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try{
    const commit=await fetch(base+'/commit',{method:'POST'});
    assert.equal(commit.status,201);assert.deepEqual(await commit.json(),{saved:true});
    assert.equal(await store.get('committed'),1,'Success response must follow commit');
    for(const [path,status] of [['reject',422],['throw',500]] as const){
      const response=await fetch(`${base}/${path}`,{method:'POST'});assert.equal(response.status,status);await response.json();
      assert.equal(await store.has('partial'),false,'Failed response must follow rollback');
    }
    console.log('PASS: HTTP success follows commit; validation and handler failures roll back writes');
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await store.clear();await closeRecordStore();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
