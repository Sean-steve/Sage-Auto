// ============================================================================
// CAR HIRE OS — CONTINUOUS INTERVAL COVERAGE CALCULATOR (DEV-009, DOM-003)
// Chained Document Coverage & Temporal Gap Detection
// ============================================================================

import type { ComplianceRecord } from "@carhire/types";
import { normalizeExpiryBoundary, normalizeStartBoundary } from "./clock";

export interface TemporalInterval {
  start: string | Date;
  end: string | Date;
}

export interface CoverageGap {
  gapStart: string;
  gapEnd: string;
  durationHours: number;
}

export interface IntervalCoverageResult {
  isFullyCovered: boolean;
  requiredInterval: { start: string; end: string };
  coveringRecordIds: string[];
  gaps: CoverageGap[];
  earliestCoverageStart?: string;
  latestCoverageEnd?: string;
}

/**
 * Evaluates whether a set of records for an entity provides continuous, uninterrupted
 * regulatory coverage across the requested operational interval [start, end].
 */
export function evaluateIntervalCoverage(
  records: ComplianceRecord[],
  interval: TemporalInterval
): IntervalCoverageResult {
  const reqStart = typeof interval.start === "string" ? normalizeStartBoundary(interval.start) : interval.start;
  const reqEnd = typeof interval.end === "string" ? normalizeExpiryBoundary(interval.end) : interval.end;

  const result: IntervalCoverageResult = {
    isFullyCovered: false,
    requiredInterval: {
      start: reqStart.toISOString(),
      end: reqEnd.toISOString(),
    },
    coveringRecordIds: [],
    gaps: [],
  };

  // Only verified records that have not been rejected or revoked can provide coverage
  const eligibleRecords = records.filter(
    (r) => r.verificationStatus === "VERIFIED" && r.status !== "REJECTED" && r.status !== "SUSPENDED"
  );

  if (eligibleRecords.length === 0) {
    result.gaps.push({
      gapStart: reqStart.toISOString(),
      gapEnd: reqEnd.toISOString(),
      durationHours: Math.max(0, (reqEnd.getTime() - reqStart.getTime()) / 3600000),
    });
    return result;
  }

  // Convert to normalized intervals [start, end]
  const intervals = eligibleRecords.map((r) => ({
    recordId: r.id,
    start: normalizeStartBoundary(r.validFrom).getTime(),
    end: normalizeExpiryBoundary(r.expiresAt).getTime(),
  }));

  // Sort by start time ascending
  intervals.sort((a, b) => a.start - b.start);

  // Merge contiguous / overlapping intervals
  const merged: Array<{ start: number; end: number; recordIds: string[] }> = [];

  for (const item of intervals) {
    if (merged.length === 0) {
      merged.push({ start: item.start, end: item.end, recordIds: [item.recordId] });
      continue;
    }

    const current = merged[merged.length - 1];
    // If the next interval starts on or before current end + 1ms (or same calendar day boundary)
    if (item.start <= current.end) {
      current.end = Math.max(current.end, item.end);
      if (!current.recordIds.includes(item.recordId)) {
        current.recordIds.push(item.recordId);
      }
    } else {
      merged.push({ start: item.start, end: item.end, recordIds: [item.recordId] });
    }
  }

  result.earliestCoverageStart = new Date(merged[0].start).toISOString();
  result.latestCoverageEnd = new Date(merged[merged.length - 1].end).toISOString();

  // Check if any single merged contiguous block completely encloses [reqStart, reqEnd]
  const enclosing = merged.find((m) => m.start <= reqStart.getTime() && m.end >= reqEnd.getTime());

  if (enclosing) {
    result.isFullyCovered = true;
    result.coveringRecordIds = enclosing.recordIds;
    return result;
  }

  // If not enclosed, compute specific gaps within [reqStart, reqEnd]
  let cursor = reqStart.getTime();
  const targetEnd = reqEnd.getTime();

  for (const block of merged) {
    if (cursor < block.start) {
      const gapEnd = Math.min(block.start, targetEnd);
      result.gaps.push({
        gapStart: new Date(cursor).toISOString(),
        gapEnd: new Date(gapEnd).toISOString(),
        durationHours: Math.max(0, (gapEnd - cursor) / 3600000),
      });
      cursor = Math.max(cursor, block.end);
    } else if (cursor <= block.end) {
      cursor = block.end;
      result.coveringRecordIds.push(...block.recordIds);
    }
  }

  if (cursor < targetEnd) {
    result.gaps.push({
      gapStart: new Date(cursor).toISOString(),
      gapEnd: new Date(targetEnd).toISOString(),
      durationHours: Math.max(0, (targetEnd - cursor) / 3600000),
    });
  }

  // Deduplicate covering record IDs
  result.coveringRecordIds = Array.from(new Set(result.coveringRecordIds));
  result.isFullyCovered = result.gaps.length === 0;

  return result;
}
