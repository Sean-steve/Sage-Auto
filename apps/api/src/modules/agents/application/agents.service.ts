// ============================================================================
// CAR HIRE OS — AGENTS APPLICATION SERVICE (DEV-004, DOM-001)
// Referral Partners, OTAs, Brokers & Affiliate Management
// ============================================================================

import type {
  Agent,
  CreateAgentDto,
  UpdateAgentDto,
  AgentFilterQueryDto,
} from "@carhire/types";
import {
  IAgentRepository,
  IAuditRepository,
  IOutboxRepository,
} from "@carhire/database";
import { AgentNotFoundError } from "../domain/errors/agent.errors";

export class AgentsService {
  constructor(
    private readonly agentRepository: IAgentRepository,
    private readonly auditRepository: IAuditRepository,
    private readonly outboxRepository: IOutboxRepository
  ) {}

  async createAgent(
    tenantId: string,
    dto: CreateAgentDto,
    actorId: string
  ): Promise<Agent> {
    const created = await this.agentRepository.create({
      tenantId,
      name: dto.name,
      agencyName: dto.agencyName,
      email: dto.email,
      phone: dto.phone,
      commissionType: dto.commissionType || "PERCENTAGE",
      commissionRatePercent: dto.commissionRatePercent ?? 10.0,
      fixedCommissionAmount: dto.fixedCommissionAmount,
      payoutBank: dto.payoutBank,
      payoutAccountNumber: dto.payoutAccountNumber,
      payoutMpesaNumber: dto.payoutMpesaNumber,
      status: "ACTIVE",
      notes: dto.notes,
    });

    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "agent.created",
      resourceType: "Agent",
      resourceId: created.id,
      metadata: {
        agentNumber: created.agentNumber,
        name: created.name,
        agencyName: created.agencyName,
      },
    });

    await this.outboxRepository.publish({
      tenantId,
      eventType: "agent.created",
      aggregateType: "Agent",
      aggregateId: created.id,
      payload: {
        agent: created,
        createdBy: actorId,
      },
    });

    return created;
  }

  async updateAgent(
    id: string,
    tenantId: string,
    dto: UpdateAgentDto,
    actorId: string
  ): Promise<Agent> {
    const existing = await this.agentRepository.findById(id, tenantId);
    if (!existing) {
      throw new AgentNotFoundError(id);
    }

    const updated = await this.agentRepository.update(
      id,
      tenantId,
      {
        name: dto.name,
        agencyName: dto.agencyName,
        email: dto.email,
        phone: dto.phone,
        commissionType: dto.commissionType,
        commissionRatePercent: dto.commissionRatePercent,
        fixedCommissionAmount: dto.fixedCommissionAmount,
        payoutBank: dto.payoutBank,
        payoutAccountNumber: dto.payoutAccountNumber,
        payoutMpesaNumber: dto.payoutMpesaNumber,
        status: dto.status,
        notes: dto.notes,
      },
      dto.expectedVersion
    );

    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "agent.updated",
      resourceType: "Agent",
      resourceId: id,
      metadata: { updatedFields: Object.keys(dto) },
    });

    return updated;
  }

  async getAgent(id: string, tenantId: string): Promise<Agent> {
    const agent = await this.agentRepository.findById(id, tenantId);
    if (!agent) {
      throw new AgentNotFoundError(id);
    }
    return agent;
  }

  async listAgents(
    tenantId: string,
    query?: AgentFilterQueryDto
  ): Promise<{ agents: Agent[]; total: number }> {
    return this.agentRepository.findAll(tenantId, query);
  }

  async recordReferral(
    id: string,
    tenantId: string,
    bookingAmount: number,
    actorId: string
  ): Promise<Agent> {
    const existing = await this.agentRepository.findById(id, tenantId);
    if (!existing) {
      throw new AgentNotFoundError(id);
    }

    let commission = 0;
    if (existing.commissionType === "PERCENTAGE") {
      commission = (bookingAmount * (existing.commissionRatePercent || 0)) / 100;
    } else if (existing.commissionType === "FIXED") {
      commission = existing.fixedCommissionAmount || 0;
    }

    const updated = await this.agentRepository.update(
      id,
      tenantId,
      {
        totalReferralsCount: (existing.totalReferralsCount || 0) + 1,
        totalCommissionEarned: (existing.totalCommissionEarned || 0) + commission,
      },
      existing.version
    );

    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "agent.referral_recorded",
      resourceType: "Agent",
      resourceId: id,
      metadata: { bookingAmount, commissionEarned: commission },
    });

    return updated;
  }
}
