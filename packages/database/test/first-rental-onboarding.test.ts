import assert from "node:assert/strict";
import {
  FIRST_RENTAL_STEP_IDS, FirstRentalSetupService,
  type FirstRentalReaders, type FirstRentalStepId,
} from "../../../apps/api/src/modules/tenancy/application/services/first-rental-setup.service";

async function run() {
  const facts = new Map<string, Set<FirstRentalStepId>>();
  const has = async (tenantId: string, step: FirstRentalStepId) =>
    facts.get(tenantId)?.has(step) || false;
  const readers: FirstRentalReaders = {
    hasVehicle: id => has(id, "VEHICLES"),
    hasCustomerAndDriver: id => has(id, "PEOPLE"),
    hasActivePricing: id => has(id, "PRICING"),
    hasConfirmedAllocation: id => has(id, "AVAILABILITY"),
    hasBooking: id => has(id, "BOOKING"),
    hasCompletedHandover: id => has(id, "HANDOVER"),
  };
  // Inject a named shared store to simulate different sessions/instances.
  const persisted = new Map<string, any>();
  const service = new FirstRentalSetupService(readers, persisted);
  const anotherSession = new FirstRentalSetupService(readers, persisted);

  const first = await service.getStatus("tenant-a");
  assert.equal(first.state, "NOT_STARTED");
  assert.equal(first.visibleOnOverview, true);
  assert.equal(first.completedCount, 0);
  assert.deepEqual(first.steps.map(s => s.id), [...FIRST_RENTAL_STEP_IDS]);

  facts.set("tenant-a", new Set(["VEHICLES", "PEOPLE", "PRICING"]));
  const progress = await service.getStatus("tenant-a");
  assert.equal(progress.state, "IN_PROGRESS");
  assert.equal(progress.completedCount, 3);
  assert.equal(progress.steps.find(s => s.id === "PRICING")?.section, "pricing");

  assert.equal(await service.changeVisibility("tenant-a", "DISMISS"), true);
  assert.equal(await service.changeVisibility("tenant-a", "DISMISS"), false, "Repeated dismiss should not generate a second change");
  assert.equal((await anotherSession.getStatus("tenant-a")).state, "DISMISSED");
  assert.equal((await anotherSession.getStatus("tenant-a")).visibleOnOverview, false);
  assert.equal((await service.getStatus("tenant-b")).visibleOnOverview, true, "Company B cannot inherit A's dismissal");
  assert.equal(await anotherSession.changeVisibility("tenant-a", "RESTORE"), true);
  assert.equal((await service.getStatus("tenant-a")).visibleOnOverview, true);

  // Historical setup observations are retained when operations change later.
  facts.set("tenant-a", new Set(["VEHICLES", "BOOKING", "AVAILABILITY"]));
  const after = await service.getStatus("tenant-a");
  assert.equal(after.completedCount, 5);
  assert.equal(after.steps.find(s => s.id === "PRICING")?.complete, true);
  assert.equal(after.completedAt, null);

  // Only a genuine completed handover produces the terminal one-time state.
  facts.set("tenant-a", new Set(["HANDOVER"]));
  const finished = await service.getStatus("tenant-a");
  assert.equal(finished.state, "COMPLETED");
  assert.equal(finished.visibleOnOverview, false);
  assert.ok(finished.completedAt);
  assert.equal(await service.changeVisibility("tenant-a", "RESTORE"), false, "Reopening cannot undo completed onboarding");
  assert.equal(await anotherSession.changeVisibility("tenant-a", "DISMISS"), false);

  facts.set("tenant-a", new Set());
  const afterDeletion = await anotherSession.getStatus("tenant-a");
  assert.equal(afterDeletion.state, "COMPLETED");
  assert.equal(afterDeletion.completedAt, finished.completedAt);
  assert.equal(afterDeletion.visibleOnOverview, false, "Completed company never sees setup again after data changes");
  assert.equal((await service.getStatus("tenant-b")).state, "NOT_STARTED");

  // An unavailable dependency must fail closed, not render "all steps done" or
  // silently store false/incomplete data.
  const broken = new FirstRentalSetupService({
    ...readers,
    hasActivePricing: async () => { throw new Error("pricing database unavailable"); },
  }, new Map());
  await assert.rejects(broken.getStatus("tenant-c"), /pricing database unavailable/);

  await assert.rejects(service.getStatus(""), /Verified tenant context required/);
  await assert.rejects(service.changeVisibility("", "DISMISS"), /Verified tenant context required/);

  console.log("UX-D2 PASS — tenant scope, real progress, persisted dismissal, restore, terminal completion, no false success");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
