import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main() {
const phase = process.argv[2];
if (phase) {
  const { UserRepository } = await import('../src/repositories/user.repository');
  const { AuthSessionRepository } = await import('../src/repositories/auth-session.repository');
  const { VehicleRepository } = await import('../src/repositories/vehicle.repository');
  const users = new UserRepository(), sessions = new AuthSessionRepository(), vehicles = new VehicleRepository();
  if (phase === 'write') {
    const user = await users.create({email: 'Persist@example.test', fullName:'Persistence check', passwordHash:'test-hash', isPlatformStaff:false,status:"ACTIVE"});
    await sessions.create({userId:user.id, refreshTokenHash:'test-refresh', tokenFamilyId:'family', expiresAt:'2099-01-01T00:00:00Z'} as any);
    await vehicles.create({tenantId:'tenant-check', registrationPlate:'TEST 123', make:'Toyota',model:'Corolla',year:2020,lifecycleStatus:'OPERATIONAL',availabilityStatus:'AVAILABLE',dailyRate:3500} as any);
  } else {
    const user = await users.findByEmail(' persist@EXAMPLE.test ');
    assert.ok(user);
    assert.equal(user.passwordHash,'test-hash');
    assert.equal((await sessions.findActiveSessionsForUser(user.id)).length,1);
    assert.equal((await vehicles.findByRegistrationPlate('TEST123','tenant-check'))?.dailyRate,3500);
    await assert.rejects(users.create({email:'persist@example.test', fullName:'Duplicate',passwordHash:'other',isPlatformStaff:false,status:"ACTIVE"}));
    assert.equal((await users.findByEmail('persist@example.test'))?.id,user.id);
  }
} else {
  const dir = mkdtempSync(join(tmpdir(),'carhire-durable-'));
  try {
    for (const phase of ['write','read']) {
      const child = spawnSync(process.execPath,['--import','tsx',__filename,phase],{env:{...process.env,SQLITE_PATH:join(dir,'test.sqlite')},encoding:'utf8'});
      assert.equal(child.status,0,child.stderr);
    }
    console.log('PASS: users, sessions and cars survive process restart; duplicate email is rejected.');
  } finally { rmSync(dir,{recursive:true,force:true}); }
}

}
main().catch(error => { console.error(error); process.exitCode=1; });
