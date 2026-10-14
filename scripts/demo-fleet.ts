/**
 * Sage Auto demo fleet catalogue. Invented sample inventory; NOT actual stock.
 * Bookability remains governed by the real compliance, calendar and booking
 * state machines. Never invent active rentals, holds or completed inspections.
 */
import type { CreateVehicleDto, VehicleCategory } from "@carhire/types";

type Model = {
  plate: string;
  make: string;
  model: string;
  year: number;
  category: VehicleCategory;
  dailyRate: number;
  location: string;
  transmission?: CreateVehicleDto["transmission"];
  fuel?: CreateVehicleDto["fuelType"];
  seats?: number;
  color: string;
  odometer: number;
  features: string[];
};

const common = ["Air conditioning", "Bluetooth audio", "USB charging"];

const catalogue: Model[] = [
  {plate:"DEMO-001",make:"Toyota",model:"Vitz",year:2019,category:"Hatchback",dailyRate:3200,location:"Nairobi CBD",color:"Pearl White",odometer:42350,features:["Reverse camera"]},
  {plate:"DEMO-002",make:"Mazda",model:"Demio",year:2020,category:"Hatchback",dailyRate:3500,location:"Westlands, Nairobi",color:"Sky Blue",odometer:38700,features:["Parking sensors"]},
  {plate:"DEMO-003",make:"Suzuki",model:"Swift",year:2022,category:"Hatchback",dailyRate:4200,location:"JKIA, Nairobi",color:"Silver",odometer:18700,features:["Apple CarPlay"]},
  {plate:"DEMO-004",make:"Honda",model:"Fit",year:2021,category:"Hatchback",dailyRate:4200,location:"Kisumu",color:"Red",odometer:26500,features:["Reverse camera", "Cruise control"],fuel:"Hybrid"},
  {plate:"DEMO-005",make:"Toyota",model:"Axio",year:2021,category:"Sedan",dailyRate:4500,location:"Nairobi CBD",color:"White",odometer:28800,features:["Reverse camera"]},
  {plate:"DEMO-006",make:"Nissan",model:"Sylphy",year:2020,category:"Sedan",dailyRate:4900,location:"Mombasa",color:"Charcoal",odometer:36200,features:["Parking sensors"]},
  {plate:"DEMO-007",make:"Toyota",model:"Premio",year:2018,category:"Sedan",dailyRate:5500,location:"Nakuru",color:"Metallic Grey",odometer:59600,features:["Leather upholstery"]},
  {plate:"DEMO-008",make:"Honda",model:"Civic",year:2022,category:"Sedan",dailyRate:7000,location:"Karen, Nairobi",color:"Black",odometer:20400,features:["Cruise control", "Apple CarPlay"]},
  {plate:"DEMO-009",make:"Toyota",model:"Corolla Cross",year:2023,category:"SUV",dailyRate:8500,location:"JKIA, Nairobi",color:"White",odometer:13200,features:["Reverse camera", "Cruise control"]},
  {plate:"DEMO-010",make:"Nissan",model:"X-Trail",year:2021,category:"SUV",dailyRate:9500,location:"Mombasa",color:"Blue",odometer:38300,features:["Reverse camera", "Roof rails"]},
  {plate:"DEMO-011",make:"Subaru",model:"Forester",year:2022,category:"SUV",dailyRate:10500,location:"Nairobi CBD",color:"Forest Green",odometer:27000,features:["All-wheel drive", "Adaptive cruise control"]},
  {plate:"DEMO-012",make:"Hyundai",model:"Tucson",year:2023,category:"SUV",dailyRate:10500,location:"Kisumu",color:"Silver",odometer:11400,features:["Reverse camera", "Blind spot alert"]},
  {plate:"DEMO-013",make:"Mazda",model:"CX-5",year:2022,category:"SUV",dailyRate:11000,location:"Westlands, Nairobi",color:"Soul Red",odometer:23900,features:["Leather upholstery", "Cruise control"]},
  {plate:"DEMO-014",make:"Toyota",model:"RAV4",year:2022,category:"SUV",dailyRate:12000,location:"Nakuru",color:"Pearl White",odometer:27500,features:["All-wheel drive", "Reverse camera"],fuel:"Hybrid"},
  {plate:"DEMO-015",make:"Suzuki",model:"Jimny",year:2023,category:"4x4 Offroad",dailyRate:14000,location:"Naivasha",color:"Jungle Green",odometer:12600,features:["4WD low range", "Hill descent control"],seats:4},
  {plate:"DEMO-016",make:"Toyota",model:"Fortuner",year:2022,category:"4x4 Offroad",dailyRate:17000,location:"Nairobi CBD",color:"Bronze",odometer:32400,features:["Four-wheel drive", "Hill start assist"],fuel:"Diesel",seats:7},
  {plate:"DEMO-017",make:"Toyota",model:"Land Cruiser Prado TX",year:2022,category:"4x4 Offroad",dailyRate:25000,location:"JKIA, Nairobi",color:"Black",odometer:26700,features:["Four-wheel drive", "Leather upholstery", "Parking cameras"],fuel:"Diesel",seats:7},
  {plate:"DEMO-018",make:"Toyota",model:"Land Cruiser 300",year:2023,category:"4x4 Offroad",dailyRate:35000,location:"Karen, Nairobi",color:"Pearl White",odometer:17300,features:["Four-wheel drive", "Surround-view camera", "Premium sound"],fuel:"Diesel",seats:7},
  {plate:"DEMO-019",make:"Mercedes-Benz",model:"C200",year:2021,category:"Luxury",dailyRate:15500,location:"Westlands, Nairobi",color:"Obsidian Black",odometer:22300,features:["Leather upholstery", "Navigation", "Sunroof"]},
  {plate:"DEMO-020",make:"BMW",model:"320i",year:2020,category:"Luxury",dailyRate:15500,location:"JKIA, Nairobi",color:"Alpine White",odometer:27800,features:["Navigation", "Parking sensors", "Leather upholstery"]},
  {plate:"DEMO-021",make:"Lexus",model:"ES 250",year:2021,category:"Luxury",dailyRate:17500,location:"Karen, Nairobi",color:"Champagne",odometer:21400,features:["Ventilated seats", "Adaptive cruise control"]},
  {plate:"DEMO-022",make:"Mercedes-Benz",model:"E300",year:2022,category:"Luxury",dailyRate:22000,location:"Nairobi CBD",color:"Graphite Grey",odometer:18400,features:["Ambient lighting", "Premium sound", "Leather upholstery"]},
  {plate:"DEMO-023",make:"Toyota",model:"Noah",year:2021,category:"Van/Bus",dailyRate:8000,location:"Mombasa",color:"White",odometer:35400,features:["Sliding doors", "Dual-zone AC"],seats:7},
  {plate:"DEMO-024",make:"Nissan",model:"Serena",year:2020,category:"Van/Bus",dailyRate:8500,location:"JKIA, Nairobi",color:"Silver",odometer:44800,features:["Sliding doors", "Rear AC"],seats:8},
  {plate:"DEMO-025",make:"Toyota",model:"Hiace",year:2021,category:"Van/Bus",dailyRate:13000,location:"Nakuru",color:"White",odometer:50200,features:["Passenger AC", "Large luggage space"],seats:14,fuel:"Diesel",transmission:"Manual"},
  {plate:"DEMO-026",make:"Nissan",model:"NV350",year:2022,category:"Van/Bus",dailyRate:14500,location:"Kisumu",color:"White",odometer:28600,features:["Passenger AC", "Large luggage space"],seats:14,fuel:"Diesel",transmission:"Manual"},
];

