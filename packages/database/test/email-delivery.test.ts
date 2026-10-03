import assert from 'node:assert/strict';
import { ProductionEmailDeliveryAdapter } from '../../../apps/api/src/modules/identity/application/services/production-email-delivery.adapter';

async function main() {
  const names=['EMAIL_PROVIDER','SENDGRID_API_KEY','SENDGRID_FROM','APP_PUBLIC_URL'];
  const original=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  const adapter=new ProductionEmailDeliveryAdapter();
  const unavailable=(error:any)=>error.statusCode===503;
  try {
    names.forEach(name=>delete process.env[name]);
    await assert.rejects(adapter.sendEmailVerificationEmail('recipient@example.test','test-token'),unavailable);
    process.env.APP_PUBLIC_URL='https://review.example.test';
    await assert.rejects(adapter.sendPasswordResetEmail('recipient@example.test','test-token'),unavailable);
    Object.assign(process.env,{EMAIL_PROVIDER:'sendgrid',SENDGRID_API_KEY:'test-only-key',SENDGRID_FROM:'sender@example.test'});
    globalThis.fetch=async()=>new Response('',{status:403});
    await assert.rejects(adapter.sendInvitationEmail('recipient@example.test','test-token'),unavailable);
    globalThis.fetch=async()=>{throw new Error('offline');};
    await assert.rejects(adapter.sendPasswordResetEmail('recipient@example.test','test-token'),unavailable);
    let calls=0;
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'https://api.sendgrid.com/v3/mail/send');
      const body=JSON.parse(options!.body as string);
      assert.equal(body.personalizations[0].to[0].email,'recipient@example.test');
      assert.match(body.content[0].value,/https:\/\/review\.example\.test\/\?(verify|reset|invite)=test-token/);
      calls++;
      return new Response(null,{status:202});
    };
    await adapter.sendEmailVerificationEmail('recipient@example.test','test-token');
    await adapter.sendPasswordResetEmail('recipient@example.test','test-token');
    await adapter.sendInvitationEmail('recipient@example.test','test-token');
    assert.equal(calls,3);
    console.log('PASS: missing configuration, provider rejection and network failures remain visible; all three email link contracts pass (simulated provider).');
  } finally {
    globalThis.fetch=originalFetch;
    names.forEach(name=>original[name]===undefined?delete process.env[name]:process.env[name]=original[name]);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
