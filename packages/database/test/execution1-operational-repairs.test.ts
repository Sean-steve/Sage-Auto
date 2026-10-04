import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fleet=readFileSync("src/components/FleetExperienceView.tsx","utf8");
const availability=readFileSync("src/components/AvailabilityExperienceView.tsx","utf8");
const bookingSchema=readFileSync("packages/validation/src/schemas.ts","utf8");
const inspection=readFileSync("src/components/modals/InspectionModal.tsx","utf8");
const handover=readFileSync("src/components/ContractHandoverExperienceView.tsx","utf8");
const maintenance=readFileSync("src/components/MaintenanceView.tsx","utf8");
const maintenanceService=readFileSync("apps/api/src/modules/maintenance/application/maintenance.service.ts","utf8");

assert.match(fleet,/profileName:"VEHICLE_GALLERY"/);
assert.match(fleet,/Remove image/);
assert.match(fleet,/removeMedia/);

assert.doesNotMatch(availability,/return\(\)=>\{refreshSeq\.current\+\+;\}/);
assert.match(availability,/automatically stop blocking after their TTL expires/);
assert.match(availability,/Sage Auto found capacity for the requested dates/);

assert.match(bookingSchema,/requestedVehicleCategoryId: z\.string\(\)\.optional\(\)/);
assert.match(bookingSchema,/pickupAt: z\.string\(\)\.min\(1\)\.optional\(\)/);
assert.match(bookingSchema,/source: z\.enum\(\["TENANT_ADMIN","OPERATIONS_DESK"/);

assert.match(inspection,/const resolvedContext=useMemo/);
assert.match(inspection,/Add defect record/);
assert.match(inspection,/customerId=resolvedContext\.customerId/);
assert.match(inspection,/rentalId:resolvedContext\.rentalId/);

assert.match(handover,/const eligibleInspections=inspections/);
assert.match(handover,/i\.vehicleId===handover\.vehicleId/);
assert.match(handover,/i\.bookingId===handover\.bookingId/);
assert.match(handover,/attachedInspection\?\.odometer/);

assert.match(maintenance,/dispatchingScheduleId/);
assert.match(maintenance,/Dispatching…/);
assert.match(maintenanceService,/const scheduledEndAt =/);
assert.doesNotMatch(maintenanceService,/catch \(err\) \{\n        \/\/ Log or rethrow as availability conflict/);

console.log("✓ Execution 1 UI/operations regression contract passed");
