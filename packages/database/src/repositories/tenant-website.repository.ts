import { createRecordStore } from "../record-store";
import {
  TenantWebsiteRecord,
  WebPageRecord,
  WebsiteDomainRecord,
  WebsiteSnapshotRecord,
  WebsiteStatus,
} from "@car-hire-os/types";

export interface ITenantWebsiteRepository {
  findById(id: string): Promise<TenantWebsiteRecord | null>;
  findByTenantId(tenantId: string): Promise<TenantWebsiteRecord | null>;
  findBySubdomain(subdomain: string): Promise<TenantWebsiteRecord | null>;
  save(website: TenantWebsiteRecord): Promise<TenantWebsiteRecord>;
  delete(id: string): Promise<boolean>;
  listAll(): Promise<TenantWebsiteRecord[]>;
}

export class InMemoryTenantWebsiteRepository implements ITenantWebsiteRepository {
  private websites: Map<string, TenantWebsiteRecord> = createRecordStore("tenant-website.repository:websites");

  async findById(id: string): Promise<TenantWebsiteRecord | null> {
    const site = this.websites.get(id);
    return site ? JSON.parse(JSON.stringify(site)) : null;
  }

  async findByTenantId(tenantId: string): Promise<TenantWebsiteRecord | null> {
    for (const site of this.websites.values()) {
      if (site.tenantId === tenantId) {
        return JSON.parse(JSON.stringify(site));
      }
    }
    return null;
  }

  async findBySubdomain(subdomain: string): Promise<TenantWebsiteRecord | null> {
    const normalized = subdomain.toLowerCase().trim();
    for (const site of this.websites.values()) {
      if (site.subdomain.toLowerCase() === normalized) {
        return JSON.parse(JSON.stringify(site));
      }
    }
    return null;
  }

