// ============================================================================
// CAR HIRE OS — SPRINT 44: PRODUCTION READINESS & LAUNCH-GATE GOVERNANCE TYPES
// Architecture: Authoritative System Acceptance, 253-Point Readiness Register,
// Launch Blocker Audit, Residual Risk Governance & Go/No-Go Certification
// ============================================================================

export type GateCategory =
  | "ARCHITECTURE_STRUCTURE"
  | "DATA_PERSISTENCE_MIGRATIONS"
  | "MULTI_TENANCY_ISOLATION"
  | "SECURITY_ACCESS_CONTROL"
  | "FINANCIAL_INTEGRITY_LEDGER"
  | "OPERATIONAL_RELIABILITY_WORKERS"
  | "OBSERVABILITY_SRE_RUNBOOKS"
  | "BACKUP_DISASTER_RECOVERY"
  | "PERFORMANCE_CAPACITY"
  | "LAUNCH_GATE_GOVERNANCE";

export type GateStatus = "VERIFIED" | "SATISFIED" | "CONDITIONAL_PASS" | "BLOCKED" | "FAIL";

export type BlockerSeverity = "P0_CATASTROPHIC" | "P1_CRITICAL" | "P2_MAJOR" | "P3_MODERATE";

export type BlockerStatus = "RESOLVED" | "MITIGATED" | "ACCEPTED_EXCEPTION" | "OPEN";

export type RiskRAG = "GREEN" | "AMBER" | "RED";

export type GoNoGoDecision = "GO_RECOMMENDED" | "CONDITIONAL_GO" | "NO_GO";

export type StakeholderRole =
  | "PRINCIPAL_ARCHITECT"
  | "HEAD_OF_SECURITY"
  | "HEAD_OF_FINANCE"
  | "LEAD_SRE"
  | "HEAD_OF_PRODUCT"
  | "RELEASE_MANAGER";

export interface ChecklistPoint {
  id: number;
  code: string;
  category: GateCategory;
  title: string;
  description: string;
  acceptanceCriteria: string;
  verificationMethod: "AUTOMATED_TEST" | "STATIC_ANALYSIS" | "OPERATIONAL_DRILL" | "ARCHITECTURE_AUDIT";
  evidenceRef: string;
  status: GateStatus;
  verifiedAt: string;
  verifiedBy: string;
  notes?: string;
}

export interface ProductionReadinessRegisterItem {
  id: string;
  domain: string;
  category: GateCategory;
  status: GateStatus;
  testSuiteRef: string;
  invariantGuarantees: string[];
  auditDate: string;
  verifiedBy: string;
}

export interface LaunchBlocker {
  id: string;
  title: string;
  severity: BlockerSeverity;
  category: GateCategory;
  rootCause: string;
  remediation: string;
  resolvedInSprint: number;
  status: BlockerStatus;
  verifiedBy: string;
  resolvedAt: string;
}

export interface ResidualRisk {
  id: string;
  title: string;
  category: GateCategory;
  description: string;
  likelihood: "LOW" | "MEDIUM" | "HIGH";
  impact: "LOW" | "MEDIUM" | "HIGH";
  rag: RiskRAG;
  mitigationStrategy: string;
  monitoringMechanism: string;
  riskOwner: string;
  reviewDate: string;
}

export interface EvidenceArtifact {
  id: string;
  name: string;
  category: GateCategory;
  artifactType: "TEST_SUITE" | "CODE_MODULE" | "CONFIGURATION" | "RUNBOOK" | "METRIC_REPORT";
  location: string;
  checksum: string;
  verifiedDate: string;
  description: string;
}

export interface StakeholderSignoff {
  role: StakeholderRole;
  name: string;
  title: string;
  decision: "SIGN_OFF_GO" | "CONDITIONAL_SIGN_OFF" | "REJECT_NO_GO";
  signatureDate: string;
  comments: string;
}

export interface GoNoGoAssessment {
  decision: GoNoGoDecision;
  candidateRcVersion: string;
  totalChecklistPoints: number;
  verifiedCount: number;
  satisfiedCount: number;
  conditionalCount: number;
  blockedCount: number;
  failedCount: number;
  openP0Count: number;
  openP1Count: number;
  openP2Count: number;
  signoffs: StakeholderSignoff[];
  evaluatedAt: string;
  auditPassed: boolean;
  executiveSummary: string;
}
