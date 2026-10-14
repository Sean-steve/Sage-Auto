/**
 * Sage Auto release safety: fail closed until real environment-specific
 * deployment and rollback adapters are implemented and verified.
 *
 * Usage: node scripts/release-preflight.mjs staging|production|rollback
 *
 * Important: A green PR CI/container build is NOT evidence that the
 * production service was deployed, migrations ran, or rollback exists.
 */
import {existsSync, statSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export function releaseAdapterPath(action){
  if(!['staging','production','rollback'].includes(action))
    throw new Error('Expected staging, production or rollback');
  return resolve('infrastructure/deployment/adapters',action+'.sh');
}

export function checkReleaseAdapter(action) {
  const file=releaseAdapterPath(action);
  if(!existsSync(file))return {ready:false,reason:
    'No tested '+action+' deployment/rollback adapter. Refusing to represent a placeholder as a release.'};
  const stat=statSync(file);
  if(!stat.isFile() || (stat.mode&0o111)===0)
    return {ready:false,reason:action+' adapter is not executable.'};
  const source=readFileSync(file,'utf8');
  if(!source.startsWith('#!/usr/bin/env bash') || !source.includes('set -euo pipefail'))
    return {ready:false,reason:action+' adapter must be a strict Bash script.'};
  if(/\bexit\s+0\b/.test(source)&&!source.includes('verify'))
    return {ready:false,reason:action+' adapter appears to complete without verification.'};
  // This is only a structural gate; environment-specific sandbox and
  // real rollback drills remain mandatory before promotion.
  return {ready:true,reason:'Adapter present. Separate functional release certification required.'};
}

const requested=process.argv[2];
if(requested) {
  try{
    const status=checkReleaseAdapter(requested);
    if(!status.ready){
      console.error('::error::BLOCKED '+requested+' — '+status.reason);
      process.exitCode=1;
    } else console.log('Adapter structure verified: '+requested+'.');
  }catch(error){
    console.error('::error::Release adapter preflight failed: '+error.message);
    process.exitCode=1;
  }
}
