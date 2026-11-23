import {AsyncLocalStorage} from 'node:async_hooks';
import {serialize,deserialize} from 'node:v8';
import {Pool, type PoolClient} from 'pg';
import * as legacy from './legacy-record-store';
import {CrossTenantViolationError, TenantContextMissingError} from './errors';

export interface RecordStore<K,V> {
  readonly size: Promise<number>;
  get(key:K):Promise<V|undefined>;
  has(key:K):Promise<boolean>;
  set(key:K,value:V):Promise<RecordStore<K,V>>;
  delete(key:K):Promise<boolean>;
  clear():Promise<void>;
  entries():Promise<[K,V][]>;
  keys():Promise<K[]>;
  values():Promise<V[]>;
  forEach(callback:(value:V,key:K)=>void|Promise<void>):Promise<void>;
}
const context=new AsyncLocalStorage<{client:PoolClient;active:boolean;tenantId?:string}>();
let pool:Pool|undefined;
const postgres=()=>{
  const backend=process.env.RECORD_STORE_BACKEND;
  if(backend && !['postgres','sqlite','memory'].includes(backend)) {
    throw new Error(`Unsupported RECORD_STORE_BACKEND: ${backend}. Refusing storage fallback.`);
  }
  return backend==='postgres';
};
function database() {
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required for PostgreSQL persistence.');
  if(!pool){pool=new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000});pool.on('error',()=>console.error('PostgreSQL idle connection failed.'));}
  const transaction=context.getStore();
  if(transaction&&!transaction.active)throw new Error('PostgreSQL transaction has already ended.');
  return transaction?.client||pool;
}
function unique(namespace:string,value:any):string|null {
  if(namespace==='user.repository:userStore')return String(value.normalizedEmail||value.email).trim().toLowerCase();
  if(namespace==='tenant.repository:store')return value.slug;
  if(namespace==='tenant-membership.repository:store')return `${value.tenantId}:${value.userId}`;
  if(namespace==='platform-membership.repository:memberships')return value.userId;
  return null;
}
export function createRecordStore<K,V>(namespace:string):RecordStore<K,V> {
  const memory=postgres()?undefined:legacy.createRecordStore<K,V>(namespace);
  const store:RecordStore<K,V>={
    get size(){return memory?Promise.resolve(memory.size):database().query('SELECT count(*)::integer AS count FROM application_records WHERE namespace=$1',[namespace]).then(r=>r.rows[0].count);},
    async get(key){if(memory)return memory.get(key);const r=await database().query('SELECT payload FROM application_records WHERE namespace=$1 AND record_key=$2',[namespace,JSON.stringify(key)]);return r.rows[0]?deserialize(r.rows[0].payload):undefined;},
    async has(key){if(memory)return memory.has(key);return (await database().query('SELECT 1 FROM application_records WHERE namespace=$1 AND record_key=$2',[namespace,JSON.stringify(key)])).rowCount!==0;},
    async set(key,value){if(memory)memory.set(key,value);else await database().query('INSERT INTO application_records(namespace,record_key,payload,unique_value) VALUES($1,$2,$3,$4) ON CONFLICT(namespace,record_key) DO UPDATE SET payload=excluded.payload,unique_value=excluded.unique_value',[namespace,JSON.stringify(key),serialize(value),unique(namespace,value)]);return store;},
    async delete(key){if(memory)return memory.delete(key);return (await database().query('DELETE FROM application_records WHERE namespace=$1 AND record_key=$2',[namespace,JSON.stringify(key)])).rowCount!==0;},
    async clear(){if(memory)memory.clear();else await database().query('DELETE FROM application_records WHERE namespace=$1',[namespace]);},
    async entries(){if(memory)return [...memory.entries()];return (await database().query('SELECT record_key,payload FROM application_records WHERE namespace=$1 ORDER BY ordinal',[namespace])).rows.map(r=>[JSON.parse(r.record_key),deserialize(r.payload)]);},
    async keys(){return (await store.entries()).map(([key])=>key);},
    async values(){return (await store.entries()).map(([,value])=>value);},
    async forEach(callback){for(const [key,value] of await store.entries())await callback(value,key);}
  };
  return store;
}
export async function withRecordTransaction<T>(work:()=>Promise<T>):Promise<T> {
  if(!postgres())return legacy.withRecordTransaction(work);
  if(context.getStore()){database();return work();}
  database();const client=await pool!.connect();let discard=false;
  const transaction={client,active:true};
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '35s'");
    const result=await context.run(transaction,work);
    await client.query('COMMIT');return result;
  }catch(error){try{await client.query('ROLLBACK');}catch{discard=true;}throw error;}
  finally{transaction.active=false;client.release(discard);}
}
/** Bind one tenant for the entire transaction, including nested repository work. */
export async function bindRecordTransactionTenant(tenantId:string):Promise<void> {
  if(typeof tenantId!=='string'||!tenantId.trim())throw new TenantContextMissingError('A tenant is required.');
  if(!postgres())return;
  const transaction=context.getStore();
  if(!transaction?.active)throw new Error('Tenant binding requires an active transaction.');
  if(transaction.tenantId && transaction.tenantId!==tenantId) {
    throw new CrossTenantViolationError(transaction.tenantId,tenantId);
  }
  // Claim synchronously so concurrent nested callbacks cannot race tenant bindings.
  if(transaction.tenantId===tenantId)return;
  transaction.tenantId=tenantId;
  await transaction.client.query("SELECT set_config('app.current_tenant_id',$1,true)",[tenantId]);
}

