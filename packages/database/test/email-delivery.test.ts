import assert from 'node:assert/strict';
import { ProductionEmailDeliveryAdapter } from '../../../apps/api/src/modules/identity/application/services/production-email-delivery.adapter';

async function main() {
  const names=['NODE_ENV','APP_ENV','EMAIL_PROVIDER','SENDGRID_API_KEY','SENDGRID_FROM','APP_PUBLIC_URL'];
  const original=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  const adapter=new ProductionEmailDeliveryAdapter();
  const unavailable=(error:any)=>error.statusCode===503;
  try {
    names.forEach(name=>delete process.env[name]);
    process.env.NODE_ENV='development';
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

    // Local development may send real email while keeping HTTP localhost links.
    process.env.APP_PUBLIC_URL='http://localhost:3000';
    let localBody='';
    globalThis.fetch=async(_url,options)=>{
      localBody=JSON.parse(options!.body as string).content[0].value;
      return new Response(null,{status:202});
    };
    await adapter.sendEmailVerificationEmail('recipient@example.test','local-token');
    assert.match(localBody,/http:\/\/localhost:3000\/\?verify=local-token/);

    // The same insecure public URL must fail closed in staging/production.
    process.env.NODE_ENV='staging';
    await assert.rejects(adapter.sendEmailVerificationEmail('recipient@example.test','blocked-token'),unavailable);
    process.env.NODE_ENV='production';
    await assert.rejects(adapter.sendEmailVerificationEmail('recipient@example.test','blocked-token'),unavailable);

    console.log('PASS: SendGrid failures remain visible; localhost HTTP is allowed only in development and production-like links require HTTPS.');
  } finally {
    globalThis.fetch=originalFetch;
    names.forEach(name=>original[name]===undefined?delete process.env[name]:process.env[name]=original[name]);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
