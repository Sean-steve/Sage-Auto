import { createRecordStore, nextRecordNumber } from "../record-store";
// ============================================================================
// CAR HIRE OS — AGENT PERSISTENCE REPOSITORY (DEV-004, DOM-001, DOM-003)
// Referral Partners, OTAs, Brokers & Affiliate Management
// ============================================================================
import type { Agent, AgentFilterQueryDto } from "@carhire/types";
import { RecordNotFoundError, ConcurrencyConflictError, CrossTenantViolationError, } from "../errors";
import { TransactionContext } from "../transaction-manager";
export interface IAgentRepository {
    findById(id: string, tenantId: string, tx?: TransactionContext): Promise<Agent | null>;
    findByEmail(email: string, tenantId: string, tx?: TransactionContext): Promise<Agent | null>;
    findByAgentNumber(agentNumber: string, tenantId: string, tx?: TransactionContext): Promise<Agent | null>;
    findAll(tenantId: string, filter?: AgentFilterQueryDto, tx?: TransactionContext): Promise<{
        agents: Agent[];
        total: number;
    }>;
    create(data: Omit<Agent, "id" | "agentNumber" | "totalReferralsCount" | "totalCommissionEarned" | "version" | "createdAt" | "updatedAt"> & {
        agentNumber?: string;
    }, tx?: TransactionContext): Promise<Agent>;
    update(id: string, tenantId: string, data: Partial<Agent>, expectedVersion?: number, tx?: TransactionContext): Promise<Agent>;
    delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}
export class AgentRepository implements IAgentRepository {
    private static agentStore = createRecordStore<string, Agent>("agent.repository:agentStore");
    static async clear(): Promise<void> {
        (await AgentRepository.agentStore.clear());
    }
    static async seed(agents: Agent[]): Promise<void> {
        for (const a of agents) {
            (await AgentRepository.agentStore.set(a.id, { ...a }));
        }
    }
    async findById(id: string, tenantId: string): Promise<Agent | null> {
        const agent = (await AgentRepository.agentStore.get(id));
        if (!agent)
            return null;
        if (agent.tenantId !== tenantId) {
            throw new CrossTenantViolationError(agent.tenantId, tenantId);
        }
        return { ...agent };
    }
    async findByEmail(email: string, tenantId: string): Promise<Agent | null> {
        const normalized = email.trim().toLowerCase();
        for (const agent of (await AgentRepository.agentStore.values())) {
            if (agent.tenantId === tenantId && agent.email.trim().toLowerCase() === normalized) {
                return { ...agent };
            }
        }
        return null;
    }
    async findByAgentNumber(agentNumber: string, tenantId: string): Promise<Agent | null> {
        const normalized = agentNumber.trim().toUpperCase();
        for (const agent of (await AgentRepository.agentStore.values())) {
            if (agent.tenantId === tenantId && agent.agentNumber.trim().toUpperCase() === normalized) {
                return { ...agent };
            }
        }
        return null;
    }
    async findAll(tenantId: string, filter?: AgentFilterQueryDto): Promise<{
        agents: Agent[];
        total: number;
    }> {
        let results = Array.from((await AgentRepository.agentStore.values())).filter((a) => a.tenantId === tenantId);
        if (filter) {
            if (filter.status) {
                results = results.filter((a) => a.status === filter.status);
            }
            if (filter.search) {
                const q = filter.search.toLowerCase();
                results = results.filter((a) => a.name.toLowerCase().includes(q) ||
                    a.agentNumber.toLowerCase().includes(q) ||
                    (a.agencyName && a.agencyName.toLowerCase().includes(q)) ||
                    a.email.toLowerCase().includes(q) ||
                    a.phone.includes(q));
            }
        }
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const total = results.length;
        const page = filter?.page || 1;
        const limit = filter?.limit || 50;
        const startIndex = (page - 1) * limit;
        const paginated = results.slice(startIndex, startIndex + limit);
        return { agents: paginated.map((a) => ({ ...a })), total };
    }
    async create(data: Omit<Agent, "id" | "agentNumber" | "totalReferralsCount" | "totalCommissionEarned" | "version" | "createdAt" | "updatedAt"> & {
        agentNumber?: string;
    }): Promise<Agent> {
        const now = new Date().toISOString();
        const agentNumber = data.agentNumber || (await nextRecordNumber("agent.repository:agentStore", "agentNumber", `AGT-${new Date().getFullYear()}-`, 10));
        const newAgent: Agent = {
            ...data,
            id: crypto.randomUUID(),
            agentNumber,
            commissionType: data.commissionType || "PERCENTAGE",
            commissionRatePercent: data.commissionRatePercent ?? 10.0,
            status: data.status || "ACTIVE",
            totalReferralsCount: 0,
            totalCommissionEarned: 0,
            version: 1,
            createdAt: now,
            updatedAt: now,
        };
        (await AgentRepository.agentStore.set(newAgent.id, newAgent));
        return { ...newAgent };
    }
    async update(id: string, tenantId: string, data: Partial<Agent>, expectedVersion?: number): Promise<Agent> {
        const agent = (await AgentRepository.agentStore.get(id));
        if (!agent) {
            throw new RecordNotFoundError("Agent", id);
        }
        if (agent.tenantId !== tenantId) {
            throw new CrossTenantViolationError(agent.tenantId, tenantId);
        }
        if (expectedVersion !== undefined && agent.version !== expectedVersion) {
            throw new ConcurrencyConflictError(`Agent ${id} version mismatch: expected ${expectedVersion}, actual ${agent.version}`);
        }
        const updatedAgent: Agent = {
            ...agent,
            ...data,
            id: agent.id,
            tenantId: agent.tenantId,
            agentNumber: agent.agentNumber,
            version: agent.version + 1,
            updatedAt: new Date().toISOString(),
        };
        (await AgentRepository.agentStore.set(id, updatedAgent));
        return { ...updatedAgent };
    }
    async delete(id: string, tenantId: string): Promise<void> {
        const agent = (await AgentRepository.agentStore.get(id));
        if (!agent)
            return;
        if (agent.tenantId !== tenantId) {
            throw new CrossTenantViolationError(agent.tenantId, tenantId);
        }
        (await AgentRepository.agentStore.delete(id));
    }
}
