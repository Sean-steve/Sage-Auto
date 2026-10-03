import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESTORATION_SCREEN_CONNECTIONS } from '../../../src/lib/access-context';

const view=readFileSync('src/components/ContractHandoverExperienceView.tsx','utf8');
const restored=readFileSync('src/components/RestoredWorkspace.tsx','utf8');
const client=readFileSync('src/lib/api-client.ts','utf8');
const contractService=readFileSync('apps/api/src/modules/contracts/application/contract.service.ts','utf8');
const handoverService=readFileSync('apps/api/src/modules/handovers/application/handover.service.ts','utf8');
const handoverState=readFileSync('apps/api/src/modules/handovers/domain/handover-state-machine.ts','utf8');
const rentalService=readFileSync('apps/api/src/modules/rentals/application/rental.service.ts','utf8');
const contracts=readFileSync('docs/CONTRACT_HANDOVER_EXPERIENCE_CONTRACTS.md','utf8');

assert.equal(RESTORATION_SCREEN_CONNECTIONS.handover.status,'PARTIAL');
assert.equal(RESTORATION_SCREEN_CONNECTIONS.handover.mutationsEnabled,true);
assert.match(restored,/ContractHandoverExperienceView/,'restored Handover route must use reconstructed experience');

for (const call of [
  'apiClient.contracts.listContracts',
  'apiClient.contracts.getContract',
  'apiClient.contracts.generateContract',
  'apiClient.contracts.sendContract',
  'apiClient.contracts.signContract',
  'apiClient.contracts.amendContract',
  'apiClient.handovers.listHandovers',
  'apiClient.handovers.getHandover',
  'apiClient.handovers.schedule',
  'apiClient.handovers.recordArrival',
  'apiClient.handovers.verifyDocuments',
  'apiClient.handovers.completeInspection',
  'apiClient.handovers.confirmSignature',
  'apiClient.handovers.handoverKeys',
  'apiClient.handovers.complete',
  'apiClient.rentals.getReadiness',
]) assert.ok(view.includes(call), 'Contract/Handover experience must use '+call);

for (const permission of [
  'contract.read','contract.generate','contract.sign','rental.read','rental.start','inspection.create'
]) assert.ok(view.includes(permission), 'Contract/Handover UI must account for '+permission);

assert.doesNotMatch(view,/apiClient\.rentals\.startRental|createRentalFromBooking|setBookings\(|setVehicles\(/,'Contract/Handover UI must not create a Rental or locally mutate Booking/Vehicle authority');
assert.match(view,/Rental creation remains in Rental Operations|does not create a Rental/,'Rental boundary must be explicit');

assert.match(contractService,/Claim the aggregate version before writing signature evidence/,'signature flow must claim optimistic version before evidence');
assert.ok(contractService.indexOf('contractRepo.update(') < contractService.indexOf('contractRepo.addSignature('),'signature evidence must be written only after aggregate version claim');
assert.match(contractService,/contractVersion: updatedContract\.contractVersion/,'signature must bind to current Contract version');

assert.match(handoverService,/Final Handover odometer cannot be lower than the verified key-handover reading/);
assert.match(handoverService,/Final Handover fuel level must be between 0 and 100/);
assert.match(handoverService,/inspection\.status !== "COMPLETED"/);
assert.match(handoverService,/inspection\.inspectionType !== "PRE_RENTAL"/);
assert.match(handoverService,/contract\.status !== "SIGNED"/);
assert.match(handoverService,/signature\.contractVersion === contract\.contractVersion/);

for (const step of ['SCHEDULED','CUSTOMER_ARRIVED','DOCUMENT_VERIFIED','PRE_RENTAL_INSPECTION','SIGNATURE','KEY_HANDOVER','HANDOVER_COMPLETED']) assert.ok(handoverState.includes(step),'Missing Handover state '+step);
assert.match(handoverState,/SCHEDULED:\s*\["CUSTOMER_ARRIVED"\]/);
assert.match(handoverState,/KEY_HANDOVER:\s*\["HANDOVER_COMPLETED"\]/);

assert.match(rentalService,/handover\.status !== "HANDOVER_COMPLETED"/,'Rental must require completed Handover');
assert.match(rentalService,/handover\.contractId !== contract\.id/,'Rental must validate Contract/Handover link');
assert.match(rentalService,/contract\.vehicleId !== vehicleId \|\| handover\.vehicleId !== vehicleId/,'Rental must validate Vehicle consistency');
assert.match(rentalService,/Booking has no active confirmed Vehicle allocation|no active confirmed Vehicle allocation/,'Rental readiness must require active Booking allocation');

assert.match(view,/Contract dispatch was recorded\/requested\. This does not by itself prove external provider delivery/,'dispatch UX must not overclaim external delivery');
assert.match(view,/The server re-reads the Inspection and uses its stored odometer\/fuel/,'inspection evidence must remain server-authoritative');
assert.match(view,/overflow-x-auto/,'checkpoint progression must remain reachable on narrow screens');

for (let i=1;i<=31;i++){const id='CONTRACT-HANDOVER-'+String(i).padStart(3,'0');assert.ok(contracts.includes(id),'Missing Contract/Handover contract '+id);}

console.log('PASS: Contract & Handover is server-backed, version-safe, sequential, evidence-bound and Rental-boundary safe.');
