import { IEmailDeliveryPort } from '../../domain/ports';
const unavailable=(message:string)=>Object.assign(new Error(message),{statusCode:503});
// Native HTTP avoids loading three optional provider SDKs at application startup.
export class ProductionEmailDeliveryAdapter implements IEmailDeliveryPort {
  private async send(to:string,subject:string,text:string):Promise<void> {
    if(process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER!=='sendgrid') throw unavailable('Set EMAIL_PROVIDER=sendgrid to use the configured email delivery adapter.');
    const key=process.env.SENDGRID_API_KEY,from=process.env.SENDGRID_FROM;
    if(!key||!from) throw unavailable('Email delivery is not configured. Contact the administrator.');
    let response:Response;
    try {response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({personalizations:[{to:[{email:to}]}],from:{email:from},subject,content:[{type:'text/plain',value:text}]})});}
    catch {throw unavailable('The email provider could not be reached. Please retry.');}
    if(!response.ok) throw unavailable('The email provider rejected delivery. Contact the administrator.');
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

    const environment=(process.env.APP_ENV||process.env.NODE_ENV||'development').toLowerCase();
    const productionLike=environment==='production'||environment==='staging';
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
    await this.send(email,'Reset your Car Hire OS password',`Choose a new password: ${this.link('reset',token)}\n\nReset code: ${token}\nExpires in one hour. Ignore this email if you did not request it.`);
  }
  async sendEmailVerificationEmail(email:string,token:string):Promise<void> {
    await this.send(email,'Verify your Car Hire OS email',`Verify your email: ${this.link('verify',token)}\n\nVerification code: ${token}\nExpires in 24 hours.`);
  }
  async sendInvitationEmail(email:string,token:string):Promise<void> {
    await this.send(email,'Your Car Hire OS invitation',`Join your team: ${this.link('invite',token)}\n\nInvitation code: ${token}\nExpires in 72 hours. Sign in or register with this email address.`);
  }
}
