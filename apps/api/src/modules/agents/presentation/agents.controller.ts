// ============================================================================
// CAR HIRE OS — AGENTS CONTROLLER (DEV-004, DOM-001, SEC-005)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { AgentsService } from "../application/agents.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";

export function createAgentsController(
  agentsService: AgentsService,
  permissionGuard: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();

  const getTenantId = (req: Request): string => {
    const tid = (req as any).tenantContext?.tenantId || (req as any).tenantId;
    if (!tid) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return tid;
  };

  const getActorId = (req: Request): string => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const actorId = auth?.userId || user?.id || user?.sub;
    if (!actorId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    return actorId;
  };

  // List Agents
  router.get(
    "/",
    permissionGuard(TENANT_PERMISSIONS.AGENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const result = await agentsService.listAgents(tenantId, req.query);
        res.json({ success: true, data: result.agents, total: result.total });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get Agent by ID
  router.get(
    "/:id",
    permissionGuard(TENANT_PERMISSIONS.AGENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const agent = await agentsService.getAgent(req.params.id, tenantId);
        res.json({ success: true, data: agent });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create Agent
  router.post(
    "/",
    permissionGuard(TENANT_PERMISSIONS.AGENT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const agent = await agentsService.createAgent(tenantId, req.body, actorId);
        res.status(201).json({ success: true, data: agent });
      } catch (err) {
        next(err);
      }
    }
  );

  // Update Agent
  router.put(
    "/:id",
    permissionGuard(TENANT_PERMISSIONS.AGENT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const updated = await agentsService.updateAgent(req.params.id, tenantId, req.body, actorId);
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
