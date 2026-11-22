import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

/** Executed in fresh processes: cannot accidentally inherit test-only state. */
for (const [label, source] of [
  ["API runtime entry", "import('./apps/api/src/runtime-env.ts')"],
  ["Direct Express application", "import('./apps/api/src/app.module.ts').then(m => m.createApiApp())"],
  ["Worker runtime entry", "import('./apps/worker/src/main.ts')"],
] as const) {
  for (const stage of ["staging", "production"]) {
    const result = spawnSync(process.execPath, ["--import","tsx","-e",source],{
      cwd:process.cwd(),encoding:"utf8",timeout:12_000,
      env:{...process.env,NODE_ENV:"development",APP_ENV:stage,
        SQLITE_PATH:"/tmp/ux-d6-intentionally-not-a-production-store.sqlite"},
    });
    assert.notEqual(result.status,0,label+" must reject "+stage+" SQLite runtime");
    assert.match((result.stderr||"")+(result.stdout||""),/PRODUCTION NO-GO/,
      label+" must disclose the authoritative PG migration blocker");
  }
}
console.log("UX-D6 RUNTIME GATE PASS: API and worker cannot start SQLite as staging/production authority");
