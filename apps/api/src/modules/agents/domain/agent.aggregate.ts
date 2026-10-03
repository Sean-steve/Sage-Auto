// ============================================================================
// CAR HIRE OS — AGENT AGGREGATE ROOT (DOM-001, DOM-003)
// Referral Partners, OTAs, Brokers & Affiliate Commission Invariants
// ============================================================================

import type { Agent, AgentStatus } from "@carhire/types";
import { AgentInvalidStatusTransitionError } from "./errors/agent.errors";

export class AgentAggregate {
  public static validateStatusTransition(
    current: AgentStatus,
    next: AgentStatus,
    reason?: string
  ): void {
    if (current === next) return;
    // Any transition between ACTIVE, SUSPENDED, INACTIVE
  }

  public static calculateCommission(
    agent: Agent,
    bookingSubtotal: number
  ): number {
    if (agent.status !== "ACTIVE") {
      return 0;
    }

    if (agent.commissionType === "FIXED_PER_BOOKING") {
      return agent.fixedCommissionAmount || 0;
    }

    // Default: PERCENTAGE
    const rate = agent.commissionRatePercent || 10.0;
    return (bookingSubtotal * rate) / 100;
  }
}
