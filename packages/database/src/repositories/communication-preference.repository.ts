import { createRecordStore } from "../record-store";
import {
  CommunicationPreferenceRecord,
  NotificationChannel,
  NotificationCategory,
} from "@car-hire-os/types";

export interface ICommunicationPreferenceRepository {
  findByPartyAndChannel(
    tenantId: string,
    partyId: string,
    channel: NotificationChannel,
    category: NotificationCategory
  ): Promise<CommunicationPreferenceRecord | null>;
  listByParty(tenantId: string, partyId: string): Promise<CommunicationPreferenceRecord[]>;
  save(pref: CommunicationPreferenceRecord): Promise<CommunicationPreferenceRecord>;
  isOptedIn(
    tenantId: string,
    partyId: string,
    channel: NotificationChannel,
    category: NotificationCategory
  ): Promise<boolean>;
  clear(): void;
}

export class InMemoryCommunicationPreferenceRepository implements ICommunicationPreferenceRepository {
  private preferences: Map<string, CommunicationPreferenceRecord> = createRecordStore("communication-preference.repository:preferences");

  private makeKey(tenantId: string, partyId: string, channel: NotificationChannel, category: NotificationCategory): string {
    return `${tenantId}:${partyId}:${channel}:${category}`;
  }

  async findByPartyAndChannel(
    tenantId: string,
    partyId: string,
    channel: NotificationChannel,
    category: NotificationCategory
  ): Promise<CommunicationPreferenceRecord | null> {
    const key = this.makeKey(tenantId, partyId, channel, category);
    const p = this.preferences.get(key);
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }

  async listByParty(tenantId: string, partyId: string): Promise<CommunicationPreferenceRecord[]> {
    const matches = Array.from(this.preferences.values()).filter(
      (p) => p.tenantId === tenantId && p.partyId === partyId
    );
    return matches.map((m) => JSON.parse(JSON.stringify(m)));
  }

  async save(pref: CommunicationPreferenceRecord): Promise<CommunicationPreferenceRecord> {
    const clone: CommunicationPreferenceRecord = JSON.parse(JSON.stringify(pref));
    clone.updatedAt = new Date().toISOString();
    const key = this.makeKey(clone.tenantId, clone.partyId, clone.channel, clone.category);
    this.preferences.set(key, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async isOptedIn(
    tenantId: string,
    partyId: string,
    channel: NotificationChannel,
    category: NotificationCategory
  ): Promise<boolean> {
    // Security and critical transactional notifications are non-suppressible by user preference
    if (category === "SECURITY") {
      return true;
    }
    const pref = await this.findByPartyAndChannel(tenantId, partyId, channel, category);
    if (!pref) {
      // Default: Transactional & Operational default to true; Marketing defaults to false unless opted in
      return category !== "MARKETING";
    }
    return pref.optedIn;
  }

  clear(): void {
    this.preferences.clear();
  }
}
