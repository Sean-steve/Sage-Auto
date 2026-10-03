import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — FILE RESOURCE LINK REPOSITORY (ARCH-001, DOM-001)
// Polymorphic binding between secure files and business domain aggregates
// ============================================================================

import { FileResourceLink, FileResourceType, FileResourceRole } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateFileResourceLinkInput {
  id?: string;
  tenantId: string;
  fileId: string;
  resourceType: FileResourceType;
  resourceId: string;
  role: FileResourceRole;
}

export interface IFileResourceLinkRepository {
  create(input: CreateFileResourceLinkInput, tx?: TransactionContext): Promise<FileResourceLink>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<FileResourceLink | null>;
  listByResource(
    tenantId: string,
    resourceType: FileResourceType,
    resourceId: string,
    role?: FileResourceRole,
    tx?: TransactionContext
  ): Promise<FileResourceLink[]>;
  listByFileId(fileId: string, tenantId?: string, tx?: TransactionContext): Promise<FileResourceLink[]>;
  delete(id: string, tenantId?: string, tx?: TransactionContext): Promise<boolean>;
  deleteByFileAndResource(
    fileId: string,
    resourceType: FileResourceType,
    resourceId: string,
    role?: FileResourceRole,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<boolean>;
}

export class FileResourceLinkRepository implements IFileResourceLinkRepository {
  private static store = createRecordStore<string, FileResourceLink>("file-resource-link.repository:store");

  public static clear(): void {
    FileResourceLinkRepository.store.clear();
  }

  async create(input: CreateFileResourceLinkInput, _tx?: TransactionContext): Promise<FileResourceLink> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const link: FileResourceLink = {
      id,
      tenantId: input.tenantId,
      fileId: input.fileId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      role: input.role,
      createdAt: now,
    };

    FileResourceLinkRepository.store.set(id, link);
    return { ...link };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<FileResourceLink | null> {
    const link = FileResourceLinkRepository.store.get(id);
    if (!link) return null;

    if (tenantId && link.tenantId !== tenantId) {
      throw new CrossTenantViolationError(link.tenantId, tenantId);
    }

    return { ...link };
  }

  async listByResource(
    tenantId: string,
    resourceType: FileResourceType,
    resourceId: string,
    role?: FileResourceRole,
    _tx?: TransactionContext
  ): Promise<FileResourceLink[]> {
    return Array.from(FileResourceLinkRepository.store.values())
      .filter((l) => {
        if (l.tenantId !== tenantId) return false;
        if (l.resourceType !== resourceType || l.resourceId !== resourceId) return false;
        if (role && l.role !== role) return false;
        return true;
      })
      .map((l) => ({ ...l }));
  }

  async listByFileId(fileId: string, tenantId?: string, _tx?: TransactionContext): Promise<FileResourceLink[]> {
    const links: FileResourceLink[] = [];
    for (const link of FileResourceLinkRepository.store.values()) {
      if (link.fileId === fileId) {
        if (tenantId && link.tenantId !== tenantId) {
          throw new CrossTenantViolationError(link.tenantId, tenantId);
        }
        links.push({ ...link });
      }
    }
    return links;
  }

  async delete(id: string, tenantId?: string, _tx?: TransactionContext): Promise<boolean> {
    const link = await this.findById(id, tenantId);
    if (!link) return false;
    return FileResourceLinkRepository.store.delete(id);
  }

  async deleteByFileAndResource(
    fileId: string,
    resourceType: FileResourceType,
    resourceId: string,
    role?: FileResourceRole,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<boolean> {
    let deleted = false;
    for (const [id, link] of FileResourceLinkRepository.store.entries()) {
      if (
        link.fileId === fileId &&
        link.resourceType === resourceType &&
        link.resourceId === resourceId &&
        (!role || link.role === role)
      ) {
        if (tenantId && link.tenantId !== tenantId) {
          throw new CrossTenantViolationError(link.tenantId, tenantId);
        }
        FileResourceLinkRepository.store.delete(id);
        deleted = true;
      }
    }
    return deleted;
  }
}
