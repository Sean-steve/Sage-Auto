import { IEmailDeliveryPort } from '../../domain/ports';

type EmailProvider = 'postmark' | 'sendgrid';

const unavailable=(message:string)=>Object.assign(new Error(message),{statusCode:503});

// Native HTTP keeps provider SDKs out of the application startup path.
export class ProductionEmailDeliveryAdapter implements IEmailDeliveryPort {
  constructor(private readonly configuredProvider?: EmailProvider) {}

  private provider(): EmailProvider {
    if (this.configuredProvider) return this.configuredProvider;

    const explicit=(process.env.EMAIL_PROVIDER || process.env.EMAIL_DELIVERY_MODE || '').toLowerCase();
    if (explicit==='postmark' || explicit==='sendgrid') return explicit;

    throw unavailable('Email delivery requires EMAIL_PROVIDER=postmark or EMAIL_PROVIDER=sendgrid.');
  }

  private async send(to:string,subject:string,text:string):Promise<void> {
    const provider=this.provider();

    if(provider==='postmark') {
      const token=process.env.POSTMARK_SERVER_TOKEN;
      const from=process.env.POSTMARK_FROM;
      const messageStream=process.env.POSTMARK_MESSAGE_STREAM || 'outbound';
      if(!token||!from) {
        throw unavailable('Postmark email delivery is not configured. Set POSTMARK_SERVER_TOKEN and POSTMARK_FROM.');
      }

      let response:Response;
      try {
        response=await fetch('https://api.postmarkapp.com/email',{
          method:'POST',
          signal:AbortSignal.timeout(15000),
          headers:{
            'X-Postmark-Server-Token':token,
            'Accept':'application/json',
            'Content-Type':'application/json',
          },
          body:JSON.stringify({
            From:from,
            To:to,
            Subject:subject,
            TextBody:text,
            MessageStream:messageStream,
          }),
        });
      } catch {
        throw unavailable('The Postmark email provider could not be reached. Please retry.');
      }

      if(!response.ok) {
        throw unavailable(`Postmark rejected email delivery (HTTP ${response.status}). Check the server token, verified sender/domain and message stream.`);
      }
      return;
    }

    const key=process.env.SENDGRID_API_KEY;
    const from=process.env.SENDGRID_FROM;
    if(!key||!from) {
      throw unavailable('SendGrid email delivery is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM.');
    }

    let response:Response;
    try {
      response=await fetch('https://api.sendgrid.com/v3/mail/send',{
        method:'POST',
        signal:AbortSignal.timeout(15000),
        headers:{
          Authorization:`Bearer ${key}`,
          'Content-Type':'application/json',
        },
        body:JSON.stringify({
          personalizations:[{to:[{email:to}]}],
          from:{email:from},
          subject,
          content:[{type:'text/plain',value:text}],
        }),
      });
    } catch {
      throw unavailable('The SendGrid email provider could not be reached. Please retry.');
    }

    if(!response.ok) {
      throw unavailable(`SendGrid rejected email delivery (HTTP ${response.status}). Check the API key and verified sender/domain.`);
    }
  }

  private link(kind:string,token:string) {
    const origin=process.env.APP_PUBLIC_URL;
    if(!origin) throw unavailable('APP_PUBLIC_URL is required for account email links.');

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw unavailable('APP_PUBLIC_URL must be a valid absolute URL.');
    }

    const environments=[process.env.APP_ENV,process.env.NODE_ENV]
      .filter(Boolean)
      .map(value=>String(value).toLowerCase());
    const productionLike=environments.some(value=>value==='production'||value==='staging');
    const localHosts=new Set(['localhost','127.0.0.1','[::1]']);
    const secure=parsed.protocol==='https:';
    const localDevelopment=parsed.protocol==='http:'&&localHosts.has(parsed.hostname);

    if(productionLike&&!secure) {
      throw unavailable('APP_PUBLIC_URL must use HTTPS in production and staging.');
    }
    if(!productionLike&&!secure&&!localDevelopment) {
      throw unavailable('Development email links may use HTTP only for localhost/loopback; use HTTPS for any other host.');
    }

    return new URL(`/?${kind}=${encodeURIComponent(token)}`,parsed).href;
  }

  async sendPasswordResetEmail(email:string,token:string):Promise<void> {
    await this.send(
      email,
      'Reset your Car Hire OS password',
      `Choose a new password: ${this.link('reset',token)}\n\nReset code: ${token}\nExpires in one hour. Ignore this email if you did not request it.`
    );
  }

  async sendEmailVerificationEmail(email:string,token:string):Promise<void> {
    await this.send(
      email,
      'Verify your Car Hire OS email',
      `Verify your email: ${this.link('verify',token)}\n\nVerification code: ${token}\nExpires in 24 hours.`
    );
  }

  async sendInvitationEmail(email:string,token:string):Promise<void> {
    await this.send(
      email,
      'Your Car Hire OS invitation',
      `Join your team: ${this.link('invite',token)}\n\nInvitation code: ${token}\nExpires in 72 hours. Sign in or register with this email address.`
    );
  }
}
