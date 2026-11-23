import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {serialize} from 'node:v8';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Pool} from 'pg';

async function main(){
  assert.ok(process.env.DATABASE_URL);
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  const schema='import_test_'+randomUUID().replaceAll('-','');
  const dir=mkdtempSync(join(tmpdir(),'sage-import-'));
  const source=join(dir,'source.sqlite');
  try{
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`CREATE TABLE ${schema}.application_records (LIKE public.application_records INCLUDING ALL)`);
    const sqlite=new DatabaseSync(source);
    sqlite.exec('CREATE TABLE records(namespace TEXT,key TEXT,value BLOB,unique_value TEXT)');
    const insert=sqlite.prepare('INSERT INTO records VALUES(?,?,?,?)');
    insert.run('Z:Case','"one"',serialize({amount:1500}),null);
    insert.run('a:case','"two"',serialize({date:new Date('2026-11-09')}),'unique-value');
    sqlite.close();
    const original=readFileSync(source);
    const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options',`-c search_path=${schema}`);
    const run=(apply=false)=>spawnSync(process.execPath,['--import','tsx','packages/database/scripts/import-sqlite-records.ts',...(apply?['--apply']:[])],{env:{...process.env,DATABASE_URL:url.toString(),SQLITE_IMPORT_PATH:source},encoding:'utf8',timeout:30000});
    assert.equal(run().status,0,'Preview must succeed');
    assert.equal(Number((await pool.query(`SELECT count(*) FROM ${schema}.application_records`)).rows[0].count),0);
    const applied=run(true);assert.equal(applied.status,0,applied.stderr);
    assert.equal(Number((await pool.query(`SELECT count(*) FROM ${schema}.application_records`)).rows[0].count),2);
    assert.ok(original.equals(readFileSync(source)),'Source must remain byte-identical');
    assert.equal(run(true).status,1,'Existing target must be protected');
    await pool.query(`TRUNCATE ${schema}.application_records`);
    const duplicate=new DatabaseSync(source);duplicate.prepare('INSERT INTO records VALUES(?,?,?,?)').run('a:case','"three"',serialize({amount:9}),'unique-value');duplicate.close();
    assert.equal(run(true).status,1,'Constraint failure must abort import');
    assert.equal(Number((await pool.query(`SELECT count(*) FROM ${schema}.application_records`)).rows[0].count),0,'No partial import');
    console.log('PASS: import preview, byte-verified copy, unchanged source, nonempty-target refusal and atomic rollback');
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();rmSync(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
