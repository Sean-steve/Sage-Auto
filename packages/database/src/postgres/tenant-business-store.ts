import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient } from "pg";

/** Additive native PG foundation. Legacy SQLite Map repositories are NOT switched. */
type PgTransaction = { client: PoolClient; tenantId: string };
const activeTransaction = new AsyncLocalStorage<PgTransaction>();
let sharedPool: Pool | undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOMAIN = /^[A-Z][A-Z0-9_]{0,63}$/;

function stop(message: string, statusCode=422): never {
  throw Object.assign(new Error(message),{statusCode});
}
function validateTenant(tenantId: string): string {
  if(!UUID.test(tenantId)) return stop("PostgreSQL tenant UUID required");
  return tenantId;
}

export function businessPgPool(): Pool {
  if(sharedPool) return sharedPool;
  const connectionString=process.env.PG_BUSINESS_DATABASE_URL || process.env.DATABASE_URL;
  if(!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString)) {
    return stop("Explicit PostgreSQL business database URL required");
  }
  sharedPool=new Pool({
    connectionString,max:10,idleTimeoutMillis:20_000,connectionTimeoutMillis:5_000,
    application_name:"sage-auto-business-authority",
  });
  return sharedPool;
}
export async function closeBusinessPgPool(): Promise<void> {
  if(!sharedPool)return;
  const old=sharedPool;sharedPool=undefined;await old.end();
}

/**
 * Opens a real SERIALIZABLE transaction with SET LOCAL tenant identity.
 * Nested work must use the same tenant and connection. External payment
 * delivery must occur OUTSIDE this transaction and use durable claims.
 * No silent retries of external side effects are permitted.
 */
export async function withTenantPgTransaction<T>(tenantId:string,work:()=>Promise<T>):Promise<T> {
  validateTenant(tenantId);
  const parent=activeTransaction.getStore();
  if(parent){
    if(parent.tenantId!==tenantId)return stop("Cross-tenant nested SQL transaction rejected",403);
    return work();
  }
  const client=await businessPgPool().connect();
  try{
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const identity=await client.query<{is_superuser:string;bypassrls:boolean}>(
      "SELECT current_setting('is_superuser') AS is_superuser, rolbypassrls AS bypassrls FROM pg_roles WHERE rolname=current_user"
    );
    if(identity.rows[0]?.is_superuser!=="off" || identity.rows[0]?.bypassrls){
      return stop("Business SQL runtime requires a non-superuser NOBYPASSRLS account",403);
    }
    await client.query("SELECT set_config('app.current_tenant_id',$1,true)",[tenantId]);
    const result=await activeTransaction.run({client,tenantId},work);
    await client.query("COMMIT");
    return result;
  }catch(error){
    try{await client.query("ROLLBACK");}catch{/* retain original */}
    throw error;
  }finally{client.release();}
}

function clientFor(tenantId:string):PoolClient {
  const context=activeTransaction.getStore();
  if(!context)return stop("SQL business store requires an active tenant transaction",403);
  if(context.tenantId!==validateTenant(tenantId))return stop("Cross-tenant SQL access rejected",403);
  return context.client;
}
function verifyPayload(tenantId:string,payload:unknown):void {
  if(!payload || typeof payload!=="object" || Array.isArray(payload) ||
      (payload as {tenantId?:string}).tenantId!==tenantId){
    return stop("Record payload tenantId must equal the active transaction tenant");
  }
}
function handleConflict(error:unknown):never {
  if((error as {code?:string}).code==="23505" || (error as {code?:string}).code==="23P01"){
    return stop("Duplicate business identifier or overlapping vehicle reservation",409);
  }
  throw error;
}
export interface PgStoredRecord<T>{
  tenantId:string;
  id:string;
  value:T;
  version:number;
}
type Row<T>={record_id:string;record_version:string;payload:T};
function rowRecord<T>(tenantId:string,row:Row<T>):PgStoredRecord<T>{
  return {tenantId,id:row.record_id,value:row.payload,version:Number(row.record_version)};
}

