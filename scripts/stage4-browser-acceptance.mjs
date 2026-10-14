/**
 * Stage 4: authenticated, real-Chromium workspace smoke against disposable review DB.
 *
 * Start "pnpm review:api" and "pnpm review:web" first. This test deliberately
 * uses the existing review-mode provisioned accounts, never production data.
 * Requires Node 24+ (native WebSocket) and a local Chrome/Chromium executable.
 *
 * Coverage: login token -> real browser render -> tenant/renter/owner/driver
 * portals -> permission-scoped nav -> feature opening -> browser refresh ->
 * negative Finance authorization via real HTTP.
 *
 * NOT payment-provider E2E, settlement money movement, or live environment test.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const api = process.env.STAGE4_API_ORIGIN || 'http://127.0.0.1:3511';
const web = process.env.STAGE4_WEB_ORIGIN || 'http://127.0.0.1:3510';
const profileDir = mkdtempSync(join(tmpdir(),'sage-stage4-browser-'));
const credentialsFile = process.env.STAGE4_CREDENTIALS_FILE || '.review/access/accounts.json';
const accounts = JSON.parse(readFileSync(credentialsFile,'utf8'));
const roles = [
  {role:'COMPANY_OWNER', sections:['returns','finance','settlements','bookings','rentals']},
  {role:'FINANCE_MANAGER',sections:['returns','finance','settlements']},
  {role:'BOOKING_AGENT',sections:['bookings','rentals','returns']},
  {role:'DRIVER',sections:['myTrips','myInspections']},
  {role:'VEHICLE_OWNER',sections:['myVehicles','mySettlements']},
  {role:'RENTER',sections:['myBookings','profile']},
];
function chromeBinary() {
  if (process.env.STAGE4_CHROME_BIN) return process.env.STAGE4_CHROME_BIN;
  for (const binary of ['google-chrome','google-chrome-stable','chromium','chromium-browser']) {
    try { return execFileSync('which',[binary],{encoding:'utf8'}).trim(); } catch {}
  }
  throw new Error('Chrome/Chromium required for browser smoke; set STAGE4_CHROME_BIN.');
}
function req(path,token,tenantId,body) {
  return fetch(api+'/api/v1'+path,{
    method:body?'POST':'GET',
    headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),
      ...(tenantId?{'X-Tenant-ID':tenantId}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
}
async function getJson(response,context) {
  let json;try {json=await response.json()}catch {throw new Error(context+' had non-JSON response '+response.status);}
  assert.equal(response.ok,true,context+' HTTP '+response.status+' '+(json?.error?.message||''));
  return json.data;
}
async function waitFor(task,description,timeoutMs=25000) {
  const until=Date.now()+timeoutMs;let last;
  while(Date.now()<until) {
    try{const answer=await task();if(answer)return answer;}catch(err){last=err;}
    await delay(200);
  }
  throw new Error('Timed out: '+description+(last?' ('+last.message+')':''));
}
class Cdp {
  constructor(ws) {
    this.ws=ws;this.counter=0;this.waiting=new Map();
    ws.addEventListener('message',event=>{
      let msg;try{msg=JSON.parse(event.data)}catch{return;}
      if(!msg.id)return;
      const pending=this.waiting.get(msg.id);
      if(!pending)return;
      clearTimeout(pending.timer);
      this.waiting.delete(msg.id);
      if(msg.error)pending.reject(new Error('CDP '+pending.method+': '+msg.error.message));
      else pending.resolve(msg.result);
    });
  }
  call(method,params={}) {
    const id=++this.counter;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.waiting.delete(id);reject(new Error('CDP timeout '+method));},15000);
      this.waiting.set(id,{resolve,reject,timer,method});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  async evaluate(expression){
    const data=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(data.exceptionDetails)throw new Error(data.exceptionDetails.text||'Browser evaluation exception');
    return data.result?.value;
  }
  async navigate(url) {
    await this.call('Page.navigate',{url});
    await waitFor(()=>this.evaluate('document.readyState==="complete" && Boolean(document.body)'),'page load');
  }
  async clickSection(label) {
    const expr=`(()=>{const labels=document.querySelectorAll('button.sage-nav-item, nav[aria-label="Workspace navigation"] button');
      const button=[...labels].find(node=>node.textContent.trim()===${JSON.stringify(label)});
      if(!button)return false;button.click();return true;})()`;
    await waitFor(()=>this.evaluate(expr),'Navigation item '+label+' rendered and clickable',20000);
    await waitFor(()=>this.evaluate(`(()=>{const sidebar=[...document.querySelectorAll('button.sage-nav-item, nav[aria-label="Workspace navigation"] button')];
      return sidebar.some(button=>button.textContent.trim()===${JSON.stringify(label)} && button.getAttribute('aria-current')==='page')
    })()`),'active section '+label);
    await waitFor(()=>this.evaluate(`(()=>{const root=document.querySelector('main');
      return root && root.textContent.trim().length>35 && !document.querySelector('vite-error-overlay');
    })()`),'section content '+label);
  }
}
let browser;
let websocket;
let failed=false;
try {
  if (['production','staging'].includes(process.env.NODE_ENV||'') || process.env.SQLITE_PATH) {
    throw new Error('Stage 4 browser smoke may only run against isolated review DB.');
  }
  const binary=chromeBinary();
  browser=spawn(binary,['--headless=new','--no-sandbox','--disable-gpu','--no-first-run',
    '--no-default-browser-check','--disable-extensions','--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--user-data-dir='+profileDir,'about:blank'],{stdio:'ignore'});
  const portFile=join(profileDir,'DevToolsActivePort');
  await waitFor(()=>existsSync(portFile),'Chrome DevTools port',45000);
  const port=Number(readFileSync(portFile,'utf8').split('\n')[0]);
  const discovery=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  assert.ok(Array.isArray(discovery) && discovery.some(page=>page.type==='page'),
    'Headless Chrome must expose a CDP page.');
} catch(err) {
  // Startup is handled below too: keep cleanup outside catch.
  failed=true;console.error('BROWSER STARTUP FAILURE:',err.message);
} finally {
  if (failed) {
    browser?.kill('SIGKILL');
    rmSync(profileDir,{recursive:true,force:true});
    process.exitCode=1;
  }
}
if(!failed) {
try {
  const port=Number(readFileSync(join(profileDir,'DevToolsActivePort'),'utf8').split('\n')[0]);
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(item=>item.type==='page');
  assert.ok(page?.webSocketDebuggerUrl,'Chrome debugging page not available');
  websocket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    websocket.addEventListener('open',resolve,{once:true});
    websocket.addEventListener('error',reject,{once:true});
  });
  const cdp=new Cdp(websocket);
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');

  let checks=0;
  for(const spec of roles) {
    const credentials=accounts[spec.role];
    assert.ok(credentials,'Missing isolated review account '+spec.role);
    const login=await getJson(await req('/auth/login',undefined,undefined,credentials),spec.role+' login');
    const token=login.tokens.accessToken;
    const context=await getJson(await req('/access/context',token),spec.role+' context');
    const portal=context.portals.find(entry=>spec.role==='RENTER'?
      entry.kind==='renter':entry.kind==='tenant'&&entry.roles.includes(spec.role));
    assert.ok(portal,'Missing portal for '+spec.role);
    const tenantId=portal.tenantId||'';

    // Explicit authorization check; sidebar gating alone cannot prove isolation.
    const finance=await req('/finance/invoices',token,tenantId);
    // Front desk has limited invoice READ, but no Finance workspace or
    // authority to seal settlements; test the actual permission matrix.
    const financeAllowed=portal.permissions.includes('*') || portal.permissions.includes('invoice.read');
    assert.equal(finance.status,financeAllowed?200:403,
      spec.role+' invoice.read authorization must be server-side');
    checks++;

    if(spec.role==='BOOKING_AGENT') {
      const seal=await req('/rentals/nonexistent/deposit-settlement',token,tenantId,{settlementStatus:'SETTLED'});
      assert.equal(seal.status,403,'Booking Agent must not finalize Finance settlements');
      checks++;
    }

    if(spec.role==='RENTER') {
      const rentals=await req('/rentals',token,tenantId);
      assert.equal(rentals.status,403,'Renter must not see tenant rental operations');
      checks++;
    }

    // Reuse one isolated browser with a clean role session between actors.
    await cdp.navigate(web+'/login');
    await cdp.evaluate('localStorage.clear();sessionStorage.clear();true');
    await cdp.evaluate(`(()=>{
      localStorage.setItem('carhire_access_token',${JSON.stringify(token)});
      localStorage.setItem('carhire_refresh_token',${JSON.stringify(login.tokens.refreshToken)});
      localStorage.setItem('carhire_active_tenant_id',${JSON.stringify(tenantId)});
      sessionStorage.setItem('access_portal',${JSON.stringify(portal.id)});
      return true;
    })()`);
    await cdp.call('Page.reload',{ignoreCache:true});
    const shellClass=['DRIVER','VEHICLE_OWNER','RENTER'].includes(spec.role)?'.access-workspace':'.saas-workspace';
    await waitFor(()=>cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(shellClass)}))`),
      spec.role+' authenticated workspace',35000);
    await waitFor(()=>cdp.evaluate(`([...document.querySelectorAll('button.sage-nav-item, nav[aria-label="Workspace navigation"] button')]
      .some(n=>n.textContent.trim()===${JSON.stringify(portal.sections[0]?.label||'')}))`),
      spec.role+' own permission-scoped sidebar',35000);
    const allowed=new Set(portal.sections.map(item=>item.label));
    const uiLabels=await cdp.evaluate(`([...document.querySelectorAll('button.sage-nav-item, nav[aria-label="Workspace navigation"] button')].map(n=>n.textContent.trim()))`);
    for(const sectionLabel of uiLabels) {
      assert.ok(allowed.has(sectionLabel),spec.role+' is rendered unauthorized section '+sectionLabel);
    }
    for(const section of spec.sections) {
      const s=portal.sections.find(item=>item.id===section);
      assert.ok(s,spec.role+' was not provisioned expected '+section+' permission');
      await cdp.clickSection(s.label);
      checks++;
    }

    // Session persistence on hard refresh, as seen by a returning staff member.
    await cdp.call('Page.reload',{ignoreCache:true});
    await waitFor(()=>cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(shellClass)}))`),
      spec.role+' reauthenticated after refresh',35000);
    checks++;
    console.log('PASS '+spec.role+': authenticated UI, section restrictions, '+spec.sections.length+
      ' modules, reload, Finance authorization');
  }
  console.log('PASS Stage 4 isolated browser acceptance: '+checks+' checks across '+roles.length+' roles.');
} catch(error) {
  console.error('Stage 4 browser acceptance failed:',error.stack||error.message);
  failed=true;
} finally {
  websocket?.close();
  browser?.kill('SIGKILL');
  // Chrome may still flush preferences after SIGKILL; cleanup must not turn
  // a successful API/DOM acceptance run into a false test failure.
  await delay(400);
  try { rmSync(profileDir,{recursive:true,force:true,maxRetries:12,retryDelay:200}); }
  catch(err) { console.warn('Temporary Chrome cleanup warning:',err.code||err.message); }
  if(failed) process.exitCode=1;
}
}
