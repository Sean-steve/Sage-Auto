// ============================================================================
// CAR HIRE OS — EMAIL DELIVERY ADAPTER (DEV-004, SEC-007)
// Development & testing mail port adapter with captured token registry
// ============================================================================

import { IEmailDeliveryPort } from "../../domain/ports";

export interface CapturedEmail {
  to: string;
  subject: string;
  type: "PASSWORD_RESET" | "EMAIL_VERIFICATION" | "INVITATION";
  token: string;
  sentAt: string;
}

export class DevelopmentEmailDeliveryAdapter implements IEmailDeliveryPort {
  private capturedEmails: CapturedEmail[] = [];

  constructor() {
    const environment = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
    if (environment === "production" || environment === "staging") {
      throw new Error(
        "Production and staging cannot use the development email delivery adapter."
      );
    }
  }

  async sendPasswordResetEmail(recipientEmail: string, resetToken: string, recipientName?: string): Promise<void> {
    const greeting = recipientName ? `Hello ${recipientName},` : "Hello,";
    const body = `${greeting}\n\nYou requested to reset your password. Use the following security token:\n${resetToken}\n\nThis token will expire in 1 hour. If you did not request this, please ignore this email.`;

    this.capturedEmails.push({
      to: recipientEmail,
      subject: "Password Reset Request — Car Hire OS",
      type: "PASSWORD_RESET",
      token: resetToken,
      sentAt: new Date().toISOString(),
    });

  }

  async sendEmailVerificationEmail(recipientEmail: string, verificationToken: string, recipientName?: string): Promise<void> {
    const greeting = recipientName ? `Hello ${recipientName},` : "Hello,";
    const body = `${greeting}\n\nPlease verify your email address for Car Hire OS by using this verification token:\n${verificationToken}\n\nThis token will expire in 24 hours.`;

    this.capturedEmails.push({
      to: recipientEmail,
      subject: "Verify Your Email Address — Car Hire OS",
      type: "EMAIL_VERIFICATION",
      token: verificationToken,
      sentAt: new Date().toISOString(),
    });

  }

  async sendInvitationEmail(recipientEmail:string, token:string):Promise<void> {
    this.capturedEmails.push({to:recipientEmail,subject:"Your Car Hire OS invitation",type:"INVITATION",token,sentAt:new Date().toISOString()});
  }

  getCapturedEmails(): CapturedEmail[] {
    return [...this.capturedEmails];
  }

  getLatestTokenFor(email: string, type: "PASSWORD_RESET" | "EMAIL_VERIFICATION" | "INVITATION"): string | null {
    const match = [...this.capturedEmails]
      .reverse()
      .find((e) => e.to.toLowerCase() === email.toLowerCase() && e.type === type);
    return match ? match.token : null;
  }

  clearCaptured(): void {
    this.capturedEmails = [];
  }
}
