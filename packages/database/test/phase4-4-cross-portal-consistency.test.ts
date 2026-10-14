import { strict as assert } from "node:assert";
import { BookingRepository, CustomerRepository, RentalRepository, VehicleRepository } from "../src/index";
import { PublicBookingService } from "../../../apps/api/src/modules/public-booking/application/public-booking.service";

/** Actual shared in-process canonical repositories, not two independent UI mock datasets. */
async function crossPortalConsistency() {
  const tenant="phase44-crossportal-tenant";
  const foreign="phase44-another-tenant";
  BookingRepository.clear();CustomerRepository.clear();RentalRepository.clear();VehicleRepository.clear();
  const customers=new CustomerRepository(),vehicles=new VehicleRepository(),
    bookings=new BookingRepository(),rentals=new RentalRepository();
  const service=new PublicBookingService({customerRepo:customers,vehicleRepo:vehicles,bookingRepo:bookings,rentalRepo:rentals});
  const customer=await customers.create({
    tenantId:tenant,fullName:"Cross Portal Customer",email:"crossportal@example.test",
    phone:"+254711880000",idOrPassportNumber:"ID-CROSSPORTAL-1",licenseNumber:"DL-CROSSPORTAL-1",
    customerType:"INDIVIDUAL",status:"ACTIVE",verificationStatus:"VERIFIED",
  } as any);
  const vehicle=await vehicles.create({
    tenantId:tenant,make:"Toyota",model:"RAV4",registrationPlate:"KZG 487B",year:2023,
    lifecycleStatus:"OPERATIONAL",availabilityStatus:"AVAILABLE",category:"SUV",
  } as any);
  const booking=await bookings.create(tenant,{
    bookingNumber:"BKG-CROSSPORTAL-001",customerId:customer.id,
    requestedVehicleId:vehicle.id,assignedVehicleId:vehicle.id,
    initialStatus:"CONFIRMED",pickupAt:"2026-09-09T08:00:00Z",
    returnAt:"2030-10-14T08:00:00Z",source:"PUBLIC_WEBSITE",
    pricingSnapshot:{currency:"KES",grossRentalTotal:25000,netRentalSubtotal:25000} as any,
    grossTotal:25000,netRentalSubtotal:25000,depositRequired:10000,taxAmount:0,
  } as any);
  const track=()=>service.getBookingAccount(tenant,booking.bookingNumber,customer.email);
  const before=await track();
  assert.equal(before.status,"CONFIRMED");
  assert.equal(before.activeRental,undefined);
  assert.equal((await bookings.findMany(tenant)).items.find(b=>b.id===booking.id)?.status,"CONFIRMED");

  // Company operator starts dispatch; renter must read the SAME persisted Rental fact.
  const rental=await rentals.create(tenant,{
    rentalNumber:"RNT-CROSSPORTAL-001",bookingId:booking.id,
    contractId:"ctr-cross",handoverId:"handover-cross",
    customerId:customer.id,primaryDriverId:"drv-cross",vehicleId:vehicle.id,
    status:"ACTIVE_ON_ROAD",scheduledStart:"2026-09-09T08:00:00Z",
    scheduledReturnAt:"2030-10-14T08:00:00Z",
    pricingSnapshot:{currency:"KES",grossTotal:25000} as any,
  });
  await bookings.update(booking.id,tenant,{status:"ACTIVE",activeRentalId:rental.id});
  const onRoad=await track();
  assert.equal(onRoad.status,"ACTIVE");
  assert.equal(onRoad.activeRental?.state,"ACTIVE_ON_ROAD");
  assert.equal(onRoad.activeRental?.rentalId,rental.id);
  assert.equal(onRoad.renterNotifications?.[0]?.title,"Vehicle collected — rental active");

  await rentals.update(rental.id,tenant,{state:"VEHICLE_RECEIVED"});
  const returned=await track();
  assert.equal(returned.activeRental?.returnStatus,"RETURN_PROCESSING");
  assert.equal(returned.renterNotifications?.[0]?.title,"Vehicle return being processed");
  assert.ok(!returned.renterNotifications?.some(n=>n.title==="Vehicle collected — rental active"));
  assert.equal((await rentals.findByBookingId(booking.id,tenant))?.state,"VEHICLE_RECEIVED");

  await rentals.update(rental.id,tenant,{state:"COMPLETED",completedAt:"2026-10-01T10:00:00Z"});
  await bookings.update(booking.id,tenant,{status:"COMPLETED"});
  const finished=await track();
  assert.equal(finished.status,"COMPLETED");
  assert.equal(finished.activeRental?.state,"COMPLETED");
  assert.equal(finished.activeRental?.returnStatus,"COMPLETED");
  assert.equal(finished.renterNotifications?.[0]?.title,"Rental completed");

  await assert.rejects(()=>service.getBookingAccount(tenant,booking.bookingNumber,"wrong@example.test"));
  await assert.rejects(()=>service.getBookingAccount(foreign,booking.bookingNumber,customer.email));
  assert.equal((await bookings.findMany(foreign)).total,0);
  assert.equal((await rentals.findMany(foreign)).items.length,0);
  console.log("✓ Company Booking + Rental → renter tracker → returned/completed changes synchronized through canonical repositories; email and tenant isolation verified");
}
void crossPortalConsistency().catch(err=>{console.error(err);process.exitCode=1;});
