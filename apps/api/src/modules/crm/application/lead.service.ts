// ============================================================================
// CAR HIRE OS — LEAD APPLICATION SERVICE (Sprint 33)
// ============================================================================

import {
  LeadRecord,
  LeadType,
  LeadStatus,
  LeadSource,
  LeadLossReason,
  LeadFilterParams,
  PublicEnquiryDto,
} from "@car-hire-os/types";
import {
  ILeadRepository,
  ICrmPipelineStageRepository,
  IOutboxRepository,
} from "@car-hire-os/database";
import { EVENT_TYPES } from "@car-hire-os/contracts";
import { CrmActivityService } from "./crm-activity.service";
import {
  LeadNotFoundError,
  LeadAlreadyConvertedError,
  LeadConversionError,
} from "../domain/crm.errors";
import { CustomersService } from "../../customers/application/customers.service";
import { CorporateAccountsService } from "../../corporate-accounts/application/corporate-accounts.service";
import { NotificationOrchestratorService } from "../../notifications/index";
import { HostResolutionService } from "../../domains/application/host-resolution.service";

export interface CreateLeadDto {
  type?: LeadType;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  taxNumber?: string;
  email: string;
  phone?: string;
  source?: LeadSource;
  sourceDetails?: string;
  assignedUserId?: string;
  estimatedValue?: number;
  currency?: string;
  confidenceScore?: number;
  pickupDate?: string;
  returnDate?: string;
  pickupLocation?: string;
  returnLocation?: string;
  preferredVehicleCategoryId?: string;
  preferredVehicleId?: string;
  marketingConsent?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateLeadDto {
  type?: LeadType;
  status?: LeadStatus;
  stageId?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  source?: LeadSource;
  sourceDetails?: string;
  assignedUserId?: string;
  estimatedValue?: number;
  currency?: string;
  confidenceScore?: number;
  pickupDate?: string;
  returnDate?: string;
  pickupLocation?: string;
  returnLocation?: string;
  preferredVehicleCategoryId?: string;
  preferredVehicleId?: string;
  lossReason?: LeadLossReason;
  lossNotes?: string;
  marketingConsent?: boolean;
  metadata?: Record<string, unknown>;
  expectedVersion?: number;
}

export interface ConvertLeadDto {
  existingCustomerId?: string;
  existingCorporateAccountId?: string;
  // If creating new customer:
  idOrPassportNumber?: string;
  licenseNumber?: string;
  licenseExpiryDate?: string;
  taxPinNumber?: string;
  // If corporate:
  registrationNumber?: string;
  billingAddress?: string;
  creditLimit?: number;
}

export class LeadService {
  constructor(
    private readonly leadRepo: ILeadRepository,
    private readonly stageRepo: ICrmPipelineStageRepository,
    private readonly activityService: CrmActivityService,
    private readonly outboxRepo?: IOutboxRepository,
    private readonly customerService?: CustomersService,
    private readonly corporateService?: CorporateAccountsService,
    private readonly notificationOrchestrator?: NotificationOrchestratorService,
    private readonly hostResolver?: HostResolutionService
  ) {}

