// ============================================================================
// CAR HIRE OS — IDENTITY DOMAIN & SECURITY AUDIT EVENTS (DEV-004, SEC-007)
// ============================================================================

export interface IdentityAuditEvent {
  eventType: string;
  userId?: string;
  email?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface UserRegisteredEventPayload {
  userId: string;
  email: string;
  fullName: string;
  registeredAt: string;
}

export interface UserLoggedInEventPayload {
  userId: string;
  sessionId: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  loggedInAt: string;
}

export interface UserLoginFailedEventPayload {
  email: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  attemptedAt: string;
}

export interface UserLoggedOutEventPayload {
  userId: string;
  sessionId?: string;
  loggedOutAt: string;
}

export interface SessionRevokedEventPayload {
  userId: string;
  sessionId: string;
  reason: string;
  revokedAt: string;
}

export interface AllSessionsRevokedEventPayload {
  userId: string;
  revokedCount: number;
  reason: string;
  revokedAt: string;
}

export interface PasswordResetRequestedEventPayload {
  userId: string;
  email: string;
  requestedAt: string;
}

export interface PasswordResetCompletedEventPayload {
  userId: string;
  email: string;
  completedAt: string;
}

export interface EmailVerifiedEventPayload {
  userId: string;
  email: string;
  verifiedAt: string;
}

export interface RefreshTokenReusedDetectedEventPayload {
  userId: string;
  sessionId: string;
  tokenFamilyId: string;
  detectedAt: string;
  ipAddress?: string;
}
