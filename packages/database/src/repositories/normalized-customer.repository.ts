import {randomUUID} from 'node:crypto';
import type {Customer, CustomerFilterQueryDto} from '@carhire/types';
import type {ICustomerRepository} from './customer.repository';
import {TransactionManager, type TransactionContext} from '../transaction-manager';
import {ConcurrencyConflictError, RecordNotFoundError} from '../errors';

// Explicit field mapping prevents silently discarding contact/identity details.
import {customerColumns as columns} from './normalized-customer-fields';
const projection=`c.*,to_char(c.license_expiry_date,'YYYY-MM-DD') AS license_expiry_date,
 ARRAY(SELECT tag FROM rental_domain.customer_tags t WHERE t.tenant_id=c.tenant_id AND t.customer_id=c.id ORDER BY position) AS tags`;
function decode(row:Record<string,any>):Customer {
 const result:Record<string,unknown>={};
 for(const [field,column] of Object.entries(columns))if(row[column]!==null&&row[column]!==undefined)result[field]=row[column] instanceof Date?row[column].toISOString():row[column];
 result.tags=row.tags;return result as unknown as Customer;
}
async function scoped<T>(tenantId:string,work:(tx:TransactionContext)=>Promise<T>):Promise<T>{
 if(process.env.RECORD_STORE_BACKEND!=='postgres')throw new Error('Normalized customers require PostgreSQL.');
 return TransactionManager.withTenantTransaction(tenantId,async tx=>{
  const [role]=await tx.executor.query<{unsafe:boolean}>(`SELECT r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR
   EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='rental_domain' AND pg_has_role(current_user,c.relowner,'USAGE')) AS unsafe
   FROM pg_roles r WHERE r.rolname=current_user`);
  if(!role||role.unsafe)throw new Error('Normalized customers require a restricted non-owner runtime role.');
  return work(tx);
 });
}
async function read(tx:TransactionContext,tenantId:string,id:string,lock=false){
 const rows=await tx.executor.query<Record<string,any>>(`SELECT ${projection} FROM rental_domain.customers c WHERE c.tenant_id=$1 AND c.id=$2${lock?' FOR UPDATE OF c':''}`,[tenantId,id]);
 return rows[0]?decode(rows[0]):null;
}
async function writeTags(tx:TransactionContext,c:Customer){
 await tx.executor.execute('DELETE FROM rental_domain.customer_tags WHERE tenant_id=$1 AND customer_id=$2',[c.tenantId,c.id]);
 for(const [position,tag] of (c.tags||[]).entries())await tx.executor.execute('INSERT INTO rental_domain.customer_tags VALUES($1,$2,$3,$4)',[c.tenantId,c.id,position,tag]);
}
export class NormalizedCustomerRepository implements ICustomerRepository {
 findById(id:string,tenantId:string){return scoped(tenantId,tx=>read(tx,tenantId,id));}
 private find(tenantId:string,expression:string,value:string){return scoped(tenantId,async tx=>{
  const rows=await tx.executor.query<Record<string,any>>(`SELECT ${projection} FROM rental_domain.customers c WHERE c.tenant_id=$1 AND ${expression}=$2`,[tenantId,value]);return rows[0]?decode(rows[0]):null;
 });}
 findByEmail(email:string,tenantId:string){return this.find(tenantId,'lower(trim(c.email))',email.trim().toLowerCase());}
 findByIdOrPassport(value:string,tenantId:string){return this.find(tenantId,'lower(trim(c.id_or_passport_number))',value.trim().toLowerCase());}
 findByCustomerNumber(value:string,tenantId:string){return this.find(tenantId,'upper(trim(c.customer_number))',value.trim().toUpperCase());}
 findAll(tenantId:string,filter:CustomerFilterQueryDto={}){return scoped(tenantId,async tx=>{
  const params:unknown[]=[tenantId];const where=['c.tenant_id=$1'];
  for(const [field,column] of [['status','status'],['verificationStatus','verification_status'],['customerType','customer_type'],['corporateAccountId','corporate_account_id']] as const){if(filter[field]){params.push(filter[field]);where.push(`c.${column}=$${params.length}`);}}
  if(filter.search){params.push(filter.search.toLowerCase());where.push(`(${['full_name','customer_number','email','phone','id_or_passport_number','license_number'].map(c=>`strpos(lower(c.${c}),$${params.length})>0`).join(' OR ')})`);}
  const clause=where.join(' AND ');const [count]=await tx.executor.query<{total:number}>(`SELECT count(*)::integer AS total FROM rental_domain.customers c WHERE ${clause}`,params);
  const limit=filter.limit||50;const page=filter.page||1;
  if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(page)||page<1)throw new Error('Customer pagination must use positive integers.');
  const rows=await tx.executor.query<Record<string,any>>(`SELECT ${projection} FROM rental_domain.customers c WHERE ${clause} ORDER BY c.created_at DESC,c.id LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,(page-1)*limit]);
  return {customers:rows.map(decode),total:count.total};
 });}
 async list(tenantId:string){return (await this.findAll(tenantId,{limit:1000})).customers;}
 listByTenant(tenantId:string){return this.list(tenantId);}
 create(data:Parameters<ICustomerRepository['create']>[0]){return scoped(data.tenantId,async tx=>{
  const year=new Date().getFullYear();const prefix=`CUS-${year}-`;let customerNumber=data.customerNumber;
  if(!customerNumber){
   const [sequence]=await tx.executor.query<{last_value:string}>(`INSERT INTO rental_domain.customer_numbers(tenant_id,year,last_value)
    SELECT $1::text,$2::integer,GREATEST(100,COALESCE(MAX(substring(customer_number FROM '[0-9]+$')::bigint),0))+1
    FROM rental_domain.customers WHERE tenant_id=$1 AND customer_number ~ $3
    ON CONFLICT(tenant_id,year) DO UPDATE SET last_value=GREATEST(rental_domain.customer_numbers.last_value+1,excluded.last_value)
    RETURNING last_value`,[data.tenantId,year,`^CUS-${year}-[0-9]+$`]);
   customerNumber=prefix+sequence.last_value.padStart(6,'0');
  }
  const now=new Date().toISOString();const customer:Customer={...data,id:randomUUID(),customerNumber,
   email:data.email.trim().toLowerCase(),phone:data.phone.trim(),idOrPassportNumber:data.idOrPassportNumber.trim(),licenseNumber:data.licenseNumber.trim(),
   customerType:data.customerType||'INDIVIDUAL',status:data.status||'ACTIVE',verificationStatus:data.verificationStatus||'UNVERIFIED',
   totalRentalsCount:data.totalRentalsCount??0,version:1,createdAt:now,updatedAt:now};
  const fields=Object.keys(columns) as (keyof typeof columns)[];
  await tx.executor.execute(`INSERT INTO rental_domain.customers(${fields.map(f=>columns[f]).join(',')}) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')})`,fields.map(f=>customer[f]??null));
  await writeTags(tx,customer);return (await read(tx,customer.tenantId,customer.id))!;
 });}
 update(id:string,tenantId:string,data:Partial<Customer>,expectedVersion?:number){return scoped(tenantId,async tx=>{
  const existing=await read(tx,tenantId,id,true);if(!existing)throw new RecordNotFoundError('Customer',id);
  if(expectedVersion!==undefined&&existing.version!==expectedVersion)throw new ConcurrencyConflictError('Customer version mismatch');
  const updated:Customer={...existing,...Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined)),id,tenantId,customerNumber:existing.customerNumber,createdAt:existing.createdAt,version:existing.version+1,updatedAt:new Date().toISOString()};
  const fields=(Object.keys(columns) as (keyof typeof columns)[]).filter(f=>!['id','tenantId','customerNumber','createdAt'].includes(f));
  await tx.executor.execute(`UPDATE rental_domain.customers SET ${fields.map((f,i)=>columns[f]+'=$'+(i+3)).join(',')} WHERE tenant_id=$1 AND id=$2`,[tenantId,id,...fields.map(f=>updated[f]??null)]);
  await writeTags(tx,updated);return (await read(tx,tenantId,id))!;
 });}
 delete(id:string,tenantId:string){return scoped(tenantId,async tx=>{await tx.executor.execute('DELETE FROM rental_domain.customers WHERE tenant_id=$1 AND id=$2',[tenantId,id]);});}
}