  async createLead(
    tenantId: string,
    dto: CreateLeadDto,
    actorId: string = "system"
  ): Promise<LeadRecord> {
    // Determine initial stage
    const stages = await this.stageRepo.findMany(tenantId);
    const initialStage = stages.find((s) => s.code === "NEW_ENQUIRY") || stages[0];

    const lead = await this.leadRepo.save({
      id: "",
      tenantId,
      leadNumber: "",
      type: dto.type || (dto.companyName ? "CORPORATE" : "INDIVIDUAL"),
      status: "NEW",
      stageId: initialStage?.id,
      firstName: dto.firstName,
      lastName: dto.lastName,
      companyName: dto.companyName,
      taxNumber: dto.taxNumber,
      email: dto.email,
      phone: dto.phone,
      source: dto.source || "WEBSITE_ENQUIRY",
      sourceDetails: dto.sourceDetails,
      assignedUserId: dto.assignedUserId,
      estimatedValue: dto.estimatedValue || 0,
      currency: dto.currency || "USD",
      confidenceScore: dto.confidenceScore ?? 50,
      pickupDate: dto.pickupDate,
      returnDate: dto.returnDate,
      pickupLocation: dto.pickupLocation,
      returnLocation: dto.returnLocation,
      preferredVehicleCategoryId: dto.preferredVehicleCategoryId,
      preferredVehicleId: dto.preferredVehicleId,
      marketingConsent: dto.marketingConsent ?? false,
      metadata: dto.metadata || {},
      version: 1,
      createdAt: "",
      updatedAt: "",
    });

    await this.activityService.logActivity({
      tenantId,
      entityType: "LEAD",
      entityId: lead.id,
      type: "STATUS_CHANGE",
      title: "Lead Created",
      description: `New lead created from source ${lead.source} by ${actorId}.`,
      performedBy: actorId,
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_LEAD_CREATED,
        aggregateType: "CRM_LEAD",
        aggregateId: lead.id,
        payload: {
          leadId: lead.id,
          leadNumber: lead.leadNumber,
          type: lead.type,
          email: lead.email,
          source: lead.source,
          estimatedValue: lead.estimatedValue,
          currency: lead.currency,
        },
      });
    }

    return lead;
  }

  async updateLead(
    tenantId: string,
    leadId: string,
    dto: UpdateLeadDto,
    actorId: string = "system"
  ): Promise<LeadRecord> {
    const lead = await this.leadRepo.findByTenantAndId(tenantId, leadId);
    if (!lead) {
      throw new LeadNotFoundError(leadId);
    }
    if (lead.status === "CONVERTED") {
      throw new LeadAlreadyConvertedError(leadId);
    }
    if (dto.expectedVersion && lead.version !== dto.expectedVersion) {
      throw new Error(`Concurrency conflict: expected version ${dto.expectedVersion} but found ${lead.version}`);
    }

    // Apply updates
    if (dto.type) lead.type = dto.type;
    if (dto.firstName !== undefined) lead.firstName = dto.firstName;
    if (dto.lastName !== undefined) lead.lastName = dto.lastName;
    if (dto.companyName !== undefined) lead.companyName = dto.companyName;
    if (dto.taxNumber !== undefined) lead.taxNumber = dto.taxNumber;
    if (dto.email !== undefined) lead.email = dto.email;
    if (dto.phone !== undefined) lead.phone = dto.phone;
    if (dto.source) lead.source = dto.source;
    if (dto.sourceDetails !== undefined) lead.sourceDetails = dto.sourceDetails;
    if (dto.assignedUserId !== undefined) lead.assignedUserId = dto.assignedUserId;
    if (dto.estimatedValue !== undefined) lead.estimatedValue = dto.estimatedValue;
    if (dto.currency) lead.currency = dto.currency;
    if (dto.confidenceScore !== undefined) lead.confidenceScore = dto.confidenceScore;
    if (dto.pickupDate !== undefined) lead.pickupDate = dto.pickupDate;
    if (dto.returnDate !== undefined) lead.returnDate = dto.returnDate;
    if (dto.pickupLocation !== undefined) lead.pickupLocation = dto.pickupLocation;
    if (dto.returnLocation !== undefined) lead.returnLocation = dto.returnLocation;
    if (dto.preferredVehicleCategoryId !== undefined) lead.preferredVehicleCategoryId = dto.preferredVehicleCategoryId;
    if (dto.preferredVehicleId !== undefined) lead.preferredVehicleId = dto.preferredVehicleId;
    if (dto.marketingConsent !== undefined) lead.marketingConsent = dto.marketingConsent;
    if (dto.metadata) lead.metadata = { ...lead.metadata, ...dto.metadata };

    lead.version += 1;
    const updated = await this.leadRepo.save(lead);

    await this.activityService.logActivity({
      tenantId,
      entityType: "LEAD",
      entityId: lead.id,
      type: "NOTE",
      title: "Lead Updated",
      description: `Lead details updated by ${actorId}.`,
      performedBy: actorId,
    });

    return updated;
  }

