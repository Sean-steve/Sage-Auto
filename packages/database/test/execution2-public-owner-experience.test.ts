import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync("src/App.tsx","utf8");
const renter=readFileSync("src/components/RenterAccount.tsx","utf8");
const rentalsView=readFileSync("src/components/RentalsView.tsx","utf8");
const rentalService=readFileSync("apps/api/src/modules/rentals/application/rental.service.ts","utf8");
const accessApp=readFileSync("src/components/AccessApp.tsx","utf8");
const websiteStudio=readFileSync("src/components/PublicWebsiteView.tsx","utf8");
const publicSite=readFileSync("src/components/TenantPublicSite.tsx","utf8");
const ownerView=readFileSync("src/components/VehicleOwnersView.tsx","utf8");
const publicController=readFileSync("apps/api/src/modules/public-booking/presentation/public-booking.controller.ts","utf8");
const publicService=readFileSync("apps/api/src/modules/public-booking/application/public-booking.service.ts","utf8");
const ownerService=readFileSync("apps/api/src/modules/vehicle-owners/application/vehicle-owners.service.ts","utf8");
const accessController=readFileSync("apps/api/src/modules/access/access.controller.ts","utf8");

assert.match(app,/location\.pathname\.endsWith\('\/track'\).*RenterAccount/,"booking tracker must remain separate from authenticated account");
assert.match(app,/location\.pathname\.endsWith\('\/account'\).*AccessApp site=\{publicSite\[1\]\}/,"public renter account must use the authenticated renter portal");
assert.match(renter,/bookingReference/);
assert.match(renter,/booking\/account\/booking/);
assert.match(renter,/setInterval\(\(\)=>void load\(bookingReference,email,false\),30000\)/);
assert.match(renter,/Latest notifications/);
assert.match(renter,/You have the vehicle/);
assert.match(renter,/timeRemainingMinutes/);
assert.match(renter,/Return due within 24 hours|RETURN_WITHIN_24H/);
assert.match(renter,/Vehicle return due soon|RETURN_WITHIN_3H/);
assert.match(renter,/Scheduled return time has passed|OVERDUE/);
assert.match(rentalsView,/listDispatchReady/);
assert.match(rentalsView,/Ready to dispatch/);
assert.match(rentalsView,/Start rental/);
assert.match(rentalService,/listDispatchReady/);
assert.match(rentalService,/HANDOVER_COMPLETED/);


for(const type of ["HERO","FEATURE_GRID","VEHICLE_SHOWCASE","TEXT_IMAGE","TESTIMONIALS","FAQ","CALL_TO_ACTION","CONTACT_INFO"]){
  assert.ok(websiteStudio.includes(type),`Storefront Studio must support ${type}`);
}
assert.match(websiteStudio,/block\.data\?\.enabled===false/);
assert.match(websiteStudio,/Save page settings/);
assert.match(websiteStudio,/testimonials:\[\]/);
assert.match(websiteStudio,/faqs:\[\]/);
assert.match(websiteStudio,/function destinationOptions/);
assert.match(websiteStudio,/Fleet catalogue/);
assert.match(websiteStudio,/Booking form/);
assert.match(websiteStudio,/Add testimonial/);
assert.match(websiteStudio,/Add FAQ/);
assert.match(websiteStudio,/Add benefit card/);
assert.match(websiteStudio,/Horizontal carousel/);
assert.match(publicSite,/function routeHref/);
assert.match(publicSite,/repeat\(auto-fit,minmax/);
assert.match(publicSite,/snap-x/);
assert.match(publicSite,/secondaryCtaLink/);

assert.match(publicSite,/booking\/availability/);
assert.match(publicSite,/temporarily held for another time window/);
assert.match(publicSite,/sage-auto:renter/);
assert.match(publicSite,/Create \/ open renter account/);
assert.match(publicSite,/Track booking now/);
assert.match(accessApp,/defaultValue=\{new URLSearchParams\(location\.search\)\.get\('claim'\)\|\|''\}/);
assert.match(accessApp,/function RenterBookings/);
assert.match(accessApp,/Rental progress/);
assert.match(accessApp,/Latest notifications/);
assert.match(accessApp,/Updates as the rental team processes your booking/);
assert.match(accessController,/getStatusHistory\(b\.id,tenantId\)/);
assert.match(accessController,/findByBookingId\(b\.id,tenantId\)/);

assert.match(publicController,/router\.post\("\/account\/booking"/);
assert.match(publicService,/getBookingAccount/);
assert.match(publicService,/customer\.email\.trim\(\)\.toLowerCase\(\)/);
assert.match(publicService,/!\["MAINTENANCE","BLOCKED"\]\.includes\(availability\)/);
assert.match(publicService,/publiclyDiscoverable\.has\(candidate\.id\)/);

assert.match(ownerView,/Manage Terms/);
assert.match(ownerView,/Edit Owner/);
assert.match(ownerView,/updateOwner/);
assert.match(ownerView,/Attach an existing fleet vehicle/);
assert.match(ownerView,/assignOwnership/);
assert.match(ownerView,/Registration and make\/model are shown so owners with identical names remain distinguishable/);
assert.match(ownerView,/renegotiateTerms/);
assert.match(ownerView,/Owner-visible agreement terms/);
assert.match(ownerService,/dto\.termsSnapshot\?\.trim\(\)/);
assert.match(accessController,/section===\'myVehicles\'/);
assert.match(accessController,/agreementTerms:agreement\?\.termsSnapshot/);
assert.match(accessController,/section===\'mySettlements\'/);

console.log("✓ Execution 2 public website, renter account and owner agreement contract passed");
