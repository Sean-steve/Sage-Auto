// ============================================================================
// CAR HIRE OS — AGENT DOMAIN ERRORS (DEV-004, DOM-001, DOM-003)
// ============================================================================

export class AgentNotFoundError extends Error {
  constructor(id: string) {
    super(`Agent not found: ${id}`);
    this.name = "AgentNotFoundError";
  }
}

export class AgentInvalidStatusTransitionError extends Error {
  constructor(from: string, to: string, reason?: string) {
    super(`Invalid agent status transition from ${from} to ${to}.${reason ? ` Reason: ${reason}` : ""}`);
    this.name = "AgentInvalidStatusTransitionError";
  }
}
