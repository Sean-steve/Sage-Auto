import {customerColumns} from '../src/repositories/normalized-customer-fields';
import {Pool,type PoolClient} from 'pg';
import {deserialize} from 'node:v8';
import {createHash} from 'node:crypto';

// Snapshot/backfill only: the running repositories are not switched by this tool.
const namespaces={tenants:'tenant.repository:store',customers:'customer.repository:customerStore',vehicles:'vehicle.repository:vehicleStore',bookings:'booking.repository:bookingStore',rentals:'rental.repository:rentalStore',invoices:'operational-invoice.repository:store',payments:'payment.repository:store',deposits:'deposit-position.repository:store',refunds:'refund.repository:store',allocations:'payment-allocation.repository:store'} as const;
type SourceRow={namespace:string;record_key:string;payload:Buffer;value:any};
const money=(value:unknown)=>{const text=String(value);if(!/^-?\d+(\.\d{1,4})?$/.test(text))throw new Error('Invalid or over-precision source money; no rounding was applied');return text;};
const required=(value:unknown)=>{if(typeof value!=='string'||!value.trim())throw new Error('Missing required source text');return value;};
const optional=(value:unknown)=>value===undefined||value===null?null:required(value);
const number=(value:unknown)=>{if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Missing or invalid source number');return value;};
async function insert(c:PoolClient,table:string,row:Record<string,unknown>){
 const columns=Object.keys(row);
 if(!/^[a-z_]+$/.test(table)||columns.some(k=>!/^[_a-z]+$/.test(k)))throw new Error('Invalid fixed backfill mapping');
 await c.query(`INSERT INTO rental_domain.${table} (${columns.join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));
}
async function assertRuntime(c:PoolClient){
 const role=(await c.query(`SELECT r.rolsuper,r.rolbypassrls,r.rolcreaterole,EXISTS(SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='rental_domain' AND t.relowner=r.oid) AS owns_tables FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
 if(!role||role.rolsuper||role.rolbypassrls||role.rolcreaterole||role.owns_tables)throw new Error('Normalized target requires a non-owner NOSUPERUSER NOBYPASSRLS NOCREATEROLE runtime role');
}
async function main(){
 if(!process.env.DATABASE_URL||!process.env.NORMALIZED_DATABASE_URL)throw new Error('Set source DATABASE_URL and explicit NORMALIZED_DATABASE_URL; source records are never modified');
 const apply=process.argv.includes('--apply');
 const tenantArg=process.argv.indexOf('--tenant-id');const selectedId=tenantArg>=0?process.argv[tenantArg+1]:undefined;
 if(tenantArg>=0&&(!selectedId||selectedId.startsWith('--')))throw new Error('--tenant-id requires an exact stored tenant ID');
 const source=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});
 const target=new Pool({connectionString:process.env.NORMALIZED_DATABASE_URL,max:1,connectionTimeoutMillis:5000});
 let s:PoolClient|undefined,t:PoolClient|undefined;
 const results:any[]=[];
 try{
  s=await source.connect();await s.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const coverage=(await s.query('SELECT namespace,count(*)::integer AS count FROM application_records GROUP BY namespace ORDER BY namespace')).rows;
  const rows:SourceRow[]=(await s.query('SELECT namespace,record_key,payload FROM application_records WHERE namespace=ANY($1::text[]) ORDER BY namespace,record_key',[Object.values(namespaces)])).rows.map(r=>({...r,value:deserialize(r.payload)}));
  for(const r of rows){if(!r.value||typeof r.value!=='object'||Array.isArray(r.value)||r.value.id!==JSON.parse(r.record_key))throw new Error('Source record identity does not match its storage key');}
  const tenants=rows.filter(r=>r.namespace===namespaces.tenants&&(!selectedId||r.value.id===selectedId));
  if(!tenants.length)throw new Error('No matching source tenant');
  const knownTenantIds=new Set(tenants.map(r=>r.value.id));
  if(!selectedId&&rows.some(r=>r.namespace!==namespaces.tenants&&!knownTenantIds.has(r.value.tenantId)))throw new Error('Core source records have no matching tenant; no backfill was attempted');
  t=await target.connect();await t.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  if(process.env.NORMALIZED_RUNTIME_ROLE){const role=process.env.NORMALIZED_RUNTIME_ROLE;if(!/^[a-z_][a-z0-9_]*$/.test(role))throw new Error('Invalid NORMALIZED_RUNTIME_ROLE');await t.query(`SET LOCAL ROLE "${role}"`);}
  await assertRuntime(t);
  // Serializes runs into this target; a populated target tenant is never overwritten.
  await t.query("SELECT pg_advisory_xact_lock(hashtext('sage-normalized-rental-core-backfill'))");
  for(const tenantRow of tenants){
   const id=required(tenantRow.value.id);const batch=rows.filter(r=>r===tenantRow||r.value.tenantId===id);
   await t.query('SAVEPOINT tenant_backfill');
   try{
    await t.query('SET CONSTRAINTS ALL DEFERRED');await t.query("SELECT set_config('app.current_tenant_id',$1,true)",[id]);
    if((await t.query('SELECT 1 FROM rental_domain.tenants WHERE tenant_id=$1',[id])).rowCount)throw new Error('Target tenant already exists; refusing overwrite');
    const items=(name:keyof typeof namespaces)=>batch.filter(r=>r.namespace===namespaces[name]).map(r=>r.value);
    const payments=new Map(items('payments').map(p=>[p.id,p]));const deposits=items('deposits');
    const parentPayment=(id:unknown)=>{const p=payments.get(required(id));if(!p)throw new Error('Payment parent missing from source tenant');return p;};
    const depositId=(source:unknown)=>{const matches=deposits.filter(d=>d.id===source||d.bookingId===source||d.rentalId===source);if(matches.length!==1)throw new Error('Deposit source is missing or ambiguous');return matches[0].id;};
    const tenant=tenantRow.value;
    await insert(t,'tenants',{tenant_id:id,name:required(tenant.name),slug:required(tenant.slug),currency:required(tenant.currency)});
    for(const r of items('customers')){
     await insert(t,'customers',Object.fromEntries(Object.entries(customerColumns).map(([field,column])=>[column,r[field]??null])));
     if(r.tags!==undefined&&!Array.isArray(r.tags))throw new Error('Customer tags must be an array');
     for(const [position,tag] of (r.tags||[]).entries())await insert(t,'customer_tags',{tenant_id:id,customer_id:r.id,position,tag});
    }
    for(const r of items('vehicles'))await insert(t,'vehicles',{tenant_id:id,id:r.id,registration_plate:required(r.registrationPlate),make:required(r.make),model:required(r.model),odometer:number(r.odometer),fuel_level:number(r.fuelLevel),lifecycle_status:required(r.lifecycleStatus),availability_status:required(r.availabilityStatus)});
    for(const r of items('bookings'))await insert(t,'bookings',{tenant_id:id,id:r.id,booking_number:required(r.bookingNumber),customer_id:required(r.customerId),assigned_vehicle_id:optional(r.assignedVehicleId),pickup_at:required(r.pickupAt??r.startDate),return_at:required(r.returnAt??r.endDate),currency:required(r.currency??r.pricingSnapshot?.currency),gross_total:money(r.grossTotal??r.pricingSnapshot?.grossTotal),deposit_required:money(r.depositRequired??r.pricingSnapshot?.securityDeposit),status:required(r.status)});
    for(const r of items('rentals'))await insert(t,'rentals',{tenant_id:id,id:r.id,rental_number:required(r.rentalNumber),booking_id:required(r.bookingId),customer_id:required(r.customerId),vehicle_id:required(r.vehicleId),scheduled_start:required(r.scheduledStart),scheduled_end:required(r.scheduledEnd),actual_start:optional(r.actualStart),actual_end:optional(r.actualEnd),checkout_odometer:number(r.checkoutOdometer),return_odometer:r.returnOdometer??null,state:required(r.state)});
    let lineCount=0;
    for(const r of items('invoices')){
     await insert(t,'invoices',{tenant_id:id,id:r.id,invoice_number:required(r.invoiceNumber),customer_id:required(r.customerId),booking_id:optional(r.bookingId),rental_id:optional(r.rentalId),currency:required(r.currency),status:required(r.status),subtotal:money(r.subtotal),tax_total:money(r.taxTotal),total:money(r.total),amount_paid:money(r.amountPaid),amount_credited:money(r.amountCredited),amount_outstanding:money(r.amountOutstanding),version:number(r.version)});
     if(!Array.isArray(r.lineItems))throw new Error('Invoice line evidence is missing');
     for(const l of r.lineItems){if(l.invoiceId!==r.id)throw new Error('Invoice line points to a different parent');await insert(t,'invoice_lines',{tenant_id:id,id:required(l.id),invoice_id:r.id,line_type:required(l.lineType),description:required(l.description),quantity:number(l.quantity),unit_price:money(l.unitPrice),net_amount:money(l.netAmount),tax_amount:money(l.taxAmount),gross_amount:money(l.grossAmount),sort_order:number(l.sortOrder)});lineCount++;}
    }
    for(const r of items('payments'))await insert(t,'payments',{tenant_id:id,id:r.id,payment_number:required(r.paymentNumber),purpose:required(r.purpose),direction:required(r.direction),currency:required(r.currency),provider:required(r.provider),provider_transaction_id:required(r.providerTransactionId),status:required(r.status),amount:money(r.amount),allocated_amount:money(r.allocatedAmount),unallocated_amount:money(r.unallocatedAmount),refunded_amount:money(r.refundedAmount),version:number(r.version)});
    for(const r of deposits)await insert(t,'deposits',{tenant_id:id,id:r.id,customer_id:required(r.customerId),booking_id:optional(r.bookingId),rental_id:optional(r.rentalId),currency:required(r.currency),status:required(r.status),required_amount:money(r.requiredAmount),received_amount:money(r.receivedAmount),held_amount:money(r.heldAmount),applied_amount:money(r.appliedAmount),refund_due_amount:money(r.refundDueAmount),refunded_amount:money(r.refundedAmount),forfeited_amount:money(r.forfeitedAmount),version:number(r.version)});
    for(const r of items('refunds')){const p=parentPayment(r.originalPaymentId);await insert(t,'refunds',{tenant_id:id,id:r.id,refund_number:required(r.refundNumber),original_payment_id:p.id,payment_purpose:p.purpose,source_type:required(r.sourceObligationType),deposit_id:r.sourceObligationType==='RENTAL_DEPOSIT'?depositId(r.sourceObligationId):null,invoice_id:r.sourceObligationType==='CUSTOMER_INVOICE'?optional(r.sourceObligationId):null,currency:required(r.currency),amount:money(r.amount),status:required(r.status),requested_by:optional(r.requestedBy),approved_by:optional(r.approvedBy),provider_reference:optional(r.providerRefundReference)});}
    for(const r of items('allocations')){if(!['CUSTOMER_INVOICE','RENTAL_DEPOSIT'].includes(r.sourceType))throw new Error('Allocation outside the normalized rental-core scope; no rows were skipped');const p=parentPayment(r.paymentId);await insert(t,'allocations',{tenant_id:id,id:r.id,payment_id:p.id,payment_purpose:p.purpose,currency:required(r.currency),invoice_id:r.sourceType==='CUSTOMER_INVOICE'?required(r.sourceId):null,deposit_id:r.sourceType==='RENTAL_DEPOSIT'?depositId(r.sourceId):null,amount:money(r.amount)});}
    for(const r of batch)await insert(t,'source_archive',{tenant_id:id,namespace:r.namespace,record_key:r.record_key,payload:r.payload});
    await t.query('SET CONSTRAINTS ALL IMMEDIATE');
    const archived=(await t.query('SELECT namespace,record_key,payload FROM rental_domain.source_archive WHERE tenant_id=$1',[id])).rows;
    const originals=new Map(batch.map(r=>[r.namespace+'\0'+r.record_key,r.payload]));
    if(archived.length!==batch.length||archived.some(r=>!originals.get(r.namespace+'\0'+r.record_key)?.equals(r.payload)))throw new Error('Source archive byte verification failed');
    const digest=createHash('sha256');for(const r of batch){digest.update(r.namespace);digest.update(r.record_key);digest.update(r.payload);}
    results.push({tenantId:id,status:'VALID',sourceRecords:batch.length,invoiceLines:lineCount,sourceDigest:digest.digest('hex')});await t.query('RELEASE SAVEPOINT tenant_backfill');
   }catch(e:any){await t.query('ROLLBACK TO SAVEPOINT tenant_backfill');await t.query('RELEASE SAVEPOINT tenant_backfill');results.push({tenantId:id,status:'INVALID',code:e.code||'SOURCE_VALIDATION',constraint:e.constraint||undefined,message:e.code?'Database rejected normalized source data':e.message});}
  }
  const invalid=results.some(r=>r.status==='INVALID');
  await t.query(apply&&!invalid?'COMMIT':'ROLLBACK');await s.query('ROLLBACK');
  console.log(JSON.stringify({mode:apply?'apply':'preview',committed:apply&&!invalid,sourceModified:false,runtimeCutover:false,results,unmappedNamespaces:coverage.filter(r=>!Object.values(namespaces).includes(r.namespace)).map(r=>({namespace:r.namespace,count:r.count}))},null,2));
  if(invalid)process.exitCode=1;
 }catch(e){if(t)await t.query('ROLLBACK').catch(()=>{});if(s)await s.query('ROLLBACK').catch(()=>{});throw e;}
 finally{s?.release();t?.release();await source.end();await target.end();}
}
main().catch((e:any)=>{console.error(JSON.stringify({error:e.code?'Database operation failed':e.message,code:e.code,constraint:e.constraint}));process.exitCode=1;});
