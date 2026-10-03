// ============================================================================
// CAR HIRE OS — IDENTITY DOMAIN PORTS & ABSTRACTIONS (DEV-004, SEC-007)
// ============================================================================

export interface IEmailDeliveryPort {
  sendInvitationEmail(recipientEmail: string, token: string): Promise<void>;
  sendPasswordResetEmail(recipientEmail: string, resetToken: string, recipientName?: string): Promise<void>;
  sendEmailVerificationEmail(recipientEmail: string, verificationToken: string, recipientName?: string): Promise<void>;
}

export interface IPasswordHasher {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
}

export interface ITokenService {
  generateAccessToken(payload: {
    userId: string;
    sessionId: string;
    email: string;
    fullName: string;
    isPlatformStaff: boolean;
  }): string;
  verifyAccessToken(token: string): {
    sub: string;
    sid: string;
    email: string;
    fullName: string;
    isPlatformStaff: boolean;
    iss: string;
    aud: string;
    iat: number;
    exp: number;
  };
  generateOpaqueRefreshToken(): string;
  hashRefreshToken(token: string): string;
  generateTokenFamilyId(): string;
  generateCryptoToken(byteLength?: number): string;
  hashCryptoToken(token: string): string;
}
