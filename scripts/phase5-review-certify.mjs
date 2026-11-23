/** Runs existing isolated review checks with readiness, evidence and owned-process cleanup. */
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync, openSync, closeSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
process.chdir(root);
if (['production','staging'].includes(process.env.NODE_ENV)||['production','staging'].includes(process.env.APP_ENV)||process.env.SQLITE_PATH)
  throw new Error('Review certification requires an isolated local environment without SQLITE_PATH.');
const dir=resolve('.review/certification',new Date().toISOString().replaceAll(':','-'));
mkdirSync(dir,{recursive:true,mode:0o700});
const env={...process.env,NODE_ENV:'test',APP_ENV:'test',ACCESS_REVIEW_PORT:'3511',EMAIL_DELIVERY_MODE:'capture',LOCAL_PAYMENT_WORKER_ENABLED:'false'};
const processes=[];
const results=[];
let stopping=false;
function start(name,command,args,extra={}) {
  const log=resolve(dir,name+'.log'),fd=openSync(log,'a',0o600);
  const child=spawn(command,args,{cwd:root,env:{...env,...extra},stdio:['ignore',fd,fd],detached:true});
  closeSync(fd);processes.push(child);
  child.failure=undefined;child.on('error',error=>{child.failure=error;});
  child.done=new Promise(resolve=>child.once('close',code=>resolve(code)));
  return {child,log};
}
async function freePort(port) {
  await new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});
}
async function ready(proc,url,marker) {
  const deadline=Date.now()+120000;
  while(Date.now()<deadline) {
    if(proc.child.failure||proc.child.exitCode!==null||proc.child.signalCode)throw new Error('Service exited; inspect '+proc.log);
    if(!marker||readFileSync(proc.log,'utf8').includes(marker)) {
      try {const r=await fetch(url,{signal:AbortSignal.timeout(2000)});if(r.ok)return;}catch{}
    }
    await delay(250);
  }
  throw new Error('Service readiness timeout; inspect '+proc.log);
}
async function check(name,args,extra={}) {
  const {child,log}=start(name,process.execPath,args,extra);
  let timer;
  const code=await Promise.race([child.done,new Promise(resolve=>{timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGTERM');}catch{}resolve('TIMEOUT');},180000);})]);
  clearTimeout(timer);
  results.push({name,status:code===0?'PASS':'FAIL',exitCode:code,log});
  console.log(name+': '+(code===0?'PASS':'FAIL'));
  if(code!==0)throw new Error(name+' failed; dependent checks were not run. See '+log);
}
async function cleanup() {
  if(stopping)return;stopping=true;
  for(const child of processes)if(child.pid&&child.exitCode===null&&!child.signalCode){try{process.kill(-child.pid,'SIGTERM');}catch{}}
  await delay(1000);
  for(const child of processes)if(child.pid&&child.exitCode===null&&!child.signalCode){try{process.kill(-child.pid,'SIGKILL');}catch{}}
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void cleanup().then(()=>process.exit(130));});
const steps=['seven-role-browser','prepare-return','return-finance-browser','rental-cross-workflow','financial-integration'];
let failure;
try {
  await freePort(3511);await freePort(3510);
  const api=start('api',process.execPath,['--import','tsx','scripts/access-review.ts']);
  await ready(api,'http://127.0.0.1:3511/api/health/live','READY:');
  const web=start('web',process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3510','--strictPort'],{VITE_API_PROXY_TARGET:'http://127.0.0.1:3511'});
  await ready(web,'http://127.0.0.1:3510/');
  const sqlite={SQLITE_PATH:resolve('.review/access/review.sqlite')};
  await check(steps[3],['--import','tsx','scripts/stage6-cross-workflow.ts'],sqlite);
  await check(steps[4],['--import','tsx','scripts/stage7-financial-integration.ts'],sqlite);
  await check(steps[0],['scripts/stage4-browser-acceptance.mjs']);
  await check(steps[1],['--import','tsx','scripts/stage4-live-closure-acceptance.ts'],{...sqlite,STAGE5_PREPARE_ONLY:'1'});
  await check(steps[2],['scripts/stage5-browser-journey.mjs']);
} catch(error) {failure=error.message;process.exitCode=1;console.error(failure);}
finally {
  await cleanup();
  for(const name of steps)if(!results.some(r=>r.name===name))results.push({name,status:'BLOCKED',reason:failure});
  let commit='unknown';try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
  writeFileSync(resolve(dir,'results.json'),JSON.stringify({commit,checkedAt:new Date().toISOString(),backend:'SQLite',money:'simulated',fullFreshTenantUiCertified:false,postgresCertified:false,failure,results},null,2),{mode:0o600});
  console.log('Evidence: '+dir);
}
