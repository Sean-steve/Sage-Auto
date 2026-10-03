// ============================================================================
// CAR HIRE OS — AUTHORIZATION MODULE PUBLIC API (DEV-005)
// ============================================================================

export * from "./domain/events/authorization.events";
export * from "./domain/policies/resource-policy.interface";
export * from "./domain/policies/domain-policies";
export * from "./application/cache/authorization-cache.service";
export * from "./application/services/authorization.service";
export * from "./application/services/role-management.service";
export * from "./application/services/platform-authorization.service";
export * from "./application/services/support-access.service";
export * from "./presentation/guards/require-permission.guard";
export * from "./presentation/guards/platform-permission.guard";
export * from "./presentation/controllers/role.controller";
export * from "./presentation/controllers/authorization.controller";
export * from "./presentation/controllers/platform-authorization.controller";
export * from "./authorization.module";
