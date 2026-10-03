// ============================================================================
// CAR HIRE OS — INSPECTION COMPARISON ENGINE (DOM-003 §21-22, DEV-004)
// Bounded Context: Pre/Post Inspection Differentials & Damage Attribution
// ============================================================================

import type {
  Inspection,
  InspectionComparison,
  InspectionComparisonObservationDiff,
  DamageObservation,
  DamageSeverity,
} from "@carhire/types";

const SEVERITY_WEIGHTS: Record<string, number> = {
  minor: 1,
  MINOR: 1,
  moderate: 2,
  MODERATE: 2,
  severe: 3,
  MAJOR: 3,
  CRITICAL: 4,
  SEVERE: 4,
};

export class InspectionComparisonEngine {
  public static compare(
    baseline: Inspection,
    returned: Inspection,
    membershipId?: string
  ): InspectionComparison {
    const now = new Date().toISOString();
    const id = `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const baselineOdo = baseline.odometer || 0;
    const returnOdo = returned.odometer || 0;
    const odometerDelta = Math.max(0, returnOdo - baselineOdo);

    const baselineFuel = baseline.fuelLevel ?? 100;
    const returnFuel = returned.fuelLevel ?? 100;
    const fuelLevelDelta = returnFuel - baselineFuel; // Negative indicates deficit

    const diffs: InspectionComparisonObservationDiff[] = [];

    // Map baseline damages by zone + type
    const baselineMap = new Map<string, DamageObservation>();
    for (const bObs of baseline.damageObservations) {
      const key = `${bObs.bodyZone}_${bObs.damageType}`;
      baselineMap.set(key, bObs);
    }

    const matchedBaselineKeys = new Set<string>();

    for (const rObs of returned.damageObservations) {
      const key = `${rObs.bodyZone}_${rObs.damageType}`;
      const matchedBaseline = baselineMap.get(key);

      if (!matchedBaseline) {
        // Brand new damage observed at return
        diffs.push({
          bodyZone: rObs.bodyZone,
          damageType: rObs.damageType,
          severity: rObs.severity,
          description: rObs.description,
          classification: "NEW",
          returnObservationId: rObs.id,
          evidenceUrls: rObs.photoUrls,
        });
      } else {
        matchedBaselineKeys.add(key);
        const bWeight = SEVERITY_WEIGHTS[matchedBaseline.severity] || 1;
        const rWeight = SEVERITY_WEIGHTS[rObs.severity] || 1;

        if (rWeight > bWeight) {
          diffs.push({
            bodyZone: rObs.bodyZone,
            damageType: rObs.damageType,
            severity: rObs.severity,
            description: `Worsened from ${matchedBaseline.severity} to ${rObs.severity}: ${rObs.description}`,
            classification: "WORSENED",
            baselineObservationId: matchedBaseline.id,
            returnObservationId: rObs.id,
            evidenceUrls: rObs.photoUrls,
          });
        } else {
          diffs.push({
            bodyZone: rObs.bodyZone,
            damageType: rObs.damageType,
            severity: rObs.severity,
            description: rObs.description,
            classification: "UNCHANGED",
            baselineObservationId: matchedBaseline.id,
            returnObservationId: rObs.id,
            evidenceUrls: rObs.photoUrls,
          });
        }
      }
    }

    // Check for baseline damages that were resolved / repaired
    for (const [key, bObs] of baselineMap.entries()) {
      if (!matchedBaselineKeys.has(key)) {
        diffs.push({
          bodyZone: bObs.bodyZone,
          damageType: bObs.damageType,
          severity: bObs.severity,
          description: `Previously noted: ${bObs.description}`,
          classification: "RESOLVED",
          baselineObservationId: bObs.id,
          evidenceUrls: bObs.photoUrls,
        });
      }
    }

    const newDamageCount = diffs.filter((d) => d.classification === "NEW").length;
    const worsenedDamageCount = diffs.filter((d) => d.classification === "WORSENED").length;
    const unchangedDamageCount = diffs.filter((d) => d.classification === "UNCHANGED").length;
    const resolvedDamageCount = diffs.filter((d) => d.classification === "RESOLVED").length;

    return {
      id,
      tenantId: returned.tenantId,
      rentalId: returned.rentalId || baseline.rentalId || null,
      vehicleId: returned.vehicleId,
      baselineInspectionId: baseline.id,
      baselineInspectionNumber: baseline.inspectionNumber,
      returnInspectionId: returned.id,
      returnInspectionNumber: returned.inspectionNumber,
      comparedAt: now,
      comparedByMembershipId: membershipId,
      baselineOdometer: baselineOdo,
      returnOdometer: returnOdo,
      odometerDelta,
      baselineFuelLevel: baselineFuel,
      returnFuelLevel: returnFuel,
      fuelLevelDelta,
      observationDiffs: diffs,
      newDamageCount,
      worsenedDamageCount,
      unchangedDamageCount,
      resolvedDamageCount,
    };
  }
}
