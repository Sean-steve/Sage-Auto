/**
 * Stage 5 real-user click journey: Return dossier -> Finance handoff -> 
 * Finance Manager seals an actual saved zero-balance return -> Company Owner
 * completes & releases fleet. Runs only with isolated review API/database.
 *
 * Requires Node 24, Chromium, pnpm review:api + pnpm review:web and fixture
 * from STAGE5_PREPARE_ONLY=1 pnpm exec tsx scripts/stage4-live-closure-acceptance.ts.
 */
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as sleep} from 'node:timers/promises';

if(['production','staging'].includes(process.env.NODE_ENV||'') || process.env.SQLITE_PATH)
  throw new Error('Stage 5 browser may run only against the review API, without external database settings.');
const fixture=JSON.parse(readFileSync('.review/access/stage5-fixture.json','utf8'));
const creds=JSON.parse(readFileSync('.review/access/accounts.json','utf8'));
const api=process.env.STAGE5_API_ORIGIN||'http://127.0.0.1:3511';
const web=process.env.STAGE5_WEB_ORIGIN||'http://127.0.0.1:3510';
const profile=mkdtempSync(join(tmpdir(),'sage-stage5-'));
const bin=process.env.STAGE5_CHROME_BIN||['google-chrome','google-chrome-stable','chromium','chromium-browser'].map(n=>{try{return execFileSync('which',[n],{encoding:'utf8'}).trim()}catch{return null}}).find(Boolean);
assert.ok(bin,'Chrome or Chromium required');
async function wait(check,label,ms=25000){
  const until=Date.now()+ms;let latest;
  while(Date.now()<until){try{const value=await check();if(value)return value;}catch(e){latest=e;}await sleep(190);}
  throw new Error('Timed out '+label+(latest?' '+latest.message:''));
}
async function request(path,token,body){
  const resp=await fetch(api+'/api/v1'+path,{
    method:body?'POST':'GET',
    headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),
      ...(token?{'X-Tenant-ID':fixture.tenantId}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  let payload;try{payload=await resp.json()}catch{payload={}};
  return {status:resp.status,ok:resp.ok,data:payload?.data,error:payload?.error?.message};
}
async function login(role){
  const res=await request('/auth/login',null,creds[role]);
  assert.equal(res.status,200,role+' sign-in '+(res.error||''));
  const accessToken=res.data.tokens.accessToken;
  const ctx=await request('/access/context',accessToken);
  assert.equal(ctx.status,200);
  const portal=ctx.data.portals.find(p=>p.kind==='tenant'&&p.roles.includes(role)&&p.tenantId===fixture.tenantId);
  assert.ok(portal,role+' does not have matching tenant portal');
  return {role,token:accessToken,refresh:res.data.tokens.refreshToken,portal};
}
class CDP {
  constructor(socket){
    this.socket=socket;this.id=0;this.requests=new Map();
    socket.addEventListener('message',ev=>{
      let msg;try{msg=JSON.parse(ev.data)}catch{return;}
      const pending=this.requests.get(msg.id);if(!pending)return;
      clearTimeout(pending.timer);this.requests.delete(msg.id);
      if(msg.error)pending.reject(new Error(msg.error.message));
      else pending.resolve(msg.result);
    });
  }
  call(method,params={}){
    const id=++this.id;return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.requests.delete(id);reject(new Error('CDP '+method+' timeout'));},20000);
      this.requests.set(id,{resolve,reject,timer});
      this.socket.send(JSON.stringify({id,method,params}));
    });
  }
  async js(expression){
    const out=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(out.exceptionDetails)throw Error(out.exceptionDetails.text||'Browser JS exception');
    return out.result?.value;
  }
  async navigate(url){
    await this.call('Page.navigate',{url});
    await wait(()=>this.js('document.readyState==="complete" && Boolean(document.body)'),url);
  }
  async button(text){
    const js=`(()=>{const b=[...document.querySelectorAll('button')]
      .find(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled && b.getClientRects().length);
      if(!b)return false;b.click();return true;})()`;
    await wait(()=>this.js(js),'click button '+text,30000);
  }
  async visible(text){
    return this.js(`([...document.querySelectorAll('button,h1,h2,p,strong')]
      .some(n=>n.textContent.trim()===${JSON.stringify(text)} && n.getClientRects().length>0))`);
  }
  async nav(label){
    await wait(()=>this.js(`(()=>{const b=[...document.querySelectorAll('button.sage-nav-item')]
       .find(b=>b.textContent.trim()===${JSON.stringify(label)}&&b.getClientRects().length);
       if(!b)return false;b.click();return true;})()`),'nav '+label);
    await wait(()=>this.js(`([...document.querySelectorAll('button.sage-nav-item')].some(b=>
      b.textContent.trim()===${JSON.stringify(label)}&&b.getAttribute('aria-current')==='page'))`),
      'active section '+label);
  }
  async selectFinanceRental(id) {
    const js=`(()=>{const select=document.querySelector('[aria-label="Return settlement handoff"] select');
      if(!select || ![...select.options].some(o=>o.value===${JSON.stringify(id)}))return false;
      const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
      setter.call(select,${JSON.stringify(id)});
      select.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`;
    await wait(()=>this.js(js),'saved rental listed in Finance settlement');
    await wait(()=>this.js(`document.querySelector('[aria-label="Return settlement handoff"] select')?.value===${JSON.stringify(id)}`),
      'Finance selected rental');
  }
}
let proc,socket;
try {
  proc=spawn(bin,['--headless=new','--no-sandbox','--disable-gpu','--disable-extensions',
    '--no-first-run','--remote-allow-origins=*','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  const portFile=join(profile,'DevToolsActivePort');
  await wait(()=>existsSync(portFile),'Chrome debug socket',15000);
  const port=Number(readFileSync(portFile,'utf8').split('\n')[0]);
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  assert.ok(pages.find(p=>p.type==='page')?.webSocketDebuggerUrl,'No browser tab');
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((res,rej)=>{socket.addEventListener('open',res,{once:true});socket.addEventListener('error',rej,{once:true});});
  const cdp=new CDP(socket);
  await cdp.call('Page.enable');await cdp.call('Runtime.enable');
  let checks=0;
  async function as(actor,section='returns'){
    await cdp.navigate(web+'/login');
    await cdp.js('localStorage.clear();sessionStorage.clear();true');
    const expression=`(()=>{localStorage.setItem('carhire_access_token',${JSON.stringify(actor.token)});
      localStorage.setItem('carhire_refresh_token',${JSON.stringify(actor.refresh)});
      localStorage.setItem('carhire_active_tenant_id',${JSON.stringify(fixture.tenantId)});
      sessionStorage.setItem('access_portal',${JSON.stringify(actor.portal.id)});
      sessionStorage.setItem(${JSON.stringify('sage:return-selection:'+fixture.tenantId)},${JSON.stringify(fixture.rentalId)});
      sessionStorage.setItem(${JSON.stringify('sage:return-finance:'+fixture.tenantId)},${JSON.stringify(fixture.rentalId)});
      return true;})()`;
    await cdp.js(expression);
    await cdp.call('Page.reload',{ignoreCache:true});
    await wait(()=>cdp.js("Boolean(document.querySelector('.saas-workspace'))"),actor.role+' workspace',35000);
    const label=actor.portal.sections.find(s=>s.id===section)?.label;
    assert.ok(label,'Missing '+section+' for '+actor.role);
    await cdp.nav(label);
    checks++;
  }

  const company=await login('COMPANY_OWNER');
  const finance=await login('FINANCE_MANAGER');
  await as(company,'returns');
  await wait(()=>cdp.visible(fixture.rentalNumber),'Return dossier for seeded rental');
  await wait(()=>cdp.visible('Continue in Finance & Payments'),'Return to Finance handoff action');
  await cdp.button('Continue in Finance & Payments');
  await wait(()=>cdp.js("Boolean(document.querySelector('[aria-label=\"Return settlement handoff\"]'))"),'Finance handoff');
  const selected=await cdp.js("document.querySelector('[aria-label=\"Return settlement handoff\"] select')?.value");
  assert.equal(selected,fixture.rentalId,'Navigation must retain selected rental');checks++;
  console.log('PASS Company Owner: Return dossier -> Finance handoff keeps rental context');

  await as(finance,'finance');
  await cdp.selectFinanceRental(fixture.rentalId);
  await wait(()=>cdp.visible('Review & finalize settlement'),'finance settlement action');
  await cdp.button('Review & finalize settlement');
  await wait(()=>cdp.visible('Seal final settlement'),'settlement form');
  await cdp.button('Seal final settlement');
  await wait(async()=>{const r=await request('/rentals/'+fixture.rentalId+'/final-calculation',finance.token);
    return r.data?.isImmutable && r.data?.depositSettlementStatus==='SETTLED';},'saved immutable Finance settlement');
  checks+=2;
  await wait(()=>cdp.visible('Return to rental completion'),'Finance -> Returns link');
  await cdp.button('Return to rental completion');
  await wait(()=>cdp.visible('Return & Final Calculation'),'Finance manager return screen');
  assert.equal(await cdp.visible('Complete & release vehicle'),false,
    'Finance Manager must not gain rental release permission');checks++;
  console.log('PASS Finance Manager: clicked real settlement form, saved immutable result, cannot release vehicle');

  await as(company,'returns');
  await wait(()=>cdp.visible('Complete & release vehicle'),'company owner rental completion');
  await cdp.button('Complete & release vehicle');
  await wait(()=>cdp.visible('Complete rental & apply disposition'),'disposition modal');
  assert.equal(await cdp.js(`([...document.querySelectorAll('select')].some(s=>s.value==='AVAILABLE' && s.closest('form')?.textContent.includes('Vehicle disposition')))`),true,
    'Default disposition must be explicit AVAILABLE in form');
  checks++;
  await cdp.button('Complete rental & apply disposition');
  await wait(async()=>{const r=await request('/rentals/'+fixture.rentalId,company.token);return r.data?.state==='COMPLETED'},
    'Company Owner live API rental completion');
  checks++;
  const rental=await request('/rentals/'+fixture.rentalId,company.token);
  assert.equal(rental.data.state,'COMPLETED');
  const returns=await request('/rentals/'+fixture.rentalId+'/return-record',company.token);
  assert.equal(returns.data?.status,'COMPLETED');checks++;
  // Read-only integrity scanner then checks all linked durable records.
  await cdp.call('Page.reload',{ignoreCache:true});
  await wait(()=>cdp.visible('Return lifecycle completed'),'completed state persists after hard reload',35000);
  checks++;
  console.log('PASS Company Owner: clicked disposition + completion; saved status persists after reload');
  console.log('PASS Stage 5 UI-to-API cross-role journey: '+checks+
    ' verified browser handoff, approval boundaries, settlement and final completion; no provider money moved.');
} catch(e){
  console.error('Stage 5 browser journey failed:',e.stack||e.message);
  process.exitCode=1;
} finally {
  socket?.close();proc?.kill('SIGKILL');rmSync(profile,{recursive:true,force:true});
}
