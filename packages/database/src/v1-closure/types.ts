// ============================================================================
// CAR HIRE OS — SPRINT 47: V1 CLOSURE & STABILIZATION TYPES
// Authoritative Data Structures for Post-Launch Stabilization, Reconciliation,
// Production Stabilization Register, Residual Risks, Baselines & V1 Closure Gate
// ============================================================================

export type StabilizationCategory =
  | "DEFECT"
  | "SECURITY"
  | "FINANCIAL_INTEGRITY"
  | "PROVIDER"
  | "INFRASTRUCTURE"
  | "PERFORMANCE"
  | "OPERATIONS"
  | "CONFIGURATION"
  | "SUPPORT"
  | "DOCUMENTATION"
  | "ENHANCEMENT";

export type IssueSeverity = "P0" | "P1" | "P2" | "P3" | "P4";

export type StabilizationStatus =
  | "OPEN"
  | "MITIGATED"
  | "FIXED"
  | "VERIFIED"
  | "DEFERRED_NON_BLOCKING";

export interface ProductionStabilizationIssue {
  issueId: string;
  category: StabilizationCategory;
  severity: IssueSeverity;
  firstObserved: string;
  affectedTenantsCount: number;
  affectedTenantsCategory: string;
  affectedDomain: string;
  productionImpact: string;
  rootCause: string;
  temporaryMitigation: string;
  permanentRemediation: string;
  regressionTest: string;
  runbookOrAlertChange: string;
  owner: string;
  status: StabilizationStatus;
}

export interface PreStabilizationInventoryItem {
  id: number;
  area: string;
  status: "STABLE" | "VERIFIED" | "CLEARED" | "NORMALIZED";
  details: string;
  evidenceRef: string;
}

export interface ProductionCheckItem {
  id: number;
  checkName: string;
  category: string;
  passed: boolean;
  measurementOrDetail: string;
  governingStandard: string;
}

export interface ResidualRiskItem {
  riskId: string;
  title: string;
  domain: string;
  severity: "LOW" | "MEDIUM";
  owner: string;
  monitoringRule: string;
  mitigationStrategy: string;
  status: "ACTIVE_MITIGATED" | "ACCEPTED_NON_BLOCKING";
  reviewTrigger: string;
}

export interface TechnicalDebtItem {
  id: string;
  title: string;
  classification: "V1-CLOSED DEBT" | "V1.1 MAINTENANCE" | "V2 CANDIDATE" | "REMOVE/OBSOLETE";
  subsystem: string;
  rationale: string;
  targetMilestone: string;
}

export interface V1ClosureGate {
  gateId: string;
  requirement: string;
  evidence: string;
  status: "PASS" | "FAIL" | "BLOCKED" | "NOT_APPLICABLE";
  owner: string;
  residualRisk: string;
}

export interface V1ProductionSnapshot {
  releaseId: string;
  gitCommitSha: string;
  apiArtifactDigest: string;
  workerArtifactDigest: string;
  tenantAdminDigest: string;
  platformAdminDigest: string;
  publicWebDigest: string;
  migrationBundleDigest: string;
  uptimeSinceLaunch: string;
  openP0Count: number;
  openP1Count: number;
  reconciliationStatus: "BALANCED_100_PERCENT";
  v1ClosureVerdict: "SPRINT 47 PASS — V1 CLOSED";
}
