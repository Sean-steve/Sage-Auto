import assert from "node:assert/strict";
import {ACCESS_SECTIONS,ROLE_SECTIONS,accessSections} from "../../../packages/constants/src/access";
import {PLATFORM_ROLES,TENANT_SYSTEM_ROLES} from "../../../packages/constants/src/roles";

const platform=accessSections(["PLATFORM_OWNER"],PLATFORM_ROLES.PLATFORM_OWNER.defaultPermissions);
const company=accessSections(["COMPANY_OWNER"],TENANT_SYSTEM_ROLES.COMPANY_OWNER.defaultPermissions);
const owner=accessSections(["VEHICLE_OWNER"],TENANT_SYSTEM_ROLES.VEHICLE_OWNER.defaultPermissions);
const driver=accessSections(["DRIVER"],TENANT_SYSTEM_ROLES.DRIVER.defaultPermissions);
const renter=accessSections(["RENTER"],[]);

const ids=(items:Array<{id:string}>)=>new Set(items.map(s=>s.id));
const platformIds=ids(platform),companyIds=ids(company),ownerIds=ids(owner);
for(const required of ["overview","companies","platformBilling","platformAnalytics","platformAudit"]) {
  assert.ok(platformIds.has(required),"SaaS Owner must have "+required);
  assert.ok(!ownerIds.has(required),"Vehicle Owner cannot see platform "+required);
}
for(const required of ["owners","fleet","bookings","rentals","returns","finance","settlements","team"]) {
  assert.ok(companyIds.has(required),"Company Owner must have "+required);
  assert.ok(!ownerIds.has(required),"Independent owner cannot see tenant operator "+required);
}
const ownerScreens=[
  "ownerOverview","myVehicles","ownerPerformance","ownerCondition",
  "ownerAgreements","ownerAgreementDetails","mySettlements","ownerStatements",
  "ownerPayouts","ownerDisputes","ownerDocuments","ownerAccount","ownerOperators",
];
for(const required of ownerScreens){
  assert.ok(ownerIds.has(required),"Vehicle Owner missing "+required);
  assert.ok(!companyIds.has(required),"Company Owner must not render personal "+required);
  assert.ok(!platformIds.has(required),"Platform Owner must not render personal "+required);
}
assert.equal(owner.length,ownerScreens.length,"Every registered independent-owner screen must remain available");
assert.deepEqual([...ids(driver)].sort(),["myTrips","myInspections"].sort());
assert.deepEqual([...ids(renter)].sort(),["myBookings","profile"].sort());
for(const permissioned of Object.entries(ACCESS_SECTIONS)){
  const [name,config]=permissioned;
  if(config.permission?.startsWith("platform.")) {
    assert.ok(!companyIds.has(name)&&!ownerIds.has(name),"Platform permissions must not leak into company roles");
  }
}
assert.ok(!accessSections(["VEHICLE_OWNER"],[]).some(s=>s.id==="owners"));
assert.ok(!accessSections(["BILLING_ADMIN"],PLATFORM_ROLES.BILLING_ADMIN.defaultPermissions).some(s=>s.id==="finance"));
assert.deepEqual(ROLE_SECTIONS.VEHICLE_OWNER,ownerScreens,"Owner screen registry must remain stable");
console.log("PASS Phase 4 role navigation contracts: 7 portal principals and 13 owner screens.");
