// ============================================================================
// CAR HIRE OS — AUTHORIZATION DOMAIN EVENTS (DEV-005, DEV-010)
// Domain event contracts for transactional outbox persistence and auditing.
// ============================================================================

export interface RoleCreatedEvent {
  eventType: "ROLE_CREATED";
  tenantId: string;
  roleId: string;
  roleName: string;
  isSystem: boolean;
  permissions: string[];
  actorId: string;
  timestamp: string;
}

export interface RoleUpdatedEvent {
  eventType: "ROLE_UPDATED";
  tenantId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  actorId: string;
  timestamp: string;
}

export interface RoleDeletedEvent {
  eventType: "ROLE_DELETED";
  tenantId: string;
  roleId: string;
  actorId: string;
  timestamp: string;
}

export interface RoleAssignedEvent {
  eventType: "ROLE_ASSIGNED";
  tenantId: string;
  membershipId: string;
  roleId: string;
  actorId: string;
  timestamp: string;
}

export interface RoleRemovedEvent {
  eventType: "ROLE_REMOVED";
  tenantId: string;
  membershipId: string;
  roleId: string;
  actorId: string;
  timestamp: string;
}

export interface SupportSessionStartedEvent {
  eventType: "SUPPORT_SESSION_STARTED";
  sessionId: string;
  platformUserId: string;
  targetTenantId: string;
  reason: string;
  expiresAt: string;
  timestamp: string;
}

export interface SupportSessionEndedEvent {
  eventType: "SUPPORT_SESSION_ENDED";
  sessionId: string;
  platformUserId: string;
  targetTenantId: string;
  endedBy: string;
  timestamp: string;
}
