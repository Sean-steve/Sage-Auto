import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const origin="http://127.0.0.1:3000";
const output="artifacts/phase4-4-browser";
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const errors=[];
const roles=[
  {name:"owner",portal:{id:"company",kind:"tenant",tenantId:"tenant-one",name:"Avenue Fleet",roles:["COMPANY_OWNER"],permissions:["*"],sections:["overview","bookings","handover","availability","fleet","customers","rentals","returns","inspections","maintenance","compliance","owners","pricing","finance","settlements","website","team","settings"].map(id=>({id,label:id[0].toUpperCase()+id.slice(1)}))}},
  {name:"booking-agent",portal:{id:"company",kind:"tenant",tenantId:"tenant-one",name:"Avenue Fleet",roles:["BOOKING_AGENT"],permissions:["booking.read"],sections:[{id:"overview",label:"Overview"},{id:"bookings",label:"Bookings"}]}},
  {name:"driver",portal:{id:"driver",kind:"tenant",tenantId:"tenant-one",name:"Avenue Fleet Driver",roles:["DRIVER"],permissions:["rental.self.read"],sections:[{id:"overview",label:"Overview"}]}},
  {name:"vehicle-owner",portal:{id:"owner",kind:"tenant",tenantId:"tenant-one",name:"Vehicle Owner",roles:["VEHICLE_OWNER"],permissions:["settlement.self.read"],sections:[{id:"overview",label:"Overview"}]}},
  {name:"platform-admin",portal:{id:"platform",kind:"platform",name:"Sage Auto Platform",roles:["PLATFORM_ADMIN"],permissions:["*"],sections:[{id:"overview",label:"Overview"}]}},
  {name:"renter",portal:{id:"renter",kind:"renter",site:"demo",name:"Rental Account",roles:["RENTER"],permissions:[],sections:[{id:"overview",label:"Overview"}]}}
];
const response=(data)=>({status:200,contentType:"application/json",body:JSON.stringify({success:true,data,...(Array.isArray(data)?{meta:{total:data.length}}:{})})});
const booking={id:"booking-1",bookingNumber:"BKG-2026-0001",status:"CONFIRMED",pickupAt:"2026-10-15T09:00:00Z",customerName:"Test Renter",tenantId:"tenant-one"};
try{
 for(const screen of [1440,390]){
  for(const role of roles){
   const context=await browser.newContext({viewport:{width:screen,height:900},baseURL:origin});
   await context.addInitScript(({portal})=>{
     localStorage.setItem("carhire_access_token","browser-review-token");
     localStorage.setItem("carhire_active_tenant_id",portal.tenantId||"");
     sessionStorage.setItem("access_portal",portal.id);
   },{portal:role.portal});
   const page=await context.newPage();
   page.on("pageerror",e=>errors.push(role.name+" "+screen+" "+e.message));
   await page.route("**/api/v1/**",async route=>{
     const url=new URL(route.request().url());
     const path=url.pathname;
     if(path.endsWith("/access/context"))return route.fulfill(response({
       user:{id:"browser-user",email:"role@example.test",fullName:"Browser Tester",emailVerified:true},
       onboarding:{},portals:[role.portal],reviewMode:false
     }));
     if(path.endsWith("/bookings"))return route.fulfill(response([booking]));
     if(path.endsWith("/fleet/vehicles"))return route.fulfill(response([]));
     if(path.endsWith("/rentals"))return route.fulfill(response([]));
     if(path.endsWith("/rentals/dispatch-ready"))return route.fulfill(response([]));
     if(path.endsWith("/finance/summary"))return route.fulfill(response({totalCollected:0,totalReceivables:0,currency:"KES"}));
     if(path.endsWith("/tenant/details"))return route.fulfill(response({id:"tenant-one",name:"Avenue Fleet"}));
     if(path.endsWith("/subscription"))return route.fulfill(response({subscription:null}));
     return route.fulfill(response([]));
   });
   await page.goto(origin+"/login",{waitUntil:"domcontentloaded"});
   await page.waitForFunction(({name})=>document.body.innerText.includes(name),{name:role.portal.name},{timeout:20000});
   const body=await page.locator("body").innerText();
   assert(!body.includes("Something went wrong"),role.name+" did not render");
   assert(body.includes(role.portal.name),role.name+" did not display its authorized portal: "+body.slice(0,220));
   if(role.name==="owner"){
     assert(body.includes("Departure board"),"Owner's company workboard is available");
     assert(body.includes("Bookings"),"Company Bookings preserved");
     assert(body.includes("Settlements"),"Owner settlements navigation preserved");
   }
   if(role.name==="booking-agent"){
     assert(body.includes("Bookings"),"Booking Agent can find Bookings");
     assert(!body.includes("Owner Settlements"),"Restricted role does not display privileged settlement navigation");
   }
   await page.screenshot({path:`${output}/${role.name}-${screen}.png`,fullPage:true});
   await context.close();
   console.log("PASS browser role",role.name,screen);
  }
 }
 // Public renter route, mocked only at HTTP boundary; dynamic status changes prove UI refresh.
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();let completed=false;
 page.on("pageerror",e=>errors.push("renter-tracker "+e.message));
 await page.route("**/api/v1/public/**",async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.includes("website/resolve"))return route.fulfill(response({branding:{businessName:"Avenue Fleet"}}));
  if(url.pathname.includes("booking/account/booking")){
   const renterBooking={bookingId:"booking-1",bookingReference:"BKG-2026-0001",status:completed?"COMPLETED":"ACTIVE",
    vehicle:{make:"Toyota",model:"RAV4"},schedule:{pickupAt:"2026-10-13T09:00:00Z",returnAt:"2026-10-15T09:00:00Z"},
    pricing:{isPaid:true,currency:"KES",grossTotal:10000,depositAmount:4000},
    renterNotifications:[],timeline:[],
    activeRental:{rentalId:"rental-1",rentalNumber:"RNT-2026-01",state:completed?"COMPLETED":"ACTIVE_ON_ROAD",
      returnStatus:completed?"COMPLETED":"ON_ROAD",timeRemainingMinutes:completed?0:1000,
      scheduledEnd:"2026-10-15T09:00:00Z",checkoutOdometer:5000,checkoutFuelLevel:80}};
   return route.fulfill(response(renterBooking));
  }
  return route.fulfill(response({}));
 });
 await page.goto(origin+"/site/demo/track",{waitUntil:"domcontentloaded"});
 await page.getByPlaceholder("BKG-2026-000123").fill("BKG-2026-0001");
 await page.getByPlaceholder("you@example.com").fill("renter@example.test");
 await page.getByRole("button",{name:"Track my booking"}).click();
 await page.getByText("You have the vehicle").waitFor();
 completed=true;
 await page.getByRole("button",{name:"Refresh"}).click();
 await page.getByRole("heading",{name:"Rental completed"}).waitFor();
 assert(!(await page.locator("body").innerText()).includes("You have the vehicle"),"Completed renter journey never asserts possession");
 await page.screenshot({path:`${output}/renter-return-completed-390.png`,fullPage:true});
 console.log("PASS renter progression", "ACTIVE_ON_ROAD -> COMPLETED");
 await context.close();
 assert.equal(errors.length,0,"Browser JS exceptions:\n"+errors.join("\n"));
}finally{
 await browser.close();
}
console.log("PASS multi-role browser smoke at 1440/390; role routing, company board and renter refresh");
