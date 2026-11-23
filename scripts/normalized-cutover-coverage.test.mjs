import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
test('cutover gate fails while compatibility repositories remain and identifies their call sites',()=>{
 const run=spawnSync(process.execPath,['scripts/normalized-cutover-coverage.mjs','--require-complete'],{encoding:'utf8',maxBuffer:10*1024*1024});
 assert.equal(run.status,1,run.stderr);const report=JSON.parse(run.stdout);
 assert.equal(report.normalizedCutoverComplete,false);
 assert.ok(report.namespaces.find(n=>n.namespace==='customer.repository:customerStore')?.locations.some(l=>l.file==='packages/database/src/repositories/customer.repository.ts'));
 assert.ok(report.namespaces.some(n=>n.namespace==='access:invitation-claims'));
 assert.equal(report.launchCertification,'NOT_ASSESSED');
 assert.equal(report.compatibilityNamespaceCount,report.namespaces.length);
 assert.ok(report.namespaces.every(n=>n.locations.every(l=>!l.file.includes('/test/'))));
});
