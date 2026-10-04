import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync("src/App.tsx","utf8");
const renter=readFileSync("src/components/RenterAccount.tsx","utf8");
const websiteStudio=readFileSync("src/components/PublicWebsiteView.tsx","utf8");
const publicSite=readFileSync("src/components/TenantPublicSite.tsx","utf8");
const ownerView=readFileSync("src/components/VehicleOwnersView.tsx","utf8");
const publicController=readFileSync("apps/api/src/modules/public-booking/presentation/public-booking.controller.ts","utf8");
const publicService=readFileSync("apps/api/src/modules/public-booking/application/public-booking.service.ts","utf8");
const ownerService=readFileSync("apps/api/src/modules/vehicle-owners/application/vehicle-owners.service.ts","utf8");
const accessController=readFileSync("apps/api/src/modules/access/access.controller.ts","utf8");

assert.match(app,/location\.pathname\.endsWith\('\/account'\).*RenterAccount/,"public renter account must not route into staff workspace");
assert.match(renter,/bookingReference/);
assert.match(renter,/booking\/account\/booking/);
assert.match(renter,/setInterval\(\(\)=>void load\(bookingReference,email,false\),30000\)/);
assert.match(renter,/Latest notifications/);

for(const type of ["HERO","FEATURE_GRID","VEHICLE_SHOWCASE","TEXT_IMAGE","TESTIMONIALS","FAQ","CALL_TO_ACTION","CONTACT_INFO"]){
  assert.ok(websiteStudio.includes(type),`Storefront Studio must support ${type}`);
}
assert.match(websiteStudio,/block\.data\?\.enabled===false/);
assert.match(websiteStudio,/Save page settings/);

assert.match(publicSite,/booking\/availability/);
assert.match(publicSite,/temporarily held for another time window/);
assert.match(publicSite,/sage-auto:renter/);
assert.match(publicSite,/Open my renter account/);

assert.match(publicController,/router\.post\("\/account\/booking"/);
assert.match(publicService,/getBookingAccount/);
assert.match(publicService,/customer\.email\.trim\(\)\.toLowerCase\(\)/);
assert.match(publicService,/!\["MAINTENANCE","BLOCKED"\]\.includes\(availability\)/);
assert.match(publicService,/publiclyDiscoverable\.has\(candidate\.id\)/);

assert.match(ownerView,/Manage Terms/);
assert.match(ownerView,/renegotiateTerms/);
assert.match(ownerView,/Owner-visible agreement terms/);
assert.match(ownerService,/dto\.termsSnapshot\?\.trim\(\)/);
assert.match(accessController,/section===\'myVehicles\'/);
assert.match(accessController,/agreementTerms:agreement\?\.termsSnapshot/);
assert.match(accessController,/section===\'mySettlements\'/);

console.log("✓ Execution 2 public website, renter account and owner agreement contract passed");
