// ============================================================================
// CAR HIRE OS — AGENTS MODULE (DEV-004, DOM-001, DOM-003)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  AgentRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { AgentsService } from "./application/agents.service";
import { createAgentsController } from "./presentation/agents.controller";

export class AgentsModule {
  public readonly agentsService: AgentsService;
  public readonly router: Router;

  constructor(
    permissionGuard: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ) {
    const agentRepo = new AgentRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.agentsService = new AgentsService(
      agentRepo,
      auditRepo,
      outboxRepo
    );

    this.router = createAgentsController(this.agentsService, permissionGuard);
  }
}
