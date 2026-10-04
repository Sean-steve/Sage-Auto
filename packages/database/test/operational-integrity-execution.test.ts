import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fleet=readFileSync("src/components/FleetExperienceView.tsx","utf8");
const compliance=readFileSync("src/components/ComplianceView.tsx","utf8");
const secureFile=readFileSync("src/lib/secure-file.ts","utf8");
const availability=readFileSync("src/components/AvailabilityExperienceView.tsx","utf8");
const allocationRepo=readFileSync("packages/database/src/repositories/vehicle-allocation.repository.ts","utf8");
const handover=readFileSync("apps/api/src/modules/handovers/application/handover.service.ts","utf8");
const providerModal=readFileSync("src/components/modals/NewProviderModal.tsx","utf8");
const providerRepo=readFileSync("packages/database/src/repositories/service-provider.repository.ts","utf8");
const bookingService=readFileSync("apps/api/src/modules/bookings/application/booking.service.ts","utf8");
const access=readFileSync("apps/api/src/modules/access/access.controller.ts","utf8");
const ownerView=readFileSync("src/components/VehicleOwnersView.tsx","utf8");
const store=readFileSync("src/lib/store.tsx","utf8");
const pricing=readFileSync("src/components/PricingExperienceView.tsx","utf8");
const customers=readFileSync("packages/database/src/repositories/customer.repository.ts","utf8");
const drivers=readFileSync("packages/database/src/repositories/driver.repository.ts","utf8");
const owners=readFileSync("packages/database/src/repositories/vehicle-owner.repository.ts","utf8");

assert.match(secureFile,/uploadSecureResourceFile/);
assert.match(secureFile,/openAttachmentReference/);
assert.match(fleet,/Or upload PDF \/ image/);
assert.match(fleet,/Document link/);
assert.match(compliance,/Or upload PDF \/ image/);
assert.match(compliance,/Document link/);

assert.match(availability,/All vehicles/);
assert.match(availability,/Active holds are shown first/);
assert.match(availability,/Related booking \/ work-order reference/);
assert.doesNotMatch(allocationRepo,/overlapping \$\{existing\.status\} allocation \(\$\{existing\.id\}\)/);

assert.match(handover,/HANDOVER_CHECKPOINT_BLOCKED/);
assert.match(handover,/statusCode=409/);

assert.match(providerRepo,/GAR-\$\{String\(nextNumber\)\.padStart\(4,"0"\)\}/);
assert.match(providerModal,/Accepted payment methods/);
assert.match(providerModal,/Assigned automatically/);
assert.match(store,/apiClient\.maintenance\.createProvider/);

assert.match(bookingService,/DUPLICATE_BOOKING/);
assert.match(bookingService,/DRIVER_DOUBLE_BOOKED/);
assert.match(access,/\/my-bookings\/:id\/cancel/);
assert.match(access,/Booking ownership could not be verified/);

assert.match(customers,/UniqueConstraintViolationError\("customer email"\)/);
assert.match(customers,/UniqueConstraintViolationError\("driving licence number"\)/);
assert.match(drivers,/UniqueConstraintViolationError\("driver email"\)/);
assert.match(drivers,/UniqueConstraintViolationError\("driving licence number"\)/);
assert.match(owners,/UniqueConstraintViolationError\("vehicle-owner email"\)/);

assert.match(store,/apiClient\.vehicleOwners\.createOwner/);
assert.match(ownerView,/getOwnershipHistory/);
assert.match(ownerView,/Create owner agreement/);
assert.match(fleet,/uniqueOwnerOptions/);

assert.match(pricing,/Start by choosing a vehicle or a vehicle category/);
assert.match(pricing,/No active pricing rule matches this selection yet/);

console.log("✓ Operational integrity execution regression contract passed");
