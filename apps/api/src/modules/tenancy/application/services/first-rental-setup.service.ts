/**
 * UX-D2: first-rental setup is tenant-scoped and separate from /access/complete.
 * This read model does not relax booking, payment, allocation or handover gates.
 */
import {
  BookingRepository, CustomerRepository, DriverRepository, HandoverRepository,
  RatePlanRepository, VehicleAllocationRepository, VehicleRepository,
} from "@carhire/database";
import { createRecordStore } from "../../../../../../../packages/database/src/record-store";

export const FIRST_RENTAL_STEP_IDS = [
  "VEHICLES", "PEOPLE", "PRICING", "AVAILABILITY", "BOOKING", "HANDOVER",
] as const;
export type FirstRentalStepId = typeof FIRST_RENTAL_STEP_IDS[number];
export type FirstRentalState = "NOT_STARTED" | "IN_PROGRESS" | "DISMISSED" | "COMPLETED";
export type FirstRentalVisibilityAction = "DISMISS" | "RESTORE";

type SavedSetup = {
  tenantId: string;
  observedSteps: FirstRentalStepId[];
  dismissedAt?: string;
  completedAt?: string;
  updatedAt: string;
};
export type FirstRentalStep = {
  id: FirstRentalStepId;
  label: string;
  description: string;
  section: string;
  complete: boolean;
};
export type FirstRentalStatus = {
  tenantId: string;
  state: FirstRentalState;
  visibleOnOverview: boolean;
  completedAt: string | null;
  dismissedAt: string | null;
  completedCount: number;
  totalCount: number;
  calculatedAt: string;
  steps: FirstRentalStep[];
};

// Readers must use tenant-scoped domain repositories, never client-side counters.
export type FirstRentalReaders = {
  hasVehicle: (tenantId: string) => Promise<boolean>;
  hasCustomerAndDriver: (tenantId: string) => Promise<boolean>;
  hasActivePricing: (tenantId: string) => Promise<boolean>;
  hasConfirmedAllocation: (tenantId: string) => Promise<boolean>;
  hasBooking: (tenantId: string) => Promise<boolean>;
  hasCompletedHandover: (tenantId: string) => Promise<boolean>;
};

const STEP_METADATA: Record<FirstRentalStepId, Omit<FirstRentalStep, "id" | "complete">> = {
  VEHICLES: { label: "Register your vehicles", description: "Add the rental vehicles and ownership details.", section: "fleet" },
  PEOPLE: { label: "Add a customer and driver", description: "Create customer and driver records, then review their verification.", section: "customers" },
  PRICING: { label: "Set your rental prices", description: "Activate a rate plan with a valid daily rate and deposit policy.", section: "pricing" },
  AVAILABILITY: { label: "Confirm rental availability", description: "Check dates and confirm an availability-backed reservation.", section: "availability" },
  BOOKING: { label: "Create your first booking", description: "Save a booking through the normal reservation workflow.", section: "bookings" },
  HANDOVER: { label: "Complete the first handover", description: "Complete contract, signatures, inspection and key release checks.", section: "handover" },
};

function domainReaders(): FirstRentalReaders {
  const fleet = new VehicleRepository();
  const customers = new CustomerRepository();
  const drivers = new DriverRepository();
  const pricing = new RatePlanRepository();
  const allocations = new VehicleAllocationRepository();
  const bookings = new BookingRepository();
  const handovers = new HandoverRepository();
  return {
    hasVehicle: async id => (await fleet.findAll(id, { page: 1, limit: 1 })).total > 0,
    hasCustomerAndDriver: async id => {
      const [c, d] = await Promise.all([
        customers.findAll(id, { page: 1, limit: 1 }),
        drivers.findAll(id, { page: 1, limit: 1 }),
      ]);
      return c.total > 0 && d.total > 0;
    },
    hasActivePricing: async id => {
      const plans = await pricing.findAll(id);
      for (const plan of plans) {
        if (plan.status !== "ACTIVE") continue;
        const rates = await pricing.getRatesForPlan(plan.id, id);
        if (rates.some(rate => Number(rate.dailyRate) > 0)) return true;
      }
      return false;
    },
    // Date-specific availability is authoritative only after an allocation is
    // confirmed by the Availability engine; an AVAILABLE vehicle alone is NOT
    // evidence that rental dates have been checked.
    hasConfirmedAllocation: async id =>
      (await allocations.findAllocations(id, {
        sourceType: "BOOKING", status: ["CONFIRMED", "ACTIVE"],
      })).length > 0,
    hasBooking: async id => (await bookings.findMany(id, { limit: 1 })).total > 0,
    hasCompletedHandover: async id =>
      (await handovers.findMany(id, { status: "HANDOVER_COMPLETED", limit: 1 })).total > 0,
  };
}