  async save(website: TenantWebsiteRecord): Promise<TenantWebsiteRecord> {
    const clone: TenantWebsiteRecord = JSON.parse(JSON.stringify(website));
    clone.updatedAt = new Date().toISOString();
    if (!clone.createdAt) {
      clone.createdAt = clone.updatedAt;
    }
    this.websites.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async delete(id: string): Promise<boolean> {
    return this.websites.delete(id);
  }

  async listAll(): Promise<TenantWebsiteRecord[]> {
    return Array.from(this.websites.values()).map((s) =>
      JSON.parse(JSON.stringify(s))
    );
  }

  clear(): void {
    this.websites.clear();
  }
}

export interface IWebPageRepository {
  findById(id: string): Promise<WebPageRecord | null>;
  findBySlug(websiteId: string, slug: string): Promise<WebPageRecord | null>;
  listByWebsiteId(websiteId: string): Promise<WebPageRecord[]>;
  save(page: WebPageRecord): Promise<WebPageRecord>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryWebPageRepository implements IWebPageRepository {
  private pages: Map<string, WebPageRecord> = createRecordStore("tenant-website.repository:pages");

  async findById(id: string): Promise<WebPageRecord | null> {
    const p = this.pages.get(id);
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }

  async findBySlug(websiteId: string, slug: string): Promise<WebPageRecord | null> {
    const normalizedSlug = slug.startsWith("/") ? slug : `/${slug}`;
    for (const page of this.pages.values()) {
      if (page.websiteId === websiteId && page.slug === normalizedSlug) {
        return JSON.parse(JSON.stringify(page));
      }
    }
    return null;
  }

  async listByWebsiteId(websiteId: string): Promise<WebPageRecord[]> {
    return Array.from(this.pages.values())
      .filter((p) => p.websiteId === websiteId)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((p) => JSON.parse(JSON.stringify(p)));
  }

  async save(page: WebPageRecord): Promise<WebPageRecord> {
    const clone: WebPageRecord = JSON.parse(JSON.stringify(page));
    clone.updatedAt = new Date().toISOString();
    if (!clone.createdAt) {
      clone.createdAt = clone.updatedAt;
    }
    this.pages.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async delete(id: string): Promise<boolean> {
    return this.pages.delete(id);
  }

  clear(): void {
    this.pages.clear();
  }
}

export interface IWebsiteDomainRepository {
  findById(id: string): Promise<WebsiteDomainRecord | null>;
  findByHostname(hostname: string): Promise<WebsiteDomainRecord | null>;
  listByWebsiteId(websiteId: string): Promise<WebsiteDomainRecord[]>;
  listByTenantId(tenantId: string): Promise<WebsiteDomainRecord[]>;
  listAll(): Promise<WebsiteDomainRecord[]>;
  save(domain: WebsiteDomainRecord): Promise<WebsiteDomainRecord>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryWebsiteDomainRepository implements IWebsiteDomainRepository {
  private domains: Map<string, WebsiteDomainRecord> = createRecordStore("tenant-website.repository:domains");

  async findById(id: string): Promise<WebsiteDomainRecord | null> {
    const d = this.domains.get(id);
    return d ? JSON.parse(JSON.stringify(d)) : null;
  }

  async findByHostname(hostname: string): Promise<WebsiteDomainRecord | null> {
    const normalized = hostname.toLowerCase().trim();
    for (const domain of this.domains.values()) {
      if (domain.hostname.toLowerCase() === normalized) {
        return JSON.parse(JSON.stringify(domain));
      }
    }
    return null;
  }

  async listByWebsiteId(websiteId: string): Promise<WebsiteDomainRecord[]> {
    return Array.from(this.domains.values())
      .filter((d) => d.websiteId === websiteId)
      .map((d) => JSON.parse(JSON.stringify(d)));
  }

  async listByTenantId(tenantId: string): Promise<WebsiteDomainRecord[]> {
    return Array.from(this.domains.values())
      .filter((d) => d.tenantId === tenantId)
      .map((d) => JSON.parse(JSON.stringify(d)));
  }

  async listAll(): Promise<WebsiteDomainRecord[]> {
    return Array.from(this.domains.values()).map((d) =>
      JSON.parse(JSON.stringify(d))
    );
  }

  async save(domain: WebsiteDomainRecord): Promise<WebsiteDomainRecord> {
    const clone: WebsiteDomainRecord = JSON.parse(JSON.stringify(domain));
    clone.updatedAt = new Date().toISOString();
    if (!clone.createdAt) {
      clone.createdAt = clone.updatedAt;
    }
    this.domains.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async delete(id: string): Promise<boolean> {
    return this.domains.delete(id);
  }

  clear(): void {
    this.domains.clear();
  }
}

export interface IWebsiteSnapshotRepository {
  findById(id: string): Promise<WebsiteSnapshotRecord | null>;
  findByVersion(websiteId: string, versionNumber: number): Promise<WebsiteSnapshotRecord | null>;
  listByWebsiteId(websiteId: string): Promise<WebsiteSnapshotRecord[]>;
  save(snapshot: WebsiteSnapshotRecord): Promise<WebsiteSnapshotRecord>;
}

export class InMemoryWebsiteSnapshotRepository implements IWebsiteSnapshotRepository {
  private snapshots: Map<string, WebsiteSnapshotRecord> = createRecordStore("tenant-website.repository:snapshots");

  async findById(id: string): Promise<WebsiteSnapshotRecord | null> {
    const s = this.snapshots.get(id);
    return s ? JSON.parse(JSON.stringify(s)) : null;
  }

  async findByVersion(websiteId: string, versionNumber: number): Promise<WebsiteSnapshotRecord | null> {
    for (const snap of this.snapshots.values()) {
      if (snap.websiteId === websiteId && snap.versionNumber === versionNumber) {
        return JSON.parse(JSON.stringify(snap));
      }
    }
    return null;
  }

  async listByWebsiteId(websiteId: string): Promise<WebsiteSnapshotRecord[]> {
    return Array.from(this.snapshots.values())
      .filter((s) => s.websiteId === websiteId)
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map((s) => JSON.parse(JSON.stringify(s)));
  }

  async save(snapshot: WebsiteSnapshotRecord): Promise<WebsiteSnapshotRecord> {
    const clone: WebsiteSnapshotRecord = JSON.parse(JSON.stringify(snapshot));
    this.snapshots.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  clear(): void {
    this.snapshots.clear();
  }
}
