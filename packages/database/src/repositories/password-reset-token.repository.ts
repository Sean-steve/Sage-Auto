import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PASSWORD RESET TOKEN PERSISTENCE REPOSITORY (DEV-004, SEC-007)
// ============================================================================

import type { PasswordResetToken } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";

export interface IPasswordResetTokenRepository {
  create(data: Omit<PasswordResetToken, "id" | "createdAt">, tx?: TransactionContext): Promise<PasswordResetToken>;
  findByTokenHash(tokenHash: string, tx?: TransactionContext): Promise<PasswordResetToken | null>;
  markAsUsed(id: string, tx?: TransactionContext): Promise<void>;
  invalidateAllForUser(userId: string, tx?: TransactionContext): Promise<void>;
}

export class PasswordResetTokenRepository implements IPasswordResetTokenRepository {
  private static tokenStore = createRecordStore<string, PasswordResetToken>("password-reset-token.repository:tokenStore");

  async create(data: Omit<PasswordResetToken, "id" | "createdAt">): Promise<PasswordResetToken> {
    const token: PasswordResetToken = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    PasswordResetTokenRepository.tokenStore.set(token.id, token);
    return token;
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    for (const token of PasswordResetTokenRepository.tokenStore.values()) {
      if (token.tokenHash === tokenHash) {
        return token;
      }
    }
    return null;
  }

  async markAsUsed(id: string): Promise<void> {
    const token = PasswordResetTokenRepository.tokenStore.get(id);
    if (token) {
      token.usedAt = new Date().toISOString();
      PasswordResetTokenRepository.tokenStore.set(id, token);
    }
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const token of PasswordResetTokenRepository.tokenStore.values()) {
      if (token.userId === userId && !token.usedAt) {
        token.usedAt = now;
        PasswordResetTokenRepository.tokenStore.set(token.id, token);
      }
    }
  }
}
