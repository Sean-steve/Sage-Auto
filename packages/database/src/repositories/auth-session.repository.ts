import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — AUTH SESSION PERSISTENCE REPOSITORY (DEV-004, SEC-007)
// ============================================================================

import type { AuthSession } from "@carhire/types";
import { RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IAuthSessionRepository {
  create(data: Omit<AuthSession, "id" | "createdAt" | "lastUsedAt">, tx?: TransactionContext): Promise<AuthSession>;
  findById(id: string, tx?: TransactionContext): Promise<AuthSession | null>;
  findByRefreshTokenHash(refreshTokenHash: string, tx?: TransactionContext): Promise<AuthSession | null>;
  updateLastUsed(id: string, tx?: TransactionContext): Promise<void>;
  rotateRefreshToken(
    id: string,
    newRefreshTokenHash: string,
    newExpiresAt: string,
    tx?: TransactionContext
  ): Promise<AuthSession>;
  revokeSession(id: string, reason: string, tx?: TransactionContext): Promise<void>;
  revokeAllForUser(userId: string, reason: string, tx?: TransactionContext): Promise<number>;
  revokeTokenFamily(tokenFamilyId: string, reason: string, tx?: TransactionContext): Promise<number>;
  findActiveSessionsForUser(userId: string, tx?: TransactionContext): Promise<AuthSession[]>;
}

export class AuthSessionRepository implements IAuthSessionRepository {
  private static sessionStore = createRecordStore<string, AuthSession>("auth-session.repository:sessionStore");

  async create(
    data: Omit<AuthSession, "id" | "createdAt" | "lastUsedAt">
  ): Promise<AuthSession> {
    const now = new Date().toISOString();
    const session: AuthSession = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      lastUsedAt: now,
    };

    AuthSessionRepository.sessionStore.set(session.id, session);
    return session;
  }

  async findById(id: string): Promise<AuthSession | null> {
    return AuthSessionRepository.sessionStore.get(id) || null;
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSession | null> {
    for (const session of AuthSessionRepository.sessionStore.values()) {
      if (session.refreshTokenHash === refreshTokenHash) {
        return session;
      }
    }
    return null;
  }

  async updateLastUsed(id: string): Promise<void> {
    const session = AuthSessionRepository.sessionStore.get(id);
    if (session) {
      session.lastUsedAt = new Date().toISOString();
      AuthSessionRepository.sessionStore.set(id, session);
    }
  }

  async rotateRefreshToken(
    id: string,
    newRefreshTokenHash: string,
    newExpiresAt: string
  ): Promise<AuthSession> {
    const session = AuthSessionRepository.sessionStore.get(id);
    if (!session) {
      throw new RecordNotFoundError("auth_sessions", id);
    }

    const updatedSession: AuthSession = {
      ...session,
      refreshTokenHash: newRefreshTokenHash,
      expiresAt: newExpiresAt,
      lastUsedAt: new Date().toISOString(),
    };

    AuthSessionRepository.sessionStore.set(id, updatedSession);
    return updatedSession;
  }

  async revokeSession(id: string, reason: string): Promise<void> {
    const session = AuthSessionRepository.sessionStore.get(id);
    if (session) {
      session.revokedAt = new Date().toISOString();
      session.revocationReason = reason;
      AuthSessionRepository.sessionStore.set(id, session);
    }
  }

  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();
    for (const session of AuthSessionRepository.sessionStore.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = now;
        session.revocationReason = reason;
        AuthSessionRepository.sessionStore.set(session.id, session);
        count++;
      }
    }
    return count;
  }

  async revokeTokenFamily(tokenFamilyId: string, reason: string): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();
    for (const session of AuthSessionRepository.sessionStore.values()) {
      if (session.tokenFamilyId === tokenFamilyId && !session.revokedAt) {
        session.revokedAt = now;
        session.revocationReason = reason;
        AuthSessionRepository.sessionStore.set(session.id, session);
        count++;
      }
    }
    return count;
  }

  async findActiveSessionsForUser(userId: string): Promise<AuthSession[]> {
    const now = new Date().getTime();
    return Array.from(AuthSessionRepository.sessionStore.values()).filter(
      (s) => s.userId === userId && !s.revokedAt && new Date(s.expiresAt).getTime() > now
    );
  }
}
