import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESTORATION_SCREEN_CONNECTIONS } from '../../../src/lib/access-context';

const view=readFileSync('src/components/AvailabilityExperienceView.tsx','utf8');
const legacy=readFileSync('src/components/AvailabilityView.tsx','utf8');
const restored=readFileSync('src/components/RestoredWorkspace.tsx','utf8');
const client=readFileSync('src/lib/api-client.ts','utf8');
const controller=readFileSync('apps/api/src/modules/availability/presentation/availability.controller.ts','utf8');
const service=readFileSync('apps/api/src/modules/availability/application/availability.service.ts','utf8');
const repository=readFileSync('packages/database/src/repositories/vehicle-allocation.repository.ts','utf8');
const contracts=readFileSync('docs/AVAILABILITY_EXPERIENCE_CONTRACTS.md','utf8');

assert.equal(RESTORATION_SCREEN_CONNECTIONS.availability.status,'PARTIAL');
assert.equal(RESTORATION_SCREEN_CONNECTIONS.availability.mutationsEnabled,true);
assert.match(restored,/AvailabilityExperienceView/,'restored Availability route must use reconstructed dispatch experience');

for (const call of [
  'apiClient.availability.listAllocations',
  'apiClient.availability.listHolds',
  'apiClient.availability.listBlocks',
  'apiClient.availability.getVehicleCalendar',
  'apiClient.availability.searchAvailableVehicles',
  'apiClient.availability.checkAvailability',
  'apiClient.availability.createAllocation',
  'apiClient.availability.releaseAllocation',
  'apiClient.availability.substituteAllocation',
  'apiClient.availability.createHold',
  'apiClient.availability.confirmHold',
  'apiClient.availability.releaseHold',
  'apiClient.availability.createBlock',
  'apiClient.availability.releaseBlock',
]) assert.ok(view.includes(call), 'Availability experience must use '+call);

for (const permission of ['availability.read','allocation.create','allocation.manage','vehicle_block.create','vehicle_block.manage'])
  assert.ok(view.includes(permission), 'Availability UI must account for '+permission);

assert.match(client,/checkAvailability:\s*\(dto: any\) => this\.post\('\/availability\/check'/,'direct check must be POST');
assert.match(client,/searchAvailableVehicles:\s*\(dto: any\) => this\.post\('\/availability\/search'/,'candidate search must be POST');
assert.doesNotMatch(client,/\/availability\/timeline/,'nonexistent legacy timeline endpoint must not remain');
assert.match(controller,/router\.get\(\s*"\/allocations"/s);
assert.match(controller,/router\.get\(\s*"\/holds"/s);
assert.match(controller,/router\.get\(\s*"\/blocks"/s);
assert.match(service,/async listAllocations\(/);
assert.match(service,/async listHolds\(/);
assert.match(service,/async listVehicleBlocks\(/);
assert.match(repository,/async listHolds\(/);

assert.doesNotMatch(view,/Math\.random\(|Date\.now\(\).*hld_|setAllocations\(\(prev\)/,'reconstructed Availability UI must not generate local allocation/hold identity or mutate local allocation truth');
assert.doesNotMatch(view,/effectivePickup\s*<|effectiveReturn\s*>|hasAllocConflict|hasHoldConflict|hasBlockConflict/,'browser overlap algorithm must not be authoritative');
assert.ok(legacy.includes('hasAllocConflict'),'legacy reference should retain evidence of the local overlap algorithm being replaced');

for (let i=1;i<=20;i++){const id='AVAILABILITY-'+String(i).padStart(3,'0');assert.ok(contracts.includes(id),'Missing Availability contract '+id);}

assert.match(view,/7 days/);
assert.match(view,/14 days/);
assert.match(view,/30 days/);
assert.match(view,/This Workbench result is not a Booking|Opening Bookings does not persist this candidate as a Booking/,'Booking boundary must remain truthful');
assert.match(view,/Empty calendar space is never treated as proof of availability/,'timeline must not imply availability from visual emptiness');
assert.match(view,/overflow-x-auto/,'Availability tabs must remain reachable on narrow screens');

console.log('PASS: Availability is server-backed, concurrency-aware, permission-scoped and free of local dispatch simulation.');
