import assert from "node:assert/strict";
import { seedDemoFleetForTenant, DEMO_FLEET } from "../../../scripts/demo-fleet";
import { VehicleRepository, TenantRepository } from "@carhire/database";

async function main() {
  const tenantRepo=new TenantRepository();
  const first=await tenantRepo.create({
    name:"Rental Fleet Demo Review",slug:"rental-fleet-review-test",planId:"plan-growth",
    status:"ACTIVE",currency:"KES",
  } as any);
  const second=await tenantRepo.create({
    name:"Other Tenant",slug:"other-rental-fleet-test",planId:"plan-growth",
    status:"ACTIVE",currency:"KES",
  } as any);
  const repository=new VehicleRepository();
  assert.equal((await repository.listByTenant(first.id)).length,0);

  const created=await seedDemoFleetForTenant(first.id);
  assert.equal(created.created,26);
  assert.equal(created.skipped,0);
  const cars=await repository.listByTenant(first.id);
  assert.equal(cars.length,26);
  assert.equal(new Set(cars.map(car=>car.registrationPlate)).size,26);
  assert.equal(new Set(cars.map(car=>car.vin)).size,26);
  assert.equal(new Set(cars.map(car=>car.category)).size,6);
  assert.ok(new Set(cars.map(car=>car.currentLocation)).size>=7,
    "The demonstration fleet needs geographic variety.");
  assert.ok(cars.every(car=>
    car.lifecycleStatus==="ACTIVE" &&
    car.availabilityStatus==="AVAILABLE" &&
    car.isPublishedToWebsite===false &&
    car.dailyRate>0 && car.fuelLevel>=0 &&
    car.seats>=4 && car.features.length>0
  ),"Demo cars are realistic inventory, not fictitious active rentals or public listings.");
  assert.ok(cars.some(car=>car.category==="Hatchback"&&car.dailyRate<4000));
  assert.ok(cars.some(car=>car.category==="4x4 Offroad"&&car.dailyRate>=25000));
  assert.ok(cars.some(car=>car.category==="Van/Bus"&&car.seats>=14));
  assert.deepEqual(
    (await repository.findAll(first.id,{category:"Luxury",limit:100})).vehicles.length,
    DEMO_FLEET.filter(car=>car.category==="Luxury").length
  );
  const firstCar=cars[0];
  const history=await repository.getStatusHistory(firstCar.id,first.id);
  assert.equal(history[0]?.newLifecycleStatus,"ACTIVE",
    "Use the canonical FleetService commissioning history.");
  const repeated=await seedDemoFleetForTenant(first.id);
  assert.equal(repeated.created,0);
  assert.equal(repeated.skipped,26);
  assert.equal((await repository.listByTenant(first.id)).length,26,
    "Repeat seeds must not duplicate records.");
  assert.equal((await repository.listByTenant(second.id)).length,0,
    "Seeding one tenant cannot leak vehicles to another.");
  await seedDemoFleetForTenant(second.id,{limit:3});
  assert.equal((await repository.listByTenant(second.id)).length,3);
  assert.equal((await repository.listByTenant(first.id)).length,26);

  console.log("PASS: 26 varied persisted demo cars, 6 classes, unique IDs, canonical commissioning, safe reruns and tenant isolation.");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
