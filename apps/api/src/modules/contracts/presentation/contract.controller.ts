// ============================================================================
// CAR HIRE OS — CONTRACT PRESENTATION CONTROLLER (DOM-003 §17, DEV-007)
// Bounded Context: Contracts & Legal Instruments
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { ContractService, ContractActor } from "../application/contract.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import {
  GenerateContractDto,
  SignContractDto,
  SendContractDto,
  ContractListQueryDto,
} from "@carhire/types";

export function createContractController(
  contractService: ContractService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const guard = (perm: string) =>
    permissionGuard
      ? permissionGuard(perm)
      : (_req: Request, _res: Response, next: NextFunction) => next();

  const getActor = (req: Request): ContractActor => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const userId = auth?.userId || user?.id || user?.sub;
    if (!userId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    return {
      userId,
      actorType: "USER",
      name: user?.fullName || user?.name,
    };
  };

  const getTenantId = (req: Request): string => {
    const ctx = (req as any).tenantContext;
    const tenantId = ctx?.tenantId;
    if (!tenantId) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return tenantId;
  };

  // --------------------------------------------------------------------------
  // Generate Contract from Booking
  // --------------------------------------------------------------------------
  router.post(
    "/generate",
    guard(TENANT_PERMISSIONS.CONTRACT_GENERATE || "contract.generate"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto = req.body as GenerateContractDto;
        const actor = getActor(req);
        const contract = await contractService.generateContract(tenantId, dto, actor);
        res.status(201).json({ success: true, data: contract });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Sign Contract (Digital Signature)
  // --------------------------------------------------------------------------
  router.post(
    "/:id/sign",
    guard(TENANT_PERMISSIONS.CONTRACT_SIGN || "contract.sign"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const contractId = req.params.id;
        const dto = req.body as SignContractDto;
        const actor = getActor(req);
        const contract = await contractService.signContract(tenantId, contractId, dto, actor);
        res.json({ success: true, data: contract });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Send Contract to Customer
  // --------------------------------------------------------------------------
  router.post(
    "/:id/send",
    guard(TENANT_PERMISSIONS.CONTRACT_GENERATE || "contract.generate"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const contractId = req.params.id;
        const dto = req.body as SendContractDto;
        const actor = getActor(req);
        const contract = await contractService.sendContract(tenantId, contractId, dto, actor);
        res.json({ success: true, data: contract });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Amend Contract (Create New Version)
  // --------------------------------------------------------------------------
  router.post(
    "/:id/amend",
    guard(TENANT_PERMISSIONS.CONTRACT_GENERATE || "contract.generate"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const contractId = req.params.id;
        const data = req.body;
        const actor = getActor(req);
        const versionRecord = await contractService.amendContractVersion(
          tenantId,
          contractId,
          data,
          actor
        );
        res.status(201).json({ success: true, data: versionRecord });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Get Contract by ID
  // --------------------------------------------------------------------------
  router.get(
    "/:id",
    guard(TENANT_PERMISSIONS.CONTRACT_READ || "contract.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const contract = await contractService.getContractById(tenantId, req.params.id);
        res.json({ success: true, data: contract });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // List Contracts
  // --------------------------------------------------------------------------
  router.get(
    "/",
    guard(TENANT_PERMISSIONS.CONTRACT_READ || "contract.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const query: ContractListQueryDto = {
          status: req.query.status as any,
          bookingId: req.query.bookingId as string,
          customerId: req.query.customerId as string,
          vehicleId: req.query.vehicleId as string,
          search: req.query.search as string,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
          offset: req.query.offset ? Number(req.query.offset) : undefined,
        };
        const result = await contractService.listContracts(tenantId, query);
        res.json({ success: true, data: result.items, total: result.total });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
