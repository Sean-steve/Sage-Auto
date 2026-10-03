// ============================================================================
// CAR HIRE OS — CORE AUTHENTICATION SERVICE (DEV-004, SEC-007, DATA-002)
// Comprehensive business logic for identity, tokens, sessions & security lifecycle
// ============================================================================

import { AUTH_CONFIG, ERROR_CODES } from "@carhire/constants";
import {
  User,
  AuthSession,
  AuthTokens,
  RegisterUserDto,
  LoginDto,
} from "@carhire/types";
import {
  IUserRepository,
  IAuthSessionRepository,
  IPasswordResetTokenRepository,
  IEmailVerificationTokenRepository,
  IAuditRepository,
  IOutboxRepository,
} from "@carhire/database";
import { AppError } from "../../../../common/filters/http-exception.filter";
import { IPasswordHasher, ITokenService, IEmailDeliveryPort } from "../../domain/ports";
import { RateLimiterService } from "../security/rate-limiter.service";

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface SanitizedUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  isPlatformStaff: boolean;
  emailVerified: boolean;
  status: string;
  createdAt: string;
}

export interface SanitizedSession {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  deviceLabel?: string;
  isCurrent?: boolean;
}

export class AuthService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly sessionRepo: IAuthSessionRepository,
    private readonly resetTokenRepo: IPasswordResetTokenRepository,
    private readonly verifyTokenRepo: IEmailVerificationTokenRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly outboxRepo: IOutboxRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: ITokenService,
    private readonly emailDelivery: IEmailDeliveryPort,
    private readonly rateLimiter: RateLimiterService
  ) {}

  private sanitizeUser(user: User): SanitizedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      isPlatformStaff: user.isPlatformStaff,
      emailVerified: Boolean(user.emailVerified || user.emailVerifiedAt),
      status: user.status || "ACTIVE",
      createdAt: user.createdAt,
    };
  }

  private sanitizeSession(session: AuthSession, currentSessionId?: string): SanitizedSession {
    return {
      id: session.id,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceLabel: session.deviceLabel,
      isCurrent: currentSessionId ? session.id === currentSessionId : false,
    };
  }

  // --------------------------------------------------------------------------
  // 1. REGISTRATION
  // --------------------------------------------------------------------------
  async register(dto: RegisterUserDto, meta?: RequestMeta): Promise<{ user: SanitizedUser }> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // Check unique normalized email
    const existing = await this.userRepo.findByNormalizedEmail(normalizedEmail);
    if (existing) {
      throw new AppError(
        ERROR_CODES.EMAIL_ALREADY_REGISTERED,
        409,
        "An account with this email address already exists."
      );
    }

    const passwordHash = await this.passwordHasher.hashPassword(dto.password);

    const createdUser = await this.userRepo.create({
      email: dto.email.trim(),
      normalizedEmail,
      passwordHash,
      fullName: dto.fullName.trim(),
      phone: dto.phone?.trim(),
      isPlatformStaff: false,
      status: "ACTIVE",
    });

    // Create Email Verification Token
    const rawVerifyToken = this.tokenService.generateCryptoToken(32);
    const tokenHash = this.tokenService.hashCryptoToken(rawVerifyToken);
    const expiresAt = new Date(Date.now() + AUTH_CONFIG.EMAIL_VERIFICATION_TOKEN_TTL_SEC * 1000).toISOString();

    await this.verifyTokenRepo.create({
      userId: createdUser.id,
      tokenHash,
      expiresAt,
    });

    // Send verification email via port
    await this.emailDelivery.sendEmailVerificationEmail(
      createdUser.email,
      rawVerifyToken,
      createdUser.fullName
    );

    // Audit and Outbox persistence
    await this.auditRepo.record({
      actorType: "USER",
      actorId: createdUser.id,
      action: "auth.user_registered",
      resourceType: "user",
      resourceId: createdUser.id,
      requestId: meta?.requestId,
      metadata: { email: normalizedEmail, ipAddress: meta?.ipAddress },
    });

    await this.outboxRepo.publish({
      eventType: "user.registered",
      aggregateType: "user",
      aggregateId: createdUser.id,
      payload: {
        userId: createdUser.id,
        email: createdUser.email,
        fullName: createdUser.fullName,
        registeredAt: createdUser.createdAt,
      },
    });

    return { user: this.sanitizeUser(createdUser) };
  }

  // --------------------------------------------------------------------------
  // 2. LOGIN
  // --------------------------------------------------------------------------
  async login(
    dto: LoginDto,
    meta?: RequestMeta
  ): Promise<{ user: SanitizedUser; tokens: AuthTokens; session: SanitizedSession }> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const rateLimitKey = `login:${normalizedEmail}:${meta?.ipAddress || "default"}`;

    const limitCheck = this.rateLimiter.consume(rateLimitKey);
    if (!limitCheck.allowed) {
      throw new AppError(
        ERROR_CODES.RATE_LIMITED,
        429,
        `Too many login attempts. Please try again in ${limitCheck.retryAfterSec} seconds.`
      );
    }

    const user = await this.userRepo.findByNormalizedEmail(normalizedEmail);
    if (!user || !user.passwordHash) {
      await this.auditRepo.record({
        actorType: "ANONYMOUS",
        action: "auth.login_failed",
        resourceType: "user",
        resourceId: normalizedEmail,
        requestId: meta?.requestId,
        metadata: { reason: "USER_NOT_FOUND", ipAddress: meta?.ipAddress },
      });
      // Generic invalid credentials message to prevent account enumeration
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401, "Invalid email or password.");
    }

    if (user.status === "DISABLED" || user.status === "SUSPENDED") {
      throw new AppError(
        ERROR_CODES.ACCOUNT_DISABLED,
        403,
        "This account is disabled or suspended. Please contact customer support."
      );
    }

    const passwordMatches = await this.passwordHasher.verifyPassword(dto.password, user.passwordHash);
    if (!passwordMatches) {
      await this.auditRepo.record({
        actorType: "USER",
        actorId: user.id,
        action: "auth.login_failed",
        resourceType: "user",
        resourceId: user.id,
        requestId: meta?.requestId,
        metadata: { reason: "INVALID_PASSWORD", ipAddress: meta?.ipAddress },
      });
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401, "Invalid email or password.");
    }

    // Reset rate limit on success
    this.rateLimiter.reset(rateLimitKey);

    // Create session and tokens
    const rawRefreshToken = this.tokenService.generateOpaqueRefreshToken();
    const refreshTokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const tokenFamilyId = this.tokenService.generateTokenFamilyId();
    const refreshExpiresAt = new Date(Date.now() + AUTH_CONFIG.REFRESH_TOKEN_TTL_SEC * 1000).toISOString();

    const session = await this.sessionRepo.create({
      userId: user.id,
      refreshTokenHash,
      tokenFamilyId,
      expiresAt: refreshExpiresAt,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      deviceLabel: meta?.userAgent ? meta.userAgent.slice(0, 100) : "Web Browser",
    });

    const accessToken = this.tokenService.generateAccessToken({
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      fullName: user.fullName,
      isPlatformStaff: Boolean(user.isPlatformStaff),
    });

    await this.auditRepo.record({
      actorType: "USER",
      actorId: user.id,
      action: "auth.login_succeeded",
      resourceType: "auth_session",
      resourceId: session.id,
      requestId: meta?.requestId,
      metadata: { ipAddress: meta?.ipAddress, userAgent: meta?.userAgent },
    });

    return {
      user: this.sanitizeUser(user),
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        tokenType: "Bearer",
        expiresIn: AUTH_CONFIG.ACCESS_TOKEN_TTL_SEC,
      },
      session: this.sanitizeSession(session, session.id),
    };
  }

  // --------------------------------------------------------------------------
  // 3. REFRESH TOKEN (With Rotation & Token-Family Reuse Protection)
  // --------------------------------------------------------------------------
  async refreshToken(refreshToken: string, meta?: RequestMeta): Promise<{ tokens: AuthTokens }> {
    if (!refreshToken) {
      throw new AppError(ERROR_CODES.REFRESH_TOKEN_INVALID, 401, "Refresh token is required.");
    }

    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const session = await this.sessionRepo.findByRefreshTokenHash(tokenHash);

    if (!session) {
      // Possible reuse of an already-rotated token or invalid token
      throw new AppError(ERROR_CODES.REFRESH_TOKEN_INVALID, 401, "Invalid or unrecognized refresh token.");
    }

    // Check if session has been revoked
    if (session.revokedAt) {
      // If a revoked session token is attempted, revoke whole family as safety measure
      await this.sessionRepo.revokeTokenFamily(session.tokenFamilyId, "DETECTED_REUSE_OF_REVOKED_TOKEN");
      await this.auditRepo.record({
        actorType: "USER",
        actorId: session.userId,
        action: "auth.refresh_token_reused_detected",
        resourceType: "auth_session",
        resourceId: session.id,
        requestId: meta?.requestId,
        metadata: { tokenFamilyId: session.tokenFamilyId, ipAddress: meta?.ipAddress },
      });
      throw new AppError(
        ERROR_CODES.REFRESH_TOKEN_REUSED,
        401,
        "Session has been revoked. Re-authentication required."
      );
    }

    // Check expiration
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await this.sessionRepo.revokeSession(session.id, "EXPIRED");
      throw new AppError(ERROR_CODES.SESSION_EXPIRED, 401, "Session expired. Please log in again.");
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user || user.status === "DISABLED" || user.status === "SUSPENDED") {
      await this.sessionRepo.revokeSession(session.id, "USER_INACTIVE");
      throw new AppError(ERROR_CODES.ACCOUNT_DISABLED, 403, "Account is disabled or suspended.");
    }

    // Rotate refresh token: generate new token, update hash and expiration
    const newRawRefreshToken = this.tokenService.generateOpaqueRefreshToken();
    const newRefreshTokenHash = this.tokenService.hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + AUTH_CONFIG.REFRESH_TOKEN_TTL_SEC * 1000).toISOString();

    await this.sessionRepo.rotateRefreshToken(session.id, newRefreshTokenHash, newExpiresAt);

    const newAccessToken = this.tokenService.generateAccessToken({
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      fullName: user.fullName,
      isPlatformStaff: Boolean(user.isPlatformStaff),
    });

    return {
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRawRefreshToken,
        tokenType: "Bearer",
        expiresIn: AUTH_CONFIG.ACCESS_TOKEN_TTL_SEC,
      },
    };
  }

  // --------------------------------------------------------------------------
  // 4. LOGOUT & SESSION REVOCATION
  // --------------------------------------------------------------------------
  async logout(
    userId: string,
    sessionId?: string,
    refreshToken?: string,
    allSessions: boolean = false,
    meta?: RequestMeta
  ): Promise<void> {
    if (allSessions) {
      const revokedCount = await this.sessionRepo.revokeAllForUser(userId, "USER_LOGGED_OUT_ALL");
      await this.auditRepo.record({
        actorType: "USER",
        actorId: userId,
        action: "auth.all_sessions_revoked",
        resourceType: "user",
        resourceId: userId,
        requestId: meta?.requestId,
        metadata: { revokedCount, ipAddress: meta?.ipAddress },
      });
      return;
    }

    if (sessionId) {
      await this.sessionRepo.revokeSession(sessionId, "USER_LOGGED_OUT");
      await this.auditRepo.record({
        actorType: "USER",
        actorId: userId,
        action: "auth.session_revoked",
        resourceType: "auth_session",
        resourceId: sessionId,
        requestId: meta?.requestId,
        metadata: { reason: "USER_LOGGED_OUT", ipAddress: meta?.ipAddress },
      });
      return;
    }

    if (refreshToken) {
      const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
      const session = await this.sessionRepo.findByRefreshTokenHash(tokenHash);
      if (session) {
        await this.sessionRepo.revokeSession(session.id, "USER_LOGGED_OUT");
        await this.auditRepo.record({
          actorType: "USER",
          actorId: session.userId,
          action: "auth.session_revoked",
          resourceType: "auth_session",
          resourceId: session.id,
          requestId: meta?.requestId,
        });
      }
    }
  }

  async revokeSession(
    actorUserId: string,
    sessionId: string,
    isPlatformAdmin: boolean = false,
    meta?: RequestMeta
  ): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 404, "Session not found.");
    }

    if (session.userId !== actorUserId && !isPlatformAdmin) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 403, "You cannot revoke another user's session.");
    }

    await this.sessionRepo.revokeSession(sessionId, "MANUAL_REVOCATION");
    await this.auditRepo.record({
      actorType: "USER",
      actorId: actorUserId,
      action: "auth.session_revoked",
      resourceType: "auth_session",
      resourceId: sessionId,
      requestId: meta?.requestId,
    });
  }

  async revokeAllSessions(actorUserId: string, meta?: RequestMeta): Promise<{ revokedCount: number }> {
    const count = await this.sessionRepo.revokeAllForUser(actorUserId, "MANUAL_ALL_REVOCATION");
    await this.auditRepo.record({
      actorType: "USER",
      actorId: actorUserId,
      action: "auth.all_sessions_revoked",
      resourceType: "user",
      resourceId: actorUserId,
      requestId: meta?.requestId,
      metadata: { revokedCount: count },
    });
    return { revokedCount: count };
  }

  // --------------------------------------------------------------------------
  // 5. PASSWORD RESET LIFECYCLE
  // --------------------------------------------------------------------------
  async forgotPassword(email: string, meta?: RequestMeta): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepo.findByNormalizedEmail(normalizedEmail);

    if (!user) {
      // Do not disclose whether email exists
      return;
    }

    // Invalidate previous tokens
    await this.resetTokenRepo.invalidateAllForUser(user.id);

    const rawToken = this.tokenService.generateCryptoToken(32);
    const tokenHash = this.tokenService.hashCryptoToken(rawToken);
    const expiresAt = new Date(Date.now() + AUTH_CONFIG.PASSWORD_RESET_TOKEN_TTL_SEC * 1000).toISOString();

    await this.resetTokenRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await this.emailDelivery.sendPasswordResetEmail(user.email, rawToken, user.fullName);

    await this.auditRepo.record({
      actorType: "USER",
      actorId: user.id,
      action: "auth.password_reset_requested",
      resourceType: "user",
      resourceId: user.id,
      requestId: meta?.requestId,
      metadata: { ipAddress: meta?.ipAddress },
    });
  }

  async resetPassword(token: string, newPassword: string, meta?: RequestMeta): Promise<void> {
    const tokenHash = this.tokenService.hashCryptoToken(token);
    const resetRecord = await this.resetTokenRepo.findByTokenHash(tokenHash);

    if (!resetRecord || resetRecord.usedAt) {
      throw new AppError(
        ERROR_CODES.RESET_TOKEN_INVALID,
        400,
        "Password reset token is invalid or has already been used."
      );
    }

    if (new Date(resetRecord.expiresAt).getTime() < Date.now()) {
      throw new AppError(
        ERROR_CODES.RESET_TOKEN_EXPIRED,
        400,
        "Password reset token has expired. Please request a new one."
      );
    }

    const newHash = await this.passwordHasher.hashPassword(newPassword);
    await this.userRepo.updatePassword(resetRecord.userId, newHash);
    await this.resetTokenRepo.markAsUsed(resetRecord.id);

    // Revoke all existing sessions for security
    await this.sessionRepo.revokeAllForUser(resetRecord.userId, "PASSWORD_RESET_COMPLETED");

    await this.auditRepo.record({
      actorType: "USER",
      actorId: resetRecord.userId,
      action: "auth.password_reset_completed",
      resourceType: "user",
      resourceId: resetRecord.userId,
      requestId: meta?.requestId,
      metadata: { ipAddress: meta?.ipAddress },
    });
  }

  // --------------------------------------------------------------------------
  // 6. EMAIL VERIFICATION
  // --------------------------------------------------------------------------
  async verifyEmail(token: string, meta?: RequestMeta): Promise<void> {
    const tokenHash = this.tokenService.hashCryptoToken(token);
    const verifyRecord = await this.verifyTokenRepo.findByTokenHash(tokenHash);

    if (!verifyRecord || verifyRecord.usedAt) {
      throw new AppError(
        ERROR_CODES.VERIFICATION_TOKEN_INVALID,
        400,
        "Email verification token is invalid or already used."
      );
    }

    if (new Date(verifyRecord.expiresAt).getTime() < Date.now()) {
      throw new AppError(
        ERROR_CODES.VERIFICATION_TOKEN_EXPIRED,
        400,
        "Email verification token has expired. Please request a new verification link."
      );
    }

    const now = new Date();
    await this.userRepo.updateEmailVerified(verifyRecord.userId, now);
    await this.verifyTokenRepo.markAsUsed(verifyRecord.id);

    await this.auditRepo.record({
      actorType: "USER",
      actorId: verifyRecord.userId,
      action: "auth.email_verified",
      resourceType: "user",
      resourceId: verifyRecord.userId,
      requestId: meta?.requestId,
      metadata: { ipAddress: meta?.ipAddress },
    });
  }

  async resendVerification(email: string, meta?: RequestMeta): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepo.findByNormalizedEmail(normalizedEmail);

    if (!user || user.emailVerified) {
      return;
    }

    await this.verifyTokenRepo.invalidateAllForUser(user.id);

    const rawToken = this.tokenService.generateCryptoToken(32);
    const tokenHash = this.tokenService.hashCryptoToken(rawToken);
    const expiresAt = new Date(Date.now() + AUTH_CONFIG.EMAIL_VERIFICATION_TOKEN_TTL_SEC * 1000).toISOString();

    await this.verifyTokenRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await this.emailDelivery.sendEmailVerificationEmail(user.email, rawToken, user.fullName);
  }

  // --------------------------------------------------------------------------
  // 7. CURRENT USER & SESSIONS QUERY
  // --------------------------------------------------------------------------
  async getMe(userId: string): Promise<SanitizedUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 404, "User not found.");
    }
    return this.sanitizeUser(user);
  }

  async getActiveSessions(userId: string, currentSessionId?: string): Promise<SanitizedSession[]> {
    const sessions = await this.sessionRepo.findActiveSessionsForUser(userId);
    return sessions.map((s) => this.sanitizeSession(s, currentSessionId));
  }
}
