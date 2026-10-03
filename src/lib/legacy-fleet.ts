import { apiClient } from './api-client';

let fleetImport: Promise<void> | undefined;
export async function preserveLegacyFleet(userId:string,tenantId:string) {
  if (localStorage.getItem("carhire_fleet_imported_v1")) return;
  if (fleetImport) return fleetImport;
  fleetImport=(async()=>{
    const backup=localStorage.getItem("carhire_fleet_backup_v1") || localStorage.getItem("carhire_vehicles");
    if(!backup) return;
    if(!localStorage.getItem("carhire_fleet_backup_v1")) localStorage.setItem("carhire_fleet_backup_v1",backup);
    const legacy=JSON.parse(backup);
    if(!Array.isArray(legacy)) throw new Error("Your fleet backup is not a valid list. It has been preserved for recovery.");
    const current=await apiClient.get<any[]>("/fleet/vehicles?limit=1000", {"X-Tenant-ID":tenantId});
    if(current.error) throw new Error(current.error.message);
    const plates=new Set((current.data||[]).map((v:any)=>v.registrationPlate.replace(/\s/g,"").toUpperCase()));
    for(const car of legacy){
      if(!car.registrationPlate) throw new Error("A saved car is missing its registration. Your backup has been preserved.");
      const plate=car.registrationPlate.replace(/\s/g,"").toUpperCase();
      if(plates.has(plate)) continue;
      const {id,tenantId:oldTenant,ownerId,activeOwnershipId,...fields}=car;
      const saved=await apiClient.post("/fleet/vehicles",fields,{"X-Tenant-ID":tenantId});
      if(saved.error) throw new Error(`Could not import ${car.registrationPlate}: ${saved.error.message}. Your original fleet is backed up.`);
      plates.add(plate);
    }
    localStorage.setItem("carhire_fleet_imported_v1",JSON.stringify({userId,tenantId,at:new Date().toISOString()}));
  })().finally(()=>{fleetImport=undefined;});
  return fleetImport;
}

