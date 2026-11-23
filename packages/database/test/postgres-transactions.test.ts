import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresDatabase, type PostgresTransaction } from '../src/postgres-database';

async function main() {
const connectionString=process.env.SAGE_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set SAGE_TEST_DATABASE_URL to an isolated PostgreSQL test database.');
const url=new URL(connectionString);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!url.pathname.endsWith('_test'))
  throw new Error('Tests require a local database whose name ends in _test.');
const pool=new Pool({connectionString,max:1});
const db=new PostgresDatabase({connectionString,max:1});
const suffix=randomUUID().replaceAll('-','');
const table='cert_'+suffix;
const role='cert_role_'+suffix;
let roleCreated=false;
try {
  assert.equal(await db.ready(),true);
  await pool.query(`CREATE TABLE ${table} (tenant_id text NOT NULL, id integer NOT NULL, amount integer NOT NULL, PRIMARY KEY (tenant_id,id))`);
  await pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);roleCreated=true;
  await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO ${role}`);
  await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
  await pool.query(`CREATE POLICY tenant_only ON ${table} USING (tenant_id=current_setting('app.current_tenant_id',true)) WITH CHECK (tenant_id=current_setting('app.current_tenant_id',true))`);
  let expired:PostgresTransaction;
  await db.transaction('alpha',async tx=>{
    expired=tx;
    await tx.execute(`SET LOCAL ROLE ${role}`);
    assert.equal(await tx.execute(`INSERT INTO ${table} VALUES ($1,$2,$3)`,['alpha',1,100]),1);
  });
  await assert.rejects(()=>expired!.query('SELECT 1'),/already ended/);
  await assert.rejects(()=>db.transaction('alpha',async tx=>{
    await tx.execute(`SET LOCAL ROLE ${role}`);
    await tx.execute(`UPDATE ${table} SET amount=999 WHERE id=1`);
    throw new Error('injected failure');
  }),/injected failure/);
  await db.transaction('alpha',async tx=>{
    await tx.execute(`SET LOCAL ROLE ${role}`);
    assert.equal((await tx.query(`SELECT amount FROM ${table}`))[0].amount,100);
  });
  await db.transaction('beta',async tx=>{
    await tx.execute(`SET LOCAL ROLE ${role}`);
    assert.equal((await tx.query(`SELECT * FROM ${table}`)).length,0);
    assert.equal(await tx.execute(`UPDATE ${table} SET amount=0`),0);
  });
  await assert.rejects(()=>db.transaction('beta',async tx=>{
    await tx.execute(`SET LOCAL ROLE ${role}`);
    await tx.execute(`INSERT INTO ${table} VALUES ('alpha',2,100)`);
  }),/row-level security/);
  await assert.rejects(()=>db.transaction('',async()=>{}),/tenant ID/);
  await db.close();
  const restarted=new PostgresDatabase({connectionString,max:1});
  try {
    await restarted.transaction('alpha',async tx=>{
      await tx.execute(`SET LOCAL ROLE ${role}`);
      assert.equal((await tx.query(`SELECT amount FROM ${table}`))[0].amount,100);
    });
  } finally {await restarted.close();}
  console.log('PASS: real PostgreSQL commit, rollback, restricted-role tenant reads/writes, pooled tenant switching, closed-executor rejection and reconnect persistence.');
} finally {
  await db.close().catch(()=>{});
  await pool.query(`DROP TABLE IF EXISTS ${table}`);
  if(roleCreated)await pool.query(`DROP ROLE ${role}`);
  await pool.end();
}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
