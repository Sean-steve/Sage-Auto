// ============================================================================
// CAR HIRE OS — CREDIT NOTE STATE MACHINE (Sprint 19: DOM-003 §28-34)
// Enforces Credit Note Issuance & Invariant Boundaries
// ============================================================================

import type { CreditNoteStatus } from "@carhire/types";
import { CreditNoteInvalidStateTransitionError } from "@carhire/database";

export class CreditNoteStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<CreditNoteStatus, CreditNoteStatus[]> = {
    DRAFT: ["ISSUED", "VOIDED"],
    ISSUED: ["VOIDED"],
    VOIDED: [], // Terminal state
  };

  static validateTransition(from: CreditNoteStatus, to: CreditNoteStatus): void {
    if (from === to) return;

    const allowed = this.ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new CreditNoteInvalidStateTransitionError(
        from,
        to,
        `Credit note lifecycle does not permit transition from '${from}' to '${to}'.`
      );
    }
  }
}
