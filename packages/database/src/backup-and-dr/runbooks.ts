// ============================================================================
// CAR HIRE OS — DISASTER RECOVERY RUNBOOKS AS CODE
// SPRINT 43: Authoritative Operational Procedures & Incident Step Sequences
// ============================================================================

export interface DrRunbook {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: "SEV1_CATASTROPHIC" | "SEV2_TENANT_DEGRADATION" | "SEV3_STORAGE_CORRUPTION";
  estimatedExecutionMinutes: number;
  prerequisites: string[];
  steps: {
    stepNumber: number;
    name: string;
    command: string;
    expectedOutcome: string;
    rollbackProcedure: string;
  }[];
}

export const DR_RUNBOOKS: DrRunbook[] = [
  {
    id: "rb-dr-001",
    code: "RB-DR-01",
    title: "Multi-Region Database Disaster Recovery & Failover",
    description:
      "Authoritative procedure for failover to secondary disaster recovery cloud region during complete primary region outage.",
    severity: "SEV1_CATASTROPHIC",
    estimatedExecutionMinutes: 12,
    prerequisites: [
      "Access to DR region KMS CMK credentials",
      "Valid immutable WORM backup in secondary bucket (Cross-Region Replication)",
      "DR VPC and PostgreSQL RDS/CloudSQL compute ready or provisionable via Terraform",
    ],
    steps: [
      {
        stepNumber: 1,
        name: "Declare SEV-1 Incident & Lock Public Ingress",
        command: "kubectl patch ingress carhire-api-ingress -p '{\"spec\":{\"rules\":[]}}'",
        expectedOutcome: "Ingress halts customer traffic with 503 Maintenance page to freeze delta window.",
        rollbackProcedure: "Re-apply standard ingress manifest if disaster declaration was in error.",
      },
      {
        stepNumber: 2,
        name: "Acquire Exclusive Advisory Lock on Secondary DB",
        command: "npm run dr:lock-engine -- --region=eu-west-1",
        expectedOutcome: "Exclusive advisory migration lock acquired on target instance.",
        rollbackProcedure: "Release lock via npm run dr:unlock-engine.",
      },
      {
        stepNumber: 3,
        name: "Restore Authoritative Database Snapshot & Stream WAL",
        command: "npm run dr:restore -- --backup=latest-replicated --target-env=DR",
        expectedOutcome: "PostgreSQL tables restored; migration checksums match running codebase.",
        rollbackProcedure: "Wipe secondary schema and re-pull snapshot.",
      },
      {
        stepNumber: 4,
        name: "Verify Double-Entry Ledger Trial Balance",
        command: "npm run dr:audit-ledger",
        expectedOutcome: "Total debits strictly equal total credits. Discrepancy is zero.",
        rollbackProcedure: "Halt restore, escalate to Chief Financial Architect.",
      },
      {
        stepNumber: 5,
        name: "Execute Financial Reconciler against Gateways",
        command: "npm run dr:reconcile-finance -- --since=backup_timestamp",
        expectedOutcome: "Stripe and M-Pesa transactions during delta ingested; zero duplicate refunds.",
        rollbackProcedure: "Review un-matched transactions in DR admin console.",
      },
      {
        stepNumber: 6,
        name: "Hydrate Redis Queues & Schedulers from PostgreSQL",
        command: "npm run dr:reconstruct-queues",
        expectedOutcome: "BullMQ queues re-seeded with pending outbox records and active cron triggers.",
        rollbackProcedure: "Flush Redis and re-run queue hydration.",
      },
      {
        stepNumber: 7,
        name: "Rebuild Derived Analytics Projections",
        command: "npm run dr:rebuild-analytics",
        expectedOutcome: "Tenant daily metrics and platform MRR movements re-aggregated from source.",
        rollbackProcedure: "Non-blocking: continue to ingress activation while job completes.",
      },
      {
        stepNumber: 8,
        name: "Reroute Route53 / Cloudflare DNS to DR Region Ingress",
        command: "aws route53 change-resource-record-sets --hosted-zone-id Z12345 --change-batch file://dr-dns.json",
        expectedOutcome: "DNS points to DR cluster; health probes respond 200 OK.",
        rollbackProcedure: "Point DNS back to primary once primary cloud provider restores region health.",
      },
    ],
  },
  {
    id: "rb-dr-002",
    code: "RB-DR-02",
    title: "Corrupted Tenant Selective Recovery & Isolation Guard",
    description:
      "Surgically restores a single tenant corrupted by accidental user deletion or application defect without impacting other tenants.",
    severity: "SEV2_TENANT_DEGRADATION",
    estimatedExecutionMinutes: 8,
    prerequisites: [
      "Target tenantId confirmed",
      "Timestamp of corruption identified",
      "Isolated DR sandbox environment available",
    ],
    steps: [
      {
        stepNumber: 1,
        name: "Place Target Tenant into Maintenance Mode",
        command: "npm run tenant:suspend -- --tenant-id=targetTenant --reason='Selective DR recovery'",
        expectedOutcome: "Tenant users receive maintenance notification; other tenants unaffected.",
        rollbackProcedure: "npm run tenant:activate -- --tenant-id=targetTenant",
      },
      {
        stepNumber: 2,
        name: "Restore Base Backup into Isolated Sandbox",
        command: "npm run dr:sandbox-restore -- --target=sandbox",
        expectedOutcome: "Full snapshot restored inside ephemeral isolated sandbox DB.",
        rollbackProcedure: "Tear down sandbox database container.",
      },
      {
        stepNumber: 3,
        name: "Extract Target Tenant Rows with Boundary Validation",
        command: "npm run dr:extract-tenant -- --tenant-id=targetTenant --output=tenant-bundle.enc",
        expectedOutcome: "Encrypted bundle containing only target tenant records; zero cross-tenant contamination.",
        rollbackProcedure: "Delete extraction bundle.",
      },
      {
        stepNumber: 4,
        name: "Merge Verified Records into Production within Transaction",
        command: "npm run dr:merge-tenant -- --input=tenant-bundle.enc --tenant-id=targetTenant",
        expectedOutcome: "Production database receives restored tenant state; foreign keys verified.",
        rollbackProcedure: "PostgreSQL transaction rollback.",
      },
      {
        stepNumber: 5,
        name: "Restore Target Tenant to Active Status",
        command: "npm run tenant:activate -- --tenant-id=targetTenant",
        expectedOutcome: "Tenant operations resume with restored historical integrity.",
        rollbackProcedure: "N/A",
      },
    ],
  },
  {
    id: "rb-dr-003",
    code: "RB-DR-03",
    title: "Object Storage Protection & File Manifest Reconciliation",
    description:
      "Verifies and restores signed PDF contracts, inspection photos, and compliance documents from WORM cross-region replica.",
    severity: "SEV3_STORAGE_CORRUPTION",
    estimatedExecutionMinutes: 5,
    prerequisites: ["S3/GCS bucket read permissions", "Active database file repository"],
    steps: [
      {
        stepNumber: 1,
        name: "Execute Storage Inventory & Manifest Checksum Audit",
        command: "npm run dr:audit-storage-manifest",
        expectedOutcome: "100% of database file hashes match storage objects.",
        rollbackProcedure: "Investigate missing objects in secondary replica bucket.",
      },
      {
        stepNumber: 2,
        name: "Re-sync Missing Keys from Secondary Replicated Bucket",
        command: "aws s3 sync s3://carhire-private-documents-dr s3://carhire-private-documents-prod",
        expectedOutcome: "Any missing objects restored from air-gapped replica.",
        rollbackProcedure: "Restore from Glacier archive snapshot if replica is unavailable.",
      },
    ],
  },
  {
    id: "rb-dr-004",
    code: "RB-DR-04",
    title: "Post-Restore Financial Reconciler & Gateway Webhook Audit",
    description:
      "Reconciles payments, refunds, and owner settlements between external gateways and restored PostgreSQL ledger.",
    severity: "SEV1_CATASTROPHIC",
    estimatedExecutionMinutes: 6,
    prerequisites: ["Stripe API key / M-Pesa Daraja API credentials with read permissions"],
    steps: [
      {
        stepNumber: 1,
        name: "Poll External Payment Gateways for Restored Delta Window",
        command: "npm run dr:reconcile-finance",
        expectedOutcome: "All gateway charges mapped to internal invoices and Double-Entry Ledger entries.",
        rollbackProcedure: "Flag un-matched items for manual financial audit.",
      },
      {
        stepNumber: 2,
        name: "Audit Owner Settlement Batches",
        command: "npm run dr:verify-payout-batches",
        expectedOutcome: "Zero duplicate payout transfers triggered; ledger in balance.",
        rollbackProcedure: "Place payout queue in paused state until resolved.",
      },
    ],
  },
];
