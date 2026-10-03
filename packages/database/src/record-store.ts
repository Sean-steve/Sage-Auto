import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { serialize, deserialize } from "node:v8";

let database: DatabaseSync | undefined;
function db(): DatabaseSync {
  if (database) return database;
  const filename = process.env.SQLITE_PATH;
  if (!filename) throw new Error("SQLITE_PATH is required for durable storage");
  if (filename !== ":memory:") mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  database = new DatabaseSync(filename);
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS records (
      namespace TEXT NOT NULL, key TEXT NOT NULL, value BLOB NOT NULL,
      unique_value TEXT, PRIMARY KEY(namespace, key), UNIQUE(namespace, unique_value)
    );`);
  return database;
}

const transactionStores = new AsyncLocalStorage<Map<string, Map<any, any>>>();
function staged(namespace:string):Map<any,any>|undefined {
  const stores=transactionStores.getStore();
  if(!stores) return;
  if(!stores.has(namespace)) stores.set(namespace,new Map());
  return stores.get(namespace)!;
}

// ponytail: snapshot the small record database to support existing async repositories.
// Replace whole-database conflict detection with indexed row versions as it grows.
// Only database work belongs in this callback; external delivery stays outside it.
export async function withRecordTransaction<T>(work:()=>Promise<T>):Promise<T> {
  if(transactionStores.getStore()) return work();
  const database=db();
  const snapshot=()=>database.prepare('SELECT namespace,key,value,unique_value FROM records ORDER BY namespace,key').all();
  const original=snapshot(), fingerprint=serialize(original);
  const stores=new Map<string,Map<any,any>>();
  for(const row of original) {
    const namespace=String(row.namespace);
    if(!stores.has(namespace)) stores.set(namespace,new Map());
    stores.get(namespace)!.set(JSON.parse(String(row.key)),deserialize(row.value as Uint8Array));
  }
  const result=await transactionStores.run(stores,work);
  database.exec('BEGIN IMMEDIATE');
  try {
    if(!fingerprint.equals(serialize(snapshot()))) throw Object.assign(new Error('Records changed during this request. Please retry.'),{statusCode:409});
    const before=new Map(original.map(row=>[`${row.namespace}\0${row.key}`,row]));
    for(const row of original) if(!stores.get(String(row.namespace))?.has(JSON.parse(String(row.key)))) new SqliteRecordStore(String(row.namespace)).delete(JSON.parse(String(row.key)));
    for(const [namespace,records] of stores) for(const [key,value] of records) {
      const previous=before.get(`${namespace}\0${JSON.stringify(key)}`);
      if(!previous||!serialize(value).equals(Buffer.from(previous.value as Uint8Array))) new SqliteRecordStore(namespace).set(key,value);
    }
    database.exec('COMMIT');
    return result;
  } catch(error) {database.exec('ROLLBACK');throw error;}
}

// ponytail: scans preserve existing repository contracts; add indexed domain tables
// when record counts justify replacing the current scan-based repository queries.
class SqliteRecordStore<K, V> extends Map<K, V> {
  constructor(private readonly namespace: string) { super(); }
  override get size(): number {
    if(staged(this.namespace)) return staged(this.namespace)!.size;
    return Number(db().prepare("SELECT count(*) AS n FROM records WHERE namespace=?").get(this.namespace)!.n);
  }
  override get(key: K): V | undefined {
    if(staged(this.namespace)) return staged(this.namespace)!.get(key);
    const row = db().prepare("SELECT value FROM records WHERE namespace=? AND key=?").get(this.namespace, JSON.stringify(key));
    return row ? deserialize(row.value as Uint8Array) : undefined;
  }
  override has(key: K): boolean {
    if(staged(this.namespace)) return staged(this.namespace)!.has(key);
    return Boolean(db().prepare("SELECT 1 FROM records WHERE namespace=? AND key=?").get(this.namespace, JSON.stringify(key)));
  }
  override set(key: K, value: V): this {
    if(staged(this.namespace)) {staged(this.namespace)!.set(key,deserialize(serialize(value)));return this;}
    const record = value as any;
    const unique = this.namespace === "user.repository:userStore"
      ? String(record.normalizedEmail || record.email).trim().toLowerCase()
      : this.namespace === "tenant.repository:store" ? record.slug
      : this.namespace === "tenant-membership.repository:store" ? `${record.tenantId}:${record.userId}`
      : this.namespace === "platform-membership.repository:memberships" ? record.userId : null;
    db().prepare(`INSERT INTO records(namespace,key,value,unique_value) VALUES(?,?,?,?)
      ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value,unique_value=excluded.unique_value`)
      .run(this.namespace, JSON.stringify(key), serialize(value), unique);
    return this;
  }
  override delete(key: K): boolean {
    if(staged(this.namespace)) return staged(this.namespace)!.delete(key);
    return Number(db().prepare("DELETE FROM records WHERE namespace=? AND key=?").run(this.namespace, JSON.stringify(key)).changes) > 0;
  }
  override clear(): void { if(staged(this.namespace)){staged(this.namespace)!.clear();return;} db().prepare("DELETE FROM records WHERE namespace=?").run(this.namespace); }
  override entries(): MapIterator<[K,V]> {
    if(staged(this.namespace)) return staged(this.namespace)!.entries();
    return db().prepare("SELECT key,value FROM records WHERE namespace=? ORDER BY rowid").all(this.namespace)
      .map(row => [JSON.parse(row.key as string), deserialize(row.value as Uint8Array)] as [K,V]).values();
  }
  override keys(): MapIterator<K> { return Array.from(this.entries(), ([key]) => key).values(); }
  override values(): MapIterator<V> { return Array.from(this.entries(), ([,value]) => value).values(); }
  override [Symbol.iterator](): MapIterator<[K,V]> { return this.entries(); }
  override forEach(callback: (value: V, key: K, map: Map<K,V>) => void, thisArg?: any): void {
    for (const [key,value] of this.entries()) callback.call(thisArg, value, key, this);
  }
}

export function createRecordStore<K,V>(namespace: string): Map<K,V> {
  // Domain unit tests explicitly run without a configured database. The API entry
  // point always configures a durable path before importing repositories.
  return process.env.SQLITE_PATH ? new SqliteRecordStore<K,V>(namespace) : new Map<K,V>();
}

export function probeRecordStore(): void {
  db().prepare("SELECT 1").get();
}

// Atomic claims for one-time invitations and initial platform ownership, including
// separate API processes sharing the same SQLite file.
const memoryClaims = new Map<string, unknown>();
export function claimRecord(namespace: string, key: string, value: unknown): boolean {
  const records=staged(namespace);
  if(records) {if(records.has(key)) return false;records.set(key,value);return true;}
  if (!process.env.SQLITE_PATH) {
    const id = `${namespace}:${key}`;
    if (memoryClaims.has(id)) return false;
    memoryClaims.set(id, value); return true;
  }
  return Number(db().prepare('INSERT INTO records(namespace,key,value) VALUES(?,?,?) ON CONFLICT(namespace,key) DO NOTHING')
    .run(namespace, JSON.stringify(key), serialize(value)).changes) === 1;
}
