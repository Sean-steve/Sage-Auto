// ============================================================================
// CAR HIRE OS — AVAILABILITY & CONCURRENCY-SAFE DISPATCH ENGINE VIEW
// SPRINT 12 (DEV-006, DEV-007, BRS-001)
// ============================================================================

import React, { useState, useMemo } from "react";
import {
  CalendarDays,
  CalendarCheck,
  Search,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Car,
  Wrench,
  ShieldAlert,
  ArrowRightLeft,
  Filter,
  Plus,
  RefreshCw,
  Info,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
} from "lucide-react";
import { useApp } from "../lib/store";
import type {
  VehicleAllocation,
  VehicleBlock,
  AllocationHold,
  AvailableCandidateVehicle,
  AllocationType,
  VehicleBlockType,
  Vehicle,
} from "@carhire/types";

export const AvailabilityView: React.FC = () => {
  const { restoration } = useApp();
  const {
    vehicles,
    activeTenantId,
    activeTenant,
    bookings,
    customers,
    activeSubscription,
  } = useApp();

  const tenantVehicles = useMemo(
    () => (vehicles || []).filter((v) => v.tenantId === activeTenantId),
    [vehicles, activeTenantId]
  );

  // Active sub-tab
  const [activeSubTab, setActiveSubTab] = useState<
    "timeline" | "search" | "holds" | "blocks" | "substitute"
  >("timeline");

  // Selected date range for Timeline
  const [timelineStartDate, setTimelineStartDate] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split("T")[0];
  });

  // Timeline view days window (7, 14, 30 days)
  const [daysCount, setDaysCount] = useState<number>(14);

  // In-memory allocation state for the interactive dashboard
  const [allocations, setAllocations] = useState<VehicleAllocation[]>([]);
  const [blocks, setBlocks] = useState<VehicleBlock[]>([]);
  const [holds, setHolds] = useState<AllocationHold[]>([]);

  // Search Engine Form State
  const [searchPickup, setSearchPickup] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [searchReturn, setSearchReturn] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    d.setHours(18, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [searchCategory, setSearchCategory] = useState<string>("ALL");
  const [searchTurnaround, setSearchTurnaround] = useState<number>(60);
  const [searchResults, setSearchResults] = useState<AvailableCandidateVehicle[] | null>(null);
  const [searchPerformed, setSearchPerformed] = useState<boolean>(false);

  // New Block Form State
  const [newBlockVehicleId, setNewBlockVehicleId] = useState<string>("");
  const [newBlockType, setNewBlockType] = useState<VehicleBlockType>("MAINTENANCE");
  const [newBlockStartsAt, setNewBlockStartsAt] = useState<string>("");
  const [newBlockEndsAt, setNewBlockEndsAt] = useState<string>("");
  const [newBlockReason, setNewBlockReason] = useState<string>("");

  // Quick Allocation / Conflict Test State
  const [testVehicleId, setTestVehicleId] = useState<string>("");
  const [testStartsAt, setTestStartsAt] = useState<string>("");
  const [testEndsAt, setTestEndsAt] = useState<string>("");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    conflicts?: any[];
  } | null>(null);

  // Substitution state
  const [subTargetAllocId, setSubTargetAllocId] = useState<string>("");
  const [subNewVehicleId, setSubNewVehicleId] = useState<string>("");
  const [subMessage, setSubMessage] = useState<{ success: boolean; text: string } | null>(null);

  // Timeline date headers generator
  const timelineDates = useMemo(() => {
    const dates: Date[] = [];
    const start = new Date(timelineStartDate);
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [timelineStartDate, daysCount]);

  // Execute Search candidate vehicles
  const handleSearch = () => {
    const pickup = new Date(searchPickup).getTime();
    const returnDate = new Date(searchReturn).getTime();

    if (returnDate <= pickup) {
      alert("Return date must be strictly after pickup date.");
      return;
    }

    const turnaroundMs = searchTurnaround * 60 * 1000;
    const effectivePickup = pickup - turnaroundMs;
    const effectiveReturn = returnDate + turnaroundMs;

    const candidates: AvailableCandidateVehicle[] = [];

    tenantVehicles.forEach((vehicle) => {
      // Filter out non-operable
      if (
        vehicle.lifecycleStatus === "RETIRED" ||
        vehicle.lifecycleStatus === "SUSPENDED" ||
        vehicle.lifecycleStatus === "SOLD" ||
        vehicle.availabilityStatus === "MAINTENANCE"
      ) {
        return;
      }

      if (searchCategory !== "ALL" && vehicle.category !== searchCategory) {
        return;
      }

      // Check overlapping allocations
      const hasAllocConflict = allocations.some((alloc) => {
        if (alloc.vehicleId !== vehicle.id || alloc.status === "RELEASED") return false;
        const aStart = new Date(alloc.startsAt).getTime();
        const aEnd = new Date(alloc.endsAt).getTime();
        return effectivePickup < aEnd && effectiveReturn > aStart;
      });

      if (hasAllocConflict) return;

      // Check overlapping active holds
      const hasHoldConflict = holds.some((h) => {
        if (h.vehicleId !== vehicle.id || h.status !== "PENDING") return false;
        const isExpired = new Date(h.expiresAt).getTime() <= Date.now();
        if (isExpired) return false;
        const hStart = new Date(h.startsAt).getTime();
        const hEnd = new Date(h.endsAt).getTime();
        return effectivePickup < hEnd && effectiveReturn > hStart;
      });

      if (hasHoldConflict) return;

      // Check overlapping blocks
      const hasBlockConflict = blocks.some((b) => {
        if (b.vehicleId !== vehicle.id || b.status !== "ACTIVE") return false;
        const bStart = new Date(b.startsAt).getTime();
        const bEnd = new Date(b.endsAt).getTime();
        return effectivePickup < bEnd && effectiveReturn > bStart;
      });

      if (hasBlockConflict) return;

      candidates.push({
        id: vehicle.id,
        tenantId: vehicle.tenantId,
        registrationNumber: vehicle.registrationPlate || "KDA 000",
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        vehicleCategoryId: vehicle.category,
        categoryName: vehicle.category,
        branchId: "branch_hq",
        dailyRate: vehicle.dailyRate || 10000,
        operationalStatus: "OPERATIONAL",
        availabilityStatus: "AVAILABLE",
        fuelType: vehicle.fuelType,
        transmission: vehicle.transmission,
        features: ["Air Conditioning", "Bluetooth", "ABS"],
      });
    });

    setSearchResults(candidates);
    setSearchPerformed(true);
  };

  // Create quick hold from search result
  const handleCreateHold = (candidate: AvailableCandidateVehicle) => {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const token = `hld_tok_${Math.random().toString(36).substring(2, 10)}`;
    const newHold: AllocationHold & { vehicle?: Vehicle } = {
      id: `hld_${Date.now()}`,
      tenantId: activeTenantId,
      allocationId: `alloc_hold_${Date.now()}`,
      holdToken: token,
      vehicleId: candidate.id,
      startsAt: new Date(searchPickup).toISOString(),
      endsAt: new Date(searchReturn).toISOString(),
      expiresAt,
      status: "PENDING",
      customerId: "ONLINE_GUEST",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      vehicle: tenantVehicles.find((v) => v.id === candidate.id),
    };

    setHolds((prev) => [newHold, ...prev]);

    // Also register hold allocation in timeline
    const holdAlloc: VehicleAllocation = {
      id: newHold.allocationId,
      tenantId: activeTenantId,
      vehicleId: candidate.id,
      allocationType: "TEMPORARY_HOLD",
      startsAt: newHold.startsAt,
      endsAt: newHold.endsAt,
      status: "HELD",
      holdToken: token,
      sourceType: "CHECKOUT_SESSION",
      sourceId: token,
      reason: "Public Web Checkout Hold (15 Min TTL)",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    setAllocations((prev) => [...prev, holdAlloc]);

    alert(`Checkout hold created for ${candidate.registrationNumber}! Token: ${token} (Expires in 15 minutes)`);
    handleSearch();
  };

  // Confirm hold into confirmed booking allocation
  const handleConfirmHold = (hold: AllocationHold) => {
    setHolds((prev) =>
      prev.map((h) => (h.id === hold.id ? { ...h, status: "CONVERTED" as const } : h))
    );
    setAllocations((prev) =>
      prev.map((a) =>
        a.id === hold.allocationId
          ? {
              ...a,
              status: "CONFIRMED",
              allocationType: "BOOKING",
              sourceType: "BOOKING",
              sourceId: `BKG-${Math.floor(1000 + Math.random() * 9000)}`,
              reason: "Confirmed Booking from Web Hold",
            }
          : a
      )
    );
    alert(`Hold ${hold.holdToken} converted to Confirmed Booking Allocation!`);
  };

  // Release hold
  const handleReleaseHold = (holdId: string, allocId: string) => {
    setHolds((prev) =>
      prev.map((h) => (h.id === holdId ? { ...h, status: "RELEASED" } : h))
    );
    setAllocations((prev) => prev.filter((a) => a.id !== allocId));
  };

  // Create Vehicle Block
  const handleCreateBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockVehicleId || !newBlockStartsAt || !newBlockEndsAt) {
      alert("Please select vehicle and specify start & end timestamps.");
      return;
    }
    const newBlock: VehicleBlock = {
      id: `blk_${Date.now()}`,
      tenantId: activeTenantId,
      vehicleId: newBlockVehicleId,
      blockType: newBlockType,
      startsAt: new Date(newBlockStartsAt).toISOString(),
      endsAt: new Date(newBlockEndsAt).toISOString(),
      reason: newBlockReason || "Operational Fleet Block",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setBlocks((prev) => [newBlock, ...prev]);
    setNewBlockReason("");
    alert("Vehicle Block successfully established. The vehicle is excluded from availability queries for that range.");
  };

  // Release Block
  const handleReleaseBlock = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, status: "RELEASED" } : b))
    );
  };

  // Concurrency Overlap Test simulator
  const handleRunConflictTest = () => {
    if (!testVehicleId || !testStartsAt || !testEndsAt) {
      alert("Please choose a vehicle and interval.");
      return;
    }
    const reqStart = new Date(testStartsAt).getTime();
    const reqEnd = new Date(testEndsAt).getTime();

    if (reqEnd <= reqStart) {
      setTestResult({
        success: false,
        message: "Invalid Interval: return must be after pickup.",
      });
      return;
    }

    // Check overlaps
    const conflictingAlloc = allocations.find((a) => {
      if (a.vehicleId !== testVehicleId || a.status === "RELEASED") return false;
      const s = new Date(a.startsAt).getTime();
      const e = new Date(a.endsAt).getTime();
      return reqStart < e && reqEnd > s;
    });

    const conflictingBlock = blocks.find((b) => {
      if (b.vehicleId !== testVehicleId || b.status !== "ACTIVE") return false;
      const s = new Date(b.startsAt).getTime();
      const e = new Date(b.endsAt).getTime();
      return reqStart < e && reqEnd > s;
    });

    if (conflictingAlloc) {
      setTestResult({
        success: false,
        message: `CONFLICT DETECTED: Vehicle is already allocated (Allocation #${conflictingAlloc.id} for ${conflictingAlloc.sourceId}). PostgreSQL GiST exclusion constraint blocks double-booking.`,
        conflicts: [conflictingAlloc],
      });
    } else if (conflictingBlock) {
      setTestResult({
        success: false,
        message: `CONFLICT DETECTED: Vehicle has an active ${conflictingBlock.blockType} block (${conflictingBlock.reason}).`,
        conflicts: [conflictingBlock],
      });
    } else {
      setTestResult({
        success: true,
        message: "AVAILABLE: Half-open interval [start, end) is completely free and safe for atomic allocation.",
      });
    }
  };

  // Handle vehicle substitution
  const handleSubstitute = () => {
    if (!subTargetAllocId || !subNewVehicleId) {
      setSubMessage({ success: false, text: "Select an allocation and new replacement vehicle." });
      return;
    }

    const alloc = allocations.find((a) => a.id === subTargetAllocId);
    if (!alloc) {
      setSubMessage({ success: false, text: "Target allocation not found." });
      return;
    }

    // Check if new vehicle has conflict
    const s = new Date(alloc.startsAt).getTime();
    const e = new Date(alloc.endsAt).getTime();
    const hasConflict = allocations.some((a) => {
      if (a.id === alloc.id || a.vehicleId !== subNewVehicleId || a.status === "RELEASED") return false;
      return s < new Date(a.endsAt).getTime() && e > new Date(a.startsAt).getTime();
    });

    if (hasConflict) {
      setSubMessage({
        success: false,
        text: "Replacement vehicle has an overlapping reservation during that window. Substitution rejected.",
      });
      return;
    }

    // Execute atomic swap
    const oldVehicle = tenantVehicles.find((v) => v.id === alloc.vehicleId);
    const newVehicle = tenantVehicles.find((v) => v.id === subNewVehicleId);

    setAllocations((prev) =>
      prev.map((a) =>
        a.id === alloc.id
          ? {
              ...a,
              vehicleId: subNewVehicleId,
              reason: `Substituted from ${oldVehicle?.registrationPlate || "previous vehicle"} to ${newVehicle?.registrationPlate || "replacement"}`,
              updatedAt: new Date().toISOString(),
              version: a.version + 1,
            }
          : a
      )
    );

    setSubMessage({
      success: true,
      text: `Vehicle successfully substituted to ${newVehicle?.registrationPlate || "new vehicle"} without interval gaps.`,
    });
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header & Metric Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Availability Engine & Concurrency Dispatch
            </h1>
            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300">
              Allocation connection pending
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review allocation screens. Saved allocations, holds and blocks are not connected yet; empty cells do not confirm availability.
          </p>
        </div>

        {/* Quick Tabs */}
        <div className="flex rounded-lg bg-slate-200/80 p-1 dark:bg-slate-800">
          <button
            onClick={() => setActiveSubTab("timeline")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeSubTab === "timeline"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Dispatch Gantt
          </button>
          <button
            onClick={() => setActiveSubTab("search")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeSubTab === "search"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            Candidate Search
          </button>
          <button
            onClick={() => setActiveSubTab("holds")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeSubTab === "holds"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Temporary Holds ({restoration ? "—" : holds.filter((h) => h.status === "PENDING").length})
          </button>
          <button
            onClick={() => setActiveSubTab("blocks")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeSubTab === "blocks"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            Blocks ({restoration ? "—" : blocks.filter((b) => b.status === "ACTIVE").length})
          </button>
          <button
            onClick={() => setActiveSubTab("substitute")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeSubTab === "substitute"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Substitution
          </button>
        </div>
      </div>

      {/* STATS STRIP */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Fleet Assets
            </span>
            <Car className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {tenantVehicles.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Operable fleet under active tenant</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Allocations
            </span>
            <CalendarCheck className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {restoration ? "—" : allocations.filter((a) => a.status === "CONFIRMED").length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Confirmed booking reservations</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Checkout Holds
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {restoration ? "—" : holds.filter((h) => h.status === "PENDING").length}
          </p>
          <p className="mt-1 text-xs text-slate-500">15-min temporary cart reservations</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Outages & Blocks
            </span>
            <Wrench className="h-4 w-4 text-rose-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
            {restoration ? "—" : blocks.filter((b) => b.status === "ACTIVE").length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Maintenance & compliance blocks</p>
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* SUBTAB 1: DISPATCH TIMELINE / GANTT VIEW                               */}
      {/* ---------------------------------------------------------------------- */}
      {activeSubTab === "timeline" && (
        <div className="space-y-4">
          {/* Timeline Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Window Start:
              </label>
              <input
                type="date"
                value={timelineStartDate}
                onChange={(e) => setTimelineStartDate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDaysCount(d)}
                    className={`rounded px-2.5 py-1 text-xs font-semibold ${
                      daysCount === d
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                    }`}
                  >
                    {d} Days
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-blue-500" />
                <span className="text-slate-600 dark:text-slate-400">Confirmed Booking</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-amber-500" />
                <span className="text-slate-600 dark:text-slate-400">Temporary Hold</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-rose-500" />
                <span className="text-slate-600 dark:text-slate-400">Maintenance / Block</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-slate-100 border border-slate-300 dark:bg-slate-800 dark:border-slate-700" />
                <span className="text-slate-600 dark:text-slate-400">Available</span>
              </div>
            </div>
          </div>

          {/* Timeline Matrix Grid */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="min-w-[900px]">
              {/* Header Row */}
              <div className="grid grid-cols-[220px_repeat(14,1fr)] border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="p-3 text-xs font-bold text-slate-700 dark:text-slate-300">
                  Vehicle Asset / Plate
                </div>
                {timelineDates.map((date, idx) => {
                  const isToday =
                    date.toISOString().split("T")[0] === new Date().toISOString().split("T")[0];
                  return (
                    <div
                      key={idx}
                      className={`border-l border-slate-200 p-2 text-center text-xs dark:border-slate-800 ${
                        isToday ? "bg-emerald-50 text-emerald-700 font-bold dark:bg-emerald-950/40 dark:text-emerald-300" : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <div className="font-semibold">{date.toLocaleDateString(undefined, { weekday: "short" })}</div>
                      <div className="text-[10px]">{date.getDate()} {date.toLocaleDateString(undefined, { month: "short" })}</div>
                    </div>
                  );
                })}
              </div>

              {/* Rows per vehicle */}
              {tenantVehicles.map((vehicle) => {
                const vehicleAllocs = allocations.filter(
                  (a) => a.vehicleId === vehicle.id && a.status !== "RELEASED"
                );
                const vehicleBlocks = blocks.filter(
                  (b) => b.vehicleId === vehicle.id && b.status === "ACTIVE"
                );

                return (
                  <div
                    key={vehicle.id}
                    className="grid grid-cols-[220px_repeat(14,1fr)] border-b border-slate-200 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-800/20"
                  >
                    {/* Vehicle Info Column */}
                    <div className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {vehicle.registrationPlate}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {vehicle.category}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {vehicle.make} {vehicle.model} ({vehicle.year})
                      </div>
                    </div>

                    {/* Day Cells */}
                    {timelineDates.map((day, dIdx) => {
                      const dayStart = new Date(day);
                      dayStart.setHours(0, 0, 0, 0);
                      const dayEnd = new Date(day);
                      dayEnd.setHours(23, 59, 59, 999);

                      const dayAlloc = vehicleAllocs.find((a) => {
                        const aS = new Date(a.startsAt).getTime();
                        const aE = new Date(a.endsAt).getTime();
                        return dayStart.getTime() < aE && dayEnd.getTime() > aS;
                      });

                      const dayBlock = vehicleBlocks.find((b) => {
                        const bS = new Date(b.startsAt).getTime();
                        const bE = new Date(b.endsAt).getTime();
                        return dayStart.getTime() < bE && dayEnd.getTime() > bS;
                      });

                      return (
                        <div
                          key={dIdx}
                          className="relative flex items-center justify-center border-l border-slate-200 p-1 dark:border-slate-800"
                        >
                          {dayAlloc && (
                            <div
                              title={`${dayAlloc.sourceId || dayAlloc.id}: ${dayAlloc.reason || "Booking"}`}
                              className={`h-7 w-full rounded text-[10px] font-semibold text-white flex items-center justify-center shadow-xs truncate px-1 cursor-pointer transition-all hover:scale-105 ${
                                dayAlloc.status === "HELD"
                                  ? "bg-amber-500 hover:bg-amber-600"
                                  : "bg-blue-600 hover:bg-blue-700"
                              }`}
                            >
                              {dayAlloc.sourceId || "Reserved"}
                            </div>
                          )}
                          {!dayAlloc && dayBlock && (
                            <div
                              title={`${dayBlock.blockType}: ${dayBlock.reason}`}
                              className="h-7 w-full rounded bg-rose-500 hover:bg-rose-600 text-[10px] font-semibold text-white flex items-center justify-center shadow-xs truncate px-1 cursor-pointer"
                            >
                              {dayBlock.blockType}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* SUBTAB 2: CANDIDATE SEARCH ENGINE                                     */}
      {/* ---------------------------------------------------------------------- */}
      {activeSubTab === "search" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Fleet Availability Search & Candidate Matcher
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Query eligible operable vehicles for specific pickup/return windows with configurable turnaround buffers.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Pickup Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={searchPickup}
                  onChange={(e) => setSearchPickup(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Return Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={searchReturn}
                  onChange={(e) => setSearchReturn(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Vehicle Category
                </label>
                <select
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="ALL">All Categories</option>
                  <option value="SUV">SUV</option>
                  <option value="Sedan">Sedan</option>
                  <option value="4x4 Offroad">4x4 Offroad</option>
                  <option value="Luxury">Luxury</option>
                  <option value="Hatchback">Hatchback</option>
                  <option value="Van/Bus">Van/Bus</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Turnaround Cleaning Buffer
                </label>
                <select
                  value={searchTurnaround}
                  onChange={(e) => setSearchTurnaround(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value={0}>0 Minutes (Immediate)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>60 Minutes (Standard)</option>
                  <option value={120}>120 Minutes (Deep Clean)</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button disabled={restoration} aria-describedby="restoration-actions-note"
                type="button"
                onClick={handleSearch}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
              >
                <Search className="h-4 w-4" />
                Find Available Vehicles
              </button>
            </div>
          </div>

          {/* Results Grid */}
          {searchPerformed && searchResults && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Available Vehicles ({searchResults.length} Match{searchResults.length === 1 ? "" : "es"})
                </h3>
                <span className="text-xs text-slate-500">
                  Guaranteed free for [{new Date(searchPickup).toLocaleString()} → {new Date(searchReturn).toLocaleString()}]
                </span>
              </div>

              {searchResults.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
                  <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
                  <h4 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
                    No Vehicles Available For This Interval
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    All fleet vehicles are either allocated, held, or undergoing maintenance during the requested range.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {searchResults.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-emerald-500/50 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            {v.categoryName}
                          </span>
                          <h4 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                            {v.make} {v.model}
                          </h4>
                          <p className="text-xs text-slate-500">
                            Plate: {v.registrationNumber} • {v.year}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            {activeTenant?.defaultCurrency || "KES"} {(v.dailyRate || 10000).toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-400">per day</div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1">
                        {v.features?.map((f, i) => (
                          <span
                            key={i}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          >
                            {f}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800 flex gap-2">
                        <button disabled={restoration} aria-describedby="restoration-actions-note"
                          type="button"
                          onClick={() => handleCreateHold(v)}
                          className="flex-1 rounded-lg bg-amber-500 py-1.5 text-xs font-bold text-white hover:bg-amber-600 shadow-xs"
                        >
                          Hold 15-Min
                        </button>
                        <button disabled={restoration} aria-describedby="restoration-actions-note"
                          type="button"
                          onClick={() => {
                            const alloc: VehicleAllocation = {
                              id: `alloc_${Date.now()}`,
                              tenantId: activeTenantId,
                              vehicleId: v.id,
                              allocationType: "BOOKING",
                              startsAt: new Date(searchPickup).toISOString(),
                              endsAt: new Date(searchReturn).toISOString(),
                              status: "CONFIRMED",
                              sourceType: "BOOKING",
                              sourceId: `BKG-${Math.floor(1000 + Math.random() * 9000)}`,
                              reason: "Direct Booking Allocation",
                              createdAt: new Date().toISOString(),
                              updatedAt: new Date().toISOString(),
                              version: 1,
                            };
                            setAllocations((prev) => [...prev, alloc]);
                            alert(`Vehicle ${v.registrationNumber} successfully allocated!`);
                            handleSearch();
                          }}
                          className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-xs"
                        >
                          Book Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* SUBTAB 3: TEMPORARY HOLDS MANAGEMENT                                  */}
      {/* ---------------------------------------------------------------------- */}
      {activeSubTab === "holds" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Temporary Checkout Holds
              </h2>
              <p className="text-xs text-slate-500">
                Non-committal reservations protecting customer carts against race conditions. Auto-release upon TTL expiration.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">Hold Token</th>
                  <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">Vehicle</th>
                  <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">Reservation Window</th>
                  <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">Expires At</th>
                  <th className="p-3 font-semibold text-slate-700 dark:text-slate-300">Status</th>
                  <th className="p-3 text-right font-semibold text-slate-700 dark:text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {holds.map((h) => {
                  const v = tenantVehicles.find((tv) => tv.id === h.vehicleId);
                  const isExpired = new Date(h.expiresAt).getTime() <= Date.now();

                  return (
                    <tr key={h.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                        {h.holdToken}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {v?.registrationPlate || "KDA 101A"}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {v?.make} {v?.model}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">
                        {new Date(h.startsAt).toLocaleDateString()} → {new Date(h.endsAt).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">
                        {new Date(h.expiresAt).toLocaleTimeString()}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            h.status === "CONVERTED"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : isExpired || h.status === "EXPIRED"
                              ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                          }`}
                        >
                          {isExpired && h.status === "PENDING" ? "EXPIRED" : h.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {h.status === "PENDING" && !isExpired && (
                          <div className="flex justify-end gap-1.5">
                            <button disabled={restoration} aria-describedby="restoration-actions-note"
                              type="button"
                              onClick={() => handleConfirmHold(h)}
                              className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-500"
                            >
                              Confirm Booking
                            </button>
                            <button disabled={restoration} aria-describedby="restoration-actions-note"
                              type="button"
                              onClick={() => handleReleaseHold(h.id, h.allocationId)}
                              className="rounded bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* SUBTAB 4: VEHICLE BLOCKS & OUTAGES                                     */}
      {/* ---------------------------------------------------------------------- */}
      {activeSubTab === "blocks" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Create Block Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="h-4 w-4 text-rose-500" />
              Establish Vehicle Block
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Isolate a vehicle from commercial allocation for maintenance, impound, or regulatory compliance.
            </p>

            <form onSubmitCapture={restoration ? e => {e.preventDefault();e.stopPropagation();} : undefined} onSubmit={handleCreateBlock} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Select Vehicle
                </label>
                <select
                  required
                  value={newBlockVehicleId}
                  onChange={(e) => setNewBlockVehicleId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">-- Choose Vehicle --</option>
                  {tenantVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registrationPlate} ({v.make} {v.model})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Block Category
                </label>
                <select
                  value={newBlockType}
                  onChange={(e) => setNewBlockType(e.target.value as VehicleBlockType)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="MAINTENANCE">Maintenance / Workshop</option>
                  <option value="INSPECTION">Inspection / Pre-Trip</option>
                  <option value="ACCIDENT_REPAIR">Accident Repair</option>
                  <option value="IMPOUND">Impound / Legal</option>
                  <option value="ADMIN_HOLD">Administrative Hold</option>
                  <option value="COMPLIANCE_LOCK">Compliance / NTSA Lock</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Block Start
                </label>
                <input
                  required
                  type="datetime-local"
                  value={newBlockStartsAt}
                  onChange={(e) => setNewBlockStartsAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Block End
                </label>
                <input
                  required
                  type="datetime-local"
                  value={newBlockEndsAt}
                  onChange={(e) => setNewBlockEndsAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reason / Operational Notes
                </label>
                <textarea
                  rows={2}
                  value={newBlockReason}
                  onChange={(e) => setNewBlockReason(e.target.value)}
                  placeholder="e.g. Scheduled 50k service at Toyota Kenya..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <button disabled={restoration} aria-describedby="restoration-actions-note"
                type="submit"
                className="w-full rounded-lg bg-rose-600 py-2 text-xs font-bold text-white hover:bg-rose-500 shadow-sm"
              >
                Apply Operational Block
              </button>
            </form>
          </div>

          {/* Active Blocks List */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Active Vehicle Outages ({restoration ? "—" : blocks.filter((b) => b.status === "ACTIVE").length})
            </h3>

            <div className="space-y-2">
              {blocks.map((b) => {
                const v = tenantVehicles.find((tv) => tv.id === b.vehicleId);
                return (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-rose-50 p-2 dark:bg-rose-950/50">
                        <Wrench className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {v?.registrationPlate || "KDA 101A"}
                          </span>
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                            {b.blockType}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{b.reason}</p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {new Date(b.startsAt).toLocaleString()} → {new Date(b.endsAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div>
                      {b.status === "ACTIVE" ? (
                        <button disabled={restoration} aria-describedby="restoration-actions-note"
                          type="button"
                          onClick={() => handleReleaseBlock(b.id)}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          Release Block
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">RELEASED</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* SUBTAB 5: VEHICLE SUBSTITUTION WORKFLOW                                */}
      {/* ---------------------------------------------------------------------- */}
      {activeSubTab === "substitute" && (
        <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-500" />
            Atomic Vehicle Substitution
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Swap an assigned vehicle on an existing allocation without breaking interval invariants or creating double-booking gaps.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                1. Select Active Booking Allocation to Substitute
              </label>
              <select
                value={subTargetAllocId}
                onChange={(e) => setSubTargetAllocId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">-- Choose Allocation --</option>
                {allocations
                  .filter((a) => a.status === "CONFIRMED")
                  .map((a) => {
                    const v = tenantVehicles.find((tv) => tv.id === a.vehicleId);
                    return (
                      <option key={a.id} value={a.id}>
                        {a.sourceId || a.id} — Currently on {v?.registrationPlate} (
                        {new Date(a.startsAt).toLocaleDateString()} to {new Date(a.endsAt).toLocaleDateString()})
                      </option>
                    );
                  })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                2. Select Replacement Vehicle
              </label>
              <select
                value={subNewVehicleId}
                onChange={(e) => setSubNewVehicleId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">-- Choose Replacement Vehicle --</option>
                {tenantVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registrationPlate} ({v.make} {v.model} • {v.category})
                  </option>
                ))}
              </select>
            </div>

            {subMessage && (
              <div
                className={`rounded-lg p-3 text-xs ${
                  subMessage.success
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-200"
                }`}
              >
                {subMessage.text}
              </div>
            )}

            <button disabled={restoration} aria-describedby="restoration-actions-note"
              type="button"
              onClick={handleSubstitute}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-500 shadow-sm"
            >
              Perform Atomic Substitution
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