export const DEMO_FLEET: ReadonlyArray<CreateVehicleDto> = catalogue.map((item,index)=>({
  registrationPlate:item.plate,
  // Demo-only VIN; never use real asset identifiers in the demo catalogue.
  vin:`SAGEDEMO${String(index+1).padStart(9,"0")}`,
  make:item.make,
  model:item.model,
  year:item.year,
  category:item.category,
  dailyRate:item.dailyRate,
  currentLocation:item.location,
  transmission:item.transmission||"Automatic",
  fuelType:item.fuel||"Petrol",
  seats:item.seats||5,
  color:item.color,
  odometer:item.odometer,
  fuelLevel:80+(index%5)*4,
  allowedDailyKm:250,
  excessKmRate:30,
  features:[...common,...item.features],
  imageUrl:"",
  // Do not advertise an unverified demo asset as public rental inventory.
  isPublishedToWebsite:false,
}));

/** Persists via the canonical FleetService, including history, audit and outbox. */
export async function seedDemoFleetForTenant(tenantId:string, options:{limit?:number}={}) {
  if (!tenantId.trim()) throw new Error("A tenant ID is required for demo inventory.");
  const [{FleetService},{
    VehicleRepository,VehicleOwnershipRepository,VehicleOwnerRepository,
    VehicleCategoryRepository,VehicleDocumentRepository,AuditRepository,OutboxRepository,
  }] = await Promise.all([
    import("../apps/api/src/modules/fleet/application/fleet.service"),
    import("@carhire/database"),
  ]);
  const repo=new VehicleRepository();
  const service=new FleetService(repo,
    new VehicleOwnershipRepository(),new VehicleOwnerRepository(),
    new VehicleCategoryRepository(),new VehicleDocumentRepository(),
    new AuditRepository(),new OutboxRepository()
  );
  const fleet=DEMO_FLEET.slice(0,options.limit??DEMO_FLEET.length);
  let created=0,skipped=0;
  for(const item of fleet){
    if(await repo.findByRegistrationPlate(item.registrationPlate,tenantId)){
      skipped++;continue;
    }
    await service.createVehicle(tenantId,{...item},
      "system:demo-fleet","Sage Auto demo fleet seed");
    created++;
  }
  return {tenantId,created,skipped,total:created+skipped};
}
