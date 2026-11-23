import type {RequestHandler} from 'express';
import {withRecordTransaction} from '@carhire/database';

/** A mutation is acknowledged only after its database transaction commits. */
export const recordTransactionMiddleware:RequestHandler=(req,res,next)=>{
  if(process.env.RECORD_STORE_BACKEND!=='postgres'||['GET','HEAD','OPTIONS'].includes(req.method)){next();return;}
  const end=res.end;
  let buffered:any[]|undefined;
  let finish:()=>void;
  let reject:(error:Error)=>void;
  const responseReady=new Promise<void>((resolve,fail)=>{finish=resolve;reject=fail;});
  const aborted=()=>reject(new Error('Request connection closed before transaction completed.'));
  req.once('aborted',aborted);
  res.once('close',aborted);
  const deadline=setTimeout(()=>reject(new Error('Mutation transaction timed out.')),30000);
  deadline.unref();
  res.end=function(...args:any[]) {
    buffered=args;
    if(res.statusCode>=400)reject(new Error('HTTP mutation failed.'));
    else finish();
    return res;
  } as typeof res.end;
  void withRecordTransaction(async()=>{next();await responseReady;}).then(()=>{
    res.end=end;
    end.apply(res,buffered as any);
  },error=>{
    res.end=end;
    if(res.destroyed)return;
    if(buffered&&res.statusCode>=400){end.apply(res,buffered as any);return;}
    res.removeHeader('Content-Length');
    res.status(['40001','40P01'].includes(error?.code)?409:503).json({error:{code:'DATABASE_TRANSACTION_FAILED',message:'The change was not saved. Refresh the record and try again.'}});
  }).finally(()=>{clearTimeout(deadline);req.off('aborted',aborted);res.off('close',aborted);});
};
