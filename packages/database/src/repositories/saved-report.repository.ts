import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — SAVED REPORT REPOSITORY (Sprint 34: DOM-003, DEV-009)
// Multi-tenant persistence for custom report templates & saved filters
// ============================================================================
import type { SavedReport } from "@carhire/types";
import { SavedReportNotFoundError, CrossTenantViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";
export interface ISavedReportRepository {
    create(data: Omit<SavedReport, "id" | "createdAt" | "updatedAt">, tx?: TransactionContext): Promise<SavedReport>;
    findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<SavedReport | null>;
    update(id: string, tenantId: string, data: Partial<Omit<SavedReport, "id" | "tenantId" | "createdAt">>, tx?: TransactionContext): Promise<SavedReport>;
    delete(id: string, tenantId: string, tx?: TransactionContext): Promise<boolean>;
    listByTenant(tenantId: string, tx?: TransactionContext): Promise<SavedReport[]>;
}
export class SavedReportRepository implements ISavedReportRepository {
    private static store = createRecordStore<string, SavedReport>("saved-report.repository:store");
    static async clear(): Promise<void> {
        (await SavedReportRepository.store.clear());
    }
    async create(data: Omit<SavedReport, "id" | "createdAt" | "updatedAt">, _tx?: TransactionContext): Promise<SavedReport> {
        const id = `srep-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        const savedReport: SavedReport = {
            ...data,
            id,
            createdAt: now,
            updatedAt: now,
        };
        (await SavedReportRepository.store.set(id, savedReport));
        return { ...savedReport };
    }
    async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<SavedReport | null> {
        const report = (await SavedReportRepository.store.get(id));
        if (!report)
            return null;
        if (tenantId && report.tenantId !== tenantId) {
            throw new CrossTenantViolationError(report.tenantId, tenantId);
        }
        return { ...report };
    }
    async update(id: string, tenantId: string, data: Partial<Omit<SavedReport, "id" | "tenantId" | "createdAt">>, _tx?: TransactionContext): Promise<SavedReport> {
        const existing = await this.findById(id, tenantId);
        if (!existing) {
            throw new SavedReportNotFoundError(id, tenantId);
        }
        const updated: SavedReport = {
            ...existing,
            ...data,
            updatedAt: new Date().toISOString(),
        };
        (await SavedReportRepository.store.set(id, updated));
        return { ...updated };
    }
    async delete(id: string, tenantId: string, _tx?: TransactionContext): Promise<boolean> {
        const existing = await this.findById(id, tenantId);
        if (!existing) {
            throw new SavedReportNotFoundError(id, tenantId);
        }
        return (await SavedReportRepository.store.delete(id));
    }
    async listByTenant(tenantId: string, _tx?: TransactionContext): Promise<SavedReport[]> {
        return Array.from((await SavedReportRepository.store.values()))
            .filter((r) => r.tenantId === tenantId)
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .map((r) => ({ ...r }));
    }
}
