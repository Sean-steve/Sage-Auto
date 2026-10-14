import { randomUUID } from "node:crypto";
import { createRecordStore } from "../record-store";

export interface FleetRegistrationEntry {
  id: string;
  tenantId: string;
  sequence: number;
  status: "UNREGISTERED" | "REGISTERED";
  batchKey: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  vehicleId?: string;
}

/**
 * Real tenant-scoped database records awaiting completion of vehicle identity.
 * Not vehicles, allocations, inventory, reservations or website listings.
 * No placeholder plates, makes, prices, VINs or compliance data are fabricated.
 */
export class FleetRegistrationEntryRepository {
  private static entries = createRecordStore<string, FleetRegistrationEntry>(
    "fleet-registration-entry.repository:entries"
  );

  async list(tenantId: string): Promise<FleetRegistrationEntry[]> {
    return [...FleetRegistrationEntryRepository.entries.values()]
      .filter(row => row.tenantId === tenantId)
      .sort((a,b) => a.sequence-b.sequence)
      .map(row=>({...row}));
  }

  async get(tenantId: string, id: string): Promise<FleetRegistrationEntry | null> {
    const row=FleetRegistrationEntryRepository.entries.get(id);
    return row?.tenantId === tenantId ? {...row} : null;
  }

  async createBatch(tenantId: string, count: number, batchKey: string, actorId: string):
    Promise<FleetRegistrationEntry[]> {
    if (!Number.isInteger(count) || count<1 || count>100)
      throw Object.assign(new Error("Choose between 1 and 100 fleet entries."),{statusCode:400});
    if(!/^[a-zA-Z0-9_-]{8,128}$/.test(batchKey))
      throw Object.assign(new Error("Invalid idempotency key."),{statusCode:400});
    const existing=(await this.list(tenantId)).filter(row=>row.batchKey===batchKey);
    if(existing.length){
      if(existing.length!==count)
        throw Object.assign(new Error("This request key was already used with another quantity."),{statusCode:409});
      return existing;
    }
    const last=(await this.list(tenantId)).reduce((n,row)=>Math.max(n,row.sequence),0);
    const now=new Date().toISOString();
    const result=Array.from({length:count},(_,i):FleetRegistrationEntry=>({
      id:randomUUID(),tenantId,sequence:last+i+1,batchKey,createdBy:actorId,
      status:"UNREGISTERED",createdAt:now,updatedAt:now,
    }));
    for(const row of result)FleetRegistrationEntryRepository.entries.set(row.id,row);
    return result.map(row=>({...row}));
  }

  async markRegistered(tenantId: string, id: string, vehicleId: string): Promise<FleetRegistrationEntry> {
    const current=await this.get(tenantId,id);
    if(!current)throw Object.assign(new Error("Fleet entry was not found."),{statusCode:404});
    if(current.status!=="UNREGISTERED")
      throw Object.assign(new Error("This fleet entry has already been registered."),{statusCode:409});
    const updated: FleetRegistrationEntry = {
      ...current,status:"REGISTERED",vehicleId,updatedAt:new Date().toISOString(),
    };
    FleetRegistrationEntryRepository.entries.set(id,updated);
    return {...updated};
  }
}
