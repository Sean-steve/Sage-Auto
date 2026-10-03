import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESTORATION_SCREEN_CONNECTIONS } from '../../../src/lib/access-context';

const view=readFileSync('src/components/FleetExperienceView.tsx','utf8');
const restored=readFileSync('src/components/RestoredWorkspace.tsx','utf8');
const client=readFileSync('src/lib/api-client.ts','utf8');
const service=readFileSync('apps/api/src/modules/fleet/application/fleet.service.ts','utf8');
const contracts=readFileSync('docs/FLEET_EXPERIENCE_CONTRACTS.md','utf8');

assert.equal(RESTORATION_SCREEN_CONNECTIONS.fleet.status,'PARTIAL');
assert.equal(RESTORATION_SCREEN_CONNECTIONS.fleet.mutationsEnabled,true);

assert.match(restored,/FleetExperienceView/,'restored Fleet must use the reconstructed experience');
assert.doesNotMatch(view,/INITIAL_VEHICLES|mockData|localStorage\.setItem\([^)]*vehicle/i,'Fleet experience must not use legacy/mock vehicle authority');

for (const call of [
  'apiClient.fleet.listVehicles',
  'apiClient.fleet.createVehicle',
  'apiClient.fleet.getDigitalTwin',
  'apiClient.fleet.updateVehicle',
  'apiClient.fleet.changeLifecycleStatus',
  'apiClient.fleet.changeAvailabilityStatus',
  'apiClient.fleet.recordMileage',
  'apiClient.fleet.recordFuel',
  'apiClient.vehicleOwners.assignOwnership',
  'apiClient.vehicleOwners.transferOwnership',
  'apiClient.maintenance.listWorkOrders',
  'apiClient.compliance.listRecords',
  'apiClient.compliance.getVehicleReadiness',
  'apiClient.inspections.listInspections',
  'apiClient.inspections.listDamageCases',
]) assert.ok(view.includes(call), `Fleet experience must use ${call}`);

for (const permission of [
  'vehicle.create','vehicle.update','vehicle.status_override','vehicle_owner.read',
  'vehicle_ownership.manage','maintenance.read','compliance.read','inspection.read'
]) assert.ok(view.includes(permission), `Fleet UI must account for ${permission}`);

assert.match(client,/getCategories:/);
assert.match(client,/getDocuments:/);
assert.match(client,/addDocument:/);

assert.doesNotMatch(service,/totalRentals:\s*14/,'Fleet digital twin must not contain fabricated rental count');
assert.doesNotMatch(service,/utilizationRatePercent:\s*78\.5/,'Fleet digital twin must not contain fabricated utilization');
assert.match(service,/rentalRepository/,'Fleet digital twin must derive rental history from the rental repository');

for (const contract of [
  'FLEET-001','FLEET-002','FLEET-003','FLEET-004','FLEET-005','FLEET-006',
  'FLEET-007','FLEET-008','FLEET-009','FLEET-010','FLEET-011','FLEET-012'
]) assert.ok(contracts.includes(contract), `Missing Fleet contract ${contract}`);

assert.match(view,/md:hidden/,'Fleet list must have a mobile card presentation');
assert.match(view,/overflow-x-auto/,'Fleet detail tabs must remain reachable on narrow screens');
assert.match(view,/expectedVersion/,'Fleet mutations must preserve optimistic concurrency where supported');

console.log('PASS: Fleet experience is server-backed, permission-aware, truthful and responsive.');
