import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — SUPPORT ACCESS SESSION REPOSITORY (DEV-005 §22, SEC-007)
// Persists time-bounded, audited support access sessions for platform staff.
// ============================================================================

import type { SupportAccessSession } from "@carhire/types";
import { InternalDatabaseError } from "../errors";

export interface ISupportAccessSessionRepository {
  createSession(data: {
    platformUserId: string;
    targetTenantId: string;
    reason: string;
    expiresInMinutes?: number;
  }): Promise<SupportAccessSession>;
  findById(id: string): Promise<SupportAccessSession | null>;
  findActiveSession(platformUserId: string, targetTenantId: string): Promise<SupportAccessSession | null>;
  endSession(id: string, endedBy: string): Promise<SupportAccessSession>;
  listSessionsForTenant(targetTenantId: string): Promise<SupportAccessSession[]>;
  listSessionsByStaff(platformUserId: string): Promise<SupportAccessSession[]>;
  listAll(): Promise<SupportAccessSession[]>;
}

export class InMemorySupportAccessSessionRepository implements ISupportAccessSessionRepository {
  private sessions: Map<string, SupportAccessSession> = createRecordStore("support-access-session.repository:sessions");

  async createSession(data: {
    platformUserId: string;
    targetTenantId: string;
    reason: string;
    expiresInMinutes?: number;
  }): Promise<SupportAccessSession> {
    if (!data.platformUserId || !data.targetTenantId || !data.reason) {
      throw new InternalDatabaseError("platformUserId, targetTenantId, and reason are required");
    }

    const durationMin = data.expiresInMinutes || 60;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMin * 60 * 1000).toISOString();

    const session: SupportAccessSession = {
      id: `sup-sess-${crypto.randomUUID()}`,
      platformUserId: data.platformUserId,
      targetTenantId: data.targetTenantId,
      reason: data.reason.trim(),
      startedAt: now.toISOString(),
      expiresAt,
      isActive: true,
    };

    this.sessions.set(session.id, session);
    return { ...session };
  }

  async findById(id: string): Promise<SupportAccessSession | null> {
    const session = this.sessions.get(id);
    if (!session) return null;

    // Check expiry
    const now = new Date().toISOString();
    if (session.isActive && session.expiresAt <= now) {
      session.isActive = false;
      session.endedAt = session.expiresAt;
    }

    return { ...session };
  }

  async findActiveSession(platformUserId: string, targetTenantId: string): Promise<SupportAccessSession | null> {
    const now = new Date().toISOString();
    for (const session of this.sessions.values()) {
      if (
        session.platformUserId === platformUserId &&
        session.targetTenantId === targetTenantId &&
        session.isActive &&
        session.expiresAt > now
      ) {
        return { ...session };
      }
    }
    return null;
  }

  async endSession(id: string, endedBy: string): Promise<SupportAccessSession> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new InternalDatabaseError(`Support access session '${id}' not found`);
    }

    session.isActive = false;
    session.endedAt = new Date().toISOString();
    this.sessions.set(id, session);
    return { ...session };
  }

  async listSessionsForTenant(targetTenantId: string): Promise<SupportAccessSession[]> {
    const list: SupportAccessSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.targetTenantId === targetTenantId) {
        list.push({ ...session });
      }
    }
    return list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async listSessionsByStaff(platformUserId: string): Promise<SupportAccessSession[]> {
    const list: SupportAccessSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.platformUserId === platformUserId) {
        list.push({ ...session });
      }
    }
    return list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async listAll(): Promise<SupportAccessSession[]> {
    const list = Array.from(this.sessions.values()).map((s) => ({ ...s }));
    return list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
}