export async function claimRecord(namespace:string,key:string,value:unknown):Promise<boolean>{
  if(!postgres())return legacy.claimRecord(namespace,key,value);
  return (await database().query('INSERT INTO application_records(namespace,record_key,payload) VALUES($1,$2,$3) ON CONFLICT(namespace,record_key) DO NOTHING RETURNING record_key',[namespace,JSON.stringify(key),serialize(value)])).rowCount===1;
}
export async function probeRecordStore():Promise<void>{if(postgres())await database().query('SELECT 1 FROM application_records LIMIT 1');else legacy.probeRecordStore();}

/** SQL operations share the exact transaction used by record repositories. */
export async function queryRecordTransaction(sql:string,params?:unknown[]) {
  if(!postgres())throw new Error('SQL execution requires the PostgreSQL backend.');
  const transaction=context.getStore();
  if(!transaction?.active)throw new Error('SQL execution requires an active transaction.');
  return database().query(sql,params);
}
export async function closeRecordStore():Promise<void>{
  const current=pool;pool=undefined;
  if(current)await current.end();
}

/** Allocate above retained records; PostgreSQL serializable conflicts fail rather than duplicate numbers. */
export async function nextRecordNumber(namespace:string, field:string, prefix:string, baseline=1000):Promise<string> {
  const allocate=()=>withRecordTransaction(async()=>{
    const sequences=createRecordStore<string,number>("record-number-sequences");
    const key=namespace+":"+prefix;
    let highest=Math.max(baseline,(await sequences.get(key))||0);
    for(const record of await createRecordStore<string,Record<string,unknown>>(namespace).values()){
      const value=record[field];
      if(typeof value!=="string"||!value.startsWith(prefix))continue;
      const suffix=value.slice(prefix.length);
      if(/^\d+$/.test(suffix))highest=Math.max(highest,Number(suffix));
    }
    const next=highest+1;
    if(!Number.isSafeInteger(next))throw new Error("Business number sequence exhausted.");
    await sequences.set(key,next);
    return prefix+String(next).padStart(6,"0");
  });
  if(context.getStore())return allocate();
  for(let attempt=0;;attempt++){
    try{return await allocate();}catch(error:any){
      if(error.code!=="40001"||attempt>=9)throw error;
    }
  }
}
