/**
 * Phase 5 live-local prerequisites. Deliberately reports the actual runtime
 * storage backend separately from PostgreSQL schema migration readiness.
 * Never prints credentials, access tokens or connection-string passwords.
 */
import "dotenv/config";
import {spawnSync} from "node:child_process";
import {existsSync} from "node:fs";
import {resolve} from "node:path";
import Redis from "ioredis";

function refuse(message) {throw new Error(message)}
const prod=[process.env.NODE_ENV,process.env.APP_ENV].some(x=>["production","staging"].includes(String(x||"").toLowerCase()));
if(prod)refuse("Phase 5 is local-only; staging and production are not allowed.");

const url=process.env.DATABASE_URL||"";
const name=process.env.PGDATABASE||"";
const redisUrl=process.env.REDIS_URL||"redis://127.0.0.1:6379";
const sqlitePath=process.env.SQLITE_PATH||resolve(".data/carhire.sqlite");
const results={runtimeRecordBackend:"SQLite via SQLITE_PATH",postgresSchema:"UNVERIFIED",redis:"UNVERIFIED",
  sqliteFileExists:existsSync(sqlitePath),productionBackendCertified:false,
  blockers:[],checkedAt:new Date().toISOString()};

if(!url&&!name)results.blockers.push("DATABASE_URL or PGDATABASE must target your isolated local PostgreSQL database.");
else if(url.includes("schema="))results.blockers.push("Remove Prisma-only schema= from DATABASE_URL for psql.");
else {
  const pg=spawnSync("psql",[
    "-X","-qAt","-v","ON_ERROR_STOP=1",
    ...(url?[url]:[]),
    "-c",`SELECT COUNT(*) FROM sage_auto_schema_migrations;`
  ],{encoding:"utf8",timeout:12000,env:{...process.env,PGCONNECT_TIMEOUT:"8"}});
  if(pg.error||pg.status!==0) {
    results.blockers.push("Cannot query live PostgreSQL migration ledger. Run pnpm db:migrate and verify local database credentials.");
  }else {
    const applied=Number(pg.stdout.trim());
    results.postgresSchema=Number.isFinite(applied)?`LIVE_SQL_MIGRATIONS_${applied}`:"INVALID_MIGRATION_LEDGER";
    if(applied<4)results.blockers.push("Not all four foundation SQL migrations are recorded in PostgreSQL.");
  }
}
const redis=new Redis(redisUrl,{lazyConnect:true,connectTimeout:4000,retryStrategy:()=>null,maxRetriesPerRequest:0});
redis.on("error",()=>{});
try{
  await redis.connect();
  const pong=await redis.ping();
  if(pong==="PONG")results.redis="CONNECTED_REAL";
  else results.blockers.push("Redis responded but did not return PONG.");
}catch{
  results.blockers.push("Cannot reach live Redis. Redis simulation must not count as certification.");
}finally{redis.disconnect();}

results.blockers.push("P0: Most API domain repositories still use SQLite record-store rather than PostgreSQL; full PostgreSQL backend certification is blocked.");
console.log(JSON.stringify(results,null,2));
if(process.argv.includes("--require-production-backend")) {
  console.error("FAIL CLOSED: PostgreSQL business-data authority is not yet implemented.");
  process.exitCode=2;
}else if(results.redis!=="CONNECTED_REAL"||!results.postgresSchema.startsWith("LIVE_SQL_MIGRATIONS_")) {
  process.exitCode=1;
}