/** Paged SQL records with mandatory optimistic-concurrency updates. */
export class PgTenantRecords<T extends {tenantId:string}>{
  constructor(readonly domain:string){
    if(!DOMAIN.test(domain))stop("Invalid business domain name");
  }
  async find(tenantId:string,id:string):Promise<PgStoredRecord<T>|null>{
    const result=await clientFor(tenantId).query<Row<T>>(
      "SELECT record_id,record_version,payload FROM sage_business_records WHERE tenant_id=$1 AND domain=$2 AND record_id=$3",
      [tenantId,this.domain,id]
    );
    return result.rows[0]?rowRecord(tenantId,result.rows[0]):null;
  }
  async list(tenantId:string,page=1,limit=100):Promise<{items:PgStoredRecord<T>[];total:number}>{
    if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>500)
      return stop("Invalid SQL pagination");
    const client=clientFor(tenantId);
    const rows=await client.query<Row<T>>(
      "SELECT record_id,record_version,payload FROM sage_business_records WHERE tenant_id=$1 AND domain=$2 ORDER BY updated_at DESC,record_id LIMIT $3 OFFSET $4",
      [tenantId,this.domain,limit,(page-1)*limit]
    );
    const count=await client.query<{n:string}>(
      "SELECT count(*)::text AS n FROM sage_business_records WHERE tenant_id=$1 AND domain=$2",
      [tenantId,this.domain]
    );
    return {items:rows.rows.map(row=>rowRecord(tenantId,row)),total:Number(count.rows[0]?.n||0)};
  }
  async create(tenantId:string,id:string,payload:T):Promise<PgStoredRecord<T>>{
    verifyPayload(tenantId,payload);
    try{
      const result=await clientFor(tenantId).query<Row<T>>(
        "INSERT INTO sage_business_records(tenant_id,domain,record_id,payload) VALUES ($1,$2,$3,$4::jsonb) RETURNING record_id,record_version,payload",
        [tenantId,this.domain,id,JSON.stringify(payload)]
      );
      return rowRecord(tenantId,result.rows[0]);
    }catch(error){return handleConflict(error);}
  }
  async update(tenantId:string,id:string,expectedVersion:number,payload:T):Promise<PgStoredRecord<T>>{
    verifyPayload(tenantId,payload);
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)return stop("Expected version required");
    try{
      const result=await clientFor(tenantId).query<Row<T>>(
        "UPDATE sage_business_records SET payload=$4::jsonb,record_version=record_version+1,updated_at=now() WHERE tenant_id=$1 AND domain=$2 AND record_id=$3 AND record_version=$5 RETURNING record_id,record_version,payload",
        [tenantId,this.domain,id,JSON.stringify(payload),expectedVersion]
      );
      if(!result.rows[0])return stop("Business record version conflict",409);
      return rowRecord(tenantId,result.rows[0]);
    }catch(error){return handleConflict(error);}
  }
  async delete(tenantId:string,id:string,expectedVersion:number):Promise<void>{
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)return stop("Expected version required");
    const result=await clientFor(tenantId).query(
      "DELETE FROM sage_business_records WHERE tenant_id=$1 AND domain=$2 AND record_id=$3 AND record_version=$4",
      [tenantId,this.domain,id,expectedVersion]
    );
    if(result.rowCount!==1)return stop("Business record deletion conflict",409);
  }
}

export type PgClaimResult="CREATED"|"REPLAY"|"CONFLICT";
/** At-most-once claim for external provider callbacks and financial actions. */
export async function claimPgOperation(
  tenantId:string,scope:string,key:string,requestHash:string
):Promise<PgClaimResult>{
  const client=clientFor(tenantId);
  const inserted=await client.query(
    "INSERT INTO sage_business_claims(tenant_id,scope,claim_key,request_hash) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING claim_key",
    [tenantId,scope,key,requestHash]
  );
  if(inserted.rowCount)return "CREATED";
  const existing=await client.query<{request_hash:string}>(
    "SELECT request_hash FROM sage_business_claims WHERE tenant_id=$1 AND scope=$2 AND claim_key=$3",
    [tenantId,scope,key]
  );
  return existing.rows[0]?.request_hash===requestHash?"REPLAY":"CONFLICT";
}

export interface PgAllocation{
  tenantId:string;allocationId:string;vehicleId:string;bookingId:string;
  pickupAt:string;returnAt:string;status:"HELD"|"RESERVED"|"ACTIVE";
}
export async function reservePgVehicle(input:PgAllocation):Promise<void>{
  try{
    await clientFor(input.tenantId).query(
      "INSERT INTO sage_vehicle_allocations(tenant_id,allocation_id,vehicle_id,booking_id,pickup_at,return_at,status) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [input.tenantId,input.allocationId,input.vehicleId,input.bookingId,input.pickupAt,input.returnAt,input.status]
    );
  }catch(error){return handleConflict(error);}
}
