import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {checkReleaseAdapter} from './release-preflight.mjs';

const ci=readFileSync('.github/workflows/ci.yml','utf8');
const rollback=readFileSync('.github/workflows/rollback.yml','utf8');
for(const phase of ['staging','production','rollback']) {
  const readiness=checkReleaseAdapter(phase);
  const command=spawnSync(process.execPath,['scripts/release-preflight.mjs',phase],{encoding:'utf8'});
  assert.equal(command.status===0,readiness.ready,
    'Release preflight CLI must match actual verified adapter presence for '+phase);
  assert.ok((phase==='rollback'?rollback:ci).includes('scripts/release-preflight.mjs '+phase),
    'Release preflight missing from workflow '+phase);
  assert.ok((phase==='rollback'?rollback:ci).includes('adapters/'+phase+'.sh'),
    'Actual release adapter not wired into workflow '+phase);
}
assert.equal(rollback.includes('==> Directing traffic routing'),false,
  'Rollback workflow must not impersonate real ingress changes with an echo');
assert.equal(ci.includes('==> Orchestrating zero-downtime rolling update'),false,
  'Production promotion must not report echo-only rollout success');
console.log('PASS Stage 5 release fail-closed gate: deployment and rollback cannot report success without real adapters.');
