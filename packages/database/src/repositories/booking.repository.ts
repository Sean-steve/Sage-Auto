import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — BOOKING PERSISTENCE REPOSITORY (DEV-004, DEV-006, DEV-007, BRS-001)
// Bounded Context: Bookings & Reservations
// Concurrency-safe, multi-tenant persistence with status history, pricing snapshots, and assignments
// ============================================================================

import type {
  Booking,
  BookingStatus,
  BookingStatusHistory,
  BookingVehicleAssignment,
  BookingPricingSnapshotRecord,
  CreateBookingDto,
  BookingListQueryDto,
  PricingSnapshot,
} from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  BookingConcurrencyConflictError,
  CrossTenantViolationError,
  BookingNotFoundError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IBookingRepository {
  create(
    tenantId: string,
    data: CreateBookingDto & {
      bookingNumber: string;
      pricingSnapshot: PricingSnapshot;
      grossTotal: number;
      netRentalSubtotal: number;
      depositRequired: number;
      taxAmount: number;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT";
      initialStatus?: BookingStatus;
    },
    tx?: TransactionContext
  ): Promise<Booking>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<Booking | null>;

  findByBookingNumber(
    bookingNumber: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<Booking | null>;

  findMany(
    tenantId: string,
    query?: BookingListQueryDto,
    tx?: TransactionContext
  ): Promise<{ items: Booking[]; total: number }>;

  update(
    id: string,
    tenantId: string,
    data: Partial<Booking>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<Booking>;

  appendStatusHistory(
    tenantId: string,
    entry: Omit<BookingStatusHistory, "id">,
    tx?: TransactionContext
  ): Promise<BookingStatusHistory>;

  getStatusHistory(
    bookingId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<BookingStatusHistory[]>;

  appendPricingSnapshot(
    tenantId: string,
    entry: Omit<BookingPricingSnapshotRecord, "id">,
    tx?: TransactionContext
  ): Promise<BookingPricingSnapshotRecord>;

  getPricingSnapshots(
    bookingId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<BookingPricingSnapshotRecord[]>;

  appendVehicleAssignment(
    tenantId: string,
    entry: Omit<BookingVehicleAssignment, "id">,
    tx?: TransactionContext
  ): Promise<BookingVehicleAssignment>;

  getVehicleAssignments(
    bookingId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<BookingVehicleAssignment[]>;

  generateNextBookingNumber(
    tenantId: string,
    tx?: TransactionContext
  ): Promise<string>;
}

export class BookingRepository implements IBookingRepository {
  private static bookingStore = createRecordStore<string, Booking>("booking.repository:bookingStore");
  private static statusHistoryStore = createRecordStore<string, BookingStatusHistory[]>("booking.repository:statusHistoryStore");
  private static pricingSnapshotStore = createRecordStore<string, BookingPricingSnapshotRecord[]>("booking.repository:pricingSnapshotStore");
  private static vehicleAssignmentStore = createRecordStore<string, BookingVehicleAssignment[]>("booking.repository:vehicleAssignmentStore");
  private static sequenceStore = createRecordStore<string, number>("booking.repository:sequenceStore");

  static clear(): void {
    BookingRepository.bookingStore.clear();
    BookingRepository.statusHistoryStore.clear();
    BookingRepository.pricingSnapshotStore.clear();
    BookingRepository.vehicleAssignmentStore.clear();
    BookingRepository.sequenceStore.clear();
  }

  async generateNextBookingNumber(
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<string> {
    const year = new Date().getFullYear();
    const key = `${tenantId}:${year}`;
    const currentSeq = (BookingRepository.sequenceStore.get(key) || 0) + 1;
    BookingRepository.sequenceStore.set(key, currentSeq);
    const padded = String(currentSeq).padStart(6, "0");
    return `BKG-${year}-${padded}`;
  }

  async create(
    tenantId: string,
    data: CreateBookingDto & {
      bookingNumber: string;
      pricingSnapshot: PricingSnapshot;
      grossTotal: number;
      netRentalSubtotal: number;
      depositRequired: number;
      taxAmount: number;
      actorUserId?: string;
      actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT";
      initialStatus?: BookingStatus;
    },
    _tx?: TransactionContext
  ): Promise<Booking> {
    const id = `bkg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const status: BookingStatus = data.initialStatus || data.status || "DRAFT";
    const actorId = data.actorUserId || "system";
    const actorType = data.actorType || "USER";

    const newBooking: Booking = {
      id,
      tenantId,
      bookingNumber: data.bookingNumber,
      status,
      customerId: data.customerId,
      corporateAccountId: data.corporateAccountId || null,
      primaryDriverId: data.primaryDriverId || data.driverId || null,
      additionalDriverIds: data.additionalDriverIds || [],
      agentId: data.agentId || null,
      agentCommissionRatePercent: null,
      requestedVehicleId: data.requestedVehicleId || data.vehicleId || null,
      requestedVehicleCategoryId: data.requestedVehicleCategoryId || null,
      assignedVehicleId: data.assignedVehicleId || data.vehicleId || null,
      pickupAt: data.pickupAt || data.startDate || now,
      returnAt: data.returnAt || data.endDate || new Date(Date.now() + 86400000).toISOString(),
      pickupLocationId: data.pickupLocationId || null,
      pickupLocationName: data.pickupLocationName || data.pickupLocation || "Main Station",
      returnLocationId: data.returnLocationId || null,
      returnLocationName: data.returnLocationName || data.returnLocation || data.pickupLocationName || data.pickupLocation || "Main Station",
      source: data.source || "OPERATIONS_DESK",
      pricingSnapshot: data.pricingSnapshot || ({
        currency: (data as any).currency || "KES",
        grossRentalTotal: data.grossTotal || 0,
        netRentalSubtotal: data.netRentalSubtotal || 0,
        dailyRate: (data as any).dailyRate || 0,
        days: (data as any).days || 1,
      } as any),
      pricingSnapshotVersion: 1,
      currency: data.pricingSnapshot?.currency || (data as any).currency || "KES",
      grossTotal: data.grossTotal ?? data.pricingSnapshot?.grossRentalTotal ?? 0,
      netRentalSubtotal: data.netRentalSubtotal ?? data.pricingSnapshot?.netRentalSubtotal ?? 0,
      depositRequired: data.depositRequired ?? (data.pricingSnapshot?.securityDeposit?.amount || 0),
      taxAmount: data.taxAmount ?? (data.pricingSnapshot?.tax?.taxAmount || 0),
      amountPaid: data.amountPaid || 0,
      paymentStatus: data.amountPaid && data.amountPaid >= (data.grossTotal ?? data.pricingSnapshot?.grossRentalTotal ?? 0)
        ? "FULLY_PAID"
        : (data.amountPaid && data.amountPaid > 0 ? "PARTIALLY_PAID" : "UNPAID"),
      depositStatus: data.depositStatus || (data.depositRequired > 0 ? "REQUESTED" : "NOT_REQUIRED"),
      specialInstructions: data.specialInstructions || null,
      customerNotes: data.customerNotes || null,
      internalNotes: data.internalNotes || data.notes || null,
      allocationId: null,
      holdToken: data.holdToken || null,
      activeRentalId: null,
      cancellationReason: null,
      rejectionReason: null,
      expiresAt: null,
      confirmedAt: status === "CONFIRMED" ? now : null,
      cancelledAt: status === "CANCELLED" ? now : null,
      completedAt: status === "COMPLETED" ? now : null,
      activatedAt: status === "ACTIVE" ? now : null,
      noShowAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      statusHistory: [],
      vehicleAssignments: [],
      pricingSnapshots: [],
      substitutions: [],

      // Legacy compatibility aliases
      vehicleId: data.assignedVehicleId || data.requestedVehicleId || data.vehicleId || undefined,
      driverId: data.primaryDriverId || data.driverId || undefined,
      startDate: data.pickupAt || data.startDate || now,
      endDate: data.returnAt || data.endDate || new Date(Date.now() + 86400000).toISOString(),
      pickupLocation: data.pickupLocationName || data.pickupLocation || "Main Station",
      returnLocation: data.returnLocationName || data.returnLocation || "Main Station",
      pricing: data.pricingSnapshot,
      notes: data.internalNotes || data.notes || undefined,
    };

    // 1. Save Initial Status History
    const historyEntry: BookingStatusHistory = {
      id: `bsh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      bookingId: id,
      tenantId,
      fromStatus: null,
      toStatus: status,
      actorType,
      actorId,
      reason: "Initial booking creation",
      occurredAt: now,
      timestamp: now,
    };
    newBooking.statusHistory = [historyEntry];
    BookingRepository.statusHistoryStore.set(id, [historyEntry]);

    // 2. Save Initial Pricing Snapshot Record
    const snapshotRecord: BookingPricingSnapshotRecord = {
      id: `bps-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      bookingId: id,
      tenantId,
      version: 1,
      isCurrent: true,
      snapshot: data.pricingSnapshot,
      schemaVersion: 1,
      createdAt: now,
      createdBy: actorId,
    };
    newBooking.pricingSnapshots = [snapshotRecord];
    BookingRepository.pricingSnapshotStore.set(id, [snapshotRecord]);

    // 3. Save Initial Vehicle Assignment if provided
    if (newBooking.assignedVehicleId) {
      const assignmentRecord: BookingVehicleAssignment = {
        id: `bva-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        bookingId: id,
        tenantId,
        vehicleId: newBooking.assignedVehicleId,
        vehicleCategoryId: newBooking.requestedVehicleCategoryId,
        isCurrent: true,
        assignedAt: now,
        releasedAt: null,
        assignedBy: actorId,
        reason: "Initial vehicle selection",
      };
      newBooking.vehicleAssignments = [assignmentRecord];
      BookingRepository.vehicleAssignmentStore.set(id, [assignmentRecord]);
    }

    BookingRepository.bookingStore.set(id, newBooking);
    return JSON.parse(JSON.stringify(newBooking));
  }

  async findById(
    id: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<Booking | null> {
    const booking = BookingRepository.bookingStore.get(id);
    if (!booking) return null;
    if (booking.tenantId !== tenantId) {
      throw new CrossTenantViolationError(booking.tenantId, tenantId);
    }
    const history = BookingRepository.statusHistoryStore.get(id) || [];
    const snapshots = BookingRepository.pricingSnapshotStore.get(id) || [];
    const assignments = BookingRepository.vehicleAssignmentStore.get(id) || [];

    const populated: Booking = {
      ...booking,
      statusHistory: [...history],
      pricingSnapshots: [...snapshots],
      vehicleAssignments: [...assignments],
    };
    return JSON.parse(JSON.stringify(populated));
  }

  async findByBookingNumber(
    bookingNumber: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<Booking | null> {
    const found = Array.from(BookingRepository.bookingStore.values()).find(
      (b) => b.tenantId === tenantId && b.bookingNumber.toUpperCase() === bookingNumber.toUpperCase()
    );
    if (!found) return null;
    return this.findById(found.id, tenantId);
  }

  async findMany(
    tenantId: string,
    query?: BookingListQueryDto,
    _tx?: TransactionContext
  ): Promise<{ items: Booking[]; total: number }> {
    let items = Array.from(BookingRepository.bookingStore.values()).filter(
      (b) => b.tenantId === tenantId
    );

    if (query?.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      items = items.filter((b) => statuses.includes(b.status));
    }

    if (query?.customerId) {
      items = items.filter((b) => b.customerId === query.customerId);
    }

    if (query?.corporateAccountId) {
      items = items.filter((b) => b.corporateAccountId === query.corporateAccountId);
    }

    if (query?.vehicleId) {
      items = items.filter(
        (b) => b.assignedVehicleId === query.vehicleId || b.requestedVehicleId === query.vehicleId
      );
    }

    if (query?.driverId) {
      items = items.filter(
        (b) => b.primaryDriverId === query.driverId || b.additionalDriverIds?.includes(query.driverId!)
      );
    }

    if (query?.agentId) {
      items = items.filter((b) => b.agentId === query.agentId);
    }

    if (query?.source) {
      items = items.filter((b) => b.source === query.source);
    }

    if (query?.pickupFrom) {
      items = items.filter((b) => new Date(b.pickupAt || b.startDate || 0) >= new Date(query.pickupFrom!));
    }

    if (query?.pickupTo) {
      items = items.filter((b) => new Date(b.pickupAt || b.startDate || 0) <= new Date(query.pickupTo!));
    }

    if (query?.returnFrom) {
      items = items.filter((b) => new Date(b.returnAt || b.endDate || 0) >= new Date(query.returnFrom!));
    }

    if (query?.returnTo) {
      items = items.filter((b) => new Date(b.returnAt || b.endDate || 0) <= new Date(query.returnTo!));
    }

    if (query?.search) {
      const q = query.search.toLowerCase();
      items = items.filter(
        (b) =>
          b.bookingNumber.toLowerCase().includes(q) ||
          (b.pickupLocationName && b.pickupLocationName.toLowerCase().includes(q)) ||
          (b.returnLocationName && b.returnLocationName.toLowerCase().includes(q)) ||
          (b.internalNotes && b.internalNotes.toLowerCase().includes(q))
      );
    }

    const total = items.length;

    // Sorting
    const sortBy = query?.sortBy || "createdAt";
    const sortOrder = query?.sortOrder || "desc";
    items.sort((a, b) => {
      let valA: string | number = a[sortBy] as string | number;
      let valB: string | number = b[sortBy] as string | number;
      if (typeof valA === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA);
      }
      return sortOrder === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    // Pagination
    const offset = query?.offset || 0;
    const limit = query?.limit || 50;
    const paged = items.slice(offset, offset + limit);

    // Populate relations
    const populated = paged.map((booking) => {
      const history = BookingRepository.statusHistoryStore.get(booking.id) || [];
      const snapshots = BookingRepository.pricingSnapshotStore.get(booking.id) || [];
      const assignments = BookingRepository.vehicleAssignmentStore.get(booking.id) || [];
      return {
        ...booking,
        statusHistory: [...history],
        pricingSnapshots: [...snapshots],
        vehicleAssignments: [...assignments],
      };
    });

    return {
      items: JSON.parse(JSON.stringify(populated)),
      total,
    };
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Booking>,
    expectedVersion?: number,
    _tx?: TransactionContext
  ): Promise<Booking> {
    const existing = BookingRepository.bookingStore.get(id);
    if (!existing) {
      throw new BookingNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new BookingConcurrencyConflictError(
        `Optimistic concurrency failure: booking ${id} has version ${existing.version}, expected ${expectedVersion}.`
      );
    }

    const updated: Booking = {
      ...existing,
      ...data,
      id: existing.id,
      tenantId: existing.tenantId,
      bookingNumber: existing.bookingNumber,
      version: (existing.version || 1) + 1,
      updatedAt: new Date().toISOString(),
      // Sync legacy aliases
      vehicleId: data.assignedVehicleId || data.requestedVehicleId || existing.assignedVehicleId || existing.requestedVehicleId || undefined,
      driverId: data.primaryDriverId || existing.primaryDriverId || undefined,
      startDate: data.pickupAt || existing.pickupAt,
      endDate: data.returnAt || existing.returnAt,
      pickupLocation: data.pickupLocationName || existing.pickupLocationName,
      returnLocation: data.returnLocationName || existing.returnLocationName,
      pricing: data.pricingSnapshot || existing.pricingSnapshot,
    };

    BookingRepository.bookingStore.set(id, updated);
    return (await this.findById(id, tenantId))!;
  }

  async appendStatusHistory(
    tenantId: string,
    entry: Omit<BookingStatusHistory, "id">,
    _tx?: TransactionContext
  ): Promise<BookingStatusHistory> {
    const bookingId = entry.bookingId || "";
    const booking = BookingRepository.bookingStore.get(bookingId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }
    if (booking.tenantId !== tenantId) {
      throw new CrossTenantViolationError(booking.tenantId, tenantId);
    }

    const newEntry: BookingStatusHistory = {
      id: `bsh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ...entry,
      bookingId,
      timestamp: entry.occurredAt || new Date().toISOString(),
      occurredAt: entry.occurredAt || new Date().toISOString(),
    };

    const history = BookingRepository.statusHistoryStore.get(bookingId) || [];
    history.push(newEntry);
    BookingRepository.statusHistoryStore.set(bookingId, history);

    return JSON.parse(JSON.stringify(newEntry));
  }

  async getStatusHistory(
    bookingId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<BookingStatusHistory[]> {
    const booking = BookingRepository.bookingStore.get(bookingId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }
    if (booking.tenantId !== tenantId) {
      throw new CrossTenantViolationError(booking.tenantId, tenantId);
    }
    const history = BookingRepository.statusHistoryStore.get(bookingId) || [];
    return JSON.parse(JSON.stringify(history));
  }

  async appendPricingSnapshot(
    tenantId: string,
    entry: Omit<BookingPricingSnapshotRecord, "id">,
    _tx?: TransactionContext
  ): Promise<BookingPricingSnapshotRecord> {
    const booking = BookingRepository.bookingStore.get(entry.bookingId);
    if (!booking) {
      throw new BookingNotFoundError(entry.bookingId);
    }
    if (booking.tenantId !== tenantId) {
      throw new CrossTenantViolationError(booking.tenantId, tenantId);
    }

    const snapshots = BookingRepository.pricingSnapshotStore.get(entry.bookingId) || [];
    // Mark previous snapshots as isCurrent = false if the new one is isCurrent
    if (entry.isCurrent) {
      for (const s of snapshots) {
        s.isCurrent = false;
      }
    }

    const newRecord: BookingPricingSnapshotRecord = {
      id: `bps-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ...entry,
    };

    snapshots.push(newRecord);
    BookingRepository.pricingSnapshotStore.set(entry.bookingId, snapshots);

    return JSON.parse(JSON.stringify(newRecord));
  }

  async getPricingSnapshots(
    bookingId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<BookingPricingSnapshotRecord[]> {
    const booking = BookingRepository.bookingStore.get(bookingId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }
    if (booking.tenantId !== tenantId) {
      throw new CrossTenantViolationError(booking.tenantId, tenantId);
    }
    const snapshots = BookingRepository.pricingSnapshotStore.get(bookingId) || [];
    return JSON.parse(JSON.stringify(snapshots));
  }

  async appendVehicleAssignment(
    tenantId: string,
    entry: Omit<BookingVehicleAssignment, "id">,
    _tx?: TransactionContext
  ): Promise<BookingVehicleAssignment> {
    const booking = BookingRepository.bookingStore.get(entry.bookingId);
    if (!booking) {
      throw new BookingNotFoundError(entry.bookingId);
    }
    if (booking.tenantId !== tenantId) {
      throw new CrossTenantViolationError(booking.tenantId, tenantId);
    }

    const assignments = BookingRepository.vehicleAssignmentStore.get(entry.bookingId) || [];
    if (entry.isCurrent) {
      const now = new Date().toISOString();
      for (const a of assignments) {
        if (a.isCurrent) {
          a.isCurrent = false;
          a.releasedAt = now;
        }
      }
    }

    const newRecord: BookingVehicleAssignment = {
      id: `bva-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ...entry,
    };

    assignments.push(newRecord);
    BookingRepository.vehicleAssignmentStore.set(entry.bookingId, assignments);

    return JSON.parse(JSON.stringify(newRecord));
  }

  async getVehicleAssignments(
    bookingId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<BookingVehicleAssignment[]> {
    const booking = BookingRepository.bookingStore.get(bookingId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }
    if (booking.tenantId !== tenantId) {
      throw new CrossTenantViolationError(booking.tenantId, tenantId);
    }
    const assignments = BookingRepository.vehicleAssignmentStore.get(bookingId) || [];
    return JSON.parse(JSON.stringify(assignments));
  }
}
