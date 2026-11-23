import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {Pool} from 'pg';

// Run while API and workers are stopped; this never modifies the source database.
async function main(){
  const source=process.env.SQLITE_IMPORT_PATH;
  if(!source||!process.env.DATABASE_URL)throw new Error('SQLITE_IMPORT_PATH and DATABASE_URL are required.');
  const apply=process.argv.includes('--apply');
  const sqlite=new DatabaseSync(resolve(source),{readOnly:true});
  const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  let client;
  try{
    const records=sqlite.prepare('SELECT namespace,key,value,unique_value FROM records ORDER BY namespace,key').all();
    client=await pool.connect();
    await client.query('BEGIN');
    await client.query('LOCK TABLE application_records IN EXCLUSIVE MODE');
    const count=Number((await client.query('SELECT count(*) AS count FROM application_records')).rows[0].count);
    if(count!==0)throw new Error('Import requires an empty application_records table; existing records will not be overwritten.');
    if(!apply){
      await client.query('ROLLBACK');
      console.log(`Preview: ${records.length} records can be imported into the empty PostgreSQL application store. Run with --apply while API and workers are stopped.`);
      return;
    }
    for(const row of records){
      await client.query('INSERT INTO application_records(namespace,record_key,payload,unique_value) VALUES($1,$2,$3,$4)',[row.namespace,row.key,Buffer.from(row.value as Uint8Array),row.unique_value]);
    }
    const saved=await client.query('SELECT namespace,record_key,payload,unique_value FROM application_records ORDER BY namespace,record_key');
    if(saved.rows.length!==records.length)throw new Error('Import count verification failed.');
    const byKey=new Map<string, {unique_value:string|null;payload:Buffer}>(saved.rows.map(row=>[JSON.stringify([row.namespace,row.record_key]),row]));
    for(const before of records){
      const after=byKey.get(JSON.stringify([before.namespace,before.key]));
      if(!after||before.unique_value!==after.unique_value||!Buffer.from(before.value as Uint8Array).equals(after.payload))throw new Error('Import value verification failed.');
    }
    await client.query('COMMIT');
    console.log(`Imported and byte-verified ${records.length} records. SQLite source preserved. Restart the application with RECORD_STORE_BACKEND=postgres.`);
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client?.release();await pool.end();sqlite.close();}
}
main().catch(()=>{console.error('SQLite import failed; no partial import was committed. Check the source, migrations, connection and empty-target requirement.');process.exitCode=1;});