export class FirstRentalSetupService {
  constructor(
    private readonly readers: FirstRentalReaders = domainReaders(),
    private readonly saved: Pick<Map<string, SavedSetup>, "get" | "set"> =
      createRecordStore<string, SavedSetup>("tenant:first-rental-setup:v1"),
  ) {}

  async getStatus(tenantId: string): Promise<FirstRentalStatus> {
    if (!tenantId) throw Object.assign(new Error("Verified tenant context required"), { statusCode: 403 });

    // Do not silently treat failed repository reads as unfinished setup.
    const checks = await Promise.all([
      this.readers.hasVehicle(tenantId),
      this.readers.hasCustomerAndDriver(tenantId),
      this.readers.hasActivePricing(tenantId),
      this.readers.hasConfirmedAllocation(tenantId),
      this.readers.hasBooking(tenantId),
      this.readers.hasCompletedHandover(tenantId),
    ]);

    const calculatedAt = new Date().toISOString();
    const latest = this.saved.get(tenantId);
    const observed = new Set<FirstRentalStepId>(latest?.observedSteps || []);
    FIRST_RENTAL_STEP_IDS.forEach((id, index) => { if (checks[index]) observed.add(id); });

    // Completion is monotonic and based on a real completed handover, not
    // arbitrary UI button clicks or six manually checked boxes.
    const completedAt = latest?.completedAt || (observed.has("HANDOVER") ? calculatedAt : undefined);
    const updated: SavedSetup = {
      tenantId,
      observedSteps: [...observed],
      dismissedAt: latest?.dismissedAt,
      completedAt,
      updatedAt: calculatedAt,
    };
    if (!latest ||
      latest.completedAt !== completedAt ||
      updated.observedSteps.some(id => !latest.observedSteps.includes(id))) {
      this.saved.set(tenantId, updated);
    }

    const state: FirstRentalState = completedAt ? "COMPLETED"
      : latest?.dismissedAt ? "DISMISSED"
      : observed.size ? "IN_PROGRESS" : "NOT_STARTED";
    const steps = FIRST_RENTAL_STEP_IDS.map(id => ({
      id, ...STEP_METADATA[id], complete: observed.has(id),
    }));
    return {
      tenantId, state, visibleOnOverview: state === "NOT_STARTED" || state === "IN_PROGRESS",
      completedAt: completedAt || null, dismissedAt: latest?.dismissedAt || null,
      completedCount: steps.filter(step => step.complete).length,
      totalCount: steps.length, calculatedAt, steps,
    };
  }

  // Caller must enforce company ownership / tenant administration.
  changeVisibility(tenantId: string, action: FirstRentalVisibilityAction): boolean {
    if (!tenantId) throw Object.assign(new Error("Verified tenant context required"), { statusCode: 403 });
    const current = this.saved.get(tenantId);
    if (current?.completedAt) return false; // Completion cannot be undone.
    const nextDismissedAt = action === "DISMISS" ? (current?.dismissedAt || new Date().toISOString()) : undefined;
    if (current?.dismissedAt === nextDismissedAt) return false;
    this.saved.set(tenantId, {
      tenantId, observedSteps: current?.observedSteps || [],
      completedAt: current?.completedAt,
      dismissedAt: nextDismissedAt, updatedAt: new Date().toISOString(),
    });
    return true;
  }
}
