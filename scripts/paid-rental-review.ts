import {mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {DevelopmentEmailDeliveryAdapter} from '../apps/api/src/modules/identity/application/services/email-delivery.service';

async function main(){
  const url=new URL(process.env.DATABASE_URL||'');
  if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/sage_paid_ui_')||[process.env.NODE_ENV,process.env.APP_ENV].some(v=>['production','staging'].includes(v||'')))throw new Error('Paid UI review requires a dedicated loopback sage_paid_ui_ database.');
  process.env.RECORD_STORE_BACKEND='postgres';process.env.ACCESS_REVIEW_MODE='true';process.env.EMAIL_DELIVERY_MODE='capture';process.env.REDIS_SIMULATED='true';
  const dir=resolve('.review/paid-ui');mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
  // Local mailbox stands in for delivered email; account changes still use normal UI routes.
  for(const method of ['sendPasswordResetEmail','sendEmailVerificationEmail','sendInvitationEmail'] as const){
    const original=DevelopmentEmailDeliveryAdapter.prototype[method];
    DevelopmentEmailDeliveryAdapter.prototype[method]=async function(...args:any[]){await (original as any).apply(this,args);writeFileSync(resolve(dir,'mailbox.json'),JSON.stringify(this.getCapturedEmails()),{mode:0o600});};
  }
  const {createApiApp}=await import('../apps/api/src/app.module');
  const app=await createApiApp();app.listen(Number(process.env.API_PORT||3521),'127.0.0.1',()=>console.log('Paid UI review API ready. Local captured mailbox enabled.'));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
