import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TENANT_PERMISSIONS } from "../../constants/src/permissions";
import { TENANT_SYSTEM_ROLES } from "../../constants/src/roles";

const booking = readFileSync("src/components/BookingExperienceView.tsx", "utf8");
const workspace = readFileSync("src/components/RestoredWorkspace.tsx", "utf8");
const website = readFileSync("src/components/PublicWebsiteView.tsx", "utf8");
const fleet = readFileSync("src/components/FleetExperienceView.tsx", "utf8");
const customerAggregate = readFileSync("apps/api/src/modules/customers/domain/customer.aggregate.ts", "utf8");
const errorFilter = readFileSync("apps/api/src/common/filters/http-exception.filter.ts", "utf8");

assert.equal(TENANT_PERMISSIONS.AVAILABILITY_READ, "availability.read");
assert.equal(TENANT_PERMISSIONS.ALLOCATION_CREATE, "allocation.create");
assert.equal(TENANT_PERMISSIONS.ALLOCATION_MANAGE, "allocation.manage");
assert.equal(TENANT_PERMISSIONS.VEHICLE_BLOCK_CREATE, "vehicle_block.create");
assert.equal(TENANT_PERMISSIONS.VEHICLE_BLOCK_MANAGE, "vehicle_block.manage");

for (const permission of [
  TENANT_PERMISSIONS.AVAILABILITY_READ,
  TENANT_PERMISSIONS.ALLOCATION_CREATE,
  TENANT_PERMISSIONS.ALLOCATION_MANAGE,
  TENANT_PERMISSIONS.VEHICLE_BLOCK_CREATE,
  TENANT_PERMISSIONS.VEHICLE_BLOCK_MANAGE,
]) {
  assert.ok(
    TENANT_SYSTEM_ROLES.COMPANY_OWNER.defaultPermissions.includes(permission),
    `Company Owner must include ${permission}`
  );
}

assert.match(booking, /const auxSeq=useRef\(0\),registerSeq=useRef\(0\),detailSeq=useRef\(0\)/);
assert.doesNotMatch(booking, /const seq=useRef\(0\)/);

for (const modal of [
  "InspectionModal",
  "MaintenanceWorkOrderModal",
  "NewWorkOrderModal",
  "NewScheduleModal",
  "NewProviderModal",
  "NewOwnerModal",
]) {
  assert.match(workspace, new RegExp(`<${modal}\\s*\\/>`), `${modal} must be mounted in unified workspace`);
}

assert.match(website, /method=body!==undefined\?'POST':'GET'/);
assert.match(customerAggregate, /UNVERIFIED:\s*\["PENDING_VERIFICATION",\s*"VERIFIED",\s*"REJECTED"\]/);
assert.match(errorFilter, /typeof domainError\.statusCode === "number"/);

assert.match(fleet, /uploadVehiclePrimaryImage/);
assert.match(fleet, /\/files\/upload-intent/);
assert.match(fleet, /profileName:"VEHICLE_SHOWCASE"/);
assert.match(fleet, /\/vehicles\/\$\{vehicleId\}\/media/);

console.log("✓ UI integration repair regression contract passed");