  async assignLead(
    tenantId: string,
    leadId: string,
    assignedUserId: string,
    actorId: string = "system"
  ): Promise<LeadRecord> {
    const lead = await this.leadRepo.findByTenantAndId(tenantId, leadId);
    if (!lead) {
      throw new LeadNotFoundError(leadId);
    }
    if (lead.status === "CONVERTED") {
      throw new LeadAlreadyConvertedError(leadId);
    }

    const previousAssignee = lead.assignedUserId;
    lead.assignedUserId = assignedUserId;
    lead.version += 1;
    const updated = await this.leadRepo.save(lead);

    await this.activityService.logActivity({
      tenantId,
      entityType: "LEAD",
      entityId: lead.id,
      type: "STATUS_CHANGE",
      title: "Lead Reassigned",
      description: `Lead assigned to user ${assignedUserId} (previous: ${previousAssignee || "unassigned"}) by ${actorId}.`,
      performedBy: actorId,
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_LEAD_ASSIGNED,
        aggregateType: "CRM_LEAD",
        aggregateId: lead.id,
        payload: {
          leadId: lead.id,
          assignedUserId,
          previousAssignee,
        },
      });
    }

    return updated;
  }

  async changeStage(
    tenantId: string,
    leadId: string,
    stageId: string,
    actorId: string = "system"
  ): Promise<LeadRecord> {
    const lead = await this.leadRepo.findByTenantAndId(tenantId, leadId);
    if (!lead) {
      throw new LeadNotFoundError(leadId);
    }
    if (lead.status === "CONVERTED") {
      throw new LeadAlreadyConvertedError(leadId);
    }

    const stage = await this.stageRepo.findById(stageId);
    if (!stage || stage.tenantId !== tenantId) {
      throw new Error(`Pipeline stage not found: ${stageId}`);
    }

    const previousStageId = lead.stageId;
    lead.stageId = stageId;

    // Automatically synchronize status based on stage
    if (stage.isWonStage) {
      lead.status = "CONVERTED";
      lead.convertedAt = new Date().toISOString();
    } else if (stage.isLostStage) {
      lead.status = "LOST";
    } else if (stage.code === "CONTACTED") {
      lead.status = "CONTACTED";
    } else if (stage.code === "QUALIFIED") {
      lead.status = "QUALIFIED";
    } else if (stage.code === "QUOTE_SENT") {
      lead.status = "PROPOSAL_SENT";
    } else if (stage.code === "NEGOTIATING") {
      lead.status = "NEGOTIATING";
    }

    lead.version += 1;
    const updated = await this.leadRepo.save(lead);

    await this.activityService.logActivity({
      tenantId,
      entityType: "LEAD",
      entityId: lead.id,
      type: "STAGE_CHANGE",
      title: "Pipeline Stage Changed",
      description: `Lead moved to stage ${stage.name} (${stage.code}) by ${actorId}.`,
      performedBy: actorId,
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_LEAD_STAGE_CHANGED,
        aggregateType: "CRM_LEAD",
        aggregateId: lead.id,
        payload: {
          leadId: lead.id,
          stageId,
          stageName: stage.name,
          previousStageId,
          status: lead.status,
        },
      });
    }

    return updated;
  }

  async qualifyLead(
    tenantId: string,
    leadId: string,
    actorId: string = "system"
  ): Promise<LeadRecord> {
    const lead = await this.leadRepo.findByTenantAndId(tenantId, leadId);
    if (!lead) {
      throw new LeadNotFoundError(leadId);
    }
    if (lead.status === "CONVERTED") {
      throw new LeadAlreadyConvertedError(leadId);
    }

    lead.status = "QUALIFIED";
    const stages = await this.stageRepo.findMany(tenantId);
    const qualifiedStage = stages.find((s) => s.code === "QUALIFIED");
    if (qualifiedStage) {
      lead.stageId = qualifiedStage.id;
    }
    lead.version += 1;
    const updated = await this.leadRepo.save(lead);

    await this.activityService.logActivity({
      tenantId,
      entityType: "LEAD",
      entityId: lead.id,
      type: "STATUS_CHANGE",
      title: "Lead Qualified",
      description: `Lead requirements verified and marked QUALIFIED by ${actorId}.`,
      performedBy: actorId,
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_LEAD_QUALIFIED,
        aggregateType: "CRM_LEAD",
        aggregateId: lead.id,
        payload: { leadId: lead.id },
      });
    }

    return updated;
  }

  async markLost(
    tenantId: string,
    leadId: string,
    lossReason: LeadLossReason,
    lossNotes?: string,
    actorId: string = "system"
  ): Promise<LeadRecord> {
    const lead = await this.leadRepo.findByTenantAndId(tenantId, leadId);
    if (!lead) {
      throw new LeadNotFoundError(leadId);
    }
    if (lead.status === "CONVERTED") {
      throw new LeadAlreadyConvertedError(leadId);
    }

    lead.status = "LOST";
    lead.lossReason = lossReason;
    lead.lossNotes = lossNotes;

    const stages = await this.stageRepo.findMany(tenantId);
    const lostStage = stages.find((s) => s.isLostStage || s.code === "LOST");
    if (lostStage) {
      lead.stageId = lostStage.id;
    }
    lead.version += 1;
    const updated = await this.leadRepo.save(lead);

    await this.activityService.logActivity({
      tenantId,
      entityType: "LEAD",
      entityId: lead.id,
      type: "STATUS_CHANGE",
      title: "Lead Marked Lost",
      description: `Reason: ${lossReason}. Notes: ${lossNotes || "None"}. Performed by ${actorId}.`,
      performedBy: actorId,
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_LEAD_LOST,
        aggregateType: "CRM_LEAD",
        aggregateId: lead.id,
        payload: {
          leadId: lead.id,
          lossReason,
          lossNotes,
        },
      });
    }

    return updated;
  }

  async disqualifyLead(
    tenantId: string,
    leadId: string,
    actorId: string = "system"
  ): Promise<LeadRecord> {
    const lead = await this.leadRepo.findByTenantAndId(tenantId, leadId);
    if (!lead) {
      throw new LeadNotFoundError(leadId);
    }

    lead.status = "DISQUALIFIED";
    lead.version += 1;
    const updated = await this.leadRepo.save(lead);

    await this.activityService.logActivity({
      tenantId,
      entityType: "LEAD",
      entityId: lead.id,
      type: "STATUS_CHANGE",
      title: "Lead Disqualified",
      description: `Lead disqualified by ${actorId}.`,
      performedBy: actorId,
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_LEAD_DISQUALIFIED,
        aggregateType: "CRM_LEAD",
        aggregateId: lead.id,
        payload: { leadId: lead.id },
      });
    }

    return updated;
  }

  async convertLead(
    tenantId: string,
    leadId: string,
    dto: ConvertLeadDto,
    actorId: string = "system"
  ): Promise<{ lead: LeadRecord; customerId?: string; corporateAccountId?: string }> {
    const lead = await this.leadRepo.findByTenantAndId(tenantId, leadId);
    if (!lead) {
      throw new LeadNotFoundError(leadId);
    }
    if (lead.status === "CONVERTED") {
      throw new LeadAlreadyConvertedError(leadId);
    }

    let customerId = dto.existingCustomerId;
    let corporateAccountId = dto.existingCorporateAccountId;

    // If converting to individual customer and no existing customer given
    if (!customerId && !corporateAccountId) {
      if (lead.type === "CORPORATE" || lead.companyName) {
        if (this.corporateService) {
          const corp = await this.corporateService.createAccount(
            tenantId,
            {
              companyName: lead.companyName || `${lead.firstName} ${lead.lastName} Enterprise`,
              registrationNumber: dto.registrationNumber || `REG-${Date.now()}`,
              taxPinNumber: dto.taxPinNumber || lead.taxNumber,
              contactPerson: `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Commercial Lead",
              email: lead.email,
              phone: lead.phone || "",
              billingAddress: dto.billingAddress,
              creditLimit: dto.creditLimit ?? 0,
            },
            actorId
          );
          corporateAccountId = corp.id;
        } else {
          corporateAccountId = `corp-${Date.now()}`;
        }
      } else {
        if (this.customerService) {
          const fullName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || lead.email.split("@")[0];
          const cust = await this.customerService.createCustomer(
            tenantId,
            {
              fullName,
              email: lead.email,
              phone: lead.phone || "",
              idOrPassportNumber: dto.idOrPassportNumber || `ID-${Date.now()}`,
              taxPinNumber: dto.taxPinNumber || lead.taxNumber,
              licenseNumber: dto.licenseNumber || "PENDING",
              licenseExpiryDate: dto.licenseExpiryDate || new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
              customerType: "INDIVIDUAL",
            },
            actorId,
            "CRM Agent"
          );
          customerId = cust.id;
        } else {
          customerId = `cust-${Date.now()}`;
        }
      }
    }

    lead.status = "CONVERTED";
    lead.convertedCustomerId = customerId;
    lead.convertedCorporateAccountId = corporateAccountId;
    lead.convertedAt = new Date().toISOString();

    const stages = await this.stageRepo.findMany(tenantId);
    const wonStage = stages.find((s) => s.isWonStage || s.code === "WON");
    if (wonStage) {
      lead.stageId = wonStage.id;
    }
    lead.version += 1;
    const updated = await this.leadRepo.save(lead);

    await this.activityService.logActivity({
      tenantId,
      entityType: "LEAD",
      entityId: lead.id,
      type: "CONVERSION",
      title: "Lead Converted to Commercial Account",
      description: `Converted to ${corporateAccountId ? `Corporate Account (${corporateAccountId})` : `Customer (${customerId})`} by ${actorId}.`,
      performedBy: actorId,
      metadata: { customerId, corporateAccountId },
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_LEAD_CONVERTED,
        aggregateType: "CRM_LEAD",
        aggregateId: lead.id,
        payload: {
          leadId: lead.id,
          customerId,
          corporateAccountId,
          convertedAt: lead.convertedAt,
        },
      });
    }

    return { lead: updated, customerId, corporateAccountId };
  }

  async handlePublicEnquiry(dto: PublicEnquiryDto): Promise<LeadRecord> {
    let resolvedTenantId = dto.tenantId;

    if (!resolvedTenantId && dto.tenantSlugOrHost && this.hostResolver) {
      const res = await this.hostResolver.resolve(dto.tenantSlugOrHost);
      resolvedTenantId = res.tenantId;
    }

    if (!resolvedTenantId) {
      throw new Error("Unable to determine tenant for public enquiry submission.");
    }

    const lead = await this.createLead(
      resolvedTenantId,
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        companyName: dto.companyName,
        email: dto.email,
        phone: dto.phone,
        source: dto.source || "WEBSITE_ENQUIRY",
        sourceDetails: dto.message,
        pickupDate: dto.pickupDate,
        returnDate: dto.returnDate,
        pickupLocation: dto.pickupLocation,
        returnLocation: dto.returnLocation,
        marketingConsent: dto.marketingConsent ?? true,
        metadata: {
          publicEnquiry: true,
          preferredVehicleCategory: dto.preferredVehicleCategory,
        },
      },
      "public_guest"
    );

    // If Notification Orchestrator is present, send an automated acknowledgment
    if (this.notificationOrchestrator) {
      try {
        await this.notificationOrchestrator.sendNotificationIntent({
          tenantId: resolvedTenantId,
          channel: "EMAIL",
          category: "OPERATIONAL",
          recipient: lead.email,
          recipientName: `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || lead.email,
          recipientPartyType: "CUSTOMER",
          subject: "Thank you for your inquiry — We received your request",
          body: `Hello ${lead.firstName || "Customer"},\n\nThank you for reaching out. We have received your inquiry (${lead.leadNumber}) and our reservations team will contact you shortly with vehicle options.\n\nBest regards,\nReservations Team`,
          correlationId: lead.id,
          metadata: {
            leadId: lead.id,
            leadNumber: lead.leadNumber,
          },
        });
      } catch {
        // Notification failure should not block lead creation
      }
    }

    return lead;
  }

  async getLead(tenantId: string, leadId: string): Promise<LeadRecord> {
    const lead = await this.leadRepo.findByTenantAndId(tenantId, leadId);
    if (!lead) {
      throw new LeadNotFoundError(leadId);
    }
    return lead;
  }

  async listLeads(filter: LeadFilterParams): Promise<{ items: LeadRecord[]; total: number }> {
    return this.leadRepo.findMany(filter);
  }

  async deleteLead(tenantId: string, leadId: string): Promise<boolean> {
    return this.leadRepo.delete(tenantId, leadId);
  }
}
