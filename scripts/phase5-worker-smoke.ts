import "dotenv/config";
import {resolve} from "node:path";

const prod=[process.env.NODE_ENV,process.env.APP_ENV].some(v=>["production","staging"].includes(String(v||"").toLowerCase()));
if(prod)throw new Error("Phase 5 worker smoke is development-only.");
if(process.env.REDIS_SIMULATED==="true")throw new Error("Do not certify simulated Redis.");
process.env.LOCAL_CERTIFICATION_MODE="true";
process.env.REDIS_REQUIRE_LIVE="true";
process.env.REDIS_SIMULATED="false";
process.env.SQLITE_PATH||=resolve(".data/carhire.sqlite");

const {WorkerManager}=await import("../apps/worker/src/worker.module");
const manager=new WorkerManager();
let started=false;
try {
  await manager.start();
  started=true;
  const health=await manager.getHealth();
  if(health.redisStatus!=="connected"||health.workersRunning<1||!health.schedulerActive) {
    throw new Error("Worker health is not backed by live Redis and running processors.");
  }
  console.log(JSON.stringify({
    result:"PASS",redis:health.redisStatus,workers:health.workersRunning,
    scheduler:health.schedulerActive,queues:health.queues.length,
    note:"This validates Redis worker readiness, NOT real payments or PostgreSQL-backed business records."
  }));
}finally{
  if(started)await manager.stop(8000);
}
