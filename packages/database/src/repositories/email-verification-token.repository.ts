import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — EMAIL VERIFICATION TOKEN PERSISTENCE REPOSITORY (DEV-004, SEC-007)
// ============================================================================

import type { EmailVerificationToken } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";

export interface IEmailVerificationTokenRepository {
  create(data: Omit<EmailVerificationToken, "id" | "createdAt">, tx?: TransactionContext): Promise<EmailVerificationToken>;
  findByTokenHash(tokenHash: string, tx?: TransactionContext): Promise<EmailVerificationToken | null>;
  markAsUsed(id: string, tx?: TransactionContext): Promise<void>;
  invalidateAllForUser(userId: string, tx?: TransactionContext): Promise<void>;
}

export class EmailVerificationTokenRepository implements IEmailVerificationTokenRepository {
  private static tokenStore = createRecordStore<string, EmailVerificationToken>("email-verification-token.repository:tokenStore");

  async create(data: Omit<EmailVerificationToken, "id" | "createdAt">): Promise<EmailVerificationToken> {
    const token: EmailVerificationToken = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    EmailVerificationTokenRepository.tokenStore.set(token.id, token);
    return token;
  }

  async findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null> {
    for (const token of EmailVerificationTokenRepository.tokenStore.values()) {
      if (token.tokenHash === tokenHash) {
        return token;
      }
    }
    return null;
  }

  async markAsUsed(id: string): Promise<void> {
    const token = EmailVerificationTokenRepository.tokenStore.get(id);
    if (token) {
      token.usedAt = new Date().toISOString();
      EmailVerificationTokenRepository.tokenStore.set(id, token);
    }
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const token of EmailVerificationTokenRepository.tokenStore.values()) {
      if (token.userId === userId && !token.usedAt) {
        token.usedAt = now;
        EmailVerificationTokenRepository.tokenStore.set(token.id, token);
      }
    }
  }
}
