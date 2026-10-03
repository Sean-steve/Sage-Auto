import assert from 'node:assert/strict';
import { ProductionEmailDeliveryAdapter } from '../../../apps/api/src/modules/identity/application/services/production-email-delivery.adapter';

async function main() {
  const names=[
    'NODE_ENV',
    'APP_ENV',
    'EMAIL_PROVIDER',
    'EMAIL_DELIVERY_MODE',
    'POSTMARK_SERVER_TOKEN',
    'POSTMARK_FROM',
    'POSTMARK_MESSAGE_STREAM',
    'SENDGRID_API_KEY',
    'SENDGRID_FROM',
    'APP_PUBLIC_URL',
  ];
  const original=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  const unavailable=(error:any)=>error.statusCode===503;

  try {
    names.forEach(name=>delete process.env[name]);
    process.env.NODE_ENV='development';
    process.env.APP_PUBLIC_URL='https://review.example.test';

    // Missing provider is visible.
    await assert.rejects(
      new ProductionEmailDeliveryAdapter().sendEmailVerificationEmail('recipient@example.test','test-token'),
      unavailable
    );

    // Postmark configuration is explicit and failures remain visible.
    Object.assign(process.env,{
      EMAIL_PROVIDER:'postmark',
      POSTMARK_SERVER_TOKEN:'postmark-test-token',
      POSTMARK_FROM:'sender@example.test',
      POSTMARK_MESSAGE_STREAM:'outbound',
    });
    globalThis.fetch=async()=>new Response('',{status:422});
    await assert.rejects(
      new ProductionEmailDeliveryAdapter().sendInvitationEmail('recipient@example.test','test-token'),
      unavailable
    );

    globalThis.fetch=async()=>{throw new Error('offline');};
    await assert.rejects(
      new ProductionEmailDeliveryAdapter().sendPasswordResetEmail('recipient@example.test','test-token'),
      unavailable
    );

    let postmarkCalls=0;
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'https://api.postmarkapp.com/email');
      const headers=options!.headers as Record<string,string>;
      assert.equal(headers['X-Postmark-Server-Token'],'postmark-test-token');
      const body=JSON.parse(options!.body as string);
      assert.equal(body.From,'sender@example.test');
      assert.equal(body.To,'recipient@example.test');
      assert.equal(body.MessageStream,'outbound');
      assert.match(body.TextBody,/https:\/\/review\.example\.test\/\?(verify|reset|invite)=test-token/);
      postmarkCalls++;
      return new Response(JSON.stringify({MessageID:'pm-test'}),{status:200,headers:{'Content-Type':'application/json'}});
    };
    const postmark=new ProductionEmailDeliveryAdapter('postmark');
    await postmark.sendEmailVerificationEmail('recipient@example.test','test-token');
    await postmark.sendPasswordResetEmail('recipient@example.test','test-token');
    await postmark.sendInvitationEmail('recipient@example.test','test-token');
    assert.equal(postmarkCalls,3);

    // SendGrid remains supported as a fallback provider.
    Object.assign(process.env,{
      EMAIL_PROVIDER:'sendgrid',
      SENDGRID_API_KEY:'sendgrid-test-key',
      SENDGRID_FROM:'sender@example.test',
    });
    let sendgridCalls=0;
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'https://api.sendgrid.com/v3/mail/send');
      const headers=options!.headers as Record<string,string>;
      assert.equal(headers.Authorization,'Bearer sendgrid-test-key');
      const body=JSON.parse(options!.body as string);
      assert.equal(body.personalizations[0].to[0].email,'recipient@example.test');
      assert.match(body.content[0].value,/https:\/\/review\.example\.test\/\?verify=test-token/);
      sendgridCalls++;
      return new Response(null,{status:202});
    };
    await new ProductionEmailDeliveryAdapter('sendgrid').sendEmailVerificationEmail('recipient@example.test','test-token');
    assert.equal(sendgridCalls,1);

    // Local development may send real provider email with localhost HTTP links.
    process.env.EMAIL_PROVIDER='postmark';
    process.env.APP_PUBLIC_URL='http://localhost:3000';
    let localBody='';
    globalThis.fetch=async(_url,options)=>{
      localBody=JSON.parse(options!.body as string).TextBody;
      return new Response(JSON.stringify({MessageID:'pm-local'}),{status:200});
    };
    await new ProductionEmailDeliveryAdapter('postmark').sendEmailVerificationEmail('recipient@example.test','local-token');
    assert.match(localBody,/http:\/\/localhost:3000\/\?verify=local-token/);

    // The same insecure URL fails closed in staging/production.
    process.env.NODE_ENV='staging';
    await assert.rejects(
      new ProductionEmailDeliveryAdapter('postmark').sendEmailVerificationEmail('recipient@example.test','blocked-token'),
      unavailable
    );
    process.env.NODE_ENV='production';
    await assert.rejects(
      new ProductionEmailDeliveryAdapter('postmark').sendEmailVerificationEmail('recipient@example.test','blocked-token'),
      unavailable
    );

    console.log('PASS: Postmark and SendGrid transactional delivery contracts pass; localhost HTTP is development-only and production-like links require HTTPS.');
  } finally {
    globalThis.fetch=originalFetch;
    names.forEach(name=>original[name]===undefined?delete process.env[name]:process.env[name]=original[name]);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
