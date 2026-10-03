import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — USER PERSISTENCE REPOSITORY (DEV-004, DATA-002)
// ============================================================================

import type { User, TenantMembership } from "@carhire/types";
import { UniqueConstraintViolationError, RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IUserRepository {
  findById(id: string, tx?: TransactionContext): Promise<User | null>;
  findByEmail(email: string, tx?: TransactionContext): Promise<User | null>;
  findByNormalizedEmail(normalizedEmail: string, tx?: TransactionContext): Promise<User | null>;
  create(data: Omit<User, "id" | "createdAt">, tx?: TransactionContext): Promise<User>;
  updatePassword(userId: string, passwordHash: string, tx?: TransactionContext): Promise<void>;
  updateEmailVerified(userId: string, verifiedAt: Date | string, tx?: TransactionContext): Promise<void>;
  updateStatus(userId: string, status: "ACTIVE" | "SUSPENDED" | "DISABLED", tx?: TransactionContext): Promise<void>;
  createMembership(membership: Omit<TenantMembership, "id" | "joinedAt">, tx?: TransactionContext): Promise<TenantMembership>;
  getMembershipsForUser(userId: string, tx?: TransactionContext): Promise<TenantMembership[]>;
  getMembershipsForTenant(tenantId: string, tx?: TransactionContext): Promise<TenantMembership[]>;
}

export class UserRepository implements IUserRepository {
  private static userStore = createRecordStore<string, User>("user.repository:userStore");
  private static membershipStore = createRecordStore<string, TenantMembership>("user.repository:membershipStore");

  async findById(id: string): Promise<User | null> {
    return UserRepository.userStore.get(id) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    return this.findByNormalizedEmail(normalized);
  }

  async findByNormalizedEmail(normalizedEmail: string): Promise<User | null> {
    const normalized = normalizedEmail.toLowerCase().trim();
    for (const user of UserRepository.userStore.values()) {
      const userNorm = (user.normalizedEmail || user.email).toLowerCase().trim();
      if (userNorm === normalized) {
        return user;
      }
    }
    return null;
  }

  async create(data: Omit<User, "id" | "createdAt">): Promise<User> {
    const normalized = (data.normalizedEmail || data.email).toLowerCase().trim();
    const existing = await this.findByNormalizedEmail(normalized);
    if (existing) {
      throw new UniqueConstraintViolationError("normalized_email", normalized);
    }

    const now = new Date().toISOString();
    const newUser: User = {
      ...data,
      normalizedEmail: normalized,
      status: data.status || "ACTIVE",
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    UserRepository.userStore.set(newUser.id, newUser);
    return newUser;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const user = UserRepository.userStore.get(userId);
    if (!user) {
      throw new RecordNotFoundError("users", userId);
    }
    user.passwordHash = passwordHash;
    user.updatedAt = new Date().toISOString();
    UserRepository.userStore.set(userId, user);
  }

  async updateEmailVerified(userId: string, verifiedAt: Date | string): Promise<void> {
    const user = UserRepository.userStore.get(userId);
    if (!user) {
      throw new RecordNotFoundError("users", userId);
    }
    user.emailVerified = true;
    user.emailVerifiedAt = typeof verifiedAt === "string" ? verifiedAt : verifiedAt.toISOString();
    user.updatedAt = new Date().toISOString();
    UserRepository.userStore.set(userId, user);
  }

  async setPlatformStaff(userId: string, enabled: boolean): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new RecordNotFoundError("users", userId);
    UserRepository.userStore.set(userId, {...user, isPlatformStaff: enabled});
  }

  async updateStatus(userId: string, status: "ACTIVE" | "SUSPENDED" | "DISABLED"): Promise<void> {
    const user = UserRepository.userStore.get(userId);
    if (!user) {
      throw new RecordNotFoundError("users", userId);
    }
    user.status = status;
    user.updatedAt = new Date().toISOString();
    UserRepository.userStore.set(userId, user);
  }


  async createMembership(data: Omit<TenantMembership, "id" | "joinedAt">): Promise<TenantMembership> {
    // Check UNIQUE(tenant_id, user_id)
    for (const m of UserRepository.membershipStore.values()) {
      if (m.tenantId === data.tenantId && m.userId === data.userId && m.status !== "REMOVED") {
        throw new UniqueConstraintViolationError("tenant_membership", `${data.tenantId}:${data.userId}`);
      }
    }

    const membership: TenantMembership = {
      ...data,
      id: crypto.randomUUID(),
      joinedAt: new Date().toISOString(),
    };

    UserRepository.membershipStore.set(membership.id, membership);
    return membership;
  }

  async getMembershipsForUser(userId: string): Promise<TenantMembership[]> {
    return Array.from(UserRepository.membershipStore.values()).filter((m) => m.userId === userId);
  }

  async getMembershipsForTenant(tenantId: string): Promise<TenantMembership[]> {
    return Array.from(UserRepository.membershipStore.values()).filter((m) => m.tenantId === tenantId);
  }
}
